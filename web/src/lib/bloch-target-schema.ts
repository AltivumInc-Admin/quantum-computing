// Parse + validate the JSON inside a ```qblochtarget fenced block.
//
// A Bloch-target Rep asks the learner to drive the θ/φ sliders until the state
// vector sits on a named single-qubit target, graded by great-circle angle on
// the Bloch sphere (bloch-target-grade.ts) and fed to the FSRS scheduler
// through the shared adapter. Mirrors predict-schema.ts.

export interface BlochTargetSpec {
  id: string;
  prompt: string;
  /** qsim DSL preparing the single-qubit target — concrete (no slider `theta`). */
  target: { program: string };
  /** Solve tolerance in degrees of Bloch arc (grader clamps to 4..30; default 5). */
  toleranceDeg: number;
  hint?: string;
  /** Hide the target ghost until solved — the pure-recall variant. */
  blind: boolean;
}

export interface ParsedBlochTarget {
  spec?: BlochTargetSpec;
  error?: string;
}

export const DEFAULT_TOLERANCE_DEG = 5;

export function parseBlochTarget(source: string): ParsedBlochTarget {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(source);
  } catch (e) {
    return { error: `invalid bloch-target JSON: ${(e as Error).message}` };
  }

  // The id is this Rep's localStorage schedule key — it must be stable and
  // author-assigned, never a content hash that could silently drift and orphan
  // a learner's progress.
  if (typeof data.id !== "string" || !data.id.trim()) {
    return { error: 'bloch-target needs a non-empty string "id" (its stable storage key)' };
  }
  if (typeof data.prompt !== "string" || !data.prompt.trim()) {
    return { error: 'bloch-target needs a non-empty "prompt" string' };
  }
  const target = data.target as { program?: unknown } | undefined;
  if (!target || typeof target.program !== "string" || !target.program.trim()) {
    return { error: 'bloch-target needs a "target": { "program": "..." }' };
  }
  // Tolerance is grading-critical, so a mistyped value fails loudly instead of
  // silently grading against the default.
  if (data.toleranceDeg != null && !Number.isFinite(data.toleranceDeg)) {
    return { error: 'bloch-target "toleranceDeg" must be a number (degrees of Bloch arc)' };
  }
  // Same for blind: silently coercing "true" (a string) to false would quietly
  // hand the pure-recall variant its ghost back.
  if (data.blind != null && typeof data.blind !== "boolean") {
    return { error: 'bloch-target "blind" must be a boolean' };
  }

  return {
    spec: {
      id: data.id,
      prompt: data.prompt,
      target: { program: target.program },
      toleranceDeg: typeof data.toleranceDeg === "number" ? data.toleranceDeg : DEFAULT_TOLERANCE_DEG,
      hint: typeof data.hint === "string" ? data.hint : undefined,
      blind: data.blind === true,
    },
  };
}
