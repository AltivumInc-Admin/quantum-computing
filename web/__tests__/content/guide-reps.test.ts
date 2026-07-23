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
 *   - challenge may carry `tier`. tier:"py" cannot be graded in CI (pyodide
 *     needs a real browser), so a py fence is accepted here ONLY if its id is in
 *     the e2e-coverage manifest (src/lib/py-reps.ts), where web/e2e/py-reps.e2e.ts
 *     grades it for real. This test additionally asserts the manifest and the set
 *     of tier:"py" fences match 1:1 in both directions — no uncovered py fence
 *     ships, and no manifest id lacks a shipped fence.
 *   - Rep ids must be unique ACROSS all GUIDEs (reps-corpus.test.ts already
 *     guards corpus-vs-GUIDE collisions; this closes GUIDE-vs-GUIDE).
 *
 * ```quiz fences are gated too, in their own table further down: same JSON-spec
 * + parser + ErrorCard shape, with stable per-question ids that feed FSRS via
 * learner self-rating (no auto-grader / truth kernel), so the Rep rules above
 * do not apply to them.
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import path from "path";
import { ALLOWED_KEYS, type RepKind } from "@/lib/rep-schema";
import { PY_REP_E2E_IDS } from "@/lib/py-reps";
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
import { parseQuiz } from "@/lib/quiz-schema";
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
          // The reference target must be a valid, concrete, self-solving qsim
          // circuit for BOTH tiers — gradePy simulates exactly this program as
          // its reference state (see pyodide-grader.ts).
          expect(gradeTs(parsed.spec!.target.program, parsed.spec!).status).toBe("solved");
          if (parsed.spec!.tier === "py") {
            // py content is graded in a real browser only — CI trusts it via the
            // e2e-coverage manifest (its actual solve/wrong grading is proven by
            // web/e2e/py-reps.e2e.ts). The starter is Braket Python, not qsim DSL,
            // so the ts untouched-editor guard does not apply here.
            expect(PY_REP_E2E_IDS as readonly string[]).toContain(parsed.spec!.id);
          } else {
            // The untouched editor must NOT already solve (the free-card class).
            expect(gradeTs(parsed.spec!.starter, parsed.spec!).status).not.toBe("solved");
          }
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

/**
 * ```quiz fences. Structurally the same shape as the six gated kinds — a JSON
 * spec, a dedicated parser, an ErrorCard degrade on any failure — but with no
 * `kind` envelope and no auto-grader: each question carries a stable `id` and
 * the learner self-rates after reveal (Again/Hard/Good/Easy), feeding the same
 * FSRS store as ```qcard under the `quiz:` card-key prefix. It therefore gets
 * its own collector rather than being folded into the Rep table above, but the
 * same guarantee: a typo'd fence fails CI instead of shipping as a parse-error
 * card where a 4-to-10 question self-check should be.
 */
function collectQuizFences(): { guide: string; body: string }[] {
  const out: { guide: string; body: string }[] = [];
  for (const entry of readdirSync(REPO_ROOT)) {
    if (!/^\d\d-/.test(entry)) continue;
    const guidePath = path.join(REPO_ROOT, entry, "GUIDE.md");
    if (!existsSync(guidePath)) continue;
    const text = readFileSync(guidePath, "utf8");
    const re = /^```quiz\n([\s\S]*?)\n```/gm;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      out.push({ guide: entry, body: m[1] });
    }
  }
  return out;
}

const quizFences = collectQuizFences();

it("finds a non-empty GUIDE quiz corpus (the extractor must not silently go blind)", () => {
  expect(quizFences.length).toBeGreaterThan(0);
});

describe.each(quizFences.map((f, i) => [`${f.guide} quiz #${i}`, f] as const))(
  "%s",
  (_name, f) => {
    it("parses through the real parser the widget uses", () => {
      expect(parseQuiz(f.body).error).toBeUndefined();
    });

    it("gives every question a stable id, non-empty prompt, and answer", () => {
      const { questions } = parseQuiz(f.body);
      expect(questions.length).toBeGreaterThan(0);
      questions.forEach((q, i) => {
        expect(q.id.trim() ? "" : `question ${i + 1} has an empty "id"`).toBe("");
        expect(q.q.trim() ? "" : `question ${i + 1} has an empty "q"`).toBe("");
        expect(q.a.trim() ? "" : `question ${i + 1} has an empty "a"`).toBe("");
        // `hint` is documented optional, but an empty string is authoring
        // debris: it renders a Hint button that reveals nothing.
        if (q.hint !== undefined) {
          expect(q.hint.trim() ? "" : `question ${i + 1} has an empty "hint"`).toBe("");
        }
      });
    });
  }
);

it("quiz question ids are unique across the whole curriculum (rename orphans progress)", () => {
  const seen = new Map<string, string>();
  for (const f of quizFences) {
    const { questions } = parseQuiz(f.body);
    for (const q of questions) {
      const prior = seen.get(q.id);
      expect(
        prior === undefined
          ? true
          : `duplicate quiz id "${q.id}" in ${f.guide} (also ${prior})`,
      ).toBe(true);
      seen.set(q.id, f.guide);
    }
  }
  // Placement + four end-of-module checks: 10 + 5 + 4 + 4 + 4 = 27.
  expect(seen.size).toBeGreaterThanOrEqual(27);
});

it("the tier:'py' GUIDE fences map 1:1 to the e2e-coverage manifest (both directions)", () => {
  const pyFenceIds = fences
    .filter((f) => f.kind === "challenge" && (JSON.parse(f.body) as { tier?: string }).tier === "py")
    .map((f) => (JSON.parse(f.body) as { id: string }).id)
    .sort();
  const manifest = [...PY_REP_E2E_IDS].sort();
  // A mismatch is a half-landed py Rep: either a fence with no browser proof, or
  // a manifest id (and its e2e case) with no shipped content behind it.
  expect(pyFenceIds).toEqual(manifest);
});

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
