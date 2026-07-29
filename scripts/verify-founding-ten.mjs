#!/usr/bin/env node
// Fails the build if an issued badge no longer matches an enabled Cognito user.
//
// This is what stops a badge detaching SILENTLY. Binding on the email means a
// holder who deletes and recreates their account keeps the badge automatically;
// a holder who CHANGES their email turns the build red instead of vanishing.
//
// Skips (exit 0) only when AWS credentials are genuinely absent, so `npm
// test` still runs offline — the live check is a CI-only gate. Everything
// else (AccessDenied, throttling, a network blip, a wrong pool id) FAILS the
// build. A bare catch that treated every execFileSync failure as "no
// credentials" would silently skip the exact case this script exists to
// catch: if the CodeBuild role is ever missing cognito-idp:ListUsers (or
// loses it, or the pool id drifts), the check would print "skipping" and
// exit 0 forever — permanently green, permanently blind. Do not simplify
// this back into a bare catch.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// --who additionally prints holder -> account email, resolved LIVE, for the
// operator who needs to answer "whose account is badge 01?". That question is
// otherwise unanswerable from the repo by design: the registry stores a one-way
// hash precisely so no address is ever committed.
//
// It REFUSES to run in CI. Printing an address to a build log would put it in
// exactly the widely-readable place this whole design exists to keep it out of
// — and CI logs outlive the build. Local terminal only, never written to disk.
const WHO = process.argv.includes("--who");
const IN_CI = Boolean(process.env.CI || process.env.CODEBUILD_BUILD_ID || process.env.GITHUB_ACTIONS);
if (WHO && IN_CI) {
  console.error("founding-ten: --who prints email addresses and must not run in CI (they would land in the build log)");
  process.exit(2);
}

const POOL_ID = process.env.QUANTUM_USER_POOL_ID ?? "us-east-2_aRydPmAjj";
const REGION = process.env.AWS_REGION ?? "us-east-2";

const registry = JSON.parse(readFileSync(new URL("../web/src/data/founding-ten.json", import.meta.url)));
// Tag each row with its cohort here (the raw JSON rows don't carry one) so a
// failure message can distinguish charter-01 from patron-01.
const issued = [
  ...registry.charter.map((b) => ({ ...b, cohort: "charter" })),
  ...registry.patron.map((b) => ({ ...b, cohort: "patron" })),
];
if (issued.length === 0) {
  console.log("founding-ten: no badges issued, nothing to verify");
  process.exit(0);
}

const NO_CREDS_PATTERN = /Unable to locate credentials|ExpiredToken|InvalidClientTokenId|security token.*invalid/i;

let raw;
try {
  raw = execFileSync("aws", [
    "cognito-idp", "list-users",
    "--user-pool-id", POOL_ID,
    "--region", REGION,
    "--output", "json",
  ], {
    stdio: ["ignore", "pipe", "pipe"],
    // execFileSync's default maxBuffer is 1 MB. Auto-paginated `list-users`
    // JSON exceeds that at roughly 1-2k users, producing ENOBUFS — which does
    // NOT match NO_CREDS_PATTERN below and would red the merge gate for an
    // unrelated reason (a buffer size, not a credentials or Cognito problem).
    maxBuffer: 32 * 1024 * 1024,
  }).toString();
} catch (err) {
  const stderr = err.stderr ? err.stderr.toString() : "";
  const noCredentials = err.code === "ENOENT" || NO_CREDS_PATTERN.test(stderr);
  if (noCredentials) {
    console.log("founding-ten: no AWS credentials, skipping the live check");
    process.exit(0);
  }
  // Not a credentials problem — AccessDenied, throttling, a bad pool id, a
  // network blip, etc. This must fail the build, not skip it. stderr from
  // the AWS CLI contains no email addresses, so it is safe to print.
  console.error(stderr || err.message);
  console.error("founding-ten: live check failed (not a credentials issue) — failing the build");
  process.exit(1);
}

// Parsing is outside the try/catch above: a malformed API response is a real
// failure to surface, not something that should be misread as "no creds".
const users = JSON.parse(raw).Users ?? [];

// A Map, not a Set: `has()` still answers the verification question, while
// --who needs the address back. Nothing is stored or logged unless --who asks.
const live = new Map(
  users
    .filter((u) => u.Enabled)
    .map((u) => u.Attributes.find((a) => a.Name === "email")?.Value)
    .filter(Boolean)
    // THIRD copy of the normalization, alongside web/src/lib/founding-ten.ts's
    // normalizeEmail() and scripts/badge-email-hash.mjs. The parity test in
    // web/__tests__/lib/founding-ten.test.ts only binds those first two — this
    // copy can drift silently and start reporting false orphans. Keep it
    // IDENTICAL (exactly trim + lowercase) to both.
    .map((e) => [createHash("sha256").update(e.trim().toLowerCase()).digest("hex"), e]),
);

const orphans = issued.filter((b) => !live.has(b.emailHash));
if (orphans.length > 0) {
  for (const b of orphans) {
    console.error(`founding-ten: ${b.cohort} serial ${b.serial} (${b.holder}) matches no enabled user`);
  }
  console.error("Repair: recompute the hash for the holder's current email and update the registry.");
  process.exit(1);
}
console.log(`founding-ten: all ${issued.length} issued badge(s) resolve to live users`);

if (WHO) {
  console.log("");
  console.log("badge          holder                    account");
  console.log("-------------  ------------------------  -------------------------------");
  for (const b of issued.sort((x, y) => x.cohort.localeCompare(y.cohort) || x.serial - y.serial)) {
    const slug = `${b.cohort}-${String(b.serial).padStart(2, "0")}`;
    console.log(`${slug.padEnd(13)}  ${b.holder.padEnd(24)}  ${live.get(b.emailHash)}`);
  }
  console.log("");
  console.log("Resolved live from Cognito. Not stored anywhere — do not paste into a file or a PR.");
}
