/**
 * Guardrail tests for template.yaml's throttling and notification path. The
 * sync API sits between learners' progress (the crown jewels) and a
 * PAY_PER_REQUEST DynamoDB table, so the template must keep: a stage throttle
 * sized to the client's real cadence, an Errors and a Throttles alarm on the
 * function, a sustained write-capacity alarm on the table, a 5xx alarm on the
 * API, and a human (email) subscriber on the alerts topic.
 *
 * The template uses CloudFormation intrinsics (!Ref, !Sub), which no plain YAML
 * parser loads without custom tags, so these tests slice the file structurally
 * (top-level section, then 2-space-indented resource blocks) instead of adding
 * a YAML dependency. Run: `cd lambda/sync && npm ci && npm test` (node --test).
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

test("the HTTP API throttles by default: 5 rps steady, burst 10", () => {
  const b = body("SyncApi");
  assert.equal(typeOf("SyncApi"), "AWS::Serverless::HttpApi");
  assert.match(b, /DefaultRouteSettings:/, "SyncApi must set DefaultRouteSettings");
  // The client PUTs at most ~1 snapshot/user/min (debounce 20s / maxWait 60s),
  // so these limits never touch a real user while capping a 256KB-PUT flood.
  assert.match(b, /ThrottlingRateLimit: 5\b/);
  assert.match(b, /ThrottlingBurstLimit: 10\b/);
});

test("the sync function has an Errors alarm and a Throttles alarm", () => {
  for (const [alarm, metric] of [
    ["SyncErrorsAlarm", "Errors"],
    ["SyncThrottlesAlarm", "Throttles"],
  ]) {
    const b = body(alarm);
    assert.ok(b, `${alarm} missing`);
    assert.match(b, /Namespace: AWS\/Lambda/, `${alarm}: wrong namespace`);
    assert.match(b, new RegExp(`MetricName: ${metric}\\b`), `${alarm}: wrong metric`);
    assert.match(b, /Value: !Ref SyncFunction/, `${alarm}: must be dimensioned on the function`);
    assert.match(b, /Statistic: Sum/, `${alarm}: must be summed`);
    assert.match(b, /Threshold: 0\b/, `${alarm}: a single event must alarm`);
    assert.match(b, /ComparisonOperator: GreaterThanThreshold/);
    assert.match(b, /TreatMissingData: notBreaching/, `${alarm}: no-traffic must not page`);
  }
});

test("a sustained table write spike alarms: >10,000 WCU per 5 min for 3 periods", () => {
  const b = body("TableWriteSpikeAlarm");
  assert.ok(b, "TableWriteSpikeAlarm missing");
  assert.match(b, /Namespace: AWS\/DynamoDB/);
  assert.match(b, /MetricName: ConsumedWriteCapacityUnits/);
  assert.match(b, /Name: TableName/);
  assert.match(b, /Value: !Ref ProgressTable/);
  assert.match(b, /Statistic: Sum/);
  assert.match(b, /Period: 300\b/);
  // Sustained, not a blip: three consecutive breaching periods.
  assert.match(b, /EvaluationPeriods: 3\b/);
  assert.match(b, /Threshold: 10000\b/);
  assert.match(b, /ComparisonOperator: GreaterThanThreshold/);
  assert.match(b, /TreatMissingData: notBreaching/);
});

test("a server-side API failure alarms: any 5xx in 5 minutes", () => {
  const b = body("Api5xxAlarm");
  assert.ok(b, "Api5xxAlarm missing");
  assert.match(b, /Namespace: AWS\/ApiGateway/);
  // HTTP APIs (v2) emit "5xx"; "5XXError" is the REST (v1) metric name.
  assert.match(b, /MetricName: 5xx\b/);
  assert.match(b, /Name: ApiId/);
  assert.match(b, /Value: !Ref SyncApi/);
  assert.match(b, /Statistic: Sum/);
  assert.match(b, /Threshold: 0\b/);
  assert.match(b, /ComparisonOperator: GreaterThanThreshold/);
  assert.match(b, /TreatMissingData: notBreaching/);
});

test("the alerts topic reaches a human by email, and every alarm notifies it", () => {
  assert.equal(typeOf("AlertsTopic"), "AWS::SNS::Topic", "AlertsTopic missing or wrong type");
  assert.match(body("AlertsTopic"), /Protocol: email/, "AlertsTopic: no email subscription");
  assert.match(body("AlertsTopic"), /Endpoint: !Ref AlertEmail/, "email must come from AlertEmail");
  const alarms = ofType("AWS::CloudWatch::Alarm");
  assert.ok(alarms.length >= 4, `expected errors/throttles/write-spike/5xx alarms, found: ${alarms}`);
  for (const alarm of alarms) {
    assert.match(body(alarm), /AlarmActions: \[!Ref AlertsTopic\]/, `${alarm}: must notify the alerts topic`);
  }
});
