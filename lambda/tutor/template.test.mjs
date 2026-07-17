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
 * (top-level section, then 2-space-indented resource blocks) instead of adding
 * a YAML dependency. Run: `cd lambda/tutor && npm ci && npm test` (node --test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const template = readFileSync(new URL("./template.yaml", import.meta.url), "utf8");

/** Lines of one top-level section (e.g. Resources), up to the next top-level key. */
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

/** Map of logicalId -> body lines for every 2-space-indented block in a section. */
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

test("every alarm in the template notifies the alerts topic", () => {
  const alarms = ofType("AWS::CloudWatch::Alarm");
  assert.ok(alarms.length >= 2, `expected the tutorError and high-invocations alarms, found: ${alarms}`);
  for (const alarm of alarms) {
    assert.match(body(alarm), /AlarmActions: \[!Ref AlertsTopic\]/, `${alarm}: must notify the alerts topic`);
  }
});
