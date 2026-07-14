import { PRICING } from "@/components/quantum/cost";
import { HARDWARE_TIERS } from "@/lib/credentials";

/**
 * The sponsored-budget money kernel: one place where price, ceiling, ladder and
 * REACHABILITY are computed, shared by the surface that spends the money
 * (qpu-submit-panel) and the surface that awards the medals (credentials-wall).
 *
 * It exists because the two surfaces were hand-copying each other's constants. A
 * hand-copied ladder is an INVERTED TRIPWIRE: change a tier and the panel keeps
 * rendering a stale plan — on the very surface whose job is to teach the learner how
 * to afford that plan — while every test stays green. So nothing here is typed twice:
 *
 *   rates    <- PRICING (cost.ts, parity-locked to lib/utils/cost.py)
 *   ladder   <- HARDWARE_TIERS (lib/credentials.ts, locked to the committed fixture
 *               lambda/qpu/__fixtures__/hardware-ladder.json from BOTH sides)
 *
 * The tests assert against the FIXTURE while the code derives from HARDWARE_TIERS, so
 * a tier edit on either side reddens instead of shipping a wrong number.
 */

// The server's exact charge, in integer micro-dollars (mirrors qpu-core.mjs costMicros).
export const IQM_TASK_MICROS = Math.round(PRICING.IQM.perTask * 1_000_000);
export const IQM_SHOT_MICROS = Math.round(PRICING.IQM.perShot * 1_000_000);
export const costMicros = (shots: number) => IQM_TASK_MICROS + IQM_SHOT_MICROS * shots;
export const usd = (micros: number) => `$${(Math.round(micros / 10_000) / 100).toFixed(2)}`;

/** The server's hard per-run shot ceiling (qpu-core.mjs MAX_SHOTS). The fixture locks
 *  it equal to the "Deep sample" threshold; the panel suite asserts that from the
 *  fixture side, so this constant cannot drift away from the server's in silence. */
export const MAX_SHOTS = 1000;

// ---- the ladder, DERIVED (never hand-typed) ---------------------------------
const runTiers = HARDWARE_TIERS.filter((t) => t.metric === "runs");
const shotTiers = HARDWARE_TIERS.filter((t) => t.metric === "shots");
/** Runs demanded by the most demanding run tier ("Run series"). */
export const LADDER_RUNS = Math.max(...runTiers.map((t) => t.n));
/** Shots demanded by the most demanding shot tier ("Deep sample"). */
export const DEEP_SAMPLE_SHOTS = Math.max(...shotTiers.map((t) => t.n));
/** Its name — derived too, so the copy that warns you are about to lose this medal
 *  cannot end up naming a medal that no longer exists. */
export const DEEP_SAMPLE_TITLE = shotTiers.find((t) => t.n === DEEP_SAMPLE_SHOTS)!.title;
/** What holding the WHOLE ladder costs from zero: cost(R,S) = TASK*R + SHOT*S — it
 *  depends only on the run count and the shot total, never on how the shots are split
 *  across the runs, which is why one plan can satisfy every tier at once. */
export const LADDER_MICROS = IQM_TASK_MICROS * LADDER_RUNS + IQM_SHOT_MICROS * DEEP_SAMPLE_SHOTS;

/**
 * The most shots a remaining budget can still buy, over ANY number of runs.
 *
 * cost(r, s) = TASK*r + SHOT*s with s <= MAX_SHOTS*r — so concentrating shots into
 * fewer runs is optimal until MAX_SHOTS binds, and past that another run's task fee
 * buys headroom. Take the best over every affordable run count.
 *
 * This is EXACTLY the frontier that decides whether "Deep sample" is still reachable,
 * so it must never be approximated.
 */
export function maxShotsAffordable(remainingMicros: number): number {
  let best = 0;
  const maxRuns = Math.floor(remainingMicros / (IQM_TASK_MICROS + IQM_SHOT_MICROS));
  for (let r = 1; r <= maxRuns; r++) {
    const forShots = remainingMicros - IQM_TASK_MICROS * r;
    if (forShots < 0) break;
    best = Math.max(best, Math.min(MAX_SHOTS * r, Math.floor(forShots / IQM_SHOT_MICROS)));
  }
  return best;
}

/** The most ADDITIONAL runs a remaining budget can still buy (a run costs at least
 *  the task fee plus one shot). The run-tier counterpart of the shot frontier. */
export function maxRunsAffordable(remainingMicros: number): number {
  return Math.floor(remainingMicros / costMicros(1));
}

/** The learner's hardware record + what their remaining allowance can still buy. */
export interface HardwareReach {
  completedRuns: number;
  completedShots: number;
  remainingMicros: number;
}

/**
 * Is a hardware tier still attainable on this learner's remaining allowance?
 *
 * THE BUG THIS EXISTS TO KILL: three runs at the panel's 100-shot default cost $1.335
 * of a $2.50 allowance, leaving $1.165 — which buys at most 596 more shots, so the
 * learner tops out at 896 of the 1,000 shots "Deep sample" needs. The medal is then
 * foreclosed FOREVER, and the wall went on rendering it as merely "Locked" — a word
 * that promises attainability. A medal the platform's own budget has made impossible
 * must say so. (Per tier: each answers only "could I still earn THIS one", which is
 * exactly what "Locked" claims.)
 */
export function tierReachable(
  tier: { n: number; metric: "runs" | "shots" },
  reach: HardwareReach,
): boolean {
  return tier.metric === "shots"
    ? reach.completedShots + maxShotsAffordable(reach.remainingMicros) >= tier.n
    : reach.completedRuns + maxRunsAffordable(reach.remainingMicros) >= tier.n;
}

/** Total shots the learner can ever hold: banked + everything still buyable. */
export const shotsStillReachable = (reach: HardwareReach) =>
  reach.completedShots + maxShotsAffordable(reach.remainingMicros);

/** Is the top (shots) medal still reachable at all? */
export const deepSampleReachable = (reach: HardwareReach) =>
  shotsStillReachable(reach) >= DEEP_SAMPLE_SHOTS;

/**
 * The cheapest plan that still takes THIS learner to all three medals from where they
 * already stand — the runs and shots they have yet to buy, and what those cost.
 *
 * Shots have to land inside runs, so the plan needs at least ceil(shotsNeeded /
 * MAX_SHOTS) runs even when the run tiers are already banked. `fits` is the honest
 * answer to "is the plan I am being shown still buyable?" — the question BudgetGuide
 * was asserting the answer to instead of computing it.
 */
export function remainingLadderPlan(reach: HardwareReach): {
  runs: number;
  shots: number;
  micros: number;
  complete: boolean;
  fits: boolean;
} {
  const shots = Math.max(0, DEEP_SAMPLE_SHOTS - reach.completedShots);
  const runsForShots = Math.ceil(shots / MAX_SHOTS);
  const runs = Math.max(Math.max(0, LADDER_RUNS - reach.completedRuns), runsForShots);
  const micros = IQM_TASK_MICROS * runs + IQM_SHOT_MICROS * shots;
  const complete = runs === 0 && shots === 0;
  return { runs, shots, micros, complete, fits: micros <= reach.remainingMicros };
}
