/**
 * Guardrail tests for template.yaml's notification path. This stack spends real
 * money, so the template must keep: an Errors alarm on EVERY Lambda function, a
 * human (email) subscriber on the kill-switch topic and on both budget
 * thresholds, a dead-reconciler alarm, and the orphaned-money metric filter
 * whose pattern literally matches reconcile.mjs's log line.
 *
 * The template uses CloudFormation intrinsics (!Ref, !Sub), which no plain YAML
 * parser loads without custom tags, so these tests slice the file structurally
 * (top-level section, then 2-space-indented resource blocks) instead of adding
 * a YAML dependency. Run: `cd lambda/qpu && npm ci && npm test` (node --test).
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

test("every Lambda function has an Errors alarm wired to the alerts topic", () => {
  const fns = ofType("AWS::Serverless::Function");
  assert.ok(fns.length >= 3, `expected the submit, reconcile, and killswitch functions, found: ${fns}`);
  const alarms = ofType("AWS::CloudWatch::Alarm");
  for (const fn of fns) {
    const alarm = alarms.find(
      (a) => /MetricName: Errors\b/.test(body(a)) && body(a).includes(`Value: !Ref ${fn}`),
    );
    assert.ok(alarm, `no Errors alarm dimensioned on function ${fn}`);
    const b = body(alarm);
    assert.match(b, /Namespace: AWS\/Lambda/, `${alarm}: wrong namespace`);
    assert.match(b, /Statistic: Sum/, `${alarm}: Errors must be summed`);
    assert.match(b, /TreatMissingData: notBreaching/, `${alarm}: no-traffic must not page`);
    assert.match(b, /AlarmActions: \[!Ref AlertsTopic\]/, `${alarm}: must notify the alerts topic`);
  }
});

test("the alerts topic and the kill-switch topic each reach a human by email", () => {
  for (const id of ["AlertsTopic", "KillSwitchTopic"]) {
    assert.equal(typeOf(id), "AWS::SNS::Topic", `${id} missing or wrong type`);
    assert.match(body(id), /Protocol: email/, `${id}: no email subscription`);
    assert.match(body(id), /Endpoint: !Ref AlertEmail/, `${id}: email must come from AlertEmail`);
  }
});

test("both budget notification thresholds carry an EMAIL subscriber alongside SNS", () => {
  const notifications = body("QpuBudget").split(/- Notification:/).slice(1);
  assert.equal(notifications.length, 2, "expected the 80% and 100% budget notifications");
  for (const n of notifications) {
    assert.match(n, /SubscriptionType: SNS/, "kill-switch (SNS) subscriber must stay");
    assert.match(n, /SubscriptionType: EMAIL/, "human (EMAIL) subscriber required");
    assert.match(n, /Address: !Ref AlertEmail/, "email must come from AlertEmail");
  }
});

test("a dead reconciler alerts: Invocations < 1 per hour, breaching on missing data", () => {
  const b = body("ReconcileStalledAlarm");
  assert.ok(b, "ReconcileStalledAlarm missing");
  assert.match(b, /MetricName: Invocations/);
  assert.match(b, /Value: !Ref ReconcileFunction/);
  assert.match(b, /Period: 3600/);
  assert.match(b, /Threshold: 1\b/);
  assert.match(b, /ComparisonOperator: LessThanThreshold/);
  // breaching: a deleted or never-firing schedule rule emits NO metric at all.
  assert.match(b, /TreatMissingData: breaching/);
  // And the schedule this window is sized for must still be 5-minutely.
  assert.match(body("ReconcileFunction"), /Schedule: rate\(5 minutes\)/);
});

test("the orphaned-money metric filter exists and matches reconcile.mjs's exact log line", () => {
  const filter = ofType("AWS::Logs::MetricFilter").find((id) => body(id).includes("OrphanedMoneyRow"));
  assert.ok(filter, "no metric filter producing OrphanedMoneyRow");
  const b = body(filter);
  // Attached to the explicitly declared reconcile log group, not an implicit one.
  assert.match(b, /LogGroupName: !Ref ReconcileLogGroup/);
  assert.match(b, /MetricNamespace: QuantumQpu/);
  const phrase = b.match(/FilterPattern: '"([^"]+)"'/)?.[1];
  assert.ok(phrase, "FilterPattern must be a quoted literal phrase");
  // The phrase must literally appear in reconcile.mjs's log call, so an edit to
  // the log line cannot silently disconnect the alarm from the code.
  const reconcileSrc = readFileSync(new URL("./reconcile.mjs", import.meta.url), "utf8");
  assert.ok(reconcileSrc.includes(phrase), `reconcile.mjs no longer logs the phrase "${phrase}"`);

  const alarm = body("OrphanedRowAlarm");
  assert.ok(alarm, "OrphanedRowAlarm missing");
  assert.match(alarm, /Namespace: QuantumQpu/);
  assert.match(alarm, /MetricName: OrphanedMoneyRow/);
  assert.match(alarm, /Threshold: 0\b/);
  assert.match(alarm, /ComparisonOperator: GreaterThanThreshold/);
  assert.match(alarm, /AlarmActions: \[!Ref AlertsTopic\]/);
});

test("the budget resource declares no fixed BudgetName (subscriber changes force replacement)", () => {
  // NotificationsWithSubscribers updates REPLACE the budget, and CloudFormation
  // creates the replacement before deleting the old one; a fixed name would
  // collide with itself and fail the stack update. (Comment lines are excluded:
  // the template explains this very rule in a comment mentioning BudgetName.)
  const propLines = (resources.QpuBudget ?? []).filter((l) => !l.trim().startsWith("#"));
  assert.ok(!propLines.some((l) => /^\s+BudgetName:/.test(l)), "QpuBudget must not pin BudgetName");
});
