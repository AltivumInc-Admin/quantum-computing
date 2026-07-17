// Validate a contributed Rep (content/reps/*.json).
//
// A contributed Rep is one JSON object: { "kind": <rep kind>, ...spec } — the
// spec fields are EXACTLY what the matching lesson fence takes, so a Rep that
// validates here renders identically when a maintainer promotes it into a
// GUIDE. validateRep is the single entry point the CI corpus test (and any
// future surfacing) uses. It checks, in order:
//
//   1. SHAPE — through the same parser the fence uses, PLUS a per-kind
//      allowed-key list: the fence parsers ignore unknown keys, so a typo like
//      "tolerence" would otherwise silently grade at the default and ride
//      verbatim into the promoted fence.
//   2. GRADEABILITY — through the same truth/grade kernels, PLUS the
//      degenerate-content guards the kernels don't own: a challenge whose
//      untouched editor already solves it, or a top-outcome prediction where
//      every basis state ties, would mint free FSRS cards with zero learner
//      effort.
//
// Grading tier: `tier` is now an ALLOWED challenge key, but tier:"py" is gated,
// not free. The Pyodide ("py") path cannot be exercised in CI (pyodide-grader.ts
// requires a real browser), so a py Rep validates ONLY if its id appears in the
// e2e-coverage manifest (./py-reps), where each listed id is graded for real,
// in a real browser, by web/e2e/py-reps.e2e.ts. Authoring a py Rep without that
// coverage fails here with an actionable message — the gate green-lights a py
// Rep exactly when there is browser-run proof behind it, and never otherwise.
// tier:"ts" is the default and always allowed.

import { parseChallenge } from "./challenge-schema";
import { isPyRepE2ECovered } from "./py-reps";
import { gradeTs } from "./challenge-grade";
import { parsePredict } from "./predict-schema";
import { predictionTruth } from "./predict-grade";
import { parseBlochTarget } from "./bloch-target-schema";
import { blochTargetTruth } from "./bloch-target-grade";
import { parseCostEstimate } from "./cost-estimate-schema";
import { costEstimateTruth } from "./cost-estimate-grade";
import { parseDebugCircuit } from "./debug-circuit-schema";
import { debugTruth } from "./debug-circuit-grade";
import { parseExpectation } from "./expectation-schema";
import { expectationTruth } from "./expectation-grade";

export const REP_KINDS = ["challenge", "predict", "blochtarget", "costestimate", "debug", "expect"] as const;
export type RepKind = (typeof REP_KINDS)[number];

/** The fence token a maintainer uses when promoting the Rep into a GUIDE. */
export const FENCE_TOKENS: Record<RepKind, string> = {
  challenge: "qchallenge",
  predict: "qpredict",
  blochtarget: "qblochtarget",
  costestimate: "qcostestimate",
  debug: "qdebug",
  expect: "qexpect",
};

// Every key a contribution may carry, per kind. challenge includes `tier` (the
// fence parser accepts it); tier:"py" is additionally gated on e2e coverage in
// the challenge case below.
/**
 * Exported for the GUIDE-fence corpus test (guide-reps.test.ts): lesson fences
 * carry the same spec keys minus the `kind` envelope, so one list serves both
 * gates and cannot drift.
 */
export const ALLOWED_KEYS: Record<RepKind, readonly string[]> = {
  challenge: ["kind", "id", "prompt", "qubits", "target", "starter", "allowedGates", "hint", "tier"],
  predict: ["kind", "id", "prompt", "program", "mode", "hint"],
  blochtarget: ["kind", "id", "prompt", "target", "toleranceDeg", "blind", "hint"],
  costestimate: ["kind", "id", "prompt", "provider", "shots", "tasks", "hint"],
  debug: ["kind", "id", "prompt", "qubits", "broken", "target", "allowedGates", "hint"],
  expect: ["kind", "id", "prompt", "program", "observable", "qubits", "hint"],
};

// A Rep is authored prose + a short program; anything near this ceiling is a
// mistake or a CI/lesson-payload attack (a multi-MB program validates fine and
// then blocks every learner's main thread once promoted).
export const MAX_REP_BYTES = 65_536;

export interface ValidRep {
  kind: RepKind;
  /** The Rep's stable id — its localStorage schedule key once graded. */
  id: string;
  fenceToken: string;
  /** The fence body (the spec without the `kind` envelope), pretty-printed. */
  fenceSource: string;
}

export interface RepValidation {
  rep?: ValidRep;
  error?: string;
}

