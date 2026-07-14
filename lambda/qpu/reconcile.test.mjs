/**
 * Offline tests for the reconcile poll. No live AWS. Run:
 * `cd lambda/qpu && npm ci && npm test` (node --test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createReconcileCore } from "./reconcile.mjs";

const NOW = Date.UTC(2026, 6, 7, 12, 0, 0);
const task = (over = {}) => ({
  idempotencyKey: { S: "k1" },
  userId: { S: "u1" },
  status: { S: "SUBMITTED" },
  taskArn: { S: "arn:aws:braket:eu-north-1:1:quantum-task/t1" },
  shots: { N: "100" }, // feeds the completedShots medal counter
  estMicros: { N: "450000" },
  createdAt: { N: String(NOW) },
  ...over,
});

function stubDdb(rows) {
  const calls = [];
  return {
    calls,
    async send(cmd) {
      const name = cmd.constructor.name;
      calls.push({ name, input: cmd.input });
      if (name === "ScanCommand") return { Items: rows, LastEvaluatedKey: undefined };
      if (name === "UpdateItemCommand" || name === "TransactWriteItemsCommand") return {};
      throw new Error(`unexpected ${name}`);
    },
  };
}
const stubBraket = (statusByArn) => ({
  async send(cmd) {
    return { status: statusByArn[cmd.input.quantumTaskArn] ?? "RUNNING" };
  },
});

const core = (ddb, braket) =>
  createReconcileCore({ ddb, braket, ledgerTable: "ledger", tasksTable: "tasks", now: () => NOW });

test("a COMPLETED task is recorded (charge kept) AND credits the medal counters", async () => {
  const ddb = stubDdb([task()]);
  const summary = await core(ddb, stubBraket({ "arn:aws:braket:eu-north-1:1:quantum-task/t1": "COMPLETED" }))();
  assert.deepEqual(summary, { checked: 1, completed: 1, failed: 0, pending: 0, orphaned: 0 });

  const tx = ddb.calls.find((c) => c.name === "TransactWriteItemsCommand").input.TransactItems;
  // Leg 1 — the task row goes COMPLETED, guarded on SUBMITTED (unchanged semantics).
  assert.match(tx[0].Update.UpdateExpression, /:done/);
  assert.equal(tx[0].Update.ConditionExpression, "#s = :submitted");
  // Leg 2 — the learner's monotonic medal counters, in the SAME transaction.
  assert.equal(tx[1].Update.Key.pk.S, "USER#u1");
  assert.match(tx[1].Update.UpdateExpression, /ADD completedRuns :one, completedShots :shots/);
  assert.equal(tx[1].Update.ExpressionAttributeValues[":one"].N, "1");
  assert.equal(tx[1].Update.ExpressionAttributeValues[":shots"].N, "100"); // the row's real shots
  // The charge is KEPT — a completed run is never refunded.
  assert.ok(!tx.some((t) => JSON.stringify(t).includes(":neg")));
});

/** A real DynamoDB TransactionCanceledException: one CancellationReason per leg, in
 *  leg order. `codes` names what happened to each leg ("None" = it would have applied). */
const cancelled = (codes) =>
  Object.assign(new Error("Transaction cancelled"), {
    name: "TransactionCanceledException",
    CancellationReasons: codes.map((Code) => ({ Code })),
  });

/** A ddb stub whose every write throws `err`. */
const throwingDdb = (rows, err) => ({
  calls: [],
  async send(cmd) {
    const name = cmd.constructor.name;
    this.calls.push({ name });
    if (name === "ScanCommand") return { Items: rows, LastEvaluatedKey: undefined };
    throw err;
  },
});

test("counting is exactly-once: a re-delivered COMPLETED cancels the WHOLE transaction", async () => {
  // The double-count guard. Both legs are in one all-or-none transaction guarded on
  // status = SUBMITTED, so a re-delivery of an already-COMPLETED row cancels the
  // ledger ADD too — the counters cannot drift above the true run count. A medal
  // that inflates itself is as dishonest as one that never lights.
  // Leg 0 (the task row) is the guard that fails; leg 1 would have applied.
  const ddb = throwingDdb([task()], cancelled(["ConditionalCheckFailed", "None"]));
  const summary = await core(ddb, stubBraket({ "arn:aws:braket:eu-north-1:1:quantum-task/t1": "COMPLETED" }))();
  assert.equal(summary.completed, 1); // swallowed, did not throw
});

test("markCompleted RETHROWS a cancellation that is NOT the already-terminal guard", async () => {
  // The lost-race bug: a TransactionConflict (a concurrent submit touching the same
  // ledger row) is ALSO a TransactionCanceledException, and the old blanket swallow ate
  // it — logging `completed: 1` while applying nothing at all. The run stays SUBMITTED,
  // the counters never move, the medal silently never lights, and the money is spent.
  // Only the genuine already-terminal case may be swallowed.
  const ddb = throwingDdb([task()], cancelled(["None", "TransactionConflict"]));
  await assert.rejects(
    () => core(ddb, stubBraket({ "arn:aws:braket:eu-north-1:1:quantum-task/t1": "COMPLETED" }))(),
    /Transaction cancelled/,
  );
});

