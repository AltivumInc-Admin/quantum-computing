// Objective grading for a ```qpredict Rep. Runs the target circuit once with the
// qcsim-parity kernel and derives the ground truth (the most-likely outcome(s)
// and the set of reachable basis states), then grades a committed prediction
// against it. Pure — no React, no storage — mirrors challenge-grade.ts.

import { simulate, probabilities, basisLabel, type Complex } from "@/components/quantum/math";
import { parseProgram, opsFor, MAX_QUBITS } from "@/components/quantum/qsim-dsl";
import type { PredictSpec, PredictMode } from "./predict-schema";

// A basis state below this probability is treated as unreachable ("zero"), so a
// numerically-tiny amplitude never counts toward the reachable set.
const ZERO_PROB_EPS = 1e-6;
// Two probabilities within this are treated as tied (for the most-likely set).
const TIE_EPS = 1e-9;

export interface PredictionTruth {
  state: Complex[];
  probs: number[];
  n: number;
  /** Argmax set — every basis index tied for the highest probability. */
  topIndices: number[];
  /** Every basis index with probability above ZERO_PROB_EPS. */
  nonzeroIndices: number[];
}

export interface TruthResult {
  truth?: PredictionTruth;
  error?: string;
}

/** Compute the circuit's outcome, or an error if it isn't a gradeable concrete circuit. */
export function predictionTruth(spec: PredictSpec): TruthResult {
  const program = parseProgram(spec.program);
  if (program.error) {
    return { error: `This Rep's circuit is invalid: ${program.error}` };
  }
  // A slider-bound theta has no single outcome to predict.
  if (program.hasTheta) {
    return { error: "This Rep's circuit must be concrete (no slider theta)." };
  }
  if (program.n > MAX_QUBITS) {
    return { error: `This Rep is configured for ${program.n} qubits, beyond the ${MAX_QUBITS}-qubit limit.` };
  }
  const state = simulate(opsFor(program, 0), program.n);
  const probs = probabilities(state);
  const maxP = Math.max(...probs);
  const topIndices: number[] = [];
  const nonzeroIndices: number[] = [];
  probs.forEach((p, i) => {
    if (p >= maxP - TIE_EPS) topIndices.push(i);
    if (p > ZERO_PROB_EPS) nonzeroIndices.push(i);
  });
  return { truth: { state, probs, n: program.n, topIndices, nonzeroIndices } };
}

function setEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const bs = new Set(b);
  return a.every((x) => bs.has(x));
}

/** Grade a committed prediction against the computed truth. */
export function gradePrediction(
  pick: number | number[],
  truth: PredictionTruth,
  mode: PredictMode,
): boolean {
  if (mode === "top-outcome") {
    return typeof pick === "number" && truth.topIndices.includes(pick);
  }
  const picks = Array.isArray(pick) ? pick : [pick];
  return setEqual(picks, truth.nonzeroIndices);
}

function ket(i: number, n: number): string {
  return `|${basisLabel(i, n)}⟩`;
}

/** A one-line recall answer for the /review card. */
export function predictReviewAnswer(truth: PredictionTruth, mode: PredictMode): string {
  if (mode === "top-outcome") {
    const pct = Math.round(Math.max(...truth.probs) * 100);
    const kets = truth.topIndices.map((i) => ket(i, truth.n)).join(" or ");
    return `Most likely outcome: ${kets} (~${pct}%)`;
  }
  const kets = truth.nonzeroIndices.map((i) => ket(i, truth.n)).join(", ");
  return `Nonzero basis states: ${kets}`;
}
