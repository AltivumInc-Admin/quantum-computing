/**
 * Guardrail tests for template.yaml's notification path. The tutor streams its
 * answer inside a committed HTTP 200, so a Bedrock failure raises neither the
 * HTTP status nor the Lambda Errors metric — the ONLY trace is index.mjs's
 * console.error(JSON.stringify({ tutorError: true, ... })) line. The template
 * must keep: a metric filter whose pattern literally matches that emission, an
 * alarm on the resulting metric, the (formerly console-managed) high-invocations
 * alarm, and a human (email) subscriber on the alerts topic.
 *
 * The template uses CloudFormation intrinsics (!Ref, !Sub), which no plain YAML
 * parser loads without custom tags, so these tests slice the file structurally
 * (see cfn-slice.mjs) instead of adding a YAML dependency.
 * Run: `cd lambda/tutor && npm ci && npm test` (node --test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { loadTemplate, section, blocks } from "./cfn-slice.mjs";

const { text: template, body, typeOf, ofType } = loadTemplate("template.yaml", import.meta.url);

test("the tutorError metric filter exists and matches index.mjs's exact emission", () => {
  const filter = ofType("AWS::Logs::MetricFilter").find((id) => body(id).includes("TutorError"));
  assert.ok(filter, "no metric filter producing TutorError");
  const b = body(filter);
  // Attached to the explicitly declared tutor log group, not an implicit one.
  assert.match(b, /LogGroupName: !Ref TutorLogGroup/);
  assert.match(b, /MetricNamespace: QuantumTutor/);
  const phrase = b.match(/FilterPattern: '"([^"]+)"'/)?.[1];
  assert.ok(phrase, "FilterPattern must be a quoted literal term");
  // A JSON selector ({ $.tutorError IS TRUE }) would NEVER fire: the function
  // logs in Lambda's default text format, whose timestamp/request-id prefix
  // makes the event invalid JSON. The pattern must stay a literal term.
  assert.ok(!phrase.startsWith("{"), "FilterPattern must not be a JSON selector");
  // The term must literally appear in index.mjs's structured error log, so an
  // edit to the log line cannot silently disconnect the alarm from the code.
  const indexSrc = readFileSync(new URL("./index.mjs", import.meta.url), "utf8");
  assert.ok(indexSrc.includes(phrase), `index.mjs no longer logs the term "${phrase}"`);
  assert.match(
    indexSrc,
    /console\.error\(JSON\.stringify\(\{ tutorError: true/,
    "index.mjs must keep the structured tutorError emission the filter is built on",
  );
});

test("the tutorError alarm turns the metric into a notification", () => {
  const b = body("TutorErrorAlarm");
  assert.ok(b, "TutorErrorAlarm missing");
  assert.match(b, /Namespace: QuantumTutor/);
  assert.match(b, /MetricName: TutorError/);
  assert.match(b, /Statistic: Sum/);
  assert.match(b, /Threshold: 0\b/);
  assert.match(b, /ComparisonOperator: GreaterThanThreshold/);
  assert.match(b, /TreatMissingData: notBreaching/, "no-traffic must not page");
  assert.match(b, /AlarmActions: \[!Ref AlertsTopic\]/);
});

test("the high-invocations alarm is stack-managed with the console alarm's exact shape", () => {
  const b = body("HighInvocationsAlarm");
  assert.ok(b, "HighInvocationsAlarm missing");
  assert.match(b, /Namespace: AWS\/Lambda/);
  assert.match(b, /MetricName: Invocations/);
  assert.match(b, /Value: !Ref TutorFunction/);
  assert.match(b, /Statistic: Sum/);
  assert.match(b, /Period: 3600/);
  assert.match(b, /Threshold: 500\b/);
  assert.match(b, /ComparisonOperator: GreaterThanThreshold/);
  assert.match(b, /TreatMissingData: notBreaching/);
  assert.match(b, /AlarmActions: \[!Ref AlertsTopic\]/);
  // PutMetricAlarm upserts by name: reusing the console alarm's name would
  // either fail stack creation or silently seize (then delete on rollback) a
  // resource the stack did not create. The name must stay distinct.
  const name = b.match(/^\s+AlarmName:\s+(\S+)/m)?.[1];
  assert.ok(name, "HighInvocationsAlarm must pin an explicit AlarmName");
  assert.notEqual(name, "quantum-tutor-high-invocations", "must not collide with the console alarm");
});

test("the alerts topic reaches a human by email and avoids the console topic's name", () => {
  assert.equal(typeOf("AlertsTopic"), "AWS::SNS::Topic", "AlertsTopic missing or wrong type");
  const b = body("AlertsTopic");
  assert.match(b, /Protocol: email/, "AlertsTopic: no email subscription");
  assert.match(b, /Endpoint: !Ref AlertEmail/, "AlertsTopic: email must come from AlertEmail");
  // SNS CreateTopic is idempotent by name: reusing the hand-created
  // quantum-tutor-alerts name would silently claim (and later delete) it.
  const name = b.match(/^\s+TopicName:\s+(\S+)/m)?.[1];
  assert.ok(name, "AlertsTopic must pin an explicit TopicName");
  assert.notEqual(name, "quantum-tutor-alerts", "must not collide with the console-created topic");
});

test("the Function URL defaults to AWS_IAM, so a cutover cannot leave it public", () => {
  // README step 1 of the blue-green cutover deploys with FunctionUrlAuthType=NONE
  // and relies on a human remembering step 5 to flip it back. If the DEFAULT ever
  // becomes NONE, a later plain `sam deploy` silently re-opens the raw Function
  // URL to unsigned public POSTs, bypassing CloudFront, the WAF rate limit and
  // every edge control — while still returning 200 to everyone.
  const params = blocks(section(template, "Parameters"));
  const p = (params.FunctionUrlAuthType ?? []).join("\n");
  assert.ok(p, "FunctionUrlAuthType parameter missing");
  assert.match(p, /Default:\s*AWS_IAM/, "FunctionUrlAuthType must DEFAULT to AWS_IAM");
});

test("CORS allows the body-hash header the client actually sends", () => {
  // POST through OAC requires x-amz-content-sha256 on every request. Dropping it
  // from AllowHeaders breaks the browser preflight and 403s every live request,
  // with nothing else in the stack to signal why.
  const fn = ofType("AWS::Serverless::Function").map((id) => body(id)).join("\n");
  assert.match(fn, /x-amz-content-sha256/, "AllowHeaders must permit the body-hash header");
  // Pinned against the header the client sends, the same drift-proofing the
  // tutorError filter does against index.mjs.
  const clientPath = new URL("../../web/src/components/ask-tutor.tsx", import.meta.url);
  assert.ok(existsSync(clientPath), `tutor client moved from ${clientPath.pathname} — repoint this assertion`);
  assert.ok(
    readFileSync(clientPath, "utf8").includes("x-amz-content-sha256"),
    "ask-tutor.tsx no longer sends x-amz-content-sha256 — the CORS allowance is now dead config",
  );
});

test("every alarm in the template notifies the alerts topic", () => {
  const alarms = ofType("AWS::CloudWatch::Alarm");
  assert.ok(alarms.length >= 2, `expected the tutorError and high-invocations alarms, found: ${alarms}`);
  for (const alarm of alarms) {
    assert.match(body(alarm), /AlarmActions: \[!Ref AlertsTopic\]/, `${alarm}: must notify the alerts topic`);
  }
});

test("the tutor log group keeps its LITERAL name (import-compatibility)", () => {
  const b = body("TutorLogGroup");
  assert.ok(b, "TutorLogGroup resource must exist");
  // The group was adopted via CloudFormation resource IMPORT, which stores the
  // literal physical name. A raw !Sub expression here is flagged as a
  // LogGroupName CHANGE (RequiresRecreation: Always) on every subsequent
  // deploy, planning a replacement that fails on the existing name. The
  // function name is pinned (FunctionName: quantum-tutor), so the literal can
  // never drift from the resolved expression.
  assert.match(b, /LogGroupName: \/aws\/lambda\/quantum-tutor$/m, "LogGroupName must be the literal string");
  assert.ok(!/LogGroupName: !Sub/.test(b), "LogGroupName must NOT be a !Sub expression (breaks post-import deploys)");
  assert.match(b, /DeletionPolicy: Retain/, "imported resources require a DeletionPolicy");
});
