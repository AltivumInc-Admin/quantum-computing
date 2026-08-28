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

test("credit metering is env-gated: WalletTableName param + conditional env + scoped wallet grant", () => {
  const params = blocks(section(template, "Parameters"));
  const p = (params.WalletTableName ?? []).join("\n");
  assert.ok(p, "WalletTableName parameter missing");
  assert.match(p, /Default: ""/, "metering must default OFF (empty table name)");

  const conditions = section(template, "Conditions").join("\n");
  assert.match(conditions, /HasWalletTable: !Not \[!Equals \[!Ref WalletTableName, ""\]\]/);

  // Both the submit function (debit + release) and the reconciler (refund of a
  // wallet-funded FAILED run) need the env var and a grant scoped to that ONE
  // table — and neither may exist when metering is off.
  for (const fn of ["QpuFunction", "ReconcileFunction"]) {
    const b = body(fn);
    assert.match(
      b,
      /WALLET_TABLE: !If \[HasWalletTable, !Ref WalletTableName, !Ref AWS::NoValue\]/,
      `${fn}: WALLET_TABLE env must be conditional on HasWalletTable`,
    );
    assert.match(b, /table\/\$\{WalletTableName\}/, `${fn}: wallet grant must name the wallet table ARN`);
  }
});

test("the budget resource declares no fixed BudgetName (subscriber changes force replacement)", () => {
  // NotificationsWithSubscribers updates REPLACE the budget, and CloudFormation
  // creates the replacement before deleting the old one; a fixed name would
  // collide with itself and fail the stack update. (Comment lines are excluded:
  // the template explains this very rule in a comment mentioning BudgetName.)
  const propLines = (resources.QpuBudget ?? []).filter((l) => !l.trim().startsWith("#"));
  assert.ok(!propLines.some((l) => /^\s+BudgetName:/.test(l)), "QpuBudget must not pin BudgetName");
});

test("the rate factor rides deployed configuration, on the ONE function that prices", () => {
  // Rule 6: the value converting true cost into charged credits resolves out of
  // Secrets Manager at deploy time and never exists in this repository. Rule 5:
  // the tutor stack reads the SAME secret through the SAME env key — the
  // cross-stack lockstep is asserted in web/__tests__/infra, and the deployed
  // pair by scripts/check-rate-parity.mjs.
  const params = blocks(section(template, "Parameters"));
  const p = (params.RateCardSecret ?? []).join("\n");
  assert.ok(p, "RateCardSecret parameter missing");
  // Default must be EXACTLY "": a Default carrying a real value would deploy
  // the spread from version control.
  assert.match(p, /^\s+Default:\s*""\s*$/m, 'RateCardSecret must default to ""');

  const conditions = section(template, "Conditions").join("\n");
  assert.match(conditions, /HasRateCard: !Not \[!Equals \[!Ref RateCardSecret, ""\]\]/);

  const resolveLine =
    /RATE_CARD: !If\s*\[HasRateCard, !Sub "\{\{resolve:secretsmanager:\$\{RateCardSecret\}:SecretString:factor\}\}", !Ref AWS::NoValue\]/;
  assert.match(body("QpuFunction"), resolveLine, "the submit function prices, so it reads the factor");

  // The reconciler must NOT carry RATE_CARD: it never prices — it refunds the
  // creditsCharged RECORDED on the task row (reconcile.mjs), exactly so a
  // repricing between debit and refund cannot diverge them. Dead config on a
  // function that never reads it is drift surface, and a parity check that
  // "verified" the reconciler would be verifying nothing.
  assert.ok(!/RATE_CARD/.test(body("ReconcileFunction")), "reconcile refunds recorded figures only");

  // Deploy-time resolution runs with the DEPLOYER's credentials — no function
  // role may hold a grant on the rate secret.
  assert.ok(!/RateCardSecret/.test(body("QpuFunction").match(/Policies:[\s\S]*/)?.[0] ?? ""),
    "the submit role must not read the rate secret at runtime");
});

test("a wallet deployed without a usable rate card is alarmable, not just greppable", () => {
  // qpu-core logs RATE_CARD_INVALID once per cold start when WalletTableName
  // is set but the factor is absent/garbled — a state in which every
  // over-allowance submit 402s while the deploy LOOKS configured. Filter +
  // alarm make that visible; the phrase is pinned to the packaged source.
  const b = body("QpuRateCardMetricFilter");
  assert.ok(b, "QpuRateCardMetricFilter missing");
  assert.match(b, /LogGroupName: !Ref QpuLogGroup/);
  const phrase = b.match(/FilterPattern: '"([^"]+)"'/)?.[1];
  assert.equal(phrase, "rate card missing or invalid");
  const src = readFileSync(new URL("./qpu-core.mjs", import.meta.url), "utf8");
  assert.ok(src.includes(phrase), "qpu-core.mjs no longer logs the rate-card phrase");
  const a = body("QpuRateCardAlarm");
  assert.ok(a, "QpuRateCardAlarm missing");
  assert.match(a, /Namespace: QuantumQpu/);
  assert.match(a, /TreatMissingData: notBreaching/);
  assert.match(a, /AlarmActions: \[!Ref AlertsTopic\]/);
});

