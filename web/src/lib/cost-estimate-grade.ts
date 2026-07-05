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

/**
 * Money is settled in integer cents, rounding each component ONCE (half-up,
 * with an epsilon so a half-cent that IEEE stores as 14.4999999... still
 * rounds up). The displayed total is then DERIVED from the rounded components,
 * so the itemized reveal can never print an addition that is off by a cent —
 * with three independently-rounded doubles, IQM at 100 shots really did render
 * "$0.30 + $0.15 = Total $0.44".
 */
const centsOf = (v: number): number => Math.round(v * 100 + 1e-7);

/** djb2 — the same tiny deterministic hash challenge-schema uses for stable ids. */
function hashId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * Deterministic per-Rep option order. Ascending sort was a structural leak:
 * for EVERY valid spec the correct total sat third of four (each single-fee
 * distractor is smaller, the fee-per-shot distractor larger), so "always pick
 * the second-largest" solved the Rep without arithmetic. A tiny LCG seeded by
 * the Rep id shuffles instead — stable across renders, different across Reps.
 */
function seededOrder(n: number, id: string): number[] {
  let s = hashId(id) || 1;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  // Warm-up draws: near-identical ids give near-identical djb2 seeds, and an
  // LCG's FIRST output for consecutive seeds differs by only ~4e-4 — every id
  // would land in the same shuffle bucket. Two iterations amplify a 1-bit seed
  // difference across the whole state.
  next();
  next();
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export interface CostEstimateTruth {
  /** The true cost in dollars, settled from cent-exact components. */
  correct: number;
  taskFee: number;
  shotFee: number;
  /** Four distinct dollar options in a deterministic per-Rep shuffle. */
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
  // Sanity-pin against the shared kernel, then settle in cents (see centsOf).
  const kernelDollars = estimateCost(spec.provider, spec.shots, 0, spec.tasks);
  const taskFeeCents = centsOf(spec.tasks * rates.perTask);
  const shotFeeCents = centsOf(spec.tasks * rates.perShot * spec.shots);
  const correctCents = taskFeeCents + shotFeeCents;
  if (Math.abs(correctCents - centsOf(kernelDollars)) > 1) {
    // Cannot happen for real PRICING values; guards a future rate that breaks
    // the cent-settlement assumption instead of silently drifting from cost.ts.
    return { error: "This Rep's cost cannot be settled in cents against the pricing kernel." };
  }

  // The three canonical misconceptions:
  //   forgot the flat task fee            -> shot fee alone
  //   forgot the shots                    -> task fee alone
  //   charged the task fee on every shot  -> shots × (perTask + perShot)
  const distractorCents = [
    shotFeeCents,
    taskFeeCents,
    centsOf(spec.tasks * spec.shots * (rates.perTask + rates.perShot)),
  ];
  const distinct = [...new Set([correctCents, ...distractorCents])];
  // If two options settle to the same displayed dollars (e.g. IonQ at exactly
  // 30 shots, where shot fee equals task fee), the Rep is ambiguous — fail
  // loudly at author time rather than grade a coin flip.
  if (distinct.length < 4) {
    return {
      error:
        "This Rep's distractors collide at these rates — pick a different shots count so all four options are distinct.",
    };
  }
  const options = seededOrder(4, spec.id).map((i) => distinct[i] / 100);
  const correctIndex = options.findIndex((v) => centsOf(v) === correctCents);

  return {
    truth: {
      correct: correctCents / 100,
      taskFee: taskFeeCents / 100,
      shotFee: shotFeeCents / 100,
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
