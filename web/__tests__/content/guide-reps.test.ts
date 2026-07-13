/**
 * The GUIDE-fence corpus gate — the missing half of reps-corpus.test.ts.
 *
 * content/reps/*.json (the contribution inbox) has always been CI-validated,
 * but the fences ACTUALLY RENDERED to learners — the ```qchallenge/qpredict/
 * qblochtarget/qcostestimate/qdebug/qexpect blocks inside each module's
 * GUIDE.md — validated only at runtime, in the learner's browser. A typo'd
 * key, an ungradeable spec, or a degenerate Rep (free-card class) would ship
 * silently and render as an error card (or worse, grade wrongly) in
 * production. This test runs EVERY GUIDE fence through the same parsers and
 * truth kernels the live widgets use, so authored content fails CI exactly
 * like contributed content does.
 *
 * GUIDE-specific rules (vs validateRep):
 *   - No `kind` envelope — the fence token IS the kind.
 *   - EVERY kind requires an explicit id (each parser enforces it). An id is a
 *     permanent schedule key; the old prompt-hash fallback for challenge meant
 *     a copy-edit to the prompt orphaned every learner's card, so it was
 *     removed (the two legacy fences were backfilled with their then-current
 *     hashes).
 *   - challenge may carry `tier`, but NOT "py": a py-tier fence cannot be
 *     graded in CI (pyodide needs a real browser), so authored py content is
 *     rejected here until a browser-gated path exists for it (the e2e fixture
 *     page is the only sanctioned tier:"py" mount).
 *   - Rep ids must be unique ACROSS all GUIDEs (reps-corpus.test.ts already
 *     guards corpus-vs-GUIDE collisions; this closes GUIDE-vs-GUIDE).
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import path from "path";
import { ALLOWED_KEYS, type RepKind } from "@/lib/rep-schema";
import { parseChallenge } from "@/lib/challenge-schema";
import { gradeTs } from "@/lib/challenge-grade";
import { parsePredict } from "@/lib/predict-schema";
import { predictionTruth } from "@/lib/predict-grade";
import { parseBlochTarget } from "@/lib/bloch-target-schema";
import { blochTargetTruth } from "@/lib/bloch-target-grade";
import { parseCostEstimate } from "@/lib/cost-estimate-schema";
import { costEstimateTruth } from "@/lib/cost-estimate-grade";
import { parseDebugCircuit } from "@/lib/debug-circuit-schema";
import { debugTruth } from "@/lib/debug-circuit-grade";
import { parseExpectation } from "@/lib/expectation-schema";
import { expectationTruth } from "@/lib/expectation-grade";

const REPO_ROOT = path.join(__dirname, "../../..");

const TOKEN_TO_KIND: Record<string, RepKind> = {
  qchallenge: "challenge",
  qpredict: "predict",
  qblochtarget: "blochtarget",
  qcostestimate: "costestimate",
  qdebug: "debug",
  qexpect: "expect",
};

interface GuideFence {
  guide: string;
  token: string;
  kind: RepKind;
  body: string;
}

function collectFences(): GuideFence[] {
  const fences: GuideFence[] = [];
  for (const entry of readdirSync(REPO_ROOT)) {
    if (!/^\d\d-/.test(entry)) continue;
    const guidePath = path.join(REPO_ROOT, entry, "GUIDE.md");
    if (!existsSync(guidePath)) continue;
    const text = readFileSync(guidePath, "utf8");
    const re = /^```(qchallenge|qpredict|qblochtarget|qcostestimate|qdebug|qexpect)\n([\s\S]*?)\n```/gm;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      fences.push({ guide: entry, token: m[1], kind: TOKEN_TO_KIND[m[1]], body: m[2] });
    }
  }
  return fences;
}

const fences = collectFences();

it("finds a non-empty GUIDE Rep corpus (the extractor must not silently go blind)", () => {
  expect(fences.length).toBeGreaterThan(0);
});

describe.each(fences.map((f, i) => [`${f.guide} ${f.token} #${i}`, f] as const))(
  "%s",
  (_name, f) => {
    const data = (): Record<string, unknown> => JSON.parse(f.body) as Record<string, unknown>;

    it("is valid JSON with only known keys for its kind", () => {
      const d = data();
      // GUIDE fences carry the contribution keys minus the `kind` envelope;
      // challenge additionally accepts `tier` (see the py rule below).
      const allowed = new Set<string>(
        ALLOWED_KEYS[f.kind].filter((k) => k !== "kind").concat(f.kind === "challenge" ? ["tier"] : [])
      );
      for (const key of Object.keys(d)) {
        expect(allowed.has(key) ? "" : `unknown key "${key}"`).toBe("");
      }
    });

    it("parses and is gradeable through the real truth kernel", () => {
      switch (f.kind) {
        case "challenge": {
          const parsed = parseChallenge(f.body);
          expect(parsed.error).toBeUndefined();
          // Authored py-tier content cannot be graded in CI — see the header.
          expect(parsed.spec!.tier).not.toBe("py");
          // The reference must solve itself; the untouched editor must not
          // (the free-card degenerate class).
          expect(gradeTs(parsed.spec!.target.program, parsed.spec!).status).toBe("solved");
          expect(gradeTs(parsed.spec!.starter, parsed.spec!).status).not.toBe("solved");
          break;
        }
        case "predict": {
          const parsed = parsePredict(f.body);
          expect(parsed.error).toBeUndefined();
          const truth = predictionTruth(parsed.spec!);
          expect(truth.error).toBeUndefined();
          if (parsed.spec!.mode === "top-outcome") {
            // All-tie top-outcome grades every pick correct — zero signal.
            expect(truth.truth!.topIndices.length).toBeLessThan(truth.truth!.probs.length);
          }
          break;
        }
        case "blochtarget": {
          const parsed = parseBlochTarget(f.body);
          expect(parsed.error).toBeUndefined();
          expect(blochTargetTruth(parsed.spec!).error).toBeUndefined();
          break;
        }
        case "costestimate": {
          const parsed = parseCostEstimate(f.body);
          expect(parsed.error).toBeUndefined();
          expect(costEstimateTruth(parsed.spec!).error).toBeUndefined();
          break;
        }
        case "debug": {
          const parsed = parseDebugCircuit(f.body);
          expect(parsed.error).toBeUndefined();
          expect(debugTruth(parsed.spec!).error).toBeUndefined();
          break;
        }
        case "expect": {
          const parsed = parseExpectation(f.body);
          expect(parsed.error).toBeUndefined();
          expect(expectationTruth(parsed.spec!).error).toBeUndefined();
          break;
        }
      }
    });
  }
);

it("every Rep has an explicit id, unique across every GUIDE (an id is a permanent schedule key)", () => {
  const seen = new Map<string, string>();
  for (const f of fences) {
    const id = (JSON.parse(f.body) as { id?: string }).id;
    // A missing id is a shipping hazard, not a pass: without an explicit key
    // the card would fall back to nothing stable and a prompt edit would
    // orphan every learner's progress.
    expect(id ? "" : `missing id in a ${f.token} fence in ${f.guide}`).toBe("");
    const prior = seen.get(id!);
    expect(prior ? `id "${id}" in both ${prior} and ${f.guide}` : "").toBe("");
    seen.set(id!, f.guide);
  }
});
