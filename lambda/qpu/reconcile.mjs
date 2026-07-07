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

async function scanSubmitted(ddb, tasksTable) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: tasksTable,
        FilterExpression: "#s = :s",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": { S: "SUBMITTED" } },
        ExclusiveStartKey,
      }),
    );
    if (res.Items) items.push(...res.Items);
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

export function createReconcileCore({ ddb, braket, ledgerTable, tasksTable, log = () => {} }) {
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
    const rows = await scanSubmitted(ddb, tasksTable);
    const summary = { checked: rows.length, completed: 0, failed: 0, pending: 0, orphaned: 0 };
    for (const row of rows) {
      const taskArn = row.taskArn?.S;
      const idempotencyKey = row.idempotencyKey.S;
      if (!taskArn) {
        // Reserved+charged but the submit's status write never landed the ARN —
        // the mid-flight-death case. We can't query it here; surface for review.
        summary.orphaned++;
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
        summary.pending++; // QUEUED / RUNNING / etc. — check again next tick
      }
    }
    if (summary.orphaned > 0) log(`qpu-reconcile: ${summary.orphaned} orphaned RESERVED-with-no-arn rows need review`);
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
