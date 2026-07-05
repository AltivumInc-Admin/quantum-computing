// Validate a contributed Rep (content/reps/*.json).
//
// A contributed Rep is one JSON object: { "kind": <rep kind>, ...spec } — the
// spec fields are EXACTLY what the matching lesson fence takes, so a Rep that
// validates here renders identically when a maintainer promotes it into a
// GUIDE. validateRep is the single entry point the CI corpus test (and any
// future surfacing) uses: it checks the SHAPE through the same parser the
// fence uses, then GRADEABILITY through the same truth/grade kernel — a Rep
// that parses but cannot be graded (unreachable target, colliding distractors,
// unsolvable reference) fails loudly here instead of shipping broken.

import { parseChallenge } from "./challenge-schema";
import { gradeTs } from "./challenge-grade";
import { parsePredict } from "./predict-schema";
import { predictionTruth } from "./predict-grade";
import { parseBlochTarget } from "./bloch-target-schema";
import { blochTargetTruth } from "./bloch-target-grade";
import { parseCostEstimate } from "./cost-estimate-schema";
import { costEstimateTruth } from "./cost-estimate-grade";

export const REP_KINDS = ["challenge", "predict", "blochtarget", "costestimate"] as const;
export type RepKind = (typeof REP_KINDS)[number];

/** The fence token a maintainer uses when promoting the Rep into a GUIDE. */
export const FENCE_TOKENS: Record<RepKind, string> = {
  challenge: "qchallenge",
  predict: "qpredict",
  blochtarget: "qblochtarget",
  costestimate: "qcostestimate",
};

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
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(source);
  } catch (e) {
    return { error: `invalid Rep JSON: ${(e as Error).message}` };
  }
  const kind = data.kind;
  if (typeof kind !== "string" || !(REP_KINDS as readonly string[]).includes(kind)) {
    return { error: `Rep needs "kind": one of ${REP_KINDS.join(", ")}` };
  }
  // The challenge parser auto-hashes a missing id from the prompt; contributed
  // Reps must be explicit — an id is a permanent storage key, never implicit.
  if (typeof data.id !== "string" || !data.id.trim()) {
    return { error: 'contributed Reps need an explicit string "id" (the stable storage key)' };
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
      // The reference solution must actually solve its own challenge.
      const grade = gradeTs(parsed.spec!.target.program, parsed.spec!);
      if (grade.status !== "solved") {
        error = `challenge reference does not solve itself: ${grade.message}`;
      }
      break;
    }
    case "predict": {
      const parsed = parsePredict(fenceSource);
      if (parsed.error) return { error: parsed.error };
      error = predictionTruth(parsed.spec!).error;
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
