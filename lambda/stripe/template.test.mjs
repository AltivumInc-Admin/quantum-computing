/**
 * Guardrail tests for template.yaml. This stack takes money and grants the
 * credits it buys, so the template must keep: the webhook route PUBLIC (Stripe
 * cannot present a JWT) while every other route stays behind the Cognito
 * authorizer; the Stripe keys sourced from Secrets Manager (never inline); a
 * stage throttle; Errors / Throttles / 5xx alarms; and a human email subscriber.
 *
 * Like lambda/sync, the template uses CloudFormation intrinsics that no plain
 * YAML parser loads, so these tests slice the file structurally instead of
 * adding a YAML dependency. Run: `cd lambda/stripe && npm ci && npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const template = readFileSync(new URL("./template.yaml", import.meta.url), "utf8");

function section(src, name) {
  const lines = src.split(/\r?\n/);
  const start = lines.indexOf(`${name}:`);
  assert.notEqual(start, -1, `template has no top-level ${name}: section`);
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}

function blocks(sectionLines) {
  const byId = {};
  let id = null;
  for (const line of sectionLines) {
    const m = line.match(/^  ([A-Za-z0-9]+):\s*$/);
    if (m) {
      id = m[1];
      byId[id] = [];
    } else if (id) {
      byId[id].push(line);
    }
  }
  return byId;
}

const resources = blocks(section(template, "Resources"));
const body = (id) => (resources[id] ?? []).join("\n");
const typeOf = (id) => body(id).match(/^\s+Type:\s+(\S+)/m)?.[1];
const ofType = (t) => Object.keys(resources).filter((id) => typeOf(id) === t);

test("the webhook route is public; every other route stays behind Cognito", () => {
  const fn = body("StripeFunction");
  // The default authorizer is Cognito for the API...
  assert.match(body("StripeApi"), /DefaultAuthorizer: CognitoJwt/);
  // ...and exactly the Webhook event overrides it to NONE.
  const webhook = fn.match(/Webhook:[\s\S]*?(?=\n {8}\w+:|\n {6}Tags:|$)/)?.[0] ?? "";
  assert.match(webhook, /Path: \/webhook/);
  assert.match(webhook, /Auth:\s*\n\s*Authorizer: NONE/, "webhook must set Authorizer: NONE");
  // No other route may carry Authorizer: NONE.
  const noneCount = (fn.match(/Authorizer: NONE/g) ?? []).length;
  assert.equal(noneCount, 1, "only the webhook route may be public");
});

test("the four routes exist with the right methods", () => {
  const fn = body("StripeFunction");
  for (const [method, path] of [
    ["POST", "/checkout"],
    ["POST", "/portal"],
    ["GET", "/wallet"],
    ["POST", "/webhook"],
  ]) {
    assert.match(fn, new RegExp(`Method: ${method}\\n\\s*Path: ${path.replace("/", "\\/")}`), `missing ${method} ${path}`);
  }
});

test("Stripe keys are read from Secrets Manager at runtime, never inlined", () => {
  const fn = body("StripeFunction");
  // Only the secret NAME is an env var; the value is fetched at runtime.
  assert.match(fn, /SECRET_ID: !Ref StripeSecretName/);
  assert.doesNotMatch(fn, /STRIPE_SECRET_KEY:/, "the secret value must not be an env var");
  // Least-privilege read scoped to exactly that one secret.
  assert.match(fn, /Action: secretsmanager:GetSecretValue/);
  assert.match(fn, /secret:\$\{StripeSecretName\}-\*/, "GetSecretValue must be scoped to the named secret");
  // A real secret VALUE (prefix + a long token) must never appear in the
  // template. The `sk_...` / `whsec_...` format hints in the doc comments are
  // fine — they carry no actual key material.
  assert.doesNotMatch(template, /sk_(live|test)_[A-Za-z0-9]{20,}/, "no literal Stripe secret key in the template");
  assert.doesNotMatch(template, /whsec_[A-Za-z0-9]{20,}/, "no literal webhook secret in the template");
});

test("the wallet table protects paid balances: Retain + PITR + TTL", () => {
  const b = body("WalletTable");
  assert.equal(typeOf("WalletTable"), "AWS::DynamoDB::Table");
  assert.match(b, /DeletionPolicy: Retain/);
  assert.match(b, /UpdateReplacePolicy: Retain/);
  assert.match(b, /PointInTimeRecoveryEnabled: true/);
  // Idempotency rows expire; wallet rows (no expiresAt) never do.
  assert.match(b, /AttributeName: expiresAt/);
  assert.match(b, /Enabled: true/);
});

test("the function's DynamoDB access is least-privilege and scoped to one table", () => {
  const b = body("StripeFunction");
  assert.match(b, /Action: \[dynamodb:GetItem, dynamodb:PutItem, dynamodb:UpdateItem\]/);
  assert.match(b, /Resource: !GetAtt WalletTable\.Arn/);
  assert.doesNotMatch(b, /dynamodb:DeleteItem/, "the handler never deletes; do not grant it");
});

test("the HTTP API throttles by default", () => {
  const b = body("StripeApi");
  assert.equal(typeOf("StripeApi"), "AWS::Serverless::HttpApi");
  assert.match(b, /ThrottlingRateLimit: 10\b/);
  assert.match(b, /ThrottlingBurstLimit: 20\b/);
});

