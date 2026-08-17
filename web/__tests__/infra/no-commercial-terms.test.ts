import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, sep } from "path";

/**
 * THIS REPOSITORY IS PUBLIC. COMMERCIAL TERMS DO NOT BELONG IN IT.
 *
 * Published prices are public by design — they are on the pricing page. What must never
 * be committed is the SPREAD: the markup over provider cost, what a credit costs to
 * serve, gross margin, and breakeven. Those tell a competitor exactly where the floor
 * is and tell a customer a number they were never meant to weigh against the price.
 *
 * This is not hypothetical. On 2026-08-03 a monetization write-up carrying the markup
 * multiplier, per-credit cost, per-tier margin and breakeven subscriber count was
 * committed and pushed to this public repo, where it sat for roughly forty minutes
 * before being sanitized and force-pushed. Nothing objected at any point: not review,
 * not CI, not the pre-commit path. This test is that objection.
 *
 * The rule (CLAUDE.md, Monetization rule 6): published prices in web/src/lib/pricing.ts
 * stay pre-marked-up literals; the spread lives in deployed configuration and the
 * founder's private notes, never in version control. `pricing.test.ts` asserts only that
 * published rates cover provider list rates, which is the strongest claim that can be
 * made here without disclosing the spread.
 *
 * If this test fails on your change, the fix is to move the number out of the repo — not
 * to widen the pattern. Provider list rates are fine (they are AWS's and Anthropic's own
 * published prices). OUR spread over them is not.
 */

const REPO = join(__dirname, "..", "..", "..");

const SKIP_DIRS = new Set([
  ".git", "node_modules", ".venv", "venv", "__pycache__", ".next", "out", ".aws-sam",
  ".pytest_cache", "dist", "build", ".claude", ".agents", ".continue", ".factory",
  ".kiro", ".design-sync", "coverage", "playwright-report", "test-results",
]);

const SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|md|yaml|yml|json|sh|toml)$/;

/** Files exempt, each with a reason. Keep this list at zero if at all possible. */
const ALLOWED = new Map<string, string>([
  [
    join("web", "__tests__", "infra", "no-commercial-terms.test.ts"),
    "this file — it necessarily contains the patterns it bans",
  ],
]);

/**
 * Patterns that disclose the spread. Deliberately narrow: each targets a number, not a
 * vocabulary word, because the words are legitimate. "The margin rule" is a design
 * principle, "Ask the margin" is the tutor's product name, and CACHE_*_MULTIPLIER are
 * Amazon's own published cache ratios — none of those reveal anything and none may trip.
 */
const BANNED: Array<{ name: string; re: RegExp }> = [
  {
    name: "a markup/handling/margin constant",
    re: /\b(MARKUP|MARGIN|HANDLING|COST_PER_CREDIT|GROSS_MARGIN|CREDIT_COST_USD)\b\s*[:=]/,
  },
  {
    name: "a stated margin percentage",
    re: /\b\d{1,3}\s?%\s*(gross\s+)?margin\b|\bmargin\s+(of|is|at)\s+\d{1,3}\s?%/i,
  },
  {
    // The PEG ($0.01 per credit) is public by design — it is on the pricing page and is
    // the whole point of a dollar-pegged wallet. What must not appear is any OTHER
    // per-credit dollar figure, because the only other one that exists is what a credit
    // costs us to serve. Hence the negative lookahead for exactly `0.01`.
    name: "what a credit costs to serve",
    re: /\$\s?0\.0(?!1\b)\d+\s*(per|\/)\s*credit\b|\bcredits?\s+costs?\s+(us\s+)?\$\s?0\.0(?!1\b)\d+/i,
  },
  {
    // A markup stated as a multiple. The TAIL is what makes this safe to widen: a
    // bare `Nx` is far too common to ban. Tailwind emits `2xl`/`6xl`, HTTP status
    // classes read `4xx`/`5xx`, CLAUDE.md rule 10 says "3x the monthly grant", and
    // CLAUDE.md's cost-basis note says "1.10x Anthropic list" — Amazon's own
    // published Bedrock premium, a PROVIDER rate and therefore fine. What is never
    // fine is a multiple attached to cost or to a billable UNIT, because our rate
    // over the provider's rate for that unit IS the spread.
    //
    // Widened 2026-08-16: an audit report carrying "1.133x per task; 1.124x per
    // shot" passed this guard completely clean. The old pattern required the
    // literal word `cost` in the tail and capped the number at a single decimal
    // place, so naming the unit instead of the word "cost" walked straight past it.
    name: "a markup multiple over cost",
    re: /\b\d{1,3}(?:\.\d+)?\s?[x×]\s*(the\s+)?(true\s+|provider\s+|underlying\s+|list\s+)?(cost\b|per[-\s](task|shot|token|credit|run|question|call|invocation)s?\b)/i,
  },
  {
    // The same disclosure written as long division rather than as a product:
    // our rate over the provider's rate, with the quotient spelled out.
    name: "a rate divided by a provider rate",
    re: /\$?\s?\d*\.\d+\s*\/\s*\$?\s?\d*\.\d+\s*=\s*\d{1,3}(?:\.\d+)?\s?[x×]/,
  },
  {
    name: "a breakeven figure",
    re: /\bbreak-?even\b[^.\n]{0,40}\b\d+\b/i,
  },
  {
    name: "per-subscriber cost to serve",
    re: /\b(COGS|cost to serve)\b[^.\n]{0,30}\$\s?\d/i,
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue; // a broken symlink is not our problem
    }
    if (st.isDirectory()) walk(full, out);
    else if (SCAN_EXT.test(entry)) out.push(full);
  }
  return out;
}

