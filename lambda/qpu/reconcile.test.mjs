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

test("a COMPLETED task is recorded (charge kept), guarded on SUBMITTED", async () => {
  const ddb = stubDdb([task()]);
  const summary = await core(ddb, stubBraket({ "arn:aws:braket:eu-north-1:1:quantum-task/t1": "COMPLETED" }))();
  assert.deepEqual(summary, { checked: 1, completed: 1, failed: 0, pending: 0, orphaned: 0 });
  const upd = ddb.calls.find((c) => c.name === "UpdateItemCommand");
  assert.match(upd.input.UpdateExpression, /COMPLETED|:done/);
  assert.equal(upd.input.ConditionExpression, "#s = :submitted"); // idempotent
  assert.ok(!ddb.calls.some((c) => c.name === "TransactWriteItemsCommand")); // no refund
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

test("a re-delivered refund is idempotent: a TransactionCanceledException is swallowed", async () => {
  // The priority double-refund path: a second refund of an already-FAILED row
  // cancels on the status=SUBMITTED guard; the core must swallow it, not throw.
  const ddb = {
    calls: [],
    async send(cmd) {
      const name = cmd.constructor.name;
      this.calls.push({ name });
      if (name === "ScanCommand") return { Items: [task()], LastEvaluatedKey: undefined };
      throw Object.assign(new Error("already reconciled"), { name: "TransactionCanceledException" });
    },
  };
  const summary = await core(ddb, stubBraket({ "arn:aws:braket:eu-north-1:1:quantum-task/t1": "FAILED" }))();
  assert.equal(summary.failed, 1); // did not throw
});

test("re-delivery is safe: a ConditionalCheckFailed on markCompleted is swallowed", async () => {
  const ddb = stubDdb([task()]);
  const throwing = {
    calls: ddb.calls,
    async send(cmd) {
      const name = cmd.constructor.name;
      ddb.calls.push({ name, input: cmd.input });
      if (name === "ScanCommand") return { Items: [task()], LastEvaluatedKey: undefined };
      throw Object.assign(new Error("already terminal"), { name: "ConditionalCheckFailedException" });
    },
  };
  const summary = await core(throwing, stubBraket({ "arn:aws:braket:eu-north-1:1:quantum-task/t1": "COMPLETED" }))();
  assert.equal(summary.completed, 1); // did not throw
});