test("a failed wallet refund is alarmable on both QPU log groups", () => {
  // Submit path: qpu-release-failed (the whole compensating release threw) and
  // qpu-refund-wallet-row-missing (the row vanished; refund must not mint it).
  const b = body("QpuRefundFailureMetricFilter");
  assert.ok(b, "QpuRefundFailureMetricFilter missing");
  assert.match(b, /LogGroupName: !Ref QpuLogGroup/);
  assert.match(b, /FilterPattern: '\?"qpu-release-failed" \?"qpu-refund-wallet-row-missing"'/);
  const core = readFileSync(new URL("./qpu-core.mjs", import.meta.url), "utf8");
  assert.ok(core.includes("qpu-release-failed"), "qpu-core.mjs lost the release-failed log");
  assert.ok(core.includes("qpu-refund-wallet-row-missing"), "qpu-core.mjs lost the missing-row log");
  assert.match(body("QpuRefundFailureAlarm") ?? "", /AlarmActions: \[!Ref AlertsTopic\]/);

  // Reconcile path: its refund leg logs through the injected log (console.log
  // in production — a severity-based filter would miss it; this term filter
  // does not care about severity).
  const r = body("ReconcileRefundFailureMetricFilter");
  assert.ok(r, "ReconcileRefundFailureMetricFilter missing");
  assert.match(r, /LogGroupName: !Ref ReconcileLogGroup/);
  const phrase = r.match(/FilterPattern: '"([^"]+)"'/)?.[1];
  assert.equal(phrase, "wallet row missing for refund");
  const rec = readFileSync(new URL("./reconcile.mjs", import.meta.url), "utf8");
  assert.ok(rec.includes(phrase), "reconcile.mjs lost the missing-row refund log");
  assert.match(body("ReconcileRefundFailureAlarm") ?? "", /AlarmActions: \[!Ref AlertsTopic\]/);
});

test("braket split: both functions carry the env pair and the conditional assume-role", () => {
  const res = section(template, "Resources").join("\n");
  // Env wiring on both functions (two occurrences each).
  assert.equal(res.match(/BRAKET_ROLE_ARN: !Ref BraketRoleArn/g)?.length, 2,
    "BRAKET_ROLE_ARN must be wired on SubmitFunction AND ReconcileFunction");
  assert.equal(res.match(/BRAKET_EXTERNAL_ID: !Ref BraketExternalId/g)?.length, 2);
  // The cross-account branch grants exactly sts:AssumeRole on the parameter.
  assert.equal(res.match(/Action: sts:AssumeRole/g)?.length, 2);
  assert.equal(res.match(/Resource: !Ref BraketRoleArn/g)?.length, 2);
});

test("braket split: direct grants survive ONLY behind the same-account branch", () => {
  const res = section(template, "Resources").join("\n");
  // Exact-count pinning, not a floor: braket:CreateQuantumTask must appear
  // EXACTLY once (submit's same-account action list) and braket:GetQuantumTask
  // EXACTLY twice (once beside it in submit's list, once as reconcile's sole
  // same-account action). Any new unconditional braket grant added ANYWHERE
  // in Resources — the realistic regression — changes one of these counts and
  // reddens this test. The wrapper count is a separate floor check: it catches
  // a HasBraketRole conditional being REMOVED (which would leave the action
  // counts unchanged, just unconditional); it does not catch a grant ADDED
  // outside any wrapper, which is what the exact counts are for.
  const createCount = res.match(/braket:CreateQuantumTask/g)?.length ?? 0;
  const getCount = res.match(/braket:GetQuantumTask/g)?.length ?? 0;
  const condWrappers = res.match(/- !If\n\s+- HasBraketRole/g)?.length ?? 0;
  assert.equal(createCount, 1,
    "braket:CreateQuantumTask must appear exactly once (submit's same-account branch)");
  assert.equal(getCount, 2,
    "braket:GetQuantumTask must appear exactly twice (submit's list + reconcile's sole action)");
  assert.ok(condWrappers >= 3,
    "expected >=3 HasBraketRole conditionals (submit braket, submit s3, reconcile braket)");
});

test("braket split: the kill-switch subscribes to the foreign spend topic, conditionally", () => {
  const res = blocks(section(template, "Resources"));
  const sub = res.BraketSpendSubscription?.join("\n") ?? "";
  assert.match(sub, /Condition: HasBraketSpendTopic/);
  assert.match(sub, /Protocol: lambda/);
  assert.match(sub, /Region: us-east-2/);
  const perm = res.BraketSpendInvokePermission?.join("\n") ?? "";
  assert.match(perm, /Principal: sns\.amazonaws\.com/);
  assert.match(perm, /SourceArn: !Ref BraketSpendTopicArn/);
});
