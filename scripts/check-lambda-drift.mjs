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
const FUNCTIONS = [
  { fn: "quantum-stripe", dir: "lambda/stripe" },
  { fn: "quantum-tutor", dir: "lambda/tutor" },
  { fn: "quantum-qpu-submit", dir: "lambda/qpu" },
  { fn: "quantum-qpu-reconcile", dir: "lambda/qpu" },
  { fn: "quantum-qpu-killswitch", dir: "lambda/qpu" },
  { fn: "quantum-workspace-sync", dir: "lambda/sync" },
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
    if (!ok) exitCode = 1;
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
    const mark = r.ok ? "OK " : "DRIFT";
    console.log(`  ${mark.padEnd(6)} ${r.fn.padEnd(34)} ${r.lastModified}`);
    for (const f of r.drifted) console.log(`         DIFFERS from git: ${join(r.dir, f)}`);
    if (r.missing.length) console.log(`         (not packaged, assumed ops-only: ${r.missing.join(", ")})`);
  }
  const bad = results.filter((r) => !r.ok);
  console.log(
    bad.length === 0
      ? `\n  All ${results.length} functions match git.\n`
      : `\n  ${bad.length} of ${results.length} functions do NOT match git. Deploy them, or explain why not.\n`,
  );
}

process.exit(exitCode);
