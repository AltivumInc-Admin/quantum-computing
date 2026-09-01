#!/usr/bin/env node
/**
 * Is what's RUNNING what's in git?
 *
 * On 2026-08-04 the deployed billing Lambda was found to be eight days and three merged
 * PRs behind `main` — 150 lines of payment logic, including debt-clearing and refund
 * receipts, that had passed CI, been reviewed, been merged, and never shipped. Nothing
 * surfaced it. CI was green. The PRs were closed. The CloudFormation stack read
 * UPDATE_COMPLETE — from the PREVIOUS deploy. A stack in UPDATE_COMPLETE tells you a
 * deploy once succeeded, not that it shipped current code.
 *
 * The only thing that surfaces this is downloading the artifact and reading it. That is
 * what this does, for every function, so the gap is visible the day it appears.
 *
 * Compares hand-written source only — node_modules and build metadata legitimately
 * differ between a packaged artifact and a working tree, and comparing them would make
 * this cry wolf until someone turned it off.
 *
 * Usage:  node scripts/check-lambda-drift.mjs [--json]
 * Exit:   0 = every function matches git   1 = drift found   2 = could not check
 *
 * Needs AWS read access (lambda:GetFunction). GitHub Actions has no AWS credentials
 * today, so this runs locally or anywhere credentials exist — see `make drift`.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const REGION = process.env.AWS_REGION || "us-east-2";
const JSON_OUT = process.argv.includes("--json");

/**
 * Deployed function -> the source directory it is built from. One entry per function,
 * because several stacks ship more than one function from a single directory.
 */
/**
 * Functions whose drift is DELIBERATE, with the reason and who to ask.
 *
 * Without this, a hold has nowhere to live except someone's head: the check
 * goes red, stays red, and by day three nobody reads it — the "cry wolf until
 * someone turns it off" failure this script's own header warns about. It had
 * already happened once (four consecutive red daily runs, 2026-08-29..09-01)
 * before this existed.
 *
 * Rules that keep this from becoming the rot it prevents:
 *  - A hold needs a REASON and a CLEARS-WHEN, both in plain language.
 *  - A held function still prints, as HELD, so it is never invisible.
 *  - If a held function STOPS drifting, this file is stale and the run says so
 *    — an allowlist nobody prunes eventually hides a real gap.
 *  - Drift in anything NOT listed here still fails the run, exactly as before.
 */
const HELD = [
  {
    fn: /^quantum-review-email-/,
    reason:
      "Cosmetic email recolor (black-and-gold retheme) is merged but deliberately NOT deployed: the three product sessions agreed to run no unrelated production deploys during the Shop product's domain cutover, so a Shop incident is never debugged alongside a Learner deploy.",
    clearsWhen:
      "Shop's cutover completes — the platform session coordinates it (runbook: docs/platform-subdomain-migration.md in the quantum-env repo). Then deploy lambda/review-email and DELETE this entry.",
  },
];

const heldFor = (fn) => HELD.find((h) => h.fn.test(fn));

const FUNCTIONS = [
  { fn: "quantum-stripe", dir: "lambda/stripe" },
  // The sandbox stack runs the SAME source and is where payment changes are
  // rehearsed. Unwatched, a green e2e run is a claim about deployed sandbox code
  // that nothing ties to git — a false green, which is worse than no green.
  // NOTE: red here has two meanings, unlike every other row: "deploy it" or
  // "you are mid-rehearsal with an unmerged branch checked out".
  { fn: "quantum-stripe-sandbox", dir: "lambda/stripe" },
  { fn: "quantum-tutor", dir: "lambda/tutor" },
  { fn: "quantum-qpu-submit", dir: "lambda/qpu" },
  { fn: "quantum-qpu-reconcile", dir: "lambda/qpu" },
  { fn: "quantum-qpu-killswitch", dir: "lambda/qpu" },
  { fn: "quantum-workspace-sync", dir: "lambda/sync" },
  { fn: "quantum-analytics", dir: "lambda/analytics" },
  { fn: "quantum-review-email-prefs", dir: "lambda/review-email" },
  { fn: "quantum-review-email-sender", dir: "lambda/review-email" },
  { fn: "quantum-review-email-unsubscribe", dir: "lambda/review-email" },
];

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();

