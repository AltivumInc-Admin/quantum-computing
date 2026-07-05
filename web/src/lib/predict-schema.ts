// Parse + validate the JSON inside a ```qpredict fenced block.
//
// A predict-then-run Rep shows a concrete circuit and asks the learner to commit
// a prediction about its outcome BEFORE the simulation is revealed. The prediction
// is graded objectively against the qcsim-parity kernel (predict-grade.ts) and
// feeds the FSRS scheduler through the shared adapter. Mirrors challenge-schema.ts.

export type PredictMode = "top-outcome" | "nonzero-states";

export interface PredictSpec {
  id: string;
  prompt: string;
  /** qsim DSL — must be concrete (no slider `theta`), or grading has no ground truth. */
  program: string;
  mode: PredictMode;
  hint?: string;
}

export interface ParsedPredict {
  spec?: PredictSpec;
  error?: string;
}

const MODES: readonly PredictMode[] = ["top-outcome", "nonzero-states"];

export function parsePredict(source: string): ParsedPredict {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(source);
  } catch (e) {
    return { error: `invalid predict JSON: ${(e as Error).message}` };
  }

  // The id is this Rep's localStorage schedule key — it must be stable and
  // author-assigned, never a content hash that could silently drift and orphan
  // a learner's progress.
  if (typeof data.id !== "string" || !data.id.trim()) {
    return { error: 'predict needs a non-empty string "id" (its stable storage key)' };
  }
  if (typeof data.prompt !== "string" || !data.prompt.trim()) {
    return { error: 'predict needs a non-empty "prompt" string' };
  }
  if (typeof data.program !== "string" || !data.program.trim()) {
    return { error: 'predict needs a "program" (qsim DSL) string' };
  }
  if (data.mode != null && !MODES.includes(data.mode as PredictMode)) {
    return { error: `predict "mode" must be one of: ${MODES.join(", ")}` };
  }
  const mode: PredictMode = data.mode === "nonzero-states" ? "nonzero-states" : "top-outcome";

  return {
    spec: {
      id: data.id,
      prompt: data.prompt,
      program: data.program,
      mode,
      hint: typeof data.hint === "string" ? data.hint : undefined,
    },
  };
}
