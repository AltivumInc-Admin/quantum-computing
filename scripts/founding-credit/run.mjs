#!/usr/bin/env node
/**
 * Founding-cohort issuance runner. Read scripts/founding-credit/RUNBOOK.md
 * before using this. The pure logic (and every guard) lives in issue.mjs; this
 * file only resolves recipients against Cognito and executes the writes.
 *
 * Zero dependencies — it shells out to the `aws` CLI, exactly like
 * scripts/verify-founding-ten.mjs.
 *
 *   node scripts/founding-credit/run.mjs --plan     # read-only, writes nothing
 *   node scripts/founding-credit/run.mjs --issue    # performs the gift
 *
 * --plan is the default. --issue is deliberately not a flag you can reach by
 * accident, and it refuses to run unless the caller's AWS account matches the
 * roster's expectedAccountId (an account migration is in flight, the wallet
 * table is Retain + PITR, and a mistaken write would survive stack deletion).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { emailHash } from "../lib/email-hash.mjs";
import {
  buildTransactItems,
  decodeCancellation,
  validateCohort,
  ALREADY_ISSUED,
  COHORT_FULL,
} from "./issue.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const ISSUE = args.includes("--issue");
const cohortPath = join(HERE, "cohort-2026-08.json");
const cohort = JSON.parse(readFileSync(cohortPath, "utf8"));

const aws = (a) => execFileSync("aws", a, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const fail = (msg) => {
  console.error(`\nREFUSING: ${msg}\n`);
  process.exit(1);
};

const problems = validateCohort(cohort);
if (problems.length) fail(`roster is invalid:\n  - ${problems.join("\n  - ")}`);
if (cohort.closed && ISSUE) fail("this cohort is closed; issuing again would be a second giveaway");

// Guard the destination account before anything else.
const acct = JSON.parse(aws(["sts", "get-caller-identity", "--output", "json"])).Account;
if (acct !== cohort.expectedAccountId) {
  fail(
    `caller is account ${acct} but the roster expects ${cohort.expectedAccountId}. ` +
      "Refusing to write credits into the wrong account.",
  );
}

// Resolve each roster hash to a live Cognito sub. Emails never leave this
// process: they are hashed locally and compared, never printed or stored.
const pool = process.env.USER_POOL_ID || "us-east-2_aRydPmAjj";
const users = JSON.parse(
  aws([
    "cognito-idp", "list-users",
    "--user-pool-id", pool,
    "--region", cohort.region,
    "--output", "json",
  ]),
).Users;

const byHash = new Map();
for (const u of users) {
  const attr = (n) => u.Attributes.find((a) => a.Name === n)?.Value;
  const email = attr("email");
  const sub = attr("sub");
  if (!email || !sub) continue;
  const h = emailHash(email);
  // A human with two accounts appears twice. Keep the OLDEST — it is the one
  // whose creation date put them in the cohort — and record the collision so
  // the plan can show it rather than silently picking one.
  const prior = byHash.get(h);
  if (!prior || new Date(u.UserCreateDate) < new Date(prior.createdAt)) {
    byHash.set(h, { sub, createdAt: u.UserCreateDate, accounts: (prior?.accounts ?? 0) + 1 });
  } else {
    prior.accounts += 1;
  }
}

console.log(`\nCohort ${cohort.cohortId} — ${cohort.creditsEach} credits each, ` +
  `max ${cohort.maxRecipients} (ceiling $${(cohort.maxRecipients * cohort.creditsEach) / 100})`);
console.log(`Account ${acct} · table ${cohort.walletTable} · ${cohort.region}`);
console.log(ISSUE ? "\n*** ISSUING — this writes credits ***\n" : "\nPLAN ONLY — nothing will be written\n");

let issued = 0;
let skipped = 0;
let missing = 0;

for (const r of cohort.recipients) {
  const hit = byHash.get(r.emailHash);
  const label = `slot ${String(r.slot).padStart(2)} · ${r.emailHash.slice(0, 12)}…`;
  if (!hit) {
    // Not a crash: an account can be deleted between roster review and
    // issuance. Report it and carry on; the slot simply goes unspent.
    console.log(`${label}  NO LIVE ACCOUNT — skipping`);
    missing += 1;
    continue;
  }
  const dupNote = hit.accounts > 1 ? `  (${hit.accounts} accounts, using oldest)` : "";
  if (!ISSUE) {
    console.log(`${label}  would credit ${cohort.creditsEach} → ${hit.sub}${dupNote}`);
    continue;
  }
  const items = buildTransactItems({
    cohort,
    tableName: cohort.walletTable,
    emailHash: r.emailHash,
    sub: hit.sub,
  });
  try {
    aws([
      "dynamodb", "transact-write-items",
      "--region", cohort.region,
      "--transact-items", JSON.stringify(items),
    ]);
    console.log(`${label}  CREDITED ${cohort.creditsEach} → ${hit.sub}${dupNote}`);
    issued += 1;
  } catch (err) {
    const outcome = decodeCancellation(String(err?.stderr ?? err?.message ?? ""));
    if (outcome === ALREADY_ISSUED) {
      console.log(`${label}  already issued — no change`);
      skipped += 1;
    } else if (outcome === COHORT_FULL) {
      fail(`the cohort ceiling is reached; slot ${r.slot} and everything after it was NOT issued`);
    } else {
      // Unknown failure: stop rather than continue past something unexplained.
      console.error(`${label}  FAILED`);
      throw err;
    }
  }
}

console.log(
  `\n${ISSUE ? "Issued" : "Would issue"}: ${ISSUE ? issued : cohort.recipients.length - missing}` +
    `${skipped ? ` · already held: ${skipped}` : ""}` +
    `${missing ? ` · no live account: ${missing}` : ""}`,
);
if (ISSUE) {
  console.log(
    "\nVerify before calling this done:\n" +
      `  aws dynamodb get-item --table-name ${cohort.walletTable} --region ${cohort.region} \\\n` +
      `    --key '{"pk":{"S":"FOUNDING#${cohort.cohortId}#COUNTER"}}'\n` +
      "  The counter's `issued` must equal the number of marker rows, and\n" +
      "  `creditsIssued` must equal issued x " + cohort.creditsEach + ".",
  );
}