test("Errors / Throttles / 5xx alarms exist and all notify a human", () => {
  for (const [alarm, ns, metric, dim] of [
    ["StripeErrorsAlarm", "AWS/Lambda", "Errors", "!Ref StripeFunction"],
    ["StripeThrottlesAlarm", "AWS/Lambda", "Throttles", "!Ref StripeFunction"],
    ["Api5xxAlarm", "AWS/ApiGateway", "5xx", "!Ref StripeApi"],
  ]) {
    const b = body(alarm);
    assert.ok(b, `${alarm} missing`);
    assert.match(b, new RegExp(`Namespace: ${ns.replace("/", "\\/")}`), `${alarm}: namespace`);
    assert.match(b, new RegExp(`MetricName: ${metric}\\b`), `${alarm}: metric`);
    assert.match(b, new RegExp(`Value: ${dim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), `${alarm}: dimension`);
    assert.match(b, /TreatMissingData: notBreaching/, `${alarm}: no-traffic must not page`);
    assert.match(b, /AlarmActions: \[!Ref AlertsTopic\]/, `${alarm}: must notify the alerts topic`);
  }
  assert.equal(typeOf("AlertsTopic"), "AWS::SNS::Topic");
  assert.match(body("AlertsTopic"), /Protocol: email/);
  assert.match(body("AlertsTopic"), /Endpoint: !Ref AlertEmail/);
  assert.ok(ofType("AWS::CloudWatch::Alarm").length >= 3);
});

// ---- money-relevant log lines must be ALERTABLE --------------------------------
// Both of these paths return HTTP 200 and do not throw, so neither
// quantum-stripe-errors (AWS/Lambda Errors counts FAILED invocations) nor
// quantum-stripe-5xx can ever see them. A console.error inside a successful
// 200 is greppable, not alertable — which is exactly how a buyer stays
// silently uncredited. Same idiom as lambda/qpu's orphaned-row filter: the
// FilterPattern's literal phrase is pinned to a string that literally appears
// in index.mjs, so editing the log line cannot silently disconnect the alarm.

const handlerSrc = readFileSync(new URL("./index.mjs", import.meta.url), "utf8");

/** The MetricFilter producing `metricName`, plus its quoted literal phrase. */
function filterFor(metricName) {
  const id = ofType("AWS::Logs::MetricFilter").find((r) => body(r).includes(metricName));
  assert.ok(id, `no metric filter produces ${metricName}`);
  const b = body(id);
  const phrase = b.match(/FilterPattern: '"([^"]+)"'/)?.[1];
  assert.ok(phrase, `${id}: FilterPattern must be a quoted literal phrase`);
  return { id, b, phrase };
}

test("an uncredited subscription invoice is alertable, not just greppable", () => {
  const { b, phrase } = filterFor("UncreditedInvoice");
  assert.match(b, /LogGroupName: !Ref StripeLogGroup/);
  assert.match(b, /MetricNamespace: QuantumStripe/);
  // The phrase must literally appear in the handler, or the alarm watches nothing.
  assert.ok(handlerSrc.includes(phrase), `index.mjs no longer logs the phrase "${phrase}"`);

  const alarm = body("UncreditedInvoiceAlarm");
  assert.ok(alarm, "UncreditedInvoiceAlarm missing");
  assert.match(alarm, /Namespace: QuantumStripe/);
  assert.match(alarm, /MetricName: UncreditedInvoice/);
  assert.match(alarm, /Threshold: 0\b/);
  assert.match(alarm, /ComparisonOperator: GreaterThanThreshold/);
  // No traffic must not page — this is a rare-event alarm, not a heartbeat.
  assert.match(alarm, /TreatMissingData: notBreaching/);
  assert.match(alarm, /AlarmActions: \[!Ref AlertsTopic\]/);
});

test("a failed delayed payment is alertable", () => {
  const { b, phrase } = filterFor("AsyncPaymentFailed");
  assert.match(b, /LogGroupName: !Ref StripeLogGroup/);
  assert.ok(handlerSrc.includes(phrase), `index.mjs no longer logs the phrase "${phrase}"`);
  const alarm = body("AsyncPaymentFailedAlarm");
  assert.ok(alarm, "AsyncPaymentFailedAlarm missing");
  assert.match(alarm, /TreatMissingData: notBreaching/);
  assert.match(alarm, /AlarmActions: \[!Ref AlertsTopic\]/);
});

test("every metric filter in this stack watches the stripe log group and notifies a human", () => {
  const filters = ofType("AWS::Logs::MetricFilter");
  assert.ok(filters.length >= 2, `expected the money-path filters, found: ${filters}`);
  const alarms = ofType("AWS::CloudWatch::Alarm");
  for (const f of filters) {
    const b = body(f);
    assert.match(b, /LogGroupName: !Ref StripeLogGroup/, `${f}: wrong log group`);
    const metric = b.match(/MetricName: (\S+)/)?.[1];
    const alarm = alarms.find((a) => new RegExp(`MetricName: ${metric}\\b`).test(body(a)));
    assert.ok(alarm, `${f}: metric ${metric} has no alarm — a filter nobody watches is decoration`);
    assert.match(body(alarm), /AlarmActions: \[!Ref AlertsTopic\]/, `${alarm}: must notify a human`);
  }
});
