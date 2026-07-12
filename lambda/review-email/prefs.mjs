// HTTP API handler (Cognito-JWT-authorized — the same authorizer discipline as
// lambda/sync) for the reminder-email preferences: GET/PUT/DELETE /prefs.
// Wires the real DynamoDB client into the prefs core; all logic + tests live
// in review-email-core.mjs.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { createPrefsCore } from "./review-email-core.mjs";

export const handler = createPrefsCore({
  ddb: new DynamoDBClient({}),
  prefsTable: process.env.PREFS_TABLE,
});
