/**
 * Guardrail tests for template.yaml.
 *
 * Two properties here are load-bearing beyond the usual furniture:
 *
 *  - THE TABLE MUST HAVE NO TTL. TTL is table-wide and keyed on an attribute
 *    NAME, so any row that later carries that attribute is deleted whole, by
 *    DynamoDB, with no application code involved and nothing to alarm on. The
 *    wallet table is the standing example. This table is the only copy of the
 *    history and raw logs cannot be re-fetched past Amplify's retention.
 *  - A COLLECTOR THAT SILENTLY STOPS looks exactly like a site with no
 *    visitors. The did-not-run alarm must therefore breach on missing data,
 *    which is the opposite of every other alarm in this repo.
 *
 * The template uses CloudFormation intrinsics (!Ref, !Sub), which no plain YAML
 * parser loads without custom tags, so these tests slice the file structurally
 * instead of adding a YAML dependency. Run: `cd lambda/analytics && npm ci && npm test`.
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
      continue;
    }
    if (id) byId[id].push(line);
  }
  return byId;
}

const resources = blocks(section(template, "Resources"));
const body = (id) => (resources[id] ?? []).join("\n");
const typeOf = (id) => body(id).match(/^\s+Type:\s+(\S+)/m)?.[1];
const ofType = (t) => Object.keys(resources).filter((id) => typeOf(id) === t);

/** Declarations only. The comments explain the landmine and must be allowed to name it. */
const withoutComments = (text) =>
  text
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");

test("the history table carries NO TimeToLive specification", () => {
  // See the header. A TTL here would let DynamoDB delete days of history
  // silently, and the raw logs behind them cannot be re-fetched.
  assert.equal(typeOf("AnalyticsTable"), "AWS::DynamoDB::Table");
  const declared = withoutComments(body("AnalyticsTable"));
  assert.doesNotMatch(declared, /TimeToLiveSpecification/);
  assert.doesNotMatch(declared, /expiresAt/);
});

test("the history table survives the stack and is point-in-time recoverable", () => {
  const t = body("AnalyticsTable");
  assert.match(t, /DeletionPolicy: Retain/);
  assert.match(t, /UpdateReplacePolicy: Retain/);
  assert.match(t, /PointInTimeRecoveryEnabled: true/);
  assert.match(t, /BillingMode: PAY_PER_REQUEST/);
});

test("the function is capped, scheduled, and knows where to write", () => {
  const f = body("AnalyticsFunction");
  assert.equal(typeOf("AnalyticsFunction"), "AWS::Serverless::Function");
  assert.match(f, /ReservedConcurrentExecutions: !Ref MaxConcurrency/);
  assert.match(f, /Runtime: nodejs22\.x/);
  assert.match(f, /Type: Schedule/);
  assert.match(f, /Schedule: !Ref ScheduleExpression/);
  assert.match(f, /TABLE_NAME: !Ref AnalyticsTable/);
});

test("permissions are scoped to this table and this Amplify app, with no wildcard", () => {
  const f = body("AnalyticsFunction");
  assert.match(f, /Action: dynamodb:PutItem/);
  assert.match(f, /Resource: !GetAtt AnalyticsTable\.Arn/);
  assert.match(f, /Action: amplify:GenerateAccessLogs/);
  assert.match(f, /apps\/\$\{AmplifyAppId\}/);
  // The handler only ever writes; nothing here should be able to read a
  // learner's row on another table or delete this one's.
  assert.doesNotMatch(f, /Resource: ["']?\*/);
  assert.doesNotMatch(f, /dynamodb:(DeleteItem|Scan|GetItem)/);
});

test("the run cannot be silent: absent invocations breach, and only that alarm does", () => {
  const silent = body("AnalyticsSilentAlarm");
  assert.match(silent, /MetricName: Invocations/);
  assert.match(silent, /ComparisonOperator: LessThanThreshold/);
  assert.match(silent, /TreatMissingData: breaching/);

  for (const alarm of ofType("AWS::CloudWatch::Alarm")) {
    if (alarm === "AnalyticsSilentAlarm") continue;
    assert.match(
      body(alarm),
      /TreatMissingData: notBreaching/,
      `${alarm}: quiet is healthy for every alarm except the did-not-run one`,
    );
  }
});

test("the alerts topic reaches a human by email, and every alarm notifies it", () => {
  assert.equal(typeOf("AlertsTopic"), "AWS::SNS::Topic");
  assert.match(body("AlertsTopic"), /Protocol: email/);
  assert.match(body("AlertsTopic"), /Endpoint: !Ref AlertEmail/);

  const alarms = ofType("AWS::CloudWatch::Alarm");
  assert.ok(alarms.length >= 4, `expected at least 4 alarms, found: ${alarms}`);
  for (const alarm of alarms) {
    assert.match(body(alarm), /AlarmActions: \[!Ref AlertsTopic\]/, `${alarm}: must notify the alerts topic`);
    assert.match(body(alarm), /AlarmDescription:/, `${alarm}: must say what broke and where to look`);
  }
});

test("the Amplify domain parameter is the apex, which is the one that works", () => {
  // Passing quantum.altivum.ai to GenerateAccessLogs returns NotFoundException;
  // the association is on the apex with a "quantum" subdomain.
  const params = blocks(section(template, "Parameters"));
  assert.match(params.AmplifyDomain.join("\n"), /Default: altivum\.ai\s*$/m);
});