describe("the public repo discloses no commercial terms", () => {
  const files = walk(REPO);

  it("scans a meaningful number of files (the walker itself must not silently no-op)", () => {
    // A guard that scans nothing passes forever. This is the guard's guard.
    expect(files.length).toBeGreaterThan(200);
  });

  it("contains no markup, per-credit cost, margin, or breakeven figure", () => {
    const findings: string[] = [];
    for (const file of files) {
      const rel = relative(REPO, file).split(sep).join(sep);
      if (ALLOWED.has(rel)) continue;
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue; // binary or unreadable
      }
      for (const { name, re } of BANNED) {
        const lines = text.split("\n");
        lines.forEach((line, i) => {
          if (re.test(line)) findings.push(`${rel}:${i + 1}  [${name}]  ${line.trim().slice(0, 120)}`);
        });
      }
    }
    expect(findings.join("\n")).toBe("");
  });
});

/**
 * The patterns above are only as good as their edges, and both edges matter: a
 * pattern too narrow lets the spread through (which is what happened — see the
 * "markup multiple" comment), and a pattern too wide trips on Tailwind classes or
 * on CLAUDE.md's own legitimate provider ratios until someone deletes it.
 *
 * This file is in ALLOWED, so the example strings below are exempt from the scan
 * and can be written out in full.
 */
describe("the banned patterns catch what they must and spare what they must", () => {
  const trips = (s: string) => BANNED.some(({ re }) => re.test(s));

  it.each([
    ["a multiple on the unit, not the word cost", "the QPU markup is 1.133x per task"],
    ["the same, per shot", "1.124x per shot once metering lands"],
    ["the classic form still caught", "we debit 1.13x cost on every surface"],
    ["spelled with the multiplication sign", "1.124× per shot"],
    ["shown as division with the quotient", "0.34/0.30 = 1.133x"],
    ["division, spaced and dollar-signed", "$0.00163 / $0.00145 = 1.124x"],
    ["a margin percentage", "that leaves a 12% gross margin"],
    ["a markup constant", "const MARKUP = 1.35;"],
    ["what a credit costs to serve", "a credit costs us $0.0072"],
    ["a breakeven figure", "breakeven is 340 subscribers"],
  ])("trips on %s", (_label, sample) => {
    expect(trips(sample)).toBe(true);
  });

  it.each([
    ["the dollar peg, which is public by design", "1 credit = $0.01 per credit, always"],
    ["Amazon's own published Bedrock premium", "Amazon Bedrock costs 1.10x Anthropic list"],
    ["the rollover cap in CLAUDE.md rule 10", "capped at 3x the monthly grant"],
    ["a Tailwind type scale", "className=\"max-w-6xl text-2xl px-4\""],
    ["an HTTP status class", "treat 4xx as client error and 5xx as ours"],
    ["a performance claim", "the sprite cache made it 2.4x faster"],
    ["an AWS instance size", "runs on an m5.2xlarge"],
    ["the product name for the tutor", "Ask the margin, right inside the lesson"],
    ["the design principle by name", "the margin rule is load-bearing"],
    ["Amazon's published cache ratios", "const CACHE_WRITE_MULTIPLIER = 1.25;"],
    ["a provider list rate on its own", "IQM lists at $0.00145 per shot"],
  ])("spares %s", (_label, sample) => {
    expect(trips(sample)).toBe(false);
  });
});
