import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import {
  UNDELIVERABLE_CLAIMS,
  claimById,
  undeliverableClaimHits,
  type UndeliverableClaim,
} from "../_support/undeliverable-claims";

/**
 * THE HARDWARE MONEY SURFACES MAY NOT ADVERTISE WHAT THE DEPLOYED SYSTEM CANNOT DO —
 * and in particular may not make a MARGIN CLAIM, in either direction.
 *
 * The defect this exists for. The pricing page carried "billed at cost with no markup"
 * until 2026-09, when commit d216724 retired it: CLAUDE.md rules 5 and 9 settle that
 * every metered surface debits at ONE shared factor over true cost, so "at cost" is a
 * commercial promise the model contradicts, and rule 6 keeps that factor out of this
 * public repo, so nothing here could ever substantiate the claim either way. That
 * commit touched the pricing page and the pricing page's test. It left the same
 * sentence shipping in SIX places on the two hardware surfaces:
 *
 *   qpu-submit-panel.tsx   "You pay for these runs at cost. We add nothing on top."
 *                          "— with no markup."
 *                          "Runs are billed at the Amazon Braket price with no markup"
 *                          "billed at the Amazon Braket price with no markup."
 *                          "credits fund every run at the same Braket rates, with no markup."
 *   hardware-panel.tsx     "billed to your credits at cost, no markup."
 *
 * They survived because the ban list that bars the phrasing was a `const` inside
 * __tests__/app/pricing-page.test.tsx — a guard scoped to one route, which reads as
 * coverage and is not. The list now lives in __tests__/_support/undeliverable-claims.ts
 * and this file points it at the surfaces the pricing page's guard could never see.
 *
 * WHY A SOURCE SCAN RATHER THAN A RENDERED ONE. Both hardware surfaces are dense with
 * conditionals — the submit panel alone branches on sponsored/unsponsored funding,
 * credentialed/gated, loading/signed-out/error/throttled, and enough-credits/not — and
 * a rendered scan only ever sees the branches the test's props select. Five of the six
 * sites above sit in a branch: `{sponsored ? … : …}`, the wallet caption's
 * enough/not-enough ternary, and a card that renders only for a learner whose budget
 * is spent. A source scan cannot be fooled that way, and it also reads the copy that
 * has no branch reachable from a unit test at all. The rendered side is not abandoned:
 * qpu-submit-panel.test.tsx asserts, per funding branch, that the retired framing is
 * ABSENT from the rendered tree.
 *
 * Two normalizations, because each catches what the other misses, and the six sites
 * needed both:
 *
 *   code  the source with comments stripped and whitespace collapsed. This is the one
 *         that sees a claim written as a STRING LITERAL inside an expression —
 *         `{sponsored ? "…" : "You pay for these runs at cost."}` — which is exactly
 *         the shape of site 1.
 *   flat  the same, with inline `{…}` expressions and `<…>` tags removed. This is the
 *         one that sees a claim SPLIT BY MARKUP — `no <strong>markup</strong>`, or a
 *         sentence interrupted by `</span>{" "}` — which reads as one phrase on screen
 *         and as two fragments in the file.
 *
 * Neither is a rendering. They are deliberately over-broad: a banned phrase in a
 * className, an identifier or a string that never reaches the screen still fails here.
 * That is the right direction for a denylist over prose, and the exemptions below are
 * the price of it.
 *
 * If this fails on your change: say only what is true and public — a run is priced from
 * the Amazon Braket rate. Do not replace one margin claim with its opposite, and do not
 * write the factor down. Widening an exemption is almost never the fix.
 */

const WEB = join(__dirname, "..", "..");
const SRC = join(WEB, "src");

/**
 * The surfaces that quote money for a hardware run. Both are hardcoded English
 * (13 t() calls between them, none on the money copy), so the Spanish arms of these
 * patterns have nothing to match here — a Spanish twin of this copy does not exist and
 * is a separate, larger piece of work.
 *
 * It is a LIST, which is the same class of gap the pricing page's guard had: a third
 * money surface added tomorrow is not scanned by this describe block until somebody
 * adds it. The repo-wide sweep further down is the answer to that for the one promise
 * this file was written about; everything else here is only as complete as this list.
 */
