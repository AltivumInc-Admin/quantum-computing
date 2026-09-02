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

const handlerSrc = readFileSync(new URL("./index.mjs", import.meta.url), "utf8");

/**
 * Pin one log-line -> metric filter -> alarm chain end to end.
 *
 * These alarms work by string coincidence: the handler console.warns a phrase,
 * a MetricFilter turns that literal into a metric, and an alarm reads it. Three
 * hand-synced copies, of which the repo's suites historically pinned one. Reword
 * any of them and both halves stay green while the alarm goes permanently dark
 * — and the matched-nothing alarm's own description says NOTHING else would say
 * so. lambda/qpu pins the identical mechanism (template.test.mjs "the orphaned-
 * money metric filter ... matches reconcile.mjs's exact log line"); this is the
 * same assertion, reusable because this stack has more than one such chain.
 */
function assertWarnAlarmChain(metricName, alarmId) {
  const filterId = ofType("AWS::Logs::MetricFilter").find((id) => body(id).includes(`MetricName: ${metricName}`));
  assert.ok(filterId, `no metric filter producing ${metricName}`);
  const filter = body(filterId);

  // Attached to the explicitly declared log group, not an implicit one.
  assert.match(filter, /LogGroupName: !Ref AnalyticsLogGroup/, `${filterId}: wrong log group`);
  assert.match(filter, /MetricNamespace: QuantumAnalytics/, `${filterId}: wrong namespace`);

  const phrase = filter.match(/FilterPattern: '"([^"]+)"'/)?.[1];
  assert.ok(phrase, `${filterId}: FilterPattern must be a quoted literal phrase`);
  assert.ok(handlerSrc.includes(phrase), `index.mjs no longer logs the phrase "${phrase}"`);

  const alarm = body(alarmId);
  assert.ok(alarm, `${alarmId} missing`);
  assert.match(alarm, /Namespace: QuantumAnalytics/, `${alarmId}: namespace must match the filter`);
  assert.match(alarm, new RegExp(`MetricName: ${metricName}\\b`), `${alarmId}: reads a different metric`);
  assert.match(alarm, /AlarmActions: \[!Ref AlertsTopic\]/, `${alarmId}: must notify the alerts topic`);
}

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

test("the matched-nothing alarm is wired to index.mjs's exact log line", () => {
  assertWarnAlarmChain("MatchedNothing", "AnalyticsMatchedNothingAlarm");
});

test("the bot-filter-incomplete alarm is wired to index.mjs's exact log line", () => {
  assertWarnAlarmChain("BotFilterIncomplete", "AnalyticsBotFilterAlarm");
});

test("the parse-degraded alarm is wired to index.mjs's exact log line", () => {
  assertWarnAlarmChain("ParseDegraded", "AnalyticsParseDegradedAlarm");
});

test("the alerts topic reaches a human by email, and every alarm notifies it", () => {
  assert.equal(typeOf("AlertsTopic"), "AWS::SNS::Topic");
  assert.match(body("AlertsTopic"), /Protocol: email/);
  assert.match(body("AlertsTopic"), /Endpoint: !Ref AlertEmail/);

  // Named, not counted with >=. A bound that only grows lets an alarm be
  // DELETED with the suite green, and lets README's Observability table fall
  // behind a newly added one — which is how the matched-nothing alarm shipped
  // undocumented. Add an alarm here and the README table has to be revisited.
  const alarms = ofType("AWS::CloudWatch::Alarm");
  assert.deepEqual(
    [...alarms].sort(),
    [
      "AnalyticsBotFilterAlarm",
      "AnalyticsDurationAlarm",
      "AnalyticsErrorsAlarm",
      "AnalyticsMatchedNothingAlarm",
      "AnalyticsParseDegradedAlarm",
      "AnalyticsSilentAlarm",
      "AnalyticsThrottlesAlarm",
    ],
    "the alarm set changed — update README.md's Observability table too",
  );
  for (const alarm of alarms) {
    assert.match(body(alarm), /AlarmActions: \[!Ref AlertsTopic\]/, `${alarm}: must notify the alerts topic`);
    assert.match(body(alarm), /AlarmDescription:/, `${alarm}: must say what broke and where to look`);
  }
});

