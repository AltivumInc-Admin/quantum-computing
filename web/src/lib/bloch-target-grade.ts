// Objective grading for a ```qblochtarget Rep. Builds the target state once
// with the qcsim-parity kernel, then grades the learner's slider-driven state
// by great-circle angle on the Bloch sphere. Pure — no React, no storage —
// mirrors predict-grade.ts / challenge-grade.ts.

import { simulate, blochAngle, clamp, type Complex } from "@/components/quantum/math";
import { parseProgram, opsFor } from "@/components/quantum/qsim-dsl";
import { diracString } from "@/components/quantum/state-readout";
import type { BlochTargetSpec } from "./bloch-target-schema";

// The θ/φ sliders step in π/60 (3°), so one step moves the vector up to ~3° of
// arc: a tolerance below 4° could make an off-grid target unreachable. 30° is
// the ceiling before "close enough" stops meaning anything on a sphere.
export const MIN_TOLERANCE_DEG = 4;
export const MAX_TOLERANCE_DEG = 30;

export function clampToleranceDeg(deg: number): number {
  return clamp(deg, MIN_TOLERANCE_DEG, MAX_TOLERANCE_DEG);
}

export interface BlochTargetTruth {
  /** The single-qubit target state the learner is steering toward. */
  targetState: Complex[];
}

export interface BlochTruthResult {
  truth?: BlochTargetTruth;
  error?: string;
}

const ZERO_STATE: Complex[] = [
  [1, 0],
  [0, 0],
];

/** Compute the target state, or an error if the spec isn't gradeable. */
export function blochTargetTruth(spec: BlochTargetSpec): BlochTruthResult {
  const program = parseProgram(spec.target.program);
  if (program.error) {
    return { error: `This Rep's target circuit is invalid: ${program.error}` };
  }
  // A slider-bound theta has no single state to steer toward.
  if (program.hasTheta) {
    return { error: "This Rep's target circuit must be concrete (no slider theta)." };
  }
  // The Bloch sphere pictures exactly one qubit; a multi-qubit target has no
  // point on it to place (an entangled qubit isn't even a pure Bloch state).
  if (program.n > 1) {
    return { error: "This Rep's target must be a single-qubit circuit (the Bloch sphere shows one qubit)." };
  }
  const targetState = simulate(opsFor(program, 0), 1);
  // The sliders start at |0⟩, so a target within tolerance of |0⟩ solves with
  // zero interaction and mints a free "good" card. This catches the whole
  // degenerate class from an authoring slip: a comment-only or directive-only
  // program (gates=[]), identity-on-|0⟩ circuits ("Z 0", "T 0", "H 0\nH 0"),
  // and near-|0⟩ rotations.
  const tolRad = (clampToleranceDeg(spec.toleranceDeg) * Math.PI) / 180;
  if (blochAngle(targetState, ZERO_STATE) <= tolRad) {
    return { error: "This Rep's target sits at the |0⟩ start position — there is nothing to drive to." };
  }
  return { truth: { targetState } };
}

export interface BlochGrade {
  solved: boolean;
  angleRad: number;
  angleDeg: number;
}

/**
 * Grade the learner's state against the target: solved when the great-circle
 * angle between them is within the tolerance. The 1e-9 slack keeps an
 * exactly-on-the-boundary grade deterministic against acos rounding.
 */
export function gradeBlochTarget(
  learnerState: Complex[],
  targetState: Complex[],
  toleranceRad: number,
): BlochGrade {
  const angleRad = blochAngle(learnerState, targetState);
  return {
    solved: angleRad <= toleranceRad + 1e-9,
    angleRad,
    angleDeg: (angleRad * 180) / Math.PI,
  };
}

/** A one-line recall answer for the /review card. */
export function blochTargetReviewAnswer(targetState: Complex[]): string {
  return `Target state: ${diracString(targetState, 1)}`;
}