export function validateRep(source: string): RepValidation {
  if (source.length > MAX_REP_BYTES) {
    return { error: `Rep exceeds ${MAX_REP_BYTES} bytes — a Rep is a prompt and a short program` };
  }
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(source);
    // JSON.parse happily returns null/true/[1] — field access must not throw.
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { error: "a Rep must be a single JSON object" };
    }
    data = parsed as Record<string, unknown>;
  } catch (e) {
    return { error: `invalid Rep JSON: ${(e as Error).message}` };
  }
  const kind = data.kind;
  if (typeof kind !== "string" || !(REP_KINDS as readonly string[]).includes(kind)) {
    return { error: `Rep needs "kind": one of ${REP_KINDS.join(", ")}` };
  }
  // An id is a permanent storage key, never implicit — every Rep kind's own
  // parser (challenge included) also enforces this.
  if (typeof data.id !== "string" || !data.id.trim()) {
    return { error: 'contributed Reps need an explicit string "id" (the stable storage key)' };
  }
  // Fail loudly on unknown keys — the fence parsers silently drop them.
  const allowed = ALLOWED_KEYS[kind as RepKind];
  for (const key of Object.keys(data)) {
    if (!allowed.includes(key)) {
      return { error: `unknown key "${key}" for kind "${kind}" — allowed: ${allowed.join(", ")}` };
    }
  }
  const target = data.target as Record<string, unknown> | undefined;
  if (target && typeof target === "object" && !Array.isArray(target)) {
    for (const key of Object.keys(target)) {
      if (key !== "program") return { error: `unknown key "target.${key}" — target takes only "program"` };
    }
  }
  const broken = data.broken as Record<string, unknown> | undefined;
  if (broken && typeof broken === "object" && !Array.isArray(broken)) {
    for (const key of Object.keys(broken)) {
      if (key !== "program") return { error: `unknown key "broken.${key}" — broken takes only "program"` };
    }
  }

  // The `kind` field is the envelope; the fence parsers see the bare spec.
  const spec: Record<string, unknown> = { ...data };
  delete spec.kind;
  const fenceSource = JSON.stringify(spec, null, 2);

  let error: string | undefined;
  switch (kind as RepKind) {
    case "challenge": {
      const parsed = parseChallenge(fenceSource);
      if (parsed.error) return { error: parsed.error };
      // tier:"py" is graded in a real browser (pyodide-grader.ts), which CI
      // cannot run — so it validates ONLY with e2e coverage behind it. An id
      // absent from the manifest is a py Rep with no browser-run proof.
      if (parsed.spec!.tier === "py" && !isPyRepE2ECovered(parsed.spec!.id)) {
        return {
          error:
            `tier:"py" Rep "${parsed.spec!.id}" has no in-browser e2e coverage — ` +
            "add its id to PY_REP_E2E_IDS in src/lib/py-reps.ts and a case to " +
            "web/e2e/py-reps.e2e.ts (the Pyodide path cannot be verified in CI otherwise)",
        };
      }
      // The reference solution must actually solve its own challenge...
      const grade = gradeTs(parsed.spec!.target.program, parsed.spec!);
      if (grade.status !== "solved") {
        error = `challenge reference does not solve itself: ${grade.message}`;
        break;
      }
      // ...and the UNTOUCHED editor must NOT: an identity-on-|0⟩ target (Z 0,
      // H 0\nH 0) or a starter equal to the solution mints a free "good" card
      // on one Check with zero learner effort (the same degenerate class
      // blochTargetTruth guards with its |0⟩-start check).
      if (gradeTs(parsed.spec!.starter, parsed.spec!).status === "solved") {
        error =
          "challenge is solved by the untouched editor (empty/identity target or starter equal to the solution) — there is nothing to do";
      }
      break;
    }
    case "predict": {
      const parsed = parsePredict(fenceSource);
      if (parsed.error) return { error: parsed.error };
      const truth = predictionTruth(parsed.spec!);
      error = truth.error;
      // A top-outcome question where every basis state ties grades EVERY pick
      // correct — zero-signal, like a colliding cost distractor set.
      if (
        !error &&
        parsed.spec!.mode === "top-outcome" &&
        truth.truth!.topIndices.length === truth.truth!.probs.length
      ) {
        error =
          "top-outcome prediction where every basis state ties — any answer grades correct; use nonzero-states or a non-uniform circuit";
      }
      break;
    }
    case "blochtarget": {
      const parsed = parseBlochTarget(fenceSource);
      if (parsed.error) return { error: parsed.error };
      error = blochTargetTruth(parsed.spec!).error;
      break;
    }
    case "costestimate": {
      const parsed = parseCostEstimate(fenceSource);
      if (parsed.error) return { error: parsed.error };
      error = costEstimateTruth(parsed.spec!).error;
      break;
    }
    case "debug": {
      const parsed = parseDebugCircuit(fenceSource);
      if (parsed.error) return { error: parsed.error };
      // debugTruth owns every degenerate guard this gate needs: parseability
      // and concreteness of BOTH programs, allowedGates self-consistency, the
      // qubit cap, broken != target (nothing to fix), and the |0...0> target
      // (delete-everything solves it).
      error = debugTruth(parsed.spec!).error;
      break;
    }
    case "expect": {
      const parsed = parseExpectation(fenceSource);
      if (parsed.error) return { error: parsed.error };
      // expectationTruth owns the guards: concrete circuit, well-formed Pauli
      // string within the qubit cap, and four distinct options on the display
      // grid (distractor-collision rejection).
      error = expectationTruth(parsed.spec!).error;
      break;
    }
  }
  if (error) return { error };

  return {
    rep: {
      kind: kind as RepKind,
      id: data.id,
      fenceToken: FENCE_TOKENS[kind as RepKind],
      fenceSource,
    },
  };
}