test("markCompleted RETHROWS a cancellation with no reasons it can read", async () => {
  // Fail loud on the unknown: a cancellation we cannot attribute to our own guard is
  // not evidence that the row was already terminal.
  const ddb = throwingDdb(
    [task()],
    Object.assign(new Error("opaque cancel"), { name: "TransactionCanceledException" }),
  );
  await assert.rejects(
    () => core(ddb, stubBraket({ "arn:aws:braket:eu-north-1:1:quantum-task/t1": "COMPLETED" }))(),
    /opaque cancel/,
  );
});

test("refund RETHROWS a cancellation that is NOT the already-reconciled guard", async () => {
  // Same defect class on the refund path: a dropped refund is real money the platform
  // never gets back, and the learner's allowance stays consumed by a run that failed.
  // Leg 2 (the task row) carries the guard; a conflict on leg 0 must surface.
  const ddb = throwingDdb([task()], cancelled(["TransactionConflict", "None", "None"]));
  await assert.rejects(
    () => core(ddb, stubBraket({ "arn:aws:braket:eu-north-1:1:quantum-task/t1": "FAILED" }))(),
    /Transaction cancelled/,
  );
});

test("a FAILED run is refunded and credits NO medal counters", async () => {
  // Every dollar spent maps to a run that counts; a refunded run counts for nothing.
  const ddb = stubDdb([task()]);
  await core(ddb, stubBraket({ "arn:aws:braket:eu-north-1:1:quantum-task/t1": "FAILED" }))();
  const tx = ddb.calls.find((c) => c.name === "TransactWriteItemsCommand").input.TransactItems;
  const body = JSON.stringify(tx);
  assert.ok(!body.includes("completedRuns"), "a refunded run must never earn a medal");
  assert.ok(!body.includes("completedShots"), "a refunded run must never earn shot credit");
  assert.ok(body.includes(":neg")); // it IS a refund
});

test("a FAILED task refunds the reservation (USER + DAY), guarded on SUBMITTED", async () => {
  const ddb = stubDdb([task()]);
  const summary = await core(ddb, stubBraket({ "arn:aws:braket:eu-north-1:1:quantum-task/t1": "FAILED" }))();
  assert.equal(summary.failed, 1);
  const tx = ddb.calls.find((c) => c.name === "TransactWriteItemsCommand").input.TransactItems;
  assert.equal(tx[0].Update.ExpressionAttributeValues[":neg"].N, "-450000"); // USER refund
  assert.equal(tx[1].Update.Key.pk.S, "DAY#2026-07-07"); // day derived from createdAt
  assert.equal(tx[2].Update.ConditionExpression, "#s = :submitted"); // idempotent
});

test("a still-running task is left pending; a stuck RESERVED row is flagged orphaned", async () => {
  // A genuine mid-flight-death row: RESERVED, no taskArn (the scan's age-bounded
  // RESERVED filter surfaces it; it can't be resolved here, so it's logged).
  const reserved = task({ idempotencyKey: { S: "k2" }, status: { S: "RESERVED" }, taskArn: undefined });
  const ddb = stubDdb([task(), reserved]);
  const summary = await core(ddb, stubBraket({ "arn:aws:braket:eu-north-1:1:quantum-task/t1": "QUEUED" }))();
  assert.equal(summary.pending, 1);
  assert.equal(summary.orphaned, 1);
  assert.equal(summary.completed, 0);
  // The orphaned row is never sent to Braket or written — just surfaced.
  assert.ok(!ddb.calls.some((c) => c.name === "TransactWriteItemsCommand"));
});

test("a re-delivered refund is idempotent: the already-reconciled cancellation is swallowed", async () => {
  // The priority double-refund path: a second refund of an already-FAILED row cancels
  // on the status=SUBMITTED guard (leg 2); the core must swallow THAT, and only that.
  const ddb = throwingDdb([task()], cancelled(["None", "None", "ConditionalCheckFailed"]));
  const summary = await core(ddb, stubBraket({ "arn:aws:braket:eu-north-1:1:quantum-task/t1": "FAILED" }))();
  assert.equal(summary.failed, 1); // did not throw
});

test("a genuinely unexpected error on markCompleted still THROWS (never silently lost)", async () => {
  // The swallow is narrow on purpose. A throttle/permission error must surface, not
  // vanish — otherwise a run could go uncounted and a medal would quietly fail to light.
  const ddb = throwingDdb(
    [task()],
    Object.assign(new Error("throttled"), { name: "ProvisionedThroughputExceededException" }),
  );
  await assert.rejects(
    () => core(ddb, stubBraket({ "arn:aws:braket:eu-north-1:1:quantum-task/t1": "COMPLETED" }))(),
    /throttled/,
  );
});
