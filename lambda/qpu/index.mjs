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
  // Unset = credit metering disabled (over-allowance runs 402 as before).
  walletTable: process.env.WALLET_TABLE || undefined,
  // RATE_CARD is injected at deploy time from Secrets Manager (template.yaml
  // resolves it behind an !If), so the value never exists in this repository.
  // Number("")/Number(undefined) are unusable, which the core gates as
  // metering OFF — refusal, never raw cost. Same env key as the tutor, on
  // purpose: one shared factor for every metered surface (rule 5).
  rateFactor: Number(process.env.RATE_CARD),
  resultsBucket: process.env.RESULTS_BUCKET,
  edgeSecret: process.env.EDGE_SECRET || undefined,
});

export const handler = (event) => core(event);