/** Hand-written source in a directory: .mjs/.js at the top level, minus tests. */
const sourceFiles = (dir) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.(mjs|js)$/.test(f))
    .filter((f) => !/\.test\.mjs$|^probe-|^verify-/.test(f))
    .filter((f) => statSync(join(dir, f)).isFile());
};

const results = [];
let exitCode = 0;

for (const { fn, dir } of FUNCTIONS) {
  const srcDir = join(REPO, dir);
  let tmp;
  try {
    const url = sh("aws", ["lambda", "get-function", "--function-name", fn, "--region", REGION,
      "--query", "Code.Location", "--output", "text"]);
    tmp = mkdtempSync(join(tmpdir(), `drift-${fn}-`));
    sh("curl", ["-sS", "-o", join(tmp, "fn.zip"), url]);
    sh("unzip", ["-oq", join(tmp, "fn.zip"), "-d", join(tmp, "fn")]);

    const drifted = [];
    const missing = [];
    for (const file of sourceFiles(srcDir)) {
      const deployedPath = join(tmp, "fn", file);
      if (!existsSync(deployedPath)) { missing.push(file); continue; }
      const a = readFileSync(join(srcDir, file), "utf8");
      const b = readFileSync(deployedPath, "utf8");
      if (a !== b) drifted.push(file);
    }

    const lastModified = sh("aws", ["lambda", "get-function-configuration", "--function-name", fn,
      "--region", REGION, "--query", "LastModified", "--output", "text"]);

    // Only a file present in BOTH and differing is drift. A file that exists in git but
    // not in the package is almost always an ops script that was never meant to ship
    // (deploy-check.mjs, cfn-slice.mjs, backfill-*.mjs), and failing on those would make
    // this cry wolf until someone disabled it — which is how guards die.
    const ok = drifted.length === 0;
    // A DECLARED hold does not fail the run — it prints as HELD with its reason.
    // Undeclared drift still fails, which is the whole point of the check.
    if (!ok && !heldFor(fn)) exitCode = 1;
    results.push({ fn, dir, ok, drifted, missing, lastModified });
  } catch (err) {
    exitCode = Math.max(exitCode, 2);
    results.push({ fn, dir, ok: false, error: String(err.message || err).split("\n")[0] });
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ region: REGION, results }, null, 2));
} else {
  console.log(`\n  Deployed-vs-git drift  (region ${REGION})\n`);
  for (const r of results) {
    if (r.error) { console.log(`  ??  ${r.fn.padEnd(34)} could not check — ${r.error}`); continue; }
    const held = !r.ok && heldFor(r.fn);
    const mark = r.ok ? "OK " : held ? "HELD" : "DRIFT";
    console.log(`  ${mark.padEnd(6)} ${r.fn.padEnd(34)} ${r.lastModified}`);
    for (const f of r.drifted) console.log(`         DIFFERS from git: ${join(r.dir, f)}`);
    if (r.missing.length) console.log(`         (not packaged, assumed ops-only: ${r.missing.join(", ")})`);
    if (held) {
      console.log(`         HELD ON PURPOSE — do not deploy to clear this.`);
      console.log(`         why:   ${held.reason}`);
      console.log(`         until: ${held.clearsWhen}`);
    }
  }
  const bad = results.filter((r) => !r.ok && !heldFor(r.fn));
  const held = results.filter((r) => !r.ok && heldFor(r.fn));
  // A hold that no longer holds anything is stale, and a stale allowlist is how
  // a real gap eventually hides behind an entry nobody re-read.
  const staleHolds = HELD.filter((h) => !results.some((r) => !r.ok && h.fn.test(r.fn)));
  console.log(
    bad.length === 0
      ? `\n  All ${results.length - held.length} unheld functions match git.` +
        (held.length ? ` ${held.length} held on purpose (see above).\n` : `\n`)
      : `\n  ${bad.length} of ${results.length} functions do NOT match git. Deploy them, or explain why not.\n`,
  );
  for (const h of staleHolds) {
    console.log(
      `  NOTE: the HELD entry matching ${h.fn} no longer matches any drifting function.\n` +
        `        The hold has served its purpose — delete it from scripts/check-lambda-drift.mjs.\n`,
    );
  }
}

process.exit(exitCode);
