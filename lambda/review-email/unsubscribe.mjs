// Function URL handler (unauthenticated — the link in the email). Wires the
// real DynamoDB client into the unsubscribe core.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { createUnsubscribeCore } from "./review-email-core.mjs";

export const handler = createUnsubscribeCore({
  ddb: new DynamoDBClient({}),
  prefsTable: process.env.PREFS_TABLE,
  unsubSecret: process.env.UNSUB_SECRET,
});
