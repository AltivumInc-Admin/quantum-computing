import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

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
  ".ipynb_checkpoints",
]);

// .ipynb is deliberately in this list (2026-08-17): notebook JSON carries the cell
// sources as string arrays, so a banned figure typed into a curriculum notebook is
// right there in the raw file text — scanning the file as text is sufficient, and a
// notebook was previously a blind spot the size of the entire curriculum.
const SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|md|yaml|yml|json|sh|toml|ipynb)$/;

/**
 * Files exempt, each with a reason. Keep this list at zero if at all possible.
 *
 * Keyed on git's own POSIX paths, which is what every scan below works in — no
 * platform-separator juggling at the call sites, and one spelling to match.
 */
const ALLOWED = new Map<string, string>([
  [
    "web/__tests__/infra/no-commercial-terms.test.ts",
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
  // ── Identifier assignments ────────────────────────────────────────────────
  // Widened 2026-08-17: the old single pattern here was case-sensitive and
  // word-boundary bounded (\bMARKUP\b), which is name-dependent in exactly the
  // region it polices — `tutorMarkup = 1.3`, `markup_factor: 1.3` and
  // `QPU_MARKUP_X = 1.2` all passed it clean. These match any identifier that
  // CONTAINS the money word (any case, camelCase, snake_case, prefixed or
  // suffixed) followed by an assignment, regardless of what the RHS looks like
  // — `markup = base * perUnit` discloses just as much as a literal.
  {
    // The one legitimate sense of "markup" in a web repo is document markup, so
    // identifiers that are exactly a doc-markup compound (LATEX_MARKUP,
    // htmlMarkup, …) are carved out up front; everything else that contains
    // mark_?up and is assigned to, trips.
    name: "a markup-bearing identifier assignment",
    re: /(?<![\w$])(?!(?:latex|html|xml|svg|jsx|inner|rich|text|raw|safe|rendered)_?markup(?![\w$]))[\w$]*mark_?up[\w$]*\s*[:=](?!=)/i,
  },
  {
    // "margin" alone is CSS (margin:, marginTop:) and chart layout
    // (POINT_MARGIN, APPROACH_ROOT_MARGIN), so the bare word cannot be banned.
    // What CAN be: a margin identifier carrying a commercial qualifier on
    // either side — gross/net/profit/… before it, or pct/rate/multiplier/…
    // after it. Layout margins never spell themselves that way.
    name: "a commercial margin identifier assignment",
    re: /(?<![\w$])(?:[\w$]*(?:gross|net|profit|contribution|operating)_?margin[\w$]*|[\w$]*margin_?(?:pct|percent(?:age)?|rate|ratio|multiplier|factor|bps|usd|micros)[\w$]*)\s*[:=](?!=)/i,
  },
  {
    // The bare SCREAMING forms, standalone only (case-sensitive on purpose:
    // lowercase `margin:` is CSS, lowercase `handling` is error handling).
    name: "a bare MARKUP/MARGIN/HANDLING constant",
    re: /(?<![\w$])(?:MARGIN|HANDLING|MARKUP)(?![\w$])\s*[:=](?!=)/,
  },
  {
    name: "a handling-fee identifier assignment",
    re: /(?<![\w$])[\w$]*handling_?(?:fee|pct|percent|rate|multiplier|factor|charge)[\w$]*\s*[:=](?!=)/i,
  },
  {
    name: "a per-credit-cost identifier assignment",
    re: /(?<![\w$])[\w$]*(?:cost_?per_?credit|credit_?cost|cost_?to_?serve|serve_?cost)[\w$]*\s*[:=](?!=)/i,
  },
  {
    name: "a breakeven identifier assignment",
    re: /(?<![\w$])[\w$]*break_?even[\w$]*\s*[:=](?!=)/i,
  },
  // ── The metering seam's OWN vocabulary ────────────────────────────────────
  // Added 2026-08-17, when the RATE_CARD mechanism landed: the most likely
  // future disclosure vector for the deployed factor is someone pinning it
  // under the names the system actually uses — a test fixture, a runbook
  // example, a template fallback. The legitimate uses stay legal by
  // construction: RATE_CARD's RHS in the templates is `!If [...]` and in the
  // handlers `Number(process.env.RATE_CARD)` (neither starts with a digit),
  // and the FICTIONAL integer factors in tests (1, 3) carry no decimal.
  {
    // The deployed env-var name with ANY numeric RHS — never legitimate.
    name: "a RATE_CARD value assignment",
    re: /(?<![\w$])RATE_?CARD[\w$]*\s*[:=](?!=)\s*["']?\d/,
  },
  {
    // A factor-family identifier with a DECIMAL RHS. Real conversion factors
    // are fractional; the decimal requirement is what spares the labelled
    // fictional integers that the flow tests inject.
    name: "a rate-factor decimal assignment",
    re: /(?<![\w$])[\w$]*rate_?(?:card|factor)[\w$]*\s*[:=](?!=)\s*["']?\d+\.\d/i,
  },
  // ── Prose forms of the same disclosure ────────────────────────────────────
  {
    // "the markup is 1.3", "marked up 30%", "we mark up by 1.3x". Either the
    // number wears x/× /% (a ratio can only be the spread), or the sentence
    // links markup to a bare number with of/is/at/by/=. Digit-free prose about
    // markup as a CONCEPT (rule 6 itself, "no markup constant") stays legal.
    name: "the spread stated as markup prose",
    re: /\bmark(?:ed|s)?[\s-]?up\b[^.\n]{0,30}?\b\d+(?:\.\d+)?\s?(?:[x×%]|percent)|\bmark(?:ed|s)?[\s-]?up\s+(?:of|is|at|by|=)\s*\$?\d/i,
  },
  {
    name: "the spread named as a spread, with a figure",
    re: /\bspread\s+(?:of|is|at)\s+\$?\d/i,
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

// The disclosure surface is exactly what git publishes, so enumerate via
// git ls-files rather than a filesystem walk. A walker also sweeps local,
// never-committed artifacts (downloaded editor bundles, design-tool vendor
// output) whose innocent `markup` identifiers are not this guard's business —
// and since a CI clone contains only tracked files, a walker would make the
// guard pass in CI while failing on a contributor's machine. ls-files gives
// both the same file set. Consequence for teeth checks: a planted violation
// must be `git add -f`ed to trip the scan, exactly like the samconfig teeth.
/** Every tracked path, as git spells it: repo-relative, POSIX separators. */
function trackedRelPaths(): string[] {
  return execSync("git ls-files -z", { cwd: REPO }).toString("utf8").split("\0").filter(Boolean);
}

/** One enumeration, shared by both guards below; each keeps its own canary. */
const TRACKED = trackedRelPaths();

/** The subset this guard reads: scannable extensions, outside the skipped trees. */
const SCANNABLE = TRACKED.filter((rel) => SCAN_EXT.test(rel)).filter(
  (rel) => !rel.split("/").some((seg) => SKIP_DIRS.has(seg)),
);

describe("the public repo discloses no commercial terms", () => {
  it("scans a meaningful number of files (the walker itself must not silently no-op)", () => {
    // A guard that scans nothing passes forever. This is the guard's guard.
    expect(SCANNABLE.length).toBeGreaterThan(200);
  });

  it("contains no markup, per-credit cost, margin, or breakeven figure", () => {
    const findings: string[] = [];
    for (const rel of SCANNABLE) {
      if (ALLOWED.has(rel)) continue;
      let text: string;
      try {
        text = readFileSync(join(REPO, rel), "utf8");
      } catch {
        continue; // binary or unreadable
      }
      // Split once per FILE, not once per pattern: sixteen patterns over a
      // thousand-odd files is sixteen thousand re-splits for one answer.
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        for (const { name, re } of BANNED) {
          if (re.test(line)) findings.push(`${rel}:${i + 1}  [${name}]  ${line.trim().slice(0, 120)}`);
        }
      });
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
  // EVERY figure in the trip samples below is FICTIONAL — invented to exercise a
  // regex, mutually inconsistent on purpose (no coherent P&L can be assembled from
  // them), and unrelated to any real commercial term of this or any product.
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
    // Widened 2026-08-17: all of the below passed the old guard clean, because the
    // constant pattern was case-sensitive and word-boundary bounded — camelCase and
    // suffixed spellings of the same identifiers walked straight past \bMARKUP\b.
    ["a camelCase markup identifier", "const tutorMarkup = 9.9;"],
    ["a snake_case markup identifier", "markup_factor: 4.2,"],
    ["a suffixed SCREAMING markup identifier", "export const QPU_MARKUP_X = 1.2;"],
    ["a markup identifier with a non-literal RHS", "const markupOverCost = base * perUnit;"],
    ["a camelCase gross-margin identifier", "grossMargin = 0.12;"],
    ["a snake_case margin-percent identifier", "const gross_margin_pct = 12;"],
    ["a margin-pct field", "marginPct: 12,"],
    ["a handling-fee identifier", "handlingFee = 40;"],
    ["a credit-cost identifier", "creditCostUsd = 0.9876;"],
    // The metering seam's own vocabulary (all figures fictional):
    ["the deployed env name with a value", 'RATE_CARD = "7.7"'],
    ["the deployed env name, integer value", "RATE_CARD: 5"],
    ["a rate-factor decimal assignment", "const rateFactor = 8.25;"],
    ["a rate-card decimal in config prose", "rate_card_value: 3.15,"],
    ["a cost-to-serve identifier", "const costToServe = 812;"],
    ["a breakeven identifier", "breakEvenSubscribers = 340;"],
    ["the spread stated as prose markup", "the markup is 2.75 on every surface"],
    ["the spread as a marked-up percentage", "prices are marked up 85% before publish"],
    ["the spread as a mark-up verb phrase", "we mark up by 6.5x across surfaces"],
    ["the spread named as a spread", "a spread of 2.1 cents on each credit"],
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
    ["the cache-read ratio likewise", "const CACHE_READ_MULTIPLIER = 0.1;"],
    ["a provider list rate on its own", "IQM lists at $0.00145 per shot"],
    // Look-alikes the 2026-08-17 widening must provably NOT reach: every one of
    // these exists in the tree today (or is one keystroke away from it).
    ["the public peg constant", "const MICROS_PER_CREDIT = 10_000;"],
    ["estimateTokens' chars-per-token divisor", "const estimateTokens = (s) => Math.ceil(s.length / 3);"],
    ["a document-markup regex (tests/test_pricing_prose.py)", 'LATEX_MARKUP = re.compile(r"[\\\\^_{}]")'],
    ["a chart layout margin (vqc-trainer.tsx)", "const POINT_MARGIN = 0.5; // breathing room, viewBox units"],
    ["an IntersectionObserver margin (widget-fence.tsx)", 'const APPROACH_ROOT_MARGIN = "400px 0px";'],
    ["plain CSS margins", "margin: 0 auto;"],
    ["React style-object margins", "style={{ marginTop: 8, margin: '0 auto' }}"],
    ["scroll-margin CSS", "scroll-margin-top: 4rem;"],
    ["HTML markup as a variable, named as such", "const htmlMarkup = renderToString(page);"],
    ["error handling as prose", "error handling: retries are capped"],
    ["spread as a verb", "the read path spreads over three tables"],
    ["a published TIERS literal (pricing.ts is public by design)", "monthlyCredits: 1200,"],
  ])("spares %s", (_label, sample) => {
    expect(trips(sample)).toBe(false);
  });
});

/**
 * `sam deploy --guided` writes every parameter the operator types — including the
 * deployed-configuration values that exist precisely so they never appear in git,
 * like the metering env vars — into samconfig.toml VERBATIM, as a
 * `parameter_overrides = "..."` line. Until 2026-08-17 that file was not
 * gitignored (`git check-ignore samconfig.toml` exited 1), so one habitual
 * `git add -A` after a guided deploy would have published the exact numbers this
 * whole test exists to keep out.
 *
 * Three layers, because each fails differently:
 *  1. no samconfig file may be TRACKED (any depth, any samconfig.*.toml/yaml);
 *  2. no tracked file may carry a samconfig-style `parameter_overrides =` line
 *     (catches the content pasted into some other file);
 *  3. .gitignore must actively refuse the paths, so the mistake is stopped at
 *     `git add` rather than found here after the push.
 *
 * The `--parameter-overrides` CLI flag in READMEs and runbooks is a different
 * string (hyphens, mid-line) and stays legal — those documented invocations carry
 * placeholders, and the runbook rule is "pass every parameter explicitly on the
 * command line" for exactly this reason.
 */
describe("sam deploy --guided output never lands in git", () => {
  it("sees the tracked file list (this guard must not silently no-op)", () => {
    expect(TRACKED.length).toBeGreaterThan(200);
  });

  it("no samconfig file is tracked, at any depth", () => {
    const hits = TRACKED.filter((p) => /(^|\/)samconfig[^/]*\.(toml|ya?ml)$/i.test(p));
    expect(hits).toEqual([]);
  });

  it("no tracked file carries a parameter_overrides value assignment", () => {
    const findings: string[] = [];
    for (const rel of TRACKED) {
      if (!SCAN_EXT.test(rel)) continue;
      if (ALLOWED.has(rel)) continue;
      let text: string;
      try {
        text = readFileSync(join(REPO, rel), "utf8");
      } catch {
        continue;
      }
      text.split("\n").forEach((line, i) => {
        if (/^\s*"?parameter_overrides"?\s*[:=]\s*\S/.test(line)) {
          findings.push(`${rel}:${i + 1}  ${line.trim().slice(0, 120)}`);
        }
      });
    }
    expect(findings.join("\n")).toBe("");
  });

  it(".gitignore refuses samconfig files before they can be staged", () => {
    for (const name of [
      "samconfig.toml",
      "samconfig.prod.toml",
      "samconfig.yaml",
      "lambda/tutor/samconfig.toml",
      "lambda/stripe/samconfig.dev.toml",
    ]) {
      // check-ignore exits 0 when the path IS ignored; execSync throws otherwise.
      expect(() => execSync(`git check-ignore -q -- ${name}`, { cwd: REPO })).not.toThrow();
    }
  });
});
