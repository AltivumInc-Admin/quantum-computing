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
    name: "a markup multiple over cost",
    re: /\b\d(?:\.\d)?\s?[x×]\s*(the\s+)?(true\s+|provider\s+|underlying\s+)?cost\b/i,
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
