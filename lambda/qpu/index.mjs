// Thin Lambda handler — wires the real AWS clients into the DI-core. All logic
// and tests live in qpu-core.mjs. The Braket client targets the DEVICE's region
// (IQM Garnet is in eu-north-1), not the Lambda's region (us-east-2).
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BraketClient } from "@aws-sdk/client-braket";
import { createHandlerCore, DEVICE_REGION } from "./qpu-core.mjs";

const core = createHandlerCore({
  ddb: new DynamoDBClient({}),
  braket: new BraketClient({ region: DEVICE_REGION }),
  ledgerTable: process.env.LEDGER_TABLE,
  tasksTable: process.env.TASKS_TABLE,
  progressTable: process.env.PROGRESS_TABLE,
  resultsBucket: process.env.RESULTS_BUCKET,
});

export const handler = (event) => core(event);
