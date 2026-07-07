// quantum-qpu-killswitch: the in-app hard stop that AWS Budgets alone can't
// provide. AWS Budgets only ALERTS — it never stops billing. This Lambda is
// subscribed to an SNS topic that a monthly Braket budget publishes to at
// 80%/100%; on any such message it flips the ledger's KILL row to disabled=true.
// KILL is the 4th condition in the submit reservation (qpu-core.mjs), so once
// tripped EVERY new submission returns 503 — a real in-app kill-switch, even
// though AWS keeps charging for already-queued tasks. Re-enabling is a deliberate
// operator action (delete/clear the KILL row); see the README.
//
// DI-core so it unit-tests offline under `node --test` with a stubbed DynamoDB.

import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

export function createKillSwitchCore({ ddb, ledgerTable, now = () => Date.now(), log = () => {} }) {
  return async function core(event) {
    const sns = event?.Records?.[0]?.Sns;
    const reason = String(sns?.Subject ?? "budget-threshold");
    log("qpu-killswitch tripped", { reason });
    await ddb.send(
      new PutItemCommand({
        TableName: ledgerTable,
        Item: {
          pk: { S: "KILL" },
          disabled: { BOOL: true },
          trippedAt: { N: String(now()) },
          reason: { S: reason },
        },
      }),
    );
    return { disabled: true };
  };
}

export const handler = createKillSwitchCore({
  ddb: new DynamoDBClient({}),
  ledgerTable: process.env.LEDGER_TABLE,
  log: console.log,
});