const HARDWARE_SURFACES = [
  "src/components/quantum/qpu-submit-panel.tsx",
  "src/components/playground/hardware-panel.tsx",
];

/**
 * Patterns NOT applied to the hardware surfaces, each with the evidence that it fires
 * on something legitimate there. Every exemption is a real hole — a genuine claim of
 * this kind on these two files ships green — so keep the list at two if at all
 * possible, and prefer rewording the copy over adding a third.
 */
const EXEMPT: { id: string; because: string }[] = [
  {
    id: "sponsored-hardware",
    // `SponsorNote`, the `sponsored` prop, and the heading "Lifetime sponsored QPU
    // budget" are all in qpu-submit-panel.tsx and all deliberate. CLAUDE.md records the
    // decision: the withdrawn sponsorship copy was removed from every surface that
    // ADVERTISES it, while the submit panel's sponsor note is CONDITIONAL — it renders
    // only for a grandfathered learner whose ledger row carries capMicros > 0 — and
    // stays, because for that learner it is true. A stem match on /sponsor\w*/ cannot
    // tell an identifier or a conditional branch from an advertisement.
    because:
      "the panel's sponsor note is conditional on a grandfathered allowance and stays (CLAUDE.md); the identifiers SponsorNote/sponsored are not copy",
  },
  {
    id: "tutor-model-unlocks",
    // Fires on "Unlock hardware access" (the credential-gate button) and "Price a run
    // first to unlock hardware access." That pattern bars a claim about TUTOR MODEL
    // entitlements, which the deployed tutor cannot honour. The hardware credential
    // gate is a different thing entirely and it works: claimCredential() flips
    // budget.credentialed and the submit form replaces the gate.
    because:
      "'unlock' here is the pedagogical credential gate (claimCredential flips budget.credentialed), not a tutor model entitlement",
  },
];

const APPLIED: UndeliverableClaim[] = UNDELIVERABLE_CLAIMS.filter(
  (c) => !EXEMPT.some((e) => e.id === c.id),
);

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const collapse = (src: string) => src.replace(/\s+/g, " ");

/** The source as written, minus comments. Sees string literals inside expressions. */
export const asCode = (src: string) => collapse(stripComments(src));

/**
 * The source with inline expressions and tags removed. Sees a phrase split by markup.
 *
 * The brace pass is deliberately ONE pass over innermost `{…}` groups, not a repeated
 * one: repeating it would eat every enclosing block — a component's whole body is
 * `{ … }` — and delete the JSX text this is trying to read.
 */
export const asFlattened = (src: string) =>
  collapse(
    stripComments(src)
      .replace(/\{[^{}]*\}/g, " ")
      .replace(/<[^>]*>/g, " "),
  );

const NORMALIZERS = [
  ["code", asCode],
  ["flat", asFlattened],
] as const;

function hitsIn(rel: string, claims: readonly UndeliverableClaim[] = APPLIED): string[] {
  const raw = readFileSync(join(WEB, rel), "utf8");
  return NORMALIZERS.flatMap(([shape, normalize]) =>
    undeliverableClaimHits(normalize(raw), `${rel} (${shape})`, claims),
  );
}

describe("the ban list this guard applies is the shared one, and is not empty", () => {
  it("resolves every exempted id (a rename must go red, not silently widen the scan)", () => {
    // claimById throws with the known ids when one is gone. Without this, renaming
    // "sponsored-hardware" in the shared list would leave EXEMPT matching nothing —
    // which fails safe here, but the reverse (renaming an APPLIED id) does not, and
    // the count assertion below is what catches that.
    for (const { id } of EXEMPT) expect(claimById(id).id).toBe(id);
  });

  it("applies every shared pattern except the two exemptions", () => {
    expect(APPLIED.length).toBe(UNDELIVERABLE_CLAIMS.length - EXEMPT.length);
    expect(APPLIED.length).toBeGreaterThan(10);
    expect(APPLIED.map((c) => c.id)).toContain("at-cost");
  });
});

/**
 * The scanner's own tripwire. A guard that has never fired is a comment, and the
 * failure mode this file was written for is precisely a guard that looks like coverage.
 * These are the two shapes the six real sites took, held against the two normalizations,
 * with a case that ONLY ONE of them can catch — so deleting either normalizer goes red.
 */
