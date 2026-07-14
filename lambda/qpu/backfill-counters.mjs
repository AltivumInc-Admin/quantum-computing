#!/usr/bin/env node
// One-off, IDEMPOTENT backfill of the Hardware-medal counters.
//
// WHY THIS EXISTS. The reconciler only started ADDing completedRuns/completedShots
// when this change shipped. Any run that COMPLETED *before* the deploy has no
// counter behind it — so on deploy an already-earned medal would silently UN-EARN
// for that learner. A medal that retracts itself is precisely the dishonesty this
// whole change exists to remove, so the counters get rebuilt from the task table,
// which is the real provenance.
//
// WHAT IT DOES. Scans quantum-qpu-tasks, keeps status === "COMPLETED" (and ONLY
// that: FAILED/CANCELLED are refunded and must never count, RESERVED/RELEASED/
// SUBMITTED are not yet real), groups by userId, and writes ABSOLUTE totals with
// `SET completedRuns = :r, completedShots = :s` — not `ADD`. Absolute is what makes
// it idempotent and safely re-runnable: running it twice is a no-op, and it also
// overwrites (rather than double-counting) anything the new reconciler already
// ADDed while it was running.
//
// RUN ORDER MATTERS — there is a real race:
//   1. Deploy the new Lambda code (the reconciler begins ADDing for new completions).
//   2. DISABLE the reconcile schedule:
//        aws events disable-rule --name <the rate(5 minutes) rule> --region us-east-2
//   3. Run this backfill.
//   4. RE-ENABLE the rule.
//   5. Re-run this backfill a few minutes later. It MUST report "no changes".
//      If it changes anything, stop and investigate.
// Without step 2, a SUBMITTED→COMPLETED transition landing between this script's
// SCAN and its WRITE is clobbered by the stale absolute SET, and that run is lost.
// The window is seconds and the rule fires every 5 minutes — but this is
// money-adjacent medal data, and pausing the rule for ~1 minute costs nothing.
//
// USAGE (read-only preview first):
//   node backfill-counters.mjs --dry-run
//   node backfill-counters.mjs
// Env: TASKS_TABLE (default quantum-qpu-tasks), LEDGER_TABLE (default
// quantum-qpu-ledger), AWS_REGION (default us-east-2).

import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";

const REGION = process.env.AWS_REGION ?? "us-east-2";
const TASKS_TABLE = process.env.TASKS_TABLE ?? "quantum-qpu-tasks";
const LEDGER_TABLE = process.env.LEDGER_TABLE ?? "quantum-qpu-ledger";
const DRY_RUN = process.argv.includes("--dry-run");

/** Sum COMPLETED runs + shots per userId. Exported so a test can prove the ONLY
 *  status that earns a medal is COMPLETED (a refunded run must count for nothing). */
export function tallyCompleted(items) {
  const byUser = new Map();
  for (const it of items) {
    if (it.status?.S !== "COMPLETED") continue; // refunded/pending rows earn nothing
    const sub = it.userId?.S;
    if (!sub) continue;
    const cur = byUser.get(sub) ?? { runs: 0, shots: 0 };
    cur.runs += 1;
    cur.shots += Number(it.shots?.N ?? 0);
    byUser.set(sub, cur);
  }
  return byUser;
}

async function scanAll(ddb) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: TASKS_TABLE,
        ProjectionExpression: "userId, #s, shots",
        ExpressionAttributeNames: { "#s": "status" },
        ExclusiveStartKey,
      }),
    );
    if (res.Items) items.push(...res.Items);
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function main() {
  const ddb = new DynamoDBClient({ region: REGION });
  const items = await scanAll(ddb);
  const byUser = tallyCompleted(items);

  console.log(
    `scanned ${items.length} task row(s) in ${TASKS_TABLE}; ` +
      `${byUser.size} user(s) with COMPLETED runs`,
  );
  if (byUser.size === 0) {
    console.log("no COMPLETED runs — nothing to backfill (no-op).");
    return;
  }

  for (const [sub, { runs, shots }] of byUser) {
    console.log(`  USER#${sub}: completedRuns=${runs} completedShots=${shots}`);
    if (DRY_RUN) continue;
    await ddb.send(
      new UpdateItemCommand({
        TableName: LEDGER_TABLE,
        Key: { pk: { S: `USER#${sub}` } },
        // ABSOLUTE set (not ADD) — idempotent and re-runnable.
        UpdateExpression: "SET completedRuns = :r, completedShots = :s",
        ExpressionAttributeValues: {
          ":r": { N: String(runs) },
          ":s": { N: String(shots) },
        },
      }),
    );
  }
  console.log(DRY_RUN ? "dry run — no writes performed." : "backfill complete.");
}

// Only run when invoked directly, so the tally above stays unit-testable.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main().catch((e) => {
    console.error("backfill failed:", e);
    process.exit(1);
  });
}
