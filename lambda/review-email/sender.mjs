// Scheduled handler (EventBridge). Wires the real AWS clients into the sender
// core; all logic + tests live in review-email-core.mjs.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SESv2Client } from "@aws-sdk/client-sesv2";
import { createSenderCore } from "./review-email-core.mjs";

export const handler = createSenderCore({
  ddb: new DynamoDBClient({}),
  ses: new SESv2Client({}),
  progressTable: process.env.PROGRESS_TABLE,
  prefsTable: process.env.PREFS_TABLE,
  fromAddress: process.env.FROM_ADDRESS,
  siteUrl: process.env.SITE_URL,
  unsubBaseUrl: process.env.UNSUB_BASE_URL,
  unsubSecret: process.env.UNSUB_SECRET,
  log: console.log,
});
