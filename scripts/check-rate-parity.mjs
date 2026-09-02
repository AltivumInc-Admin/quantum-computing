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
 * values are read into memory, compared there, and discarded. What prints is
 * presence, usability (would the handler's Number() gate accept it), and
 * MATCH/MISMATCH across the functions. Never the value — and never a digest
 * of it either: a rate factor is a short low-entropy string, so even an
 * unsalted hash PREFIX is dictionary-recoverable in milliseconds. Equality
 * never requires a printable token.
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
import { classify, normalizeRateCard, verdict } from "./drift/rate-rules.mjs";

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
  );
  return normalizeRateCard(out);
}

const rows = [];
for (const fn of FUNCTIONS) {
  let value;
  try {
    value = readRateCard(fn);
  } catch (e) {
    // The CLI's error text can echo command output; keep it to the first line,
    // which for auth/permission failures never contains an env value.
    console.error(`  ERROR  ${fn}: ${e.message?.split("\n")[0] ?? e}`);
    process.exit(2);
  }
  rows.push({ fn, state: classify(value), value });
}

// Values compared HERE, in memory, and never referenced again.
const distinctValues = new Set(rows.filter((r) => r.value !== undefined).map((r) => r.value)).size;
for (const r of rows) delete r.value;

console.log(`\n  Rate-card parity  (region ${REGION})\n`);
for (const r of rows) {
  console.log(`  ${r.state.padEnd(17)} ${r.fn}`);
}

const { exitCode, lines } = verdict(rows, distinctValues);
for (const line of lines) console.log(line);
process.exit(exitCode);