test("the Amplify domain parameter is the apex, which is the one that works", () => {
  // Passing a subdomain (learner.quantumenv.dev) to GenerateAccessLogs returns
  // NotFoundException; the association is the apex, and the subdomain is
  // selected inside the handler by x-host-header.
  const params = blocks(section(template, "Parameters"));
  assert.match(params.AmplifyDomain.join("\n"), /Default: quantumenv\.dev\s*$/m);
});

test("the ops script reads this stack's identity rather than restating it", () => {
  // The QL-Prod cutover moved the Lambda and left scripts/analytics/backfill.mjs
  // pointing at the retired Altivum app: it fetched the wrong logs, matched none
  // of them, printed zeroes and exited 0. The script now slices AmplifyAppId,
  // AmplifyDomain and SiteHost out of this file, so it cannot lag a deploy —
  // and this test fails if anyone copies a value back into it.
  const backfill = readFileSync(new URL("../../scripts/analytics/backfill.mjs", import.meta.url), "utf8");
  for (const name of ["AmplifyAppId", "AmplifyDomain", "SiteHost"]) {
    assert.ok(
      backfill.includes(`paramDefault("${name}")`),
      `backfill.mjs must take ${name} from template.yaml, not from a constant`,
    );
  }
  const params = blocks(section(template, "Parameters"));
  for (const name of ["AmplifyAppId", "AmplifyDomain", "SiteHost"]) {
    const value = params[name].join("\n").match(/^\s+Default: (.+)$/m)?.[1]?.trim();
    assert.ok(value, `${name} must carry a Default for backfill.mjs to read`);
    assert.equal(
      backfill.includes(value),
      false,
      `backfill.mjs hardcodes ${name}'s value (${value}); it must read it from the template`,
    );
  }
});

test("the host filter is a parameter, and it names the canonical site host", () => {
  // A stale host filter does not skew this report, it ZEROES it — every row is
  // dropped, `humans` records 0, the job still succeeds and no alarm fires.
  // That silently held from the QL-Prod cutover until 2026-08-31, so the value
  // is a parameter wired to an env var (never a source constant) and it must
  // name the same host the site actually serves.
  //
  // DERIVED, not restated. web/src/lib/site.ts is the declared single source
  // for the deployed origin; the classifier's fallback and this parameter's
  // Default are copies of its hostname, and a third hardcoded copy in this file
  // would let all of them drift together with the suite green. The
  // matched-nothing alarm's own description tells the operator to compare the
  // two by hand — this is that comparison, made automatic.
  const params = blocks(section(template, "Parameters"));
  assert.ok(params.SiteHost, "SiteHost must be a template parameter");
  assert.match(template, /SITE_HOST: !Ref SiteHost/, "SiteHost must reach the function as SITE_HOST");

  const siteTs = readFileSync(new URL("../../web/src/lib/site.ts", import.meta.url), "utf8");
  const siteUrl = siteTs.match(/^export const SITE_URL = "([^"]+)"/m)?.[1];
  assert.ok(siteUrl, "web/src/lib/site.ts must export a string SITE_URL");
  const canonical = new URL(siteUrl).hostname;

  const paramDefault = params.SiteHost.join("\n").match(/^\s+Default: (.+)$/m)?.[1]?.trim();
  assert.equal(paramDefault, canonical, "SiteHost's Default disagrees with SITE_URL in web/src/lib/site.ts");

  const classifySrc = readFileSync(new URL("./classify.mjs", import.meta.url), "utf8");
  const fallback = classifySrc.match(/^export const SITE_HOST = "([^"]+)";/m)?.[1];
  assert.equal(fallback, canonical, "classify.mjs's SITE_HOST fallback disagrees with web/src/lib/site.ts");
});
