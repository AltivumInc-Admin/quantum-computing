// Objective grading for a ```qcostestimate Rep. The truth comes from the same
// pricing kernel every cost surface uses (cost.ts, parity-locked against
// lib/utils/cost.py by the committed cost.json fixture), and the distractors
// are the three canonical pricing-model MISCONCEPTIONS — not random noise — so
// a wrong pick diagnoses exactly which part of the model the learner dropped.
// Pure — no React, no storage — mirrors predict-grade.ts.

import { PRICING, estimateCost } from "@/components/quantum/cost";
import type { CostEstimateSpec } from "./cost-estimate-schema";

export const fmtUsd = (v: number): string =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface CostEstimateTruth {
  /** The true cost: tasks × (perTask + perShot × shots). */
  correct: number;
  taskFee: number;
  shotFee: number;
  /** Four distinct dollar options, sorted ascending. */
  options: number[];
  correctIndex: number;
  /**
   * What those shots buy — the honest precision story. Standard error of an
   * estimated outcome probability at p = 0.5 (the worst case): 1/(2√N), as a
   * percentage. Shots reduce statistical error; they do not improve hardware
   * fidelity.
   */
  sePercentPerTask: number;
}

export interface CostTruthResult {
  truth?: CostEstimateTruth;
  error?: string;
}

export function costEstimateTruth(spec: CostEstimateSpec): CostTruthResult {
  const rates = PRICING[spec.provider];
  if (!("perShot" in rates)) {
    return { error: "This Rep's provider must be a per-shot QPU." };
  }
  const correct = estimateCost(spec.provider, spec.shots, 0, spec.tasks);
  const taskFee = spec.tasks * rates.perTask;
  const shotFee = spec.tasks * rates.perShot * spec.shots;

  // The three canonical misconceptions:
  //   forgot the flat task fee            -> shot fee alone
  //   forgot the shots                    -> task fee alone
  //   charged the task fee on every shot  -> shots × (perTask + perShot)
  const distractors = [shotFee, taskFee, spec.tasks * spec.shots * (rates.perTask + rates.perShot)];
  const options = [...new Set([correct, ...distractors].map((v) => fmtUsd(v)))]
    .map((s) => Number(s.replace(/[$,]/g, "")))
    .sort((a, b) => a - b);
  // If two options round to the same displayed dollars (e.g. IonQ at exactly 30
  // shots, where shot fee equals task fee), the Rep is ambiguous — fail loudly
  // at author time rather than grade a coin flip.
  if (options.length < 4) {
    return {
      error:
        "This Rep's distractors collide at these rates — pick a different shots count so all four options are distinct.",
    };
  }
  const correctIndex = options.findIndex((v) => fmtUsd(v) === fmtUsd(correct));

  return {
    truth: {
      correct,
      taskFee,
      shotFee,
      options,
      correctIndex,
      sePercentPerTask: 100 / (2 * Math.sqrt(spec.shots)),
    },
  };
}

/** Grade a committed pick against the truth. */
export function gradeCostEstimate(pickIndex: number, truth: CostEstimateTruth): boolean {
  return pickIndex === truth.correctIndex;
}

/** A one-line recall answer for the /review card. */
export function costEstimateReviewAnswer(spec: CostEstimateSpec, truth: CostEstimateTruth): string {
  const rates = PRICING[spec.provider];
  const perShot = "perShot" in rates ? rates.perShot : 0;
  const perTask = "perShot" in rates ? rates.perTask : 0;
  return (
    `${fmtUsd(truth.correct)} — ${spec.tasks} task${spec.tasks === 1 ? "" : "s"} × ` +
    `(${fmtUsd(perTask)} + ${spec.shots.toLocaleString("en-US")} × $${perShot})`
  );
}
