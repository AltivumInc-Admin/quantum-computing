import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * THE CREDIT-WRITER ALLOWLIST.
 *
 * The billing Lambda states an invariant: nothing in this platform adds credits
 * a learner did not pay for. The founder approved exactly ONE bounded exception
 * — 1,000 credits to the first 20 learners, a $200 ceiling — as a growth cost,
 * explicitly not a free tier and explicitly not a licence for a second cohort.
 *
 * An exception granted once tends to become a pattern: the next "just a small
 * signup bonus" lands in a different file, reviews clean, and nothing anywhere
 * objects. This test is the objection. It fails when ANY file outside the
 * allowlist gains the ability to increase a wallet balance.
 *
 * If this test fails on your change, the question is not "how do I get past
 * it". It is "has the founder approved a second giveaway, in writing". If yes,
 * add the file here in the same commit that adds the giveaway, so the diff
 * shows both.
 */

const REPO = join(__dirname, "..", "..", "..");

/**
 * Files permitted to move a wallet balance, and why each is allowed. Derived
 * from the codebase, not assumed: every entry below was found by scanning for
 * the credit-mutating UpdateExpression, so the list starts complete.
 */
const ALLOWED = new Map<string, string>([
  [
    "lambda/stripe/index.mjs",
    "the billing Lambda — every positive delta is a completed Stripe purchase or a clawback reversal",
  ],
  [
    "lambda/qpu/qpu-core.mjs",
    "debits a reservation and releases the unspent remainder (the learner's own money returning)",
  ],
  [
    "lambda/qpu/reconcile.mjs",
    "returns the unspent reserve when a run is reconciled after the fact",
  ],
  [
    "lambda/tutor/index.mjs",
    "reserves before streaming and settles against real usage, returning the remainder",
  ],
  [
    "scripts/founding-credit/issue.mjs",
    "THE ONE APPROVED EXCEPTION — the founding-cohort gift, hand-run, roster reviewed in git, ceiling enforced by DynamoDB",
  ],
  [
    "scripts/stripe/e2e-sandbox.mjs",
    "the sandbox e2e harness — seeds balances with an ABSOLUTE SET to set up refund/dispute cases. " +
      "It is the only entry here that destroys rather than adjusts a balance, so it carries its own " +
      "refusal: --table must match /sandbox/, alongside the existing sk_live_ refusal. Both wallet " +
      "tables live in one AWS account and their names differ by one word.",
  ],
]);

/** Directories worth scanning; everything else cannot reach DynamoDB anyway. */
const ROOTS = ["lambda", "scripts", "web/src", "infra"];
const SKIP_DIR = /node_modules|\.aws-sam|__pycache__|\.next|out|dist|coverage/;
const CODE = /\.(mjs|js|ts|tsx)$/;

function walk(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (SKIP_DIR.test(full)) continue;
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, acc);
    else if (CODE.test(name)) acc.push(full);
  }
  return acc;
}

/**
 * A wallet balance move, in this codebase, is an `ADD credits` in a DynamoDB
 * UpdateExpression (the billing Lambda builds the same clause dynamically, as
 * `credits :amt` pushed into an ADD list). Test files are excluded — they
 * assert on the string. Matching the mutation rather than only the increase is
 * deliberate: a new debit path is also something this list should notice.
 *
 * The third alternative exists because this guard had a hole for a day and
 * looked authoritative the whole time. `scripts/stripe/e2e-sandbox.mjs` moves a
 * balance with `SET ${expr.join(", ")}` built from an object, so the literal
 * `credits` never appears next to `ADD` or `SET` anywhere in the source — the
 * suite passed 4/4 with an unlisted writer in a scanned root. And its write is
 * an absolute SET, which DESTROYS a balance rather than adjusting it, so it was
 * the most dangerous possible thing to be invisible here.
 *
 * So: also treat "constructs a WALLET# key AND issues a DynamoDB update" as a
 * balance move, regardless of how the expression is assembled. A guard that can
 * only see one spelling of the mutation is a guard that reports a wrong answer
 * with total confidence.
 */
const CREDIT_WRITE =
  /ADD\s+credits\b|adds\.push\("credits |(?=[\s\S]*`WALLET#\$\{)[\s\S]*(?:update-item|UpdateItemCommand)/;

describe("credit-writer allowlist", () => {
  const offenders: string[] = [];

  for (const root of ROOTS) {
    for (const file of walk(join(REPO, root))) {
      const rel = file.slice(REPO.length + 1).replace(/\\/g, "/");
      if (/\.test\.|__tests__|__fixtures__/.test(rel)) continue;
      const src = readFileSync(file, "utf8");
      if (CREDIT_WRITE.test(src) && !ALLOWED.has(rel)) offenders.push(rel);
    }
  }

  it("no file outside the allowlist can increase a wallet balance", () => {
    expect(offenders).toEqual([]);
  });

  it("every allowlisted file still exists and still writes credits", () => {
    // Keeps the list honest: a stale entry would quietly widen the allowlist.
    for (const [rel] of ALLOWED) {
      const src = readFileSync(join(REPO, rel), "utf8");
      expect(CREDIT_WRITE.test(src)).toBe(true);
    }
  });

  it("the gift lives OUTSIDE the internet-facing billing Lambda", () => {
    // A design candidate proposed an admin path inside lambda/stripe gated on
    // the ABSENCE of a request context. That is a mint on a public function the
    // day anyone adds a Function URL or a new event source — and this repo has
    // already been burned by a gate that failed open (the `effectiveCap > 0`
    // guard exists because a cap of 0 alone was not sufficient). The gift is a
    // hand-run script instead, and the deployed Lambda must not know it exists.
    const billing = readFileSync(join(REPO, "lambda/stripe/index.mjs"), "utf8");
    const withoutComments = billing
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(withoutComments).not.toContain("FOUNDING#");
    expect(withoutComments).not.toMatch(/founding[-_]?cohort/i);
  });

  it("the founding gift never writes a subscription tier", () => {
    // Tier is what gates the paid tutor models. Writing one would take the
    // gift out of hardware scope, open the Billing Portal to a non-subscriber,
    // and be silently resettable by an unrelated subscription webhook.
    const issue = readFileSync(join(REPO, "scripts/founding-credit/issue.mjs"), "utf8");
    const code = issue
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\btier\b/);
  });
});
