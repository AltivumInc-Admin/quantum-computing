#!/usr/bin/env node
/**
 * Do the two DEPLOYED pricing functions carry the same rate configuration?
 *
 * Rule 5 says every metered surface converts at one shared factor, but the two
 * halves of that claim live in different places. The repo half (same env key,
 * same secret shape, metering-off defaults) is asserted by
 * web/__tests__/infra/rate-card-parity.test.ts. THIS is the deployed half:
 * `make drift` proves the code matches git, but it reads only LastModified and
 * hand-written source — three functions can run three different configured
 * values with a green drift report every morning. This closes that gap.
 *
 * VALUE-BLIND by construction (rule 6 — this output lands in CI logs): the
 * value is read into memory, hashed, and discarded. What prints is presence,
 * usability (would the handler's Number() gate accept it), and a hash prefix.
 * Never the value, never its length beyond "usable".
 *
 * quantum-qpu-reconcile is deliberately NOT checked: it refunds the
 * creditsCharged recorded on the task row and never prices, so it carries no
 * RATE_CARD by design (lambda/qpu/template.yaml pins this). "Verifying" a
 * function that never reads the value would verify nothing.
 *
 * Usage:  node scripts/check-rate-parity.mjs
 * Exit:   0 = consistent (all absent, or all present and identical)
 *         1 = divergent or unusable   2 = could not check
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const REGION = process.env.AWS_REGION ?? "us-east-2";
const FUNCTIONS = ["quantum-tutor", "quantum-qpu-submit"];

function readRateCard(fn) {
  const out = execFileSync(
    "aws",
    [
      "lambda",
      "get-function-configuration",
      "--function-name",
      fn,
      "--region",
      REGION,
      "--query",
      "Environment.Variables.RATE_CARD",
      "--output",
      "text",
    ],
    { encoding: "utf8" },
  ).trim();
  // `--output text` prints "None" for a missing key — and "None" is also not a
  // usable factor, so collapsing the two is safe as well as convenient.
  return out === "None" || out === "" ? undefined : out;
}

let failed = false;
const rows = [];
for (const fn of FUNCTIONS) {
  let value;
  try {
    value = readRateCard(fn);
  } catch (e) {
    console.error(`  ERROR  ${fn}: ${e.message?.split("\n")[0] ?? e}`);
    process.exit(2);
  }
  if (value === undefined) {
    rows.push({ fn, state: "ABSENT", hash: null });
    continue;
  }
  const n = Number(value);
  const usable = Number.isFinite(n) && n > 0;
  rows.push({
    fn,
    state: usable ? "PRESENT" : "PRESENT-UNUSABLE",
    hash: createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12),
  });
  if (!usable) failed = true; // deployed-but-refusing is a misconfiguration, say so
}

console.log(`\n  Rate-card parity  (region ${REGION})\n`);
for (const r of rows) {
  console.log(`  ${r.state.padEnd(17)} ${r.fn}${r.hash ? `   sha256:${r.hash}` : ""}`);
}

const states = new Set(rows.map((r) => r.state));
const hashes = new Set(rows.filter((r) => r.hash).map((r) => r.hash));

if (states.has("PRESENT-UNUSABLE")) {
  console.log("\n  FAIL: a deployed RATE_CARD would be refused by the handler's gate.");
  console.log("  Paid surfaces are refusing right now while looking configured.\n");
  process.exit(1);
}
if (states.size > 1) {
  console.log("\n  FAIL: one surface is configured and the other is not (rule 5).");
  console.log("  Both must flip in the same cutover — see the billing runbook.\n");
  process.exit(1);
}
if (hashes.size > 1) {
  console.log("\n  FAIL: the two surfaces carry DIFFERENT values (rule 5).");
  console.log("  One wallet + two conversion rates = every rational learner spends");
  console.log("  through the cheaper surface. Redeploy both from the same secret.\n");
  process.exit(1);
}
console.log(
  states.has("ABSENT")
    ? "\n  OK: metering is off on both surfaces — consistent.\n"
    : "\n  OK: both surfaces carry the identical rate configuration.\n",
);
process.exit(failed ? 1 : 0);
