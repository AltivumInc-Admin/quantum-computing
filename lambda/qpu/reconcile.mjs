// quantum-qpu-reconcile: a scheduled poll that trues up the ledger against what
// actually happened on the hardware. Two jobs:
//   COMPLETED task → mark the row COMPLETED (keep the charge; this is what lights
//                    the learner's hardware credential from real provenance).
//   FAILED/CANCELLED → refund the reservation (a run that didn't happen should
//                    not cost the learner's sponsored budget).
// Every write is guarded on the current status (ConditionExpression), so the
// at-least-once, possibly-out-of-order nature of task state changes can never
// double-apply. DI-core, offline-tested under `node --test`.

import { DynamoDBClient, ScanCommand, TransactWriteItemsCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { BraketClient, GetQuantumTaskCommand } from "@aws-sdk/client-braket";
import { utcDay, DEVICE_REGION } from "./qpu-core.mjs";

// A RESERVED row older than this is stuck: the submit Lambda (20s timeout) either
// died between committing the reservation and writing the task ARN (a real,
// charged, un-refundable-here money-stuck row) or its compensating release also
// failed. Well past the submit timeout, so this never races an in-flight submit.
const ORPHAN_AGE_MS = 5 * 60 * 1000;

// Scan the rows that need attention: SUBMITTED tasks (resolve against Braket) and
// stuck RESERVED rows older than ORPHAN_AGE_MS (detect + surface — they can't be
// resolved here without the ARN the submit never persisted).
async function scanStuck(ddb, tasksTable, staleBefore) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: tasksTable,
        FilterExpression: "#s = :submitted OR (#s = :reserved AND createdAt < :old)",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":submitted": { S: "SUBMITTED" },
          ":reserved": { S: "RESERVED" },
          ":old": { N: String(staleBefore) },
        },
        ExclusiveStartKey,
      }),
    );
    if (res.Items) items.push(...res.Items);
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

export function createReconcileCore({ ddb, braket, ledgerTable, tasksTable, now = () => Date.now(), log = () => {} }) {
  // COMPLETED — the task ran and Braket billed; keep the charge, just record it.
  async function markCompleted(idempotencyKey) {
    await ddb
      .send(
        new UpdateItemCommand({
          TableName: tasksTable,
          Key: { idempotencyKey: { S: idempotencyKey } },
          UpdateExpression: "SET #s = :done, actualMicros = estMicros",
          ConditionExpression: "#s = :submitted",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":done": { S: "COMPLETED" }, ":submitted": { S: "SUBMITTED" } },
        }),
      )
      .catch((e) => {
        if (e?.name !== "ConditionalCheckFailedException") throw e; // already terminal — fine
      });
  }

  // FAILED/CANCELLED — refund the reservation. The all-or-none transaction only
  // fires while the row is still SUBMITTED, so re-delivery can't double-refund.
  async function refund(idempotencyKey, sub, day, estMicros) {
    await ddb
      .send(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Update: {
                TableName: ledgerTable,
                Key: { pk: { S: `USER#${sub}` } },
                UpdateExpression: "ADD spentMicros :neg",
                ExpressionAttributeValues: { ":neg": { N: String(-estMicros) } },
              },
            },
            {
              Update: {
                TableName: ledgerTable,
                Key: { pk: { S: `DAY#${day}` } },
                UpdateExpression: "ADD dayMicros :neg",
                ExpressionAttributeValues: { ":neg": { N: String(-estMicros) } },
              },
            },
            {
              Update: {
                TableName: tasksTable,
                Key: { idempotencyKey: { S: idempotencyKey } },
                UpdateExpression: "SET #s = :failed",
                ConditionExpression: "#s = :submitted",
                ExpressionAttributeNames: { "#s": "status" },
                ExpressionAttributeValues: { ":failed": { S: "FAILED" }, ":submitted": { S: "SUBMITTED" } },
              },
            },
          ],
        }),
      )
      .catch((e) => {
        if (e?.name !== "TransactionCanceledException") throw e; // already reconciled — fine
      });
  }

  return async function run() {
    const rows = await scanStuck(ddb, tasksTable, now() - ORPHAN_AGE_MS);
    const summary = { checked: rows.length, completed: 0, failed: 0, pending: 0, orphaned: 0 };
    for (const row of rows) {
      const idempotencyKey = row.idempotencyKey.S;
      const taskArn = row.taskArn?.S;
      // A stuck RESERVED row (or any SUBMITTED row missing its ARN) can't be
      // resolved here — no ARN to query. Surface it; money stays reserved, not lost.
      if (row.status.S === "RESERVED" || !taskArn) {
        summary.orphaned++;
        log(`qpu-reconcile: orphaned row ${idempotencyKey} (status ${row.status.S}) — reserved money needs review`);
        continue;
      }
      const res = await braket.send(new GetQuantumTaskCommand({ quantumTaskArn: taskArn }));
      const status = res.status;
      if (status === "COMPLETED") {
        await markCompleted(idempotencyKey);
        summary.completed++;
      } else if (status === "FAILED" || status === "CANCELLED") {
        await refund(idempotencyKey, row.userId.S, utcDay(Number(row.createdAt.N)), Number(row.estMicros.N));
        summary.failed++;
      } else {
        summary.pending++; // QUEUED / RUNNING / CANCELLING — check again next tick
      }
    }
    log(`qpu-reconcile: ${JSON.stringify(summary)}`);
    return summary;
  };
}

export const handler = createReconcileCore({
  ddb: new DynamoDBClient({}),
  braket: new BraketClient({ region: DEVICE_REGION }),
  ledgerTable: process.env.LEDGER_TABLE,
  tasksTable: process.env.TASKS_TABLE,
  log: console.log,
});
