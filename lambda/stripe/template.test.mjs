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
const parameters = blocks(section(template, "Parameters"));
const body = (id) => (resources[id] ?? []).join("\n");
const paramDefault = (id) =>
  (parameters[id] ?? []).join("\n").match(/^\s+Default:\s*(.+?)\s*$/m)?.[1];
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

test("the README never asks an operator to TYPE the signing secret", () => {
  // The whsec_ is the credit-minting key: /webhook is the one route with
  // Authorizer: NONE, the HMAC is its entire authentication, and the handler
  // then trusts client_reference_id and metadata.credits verbatim. A secret
  // pasted onto a command line is in argv, the shell history and the process
  // table. scripts/stripe/rotate-webhook-endpoint.mjs pipes it over stdin
  // instead; the README's job is to point there and nowhere else.
  const readme = readFileSync(new URL("./README.md", import.meta.url), "utf8");
  assert.match(
    readme,
    /rotate-webhook-endpoint\.mjs/,
    "the README must route webhook provisioning through the script"
  );
  // Two placeholders are legitimate: the secret's JSON SHAPE, and the
  // deliberate phase-1 stand-in the script later overwrites. Anything else
  // that looks like a value being handed to a command is the pattern this
  // guards against.
  const ALLOWED = new Set(["whsec_", "whsec_…", "whsec_PLACEHOLDER"]);
  for (const m of readme.matchAll(/whsec_[A-Za-z0-9_…]*/g)) {
    assert.ok(
      ALLOWED.has(m[0]),
      `README hands a webhook secret to a command: "${m[0]}" — pipe it, never type it`
    );
  }
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
  // The stack's own Description is the first thing anyone reads about this
  // table. It listed WALLET# and EVENT# only, though every refund path reads a
  // RECEIPT# row this Lambda writes — and a row prefix nobody knows exists is
  // one nobody protects.
  const description = template.match(/^Description: >\n([\s\S]*?)\n\S/m)?.[1] ?? "";
  for (const prefix of ["WALLET#", "EVENT#", "RECEIPT#"]) {
    assert.ok(description.includes(prefix), `the stack Description omits the ${prefix} rows`);
  }
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

// ---- the stack must be deployable TWICE in one account -------------------------
// A sandbox stack is how payment and credit-issuance changes get exercised before
// they touch real money, and it has to live in the SAME account and region as live
// (that is where the Cognito pool and the deploy role are). CloudFormation fails a
// second stack with AlreadyExists on any hardcoded physical name, so every one of
// them must derive from a parameter. The README claimed for months that
// `--parameter-overrides StripeSecretName=...` was enough; it was not, and nothing
// tested the claim.

/** Properties whose value becomes a physical, account-unique name. */
const PHYSICAL_NAME_PROPS = ["TableName", "FunctionName", "TopicName", "AlarmName", "MetricNamespace", "Namespace"];

/**
 * Every `Prop: value` in the whole Resources section for the naming props.
 *
 * Two YAML shapes both carry a namespace and BOTH must be seen, or the guard has
 * a blind spot exactly where a hardcoded name would hide: the alarm form
 * `Namespace: <x>` and the metric-filter list-item form `- MetricNamespace: <x>`
 * (a leading `- ` that a `^\s+Prop:` anchor silently skips). `AWS/...` namespaces
 * are Amazon's own and are legitimately literal, so they are excluded here rather
 * than exempted downstream — they are not OUR physical names.
 */
function physicalNames() {
  const out = [];
  for (const id of Object.keys(resources)) {
    for (const line of resources[id]) {
      const m = line.match(new RegExp(`^\\s+-?\\s*(${PHYSICAL_NAME_PROPS.join("|")}):\\s*(.+?)\\s*$`));
      if (!m) continue;
      if (/^["']?AWS\//.test(m[2])) continue; // AWS-owned namespace, not ours to parameterize
      out.push({ id, prop: m[1], value: m[2] });
    }
  }
  return out;
}

test("no physical resource name is hardcoded — a sandbox stack can coexist with live", () => {
  const found = physicalNames();
  assert.ok(found.length >= 10, `expected the table+function+topic+alarms, found ${found.length}`);
  for (const { id, prop, value } of found) {
    assert.doesNotMatch(
      value,
      /^["']?(quantum-stripe|QuantumStripe)/,
      `${id}.${prop} = ${value} is a hardcoded name; deploying a second stack in this ` +
        `account would fail with AlreadyExists. Derive it from !Ref NamePrefix / !Ref MetricNamespace.`
    );
    assert.match(
      value,
      /!Ref |!Sub /,
      `${id}.${prop} = ${value} must derive from a parameter`
    );
  }
});

test("the parameter defaults reproduce today's LIVE names exactly (a zero-diff update)", () => {
  // Renaming a live resource is not a rename — CloudFormation REPLACES it. For the
  // wallet table that would strand every purchased balance in a retained orphan
  // while the stack quietly served a new, empty one. These defaults are the only
  // thing standing between the parameterization above and that outcome, so they are
  // pinned to the exact strings deployed today (verified against the live stack).
  assert.equal(paramDefault("NamePrefix"), "quantum-stripe");
  assert.equal(paramDefault("MetricNamespace"), "QuantumStripe");

  const resolve = (v) =>
    v
      .replace(/^!Sub\s+/, "")
      .replace(/^["']|["']$/g, "")
      .replace(/\$\{NamePrefix\}/g, "quantum-stripe")
      .replace(/^!Ref NamePrefix$/, "quantum-stripe")
      .replace(/^!Ref MetricNamespace$/, "QuantumStripe");

  const resolved = new Set(physicalNames().map(({ value }) => resolve(value)));
  // Every name `aws cloudformation describe-stack-resources` reports today. It
  // is one-directional on purpose: each of these must still be produced, but
  // the template may legitimately declare names not yet deployed (a new alarm
  // arrives here only once it exists in the live stack).
  for (const live of [
    "quantum-stripe-wallet",
    "quantum-stripe",
    "quantum-stripe-alerts",
    "quantum-stripe-errors",
    "quantum-stripe-uncredited-invoice",
    // Born from an unnoticed rotation, and the one alarm whose live name this
    // list forgot — so it was the only one a NamePrefix regression could have
    // silently replaced.
    "quantum-stripe-signature-rejected",
    "quantum-stripe-async-payment-failed",
    "quantum-stripe-unreclaimed-refund",
    "quantum-stripe-webhook-fault",
    "quantum-stripe-throttles",
    "quantum-stripe-5xx",
    "QuantumStripe",
  ]) {
    assert.ok(resolved.has(live), `default parameters no longer produce the live name "${live}"`);
  }
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
  // The UMBRELLA phrase, exactly as the clawback side does it: five branches
  // end a settled purchase without moving the wallet, and pinning one branch's
  // literal watched exactly one of them while the other four returned 200 into
  // the void.
  assert.equal(phrase, "credits NOT granted", "one phrase must cover every withheld grant");
  assert.match(b, /LogGroupName: !Ref StripeLogGroup/);
  // The literal namespace moved to a parameter so a sandbox stack cannot page on
  // live money; "the default is still QuantumStripe" is pinned by the zero-diff test.
  assert.match(b, /MetricNamespace: !Ref MetricNamespace/);
  // The phrase must literally appear in the handler, or the alarm watches nothing.
  assert.ok(handlerSrc.includes(phrase), `index.mjs no longer logs the phrase "${phrase}"`);

  const alarm = body("UncreditedInvoiceAlarm");
  assert.ok(alarm, "UncreditedInvoiceAlarm missing");
  assert.match(alarm, /Namespace: !Ref MetricNamespace/);
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

test("every metric filter in this stack watches a log group this stack owns and notifies a human", () => {
  const filters = ofType("AWS::Logs::MetricFilter");
  assert.ok(filters.length >= 2, `expected the money-path filters, found: ${filters}`);
  const alarms = ofType("AWS::CloudWatch::Alarm");
  for (const f of filters) {
    const b = body(f);
    // Two groups, and only two. The function's, where every console.error
    // lands; and the GATEWAY's, which is the only place a rejection that never
    // reached the function can be seen at all.
    assert.match(
      b,
      /LogGroupName: !Ref (StripeLogGroup|StripeApiLogGroup)/,
      `${f}: wrong log group`
    );
    const metric = b.match(/MetricName: (\S+)/)?.[1];
    const alarm = alarms.find((a) => new RegExp(`MetricName: ${metric}\\b`).test(body(a)));
    assert.ok(alarm, `${f}: metric ${metric} has no alarm — a filter nobody watches is decoration`);
    assert.match(body(alarm), /AlarmActions: \[!Ref AlertsTopic\]/, `${alarm}: must notify a human`);
  }
});

test("every unreclaimable-money branch is covered by ONE shared filter", () => {
  const { b, phrase } = filterFor("UnreclaimedRefund");
  assert.equal(phrase, "credits NOT reclaimed", "one phrase must cover every branch, present and future");
  assert.match(b, /LogGroupName: !Ref StripeLogGroup/);
  assert.ok(handlerSrc.includes(phrase));
  const alarm = body("UnreclaimedRefundAlarm");
  assert.ok(alarm, "UnreclaimedRefundAlarm missing");
  assert.match(alarm, /AlarmActions: \[!Ref AlertsTopic\]/);
});

test("the Stripe client's deadline stays under the function's, so the handler's error paths can run", () => {
  // A runtime timeout kill is not an exception: it runs no catch block, so the
  // "webhook handling failed" line below is never emitted and its alarm never
  // fires. stripe-node's defaults (80,000 ms, 2 retries) are five times this
  // function's whole budget for a single attempt, so without an explicit
  // deadline a stalled Stripe call is ALWAYS ended by the runtime.
  const fnTimeout = Number(body("StripeFunction").match(/^\s+Timeout: (\d+)/m)?.[1]);
  assert.ok(Number.isFinite(fnTimeout), "StripeFunction must declare a Timeout");

  const opts = handlerSrc.match(/export const STRIPE_CLIENT_OPTIONS = \{([\s\S]*?)\};/)?.[1];
  assert.ok(opts, "index.mjs must export STRIPE_CLIENT_OPTIONS");
  const timeoutMs = Number(opts.match(/timeout:\s*(\d+)/)?.[1]);
  const retries = Number(opts.match(/maxNetworkRetries:\s*(\d+)/)?.[1]);
  assert.ok(Number.isFinite(timeoutMs), "STRIPE_CLIENT_OPTIONS must pin an explicit timeout");
  assert.ok(Number.isFinite(retries), "STRIPE_CLIENT_OPTIONS must pin maxNetworkRetries");

  // Attempts x per-request timeout, plus the SDK's backoff between them
  // (jittered, capped at 2 s per sleep), must all fit inside the runtime's.
  const MAX_BACKOFF_MS = 2000;
  const worstCaseMs = (retries + 1) * timeoutMs + retries * MAX_BACKOFF_MS;
  assert.ok(
    worstCaseMs < fnTimeout * 1000,
    `Stripe's worst case ${worstCaseMs}ms must stay under the function's ${fnTimeout}s`
  );
});

test("a JWT the gateway refuses is visible somewhere, and it is not the function's log group", () => {
  // The Cognito authorizer runs BEFORE any invocation, so a refused token
  // produces no log line, no Lambda metric, and no 5xx. Without access logs a
  // stale UserPoolClientId takes the storefront down leaving nothing behind at
  // all — the client renders a 401 as absence.
  const api = body("StripeApi");
  assert.match(api, /AccessLogSettings:/, "the HTTP API must write access logs");
  assert.match(api, /DestinationArn: !GetAtt StripeApiLogGroup\.Arn/);
  // The field that names WHY a token was refused (audience, issuer, expiry).
  assert.match(api, /\$context\.authorizer\.error/, "the log must record the authorizer's reason");
  assert.match(api, /\$context\.status/, "and the status the metric filter counts");

  assert.equal(typeOf("StripeApiLogGroup"), "AWS::Logs::LogGroup");
  assert.match(body("StripeApiLogGroup"), /DeletionPolicy: Retain/);
  assert.match(body("StripeApiLogGroup"), /RetentionInDays: !Ref LogRetentionInDays/);

  const filter = body("AuthRejectedMetricFilter");
  assert.ok(filter, "AuthRejectedMetricFilter missing");
  assert.match(filter, /LogGroupName: !Ref StripeApiLogGroup/);
  assert.match(filter, /\$\.status = "401"/);

  const alarm = body("AuthRejectedAlarm");
  assert.ok(alarm, "AuthRejectedAlarm missing");
  assert.match(alarm, /MetricName: AuthRejected/);
  // NOT the money-path threshold of 0: one expired token is a learner with a
  // tab left open, and paging on that trains the operator to ignore the topic.
  assert.doesNotMatch(alarm, /Threshold: 0\b/, "a lone expired token must not page");
  assert.match(alarm, /TreatMissingData: notBreaching/);
  assert.match(alarm, /AlarmActions: \[!Ref AlertsTopic\]/);
});

test("a failed webhook transaction is alertable — it is the only clawback-fault signal", () => {
  const { phrase } = filterFor("WebhookHandlerFault");
  assert.ok(handlerSrc.includes(phrase), `index.mjs no longer logs "${phrase}"`);
  assert.match(body("WebhookHandlerFaultAlarm"), /AlarmActions: \[!Ref AlertsTopic\]/);
});

// The INVERSE of the pinning test. filterFor proves filter -> code; this proves
// code -> filter, so a console.error added later cannot ship unwatched while the
// suite stays green. That gap is exactly how `webhook handling failed` sat
// unmonitored until now.
test("every console.error in the handler is covered by some metric filter", () => {
  const phrases = ofType("AWS::Logs::MetricFilter")
    .map((id) => body(id).match(/FilterPattern: '"([^"]+)"'/)?.[1])
    .filter(Boolean);
  assert.ok(phrases.length >= 4, `expected the money filters, found ${phrases.length}`);

  // Deliberately unwatched, with the reason written down.
  const UNWATCHED = [
    // Diagnostic only: the caller ALSO emits a pinned CLAWBACK_UNRECLAIMED line
    // when this leads to an unrefundable grant, so alarming twice on one fault
    // would train the operator to ignore the topic.
    "invoice.paid: could not expand payments",
  ];

  // Exported string constants used as log messages, resolved from the source so a
  // phrase can be shared between the handler and this test without being retyped.
  const consts = Object.fromEntries(
    [...handlerSrc.matchAll(/export const ([A-Z_]+) = "([^"]+)";/g)].map((m) => [m[1], m[2]])
  );

  // Three first-argument shapes, and ALL of them must be seen: a template
  // literal, a plain string, and a BARE CONSTANT. The bare-constant case was
  // invisible here until 2026-08-17, which is how console.error(SIGNATURE_REJECTED)
  // slipped in watched by nothing — the same blind spot physicalNames() had, in a
  // different guard. A message this test cannot see is a message no alarm covers.
  const messages = [...handlerSrc.matchAll(/console\.error\(\s*(`[^`]*`|"[^"]*"|[A-Z_]{4,})/g)].map((m) => {
    const raw = m[1];
    if (raw.startsWith("`") || raw.startsWith('"')) return raw.slice(1, -1);
    return consts[raw] ?? `<unresolved constant ${raw}>`;
  });
  assert.ok(messages.length >= 6, `expected several console.error sites, found ${messages.length}`);
  for (const msg of messages) {
    // Template literals interpolate the shared phrase constants; resolve them.
    let resolved = msg;
    for (const [name, value] of Object.entries(consts)) {
      resolved = resolved.replaceAll(`\${${name}}`, value);
    }
    const covered = phrases.some((p) => resolved.includes(p)) || UNWATCHED.some((u) => resolved.includes(u));
    assert.ok(covered, `console.error("${resolved}") is watched by no metric filter and is not on UNWATCHED`);
  }
});