describe("the scanner catches the retired framing in the shapes it actually shipped in", () => {
  // Site 1, verbatim from qpu-submit-panel.tsx before this change: a banned sentence
  // living inside a ternary, which `flat` deletes along with the expression.
  const insideAnExpression = `
        <span className="font-semibold text-(--ink)">
          {sponsored
            ? "The platform pays for these runs. You are never charged."
            : "You pay for these runs at cost. We add nothing on top."}
        </span>`;

  // The shape a source scan of raw text cannot see: one phrase, two text nodes.
  const claimSplitAcrossTags = `<p>Runs are billed at the Amazon Braket price with no <strong>markup</strong>.</p>`;

  it("catches a claim written as a string literal inside an expression", () => {
    expect(undeliverableClaimHits(asCode(insideAnExpression), "fixture", APPLIED)).not.toEqual([]);
    // And the demonstration that `code` is load-bearing: `flat` throws this away.
    expect(undeliverableClaimHits(asFlattened(insideAnExpression), "fixture", APPLIED)).toEqual([]);
  });

  it("catches a claim split across markup", () => {
    expect(undeliverableClaimHits(asFlattened(claimSplitAcrossTags), "fixture", APPLIED)).not.toEqual([]);
    // And the demonstration that `flat` is load-bearing: `code` cannot see this one.
    expect(undeliverableClaimHits(asCode(claimSplitAcrossTags), "fixture", APPLIED)).toEqual([]);
  });

  it("stays silent on the honest replacement", () => {
    const honest = `
      <p>
        Every run bills the platform&apos;s AWS account at the Amazon Braket rate —{" "}
        <span>{PER_TASK_USD} per task + {PER_SHOT_USD} per shot</span>.
      </p>`;
    expect(undeliverableClaimHits(asCode(honest), "fixture", APPLIED)).toEqual([]);
    expect(undeliverableClaimHits(asFlattened(honest), "fixture", APPLIED)).toEqual([]);
  });
});

describe.each(HARDWARE_SURFACES)("%s", (rel) => {
  it("is the file this guard thinks it is", () => {
    // Non-vacuity: a moved or renamed surface must fail loudly rather than scan
    // something that no longer quotes money for a hardware run.
    const raw = readFileSync(join(WEB, rel), "utf8");
    expect(raw.length).toBeGreaterThan(2_000);
    expect(raw).toMatch(/IQM Garnet/);
  });

  it("advertises no capability the deployed system cannot perform", () => {
    expect(hitsIn(rel)).toEqual([]);
  });
});

/**
 * The at-cost promise, across ALL of web/src — the one pattern that gets a repo-wide
 * sweep rather than a hardcoded surface list.
 *
 * The whole lesson of d216724 is that naming the surfaces is how the clause survived:
 * it was removed where somebody looked and kept shipping where nobody did. A margin
 * claim is cheap to type into any component, any dictionary entry and any piece of
 * marketing copy, so for this one claim the scan is the entire app rather than a list
 * somebody has to remember to extend.
 *
 * It costs nothing: the pattern's Spanish arm is anchored on "a costo" / "a precio de
 * costo" rather than the bare noun precisely so that honest cost talk ("te muestra su
 * costo") does not fire, and as of this change the sweep is clean over every .ts/.tsx
 * file under web/src with zero exemptions. Keep it at zero. If it fires on prose that
 * is genuinely honest, the pattern is wrong and belongs edited in the shared list —
 * not exempted here.
 */
describe("the at-cost promise is gone from the whole app, not just the pages someone looked at", () => {
  function walk(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, acc);
      else if (/\.tsx?$/.test(name)) acc.push(full);
    }
    return acc;
  }

  const files = walk(SRC);
  const atCost = [claimById("at-cost")];

  it("finds source files to scan", () => {
    // A broken walk would make the sweep below vacuously true.
    expect(files.length).toBeGreaterThan(100);
  });

  it("makes no at-cost or no-markup claim anywhere under web/src", () => {
    const offenders = files.flatMap((file) => {
      const raw = readFileSync(file, "utf8");
      const rel = relative(WEB, file);
      return NORMALIZERS.flatMap(([shape, normalize]) =>
        undeliverableClaimHits(normalize(raw), `${rel} (${shape})`, atCost),
      );
    });
    expect(offenders).toEqual([]);
  });
});
