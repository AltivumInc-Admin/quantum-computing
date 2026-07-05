/**
 * Cost + wall-clock models for the 06-hybrid-jobs widgets (qjob, qparam,
 * qcheckpoint). These are deliberately simple, illustrative models of Amazon
 * Braket Hybrid Jobs behavior — not a billing oracle. The QPU per-task / per-shot
 * RATES come from cost.ts (the single source of truth, mirroring lib/utils/cost.py);
 * the ML-instance hourly rates below are representative SageMaker on-demand prices
 * (us-east-1, subject to change). Queue-wait and per-circuit compile times are
 * user-supplied illustrative inputs in the widgets.
 *
 * Everything here is pure arithmetic so it is trivially unit-testable and runs
 * client-side with no AWS calls (static-export safe).
 */

import { PRICING, type Provider } from "./cost";

/**
 * Representative on-demand price (USD/hour) for the SageMaker ML instances a
 * Braket Hybrid Job can run its classical code on. Illustrative — check current
 * AWS pricing for exact figures. Matches the GUIDE's ~$0.10–$3.85/hour range (ml.p3.2xlarge is the ceiling).
 */
export const INSTANCES = {
  "ml.m5.large": 0.115,
  "ml.m5.xlarge": 0.23,
  "ml.g4dn.xlarge": 0.7364,
  "ml.p3.2xlarge": 3.825,
} as const;

export type InstanceType = keyof typeof INSTANCES;

// --- wall-clock models ----------------------------------------------------

/**
 * Standalone tasks: every iteration is a separate quantum task that waits in the
 * device's general queue before it runs. Wall-clock ~ n * (queue wait + compute).
 */
export function standaloneWallClockSec(n: number, queueWaitSec: number, iterSec: number): number {
  return n * (queueWaitSec + iterSec);
}

/**
 * Hybrid Job: tasks get priority access and run back-to-back, so only a one-time
 * container startup is paid up front. Wall-clock ~ startup + n * compute.
 */
export function hybridWallClockSec(n: number, startupSec: number, iterSec: number): number {
  return startupSec + n * iterSec;
}

// --- cost models ----------------------------------------------------------

/**
 * QPU cost for `n` task iterations of `shots` each, at the given provider's rates.
 * Per-shot providers: n * (perTask + perShot * shots). Per-minute simulators do
 * not apply here (Hybrid Jobs charge QPU tasks at the same standalone rates).
 */
export function qpuCost(provider: Provider, n: number, shots: number): number {
  const p = PRICING[provider];
  if (!("perShot" in p)) return 0;
  return n * (p.perTask + p.perShot * shots);
}

/** Classical instance charge for a wall-clock duration (instance rate is per hour). */
export function instanceCost(instance: InstanceType, wallClockSec: number): number {
  return INSTANCES[instance] * (wallClockSec / 3600);
}

/**
 * Total Hybrid Job cost = QPU task cost + classical instance cost over the job's
 * wall-clock. (Standalone runs pay only the QPU cost — no managed instance.)
 */
export function jobTotalCost(
  provider: Provider,
  instance: InstanceType,
  n: number,
  shots: number,
  wallClockSec: number
): number {
  return qpuCost(provider, n, shots) + instanceCost(instance, wallClockSec);
}

// --- parametric compilation ----------------------------------------------

/** Recompile every iteration: n * (compile + run). */
export function paramTimeNaive(n: number, compileSec: number, runSec: number): number {
  return n * (compileSec + runSec);
}

/** Parametric compilation: compile once, reuse — compile + n * run. */
export function paramTimeReused(n: number, compileSec: number, runSec: number): number {
  return compileSec + n * runSec;
}

/** Wall-clock saved by parametric compilation = (n - 1) * compile. */
export function paramSavedSec(n: number, compileSec: number): number {
  return Math.max(0, (n - 1) * compileSec);
}

// --- checkpointing --------------------------------------------------------

/**
 * Iterations that must be redone after a failure at iteration `failAt`.
 * Without checkpointing, a restart redoes all completed work (0..failAt).
 */
export function wastedNoCheckpoint(failAt: number): number {
  return Math.max(0, failAt);
}

/**
 * With a checkpoint saved every `every` iterations, a restart resumes from the
 * last checkpoint, so only the work since then is redone.
 */
export function wastedWithCheckpoint(failAt: number, every: number): number {
  if (every <= 0) return Math.max(0, failAt);
  const lastCheckpoint = Math.floor(failAt / every) * every;
  return Math.max(0, failAt - lastCheckpoint);
}
