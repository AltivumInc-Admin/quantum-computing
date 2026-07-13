import { readFileSync } from "fs";
import path from "path";
import {
  IQM_TASK_MICROS,
  IQM_SHOT_MICROS,
  MAX_SHOTS,
  LADDER_RUNS,
  DEEP_SAMPLE_SHOTS,
  LADDER_MICROS,
  costMicros,
  maxShotsAffordable,
  maxRunsAffordable,
  tierReachable,
  deepSampleReachable,
  shotsStillReachable,
  remainingLadderPlan,
} from "@/lib/qpu-budget";

/**
 * The reachability kernel — the arithmetic that decides whether a medal is still
 * winnable on a finite, one-time allowance.
 *
 * Expectations derive from the committed fixture (the money path's own contract) while
 * the code derives from HARDWARE_TIERS + PRICING, so a tier or price change reddens
 * here rather than shipping a surface that quietly advertises the impossible.
 */
const LADDER = JSON.parse(
  readFileSync(path.join(__dirname, "../../../lambda/qpu/__fixtures__/hardware-ladder.json"), "utf8"),
) as {
  lifetimeCapMicros: number;
  perTaskMicros: number;
  perShotMicros: number;
  maxShots: number;
  tiers: { n: number; title: string; metric: "runs" | "shots" }[];
  cheapestPath: { runs: number; shots: number; costMicros: number };
};

const CAP = LADDER.lifetimeCapMicros;
const DEEP = Math.max(...LADDER.tiers.filter((t) => t.metric === "shots").map((t) => t.n));
const RUNS = Math.max(...LADDER.tiers.filter((t) => t.metric === "runs").map((t) => t.n));
const fresh = (remainingMicros = CAP) => ({
  completedRuns: 0,
  completedShots: 0,
  remainingMicros,
});

describe("the money constants mirror the server's, penny for penny", () => {
  it("matches the ledger's real charge and ceiling", () => {
    expect(IQM_TASK_MICROS).toBe(LADDER.perTaskMicros);
    expect(IQM_SHOT_MICROS).toBe(LADDER.perShotMicros);
    expect(MAX_SHOTS).toBe(LADDER.maxShots);
    expect(costMicros(MAX_SHOTS)).toBe(LADDER.perTaskMicros + LADDER.perShotMicros * LADDER.maxShots);
  });

  it("derives the ladder rather than hand-copying it", () => {
    expect(LADDER_RUNS).toBe(RUNS);
    expect(DEEP_SAMPLE_SHOTS).toBe(DEEP);
    // The advertised plan IS the fixture's cheapest path — asserted, not assumed.
    expect(LADDER_MICROS).toBe(LADDER.cheapestPath.costMicros);
    expect(LADDER_MICROS).toBeLessThanOrEqual(CAP);
  });
});

describe("maxRunsAffordable", () => {
  it("counts runs at the cheapest possible run (task fee + one shot)", () => {
    expect(maxRunsAffordable(costMicros(1))).toBe(1);
    expect(maxRunsAffordable(costMicros(1) - 1)).toBe(0);
    expect(maxRunsAffordable(IQM_TASK_MICROS)).toBe(0); // the fee alone buys no run
  });
});

describe("tierReachable — the four-state wall's arithmetic", () => {
  it("the foreclosure: three default 100-shot runs kill the top medal FOREVER", () => {
    const after3 = {
      completedRuns: 3,
      completedShots: 300,
      remainingMicros: CAP - 3 * costMicros(100),
    };
    // 896 total reachable shots against a 1,000-shot medal. This is the whole bug.
    expect(shotsStillReachable(after3)).toBe(896);
    expect(shotsStillReachable(after3)).toBeLessThan(DEEP);
    expect(deepSampleReachable(after3)).toBe(false);
    expect(tierReachable({ metric: "shots", n: DEEP }, after3)).toBe(false);
    // The run tiers are already EARNED at 3 runs, so the wall shows three states.
    expect(tierReachable({ metric: "runs", n: RUNS }, after3)).toBe(true);
  });

  it("two default runs still leave the top medal reachable — the cliff is at the third", () => {
    const after2 = {
      completedRuns: 2,
      completedShots: 200,
      remainingMicros: CAP - 2 * costMicros(100),
    };
    expect(deepSampleReachable(after2)).toBe(true);
    expect(shotsStillReachable(after2)).toBeGreaterThanOrEqual(DEEP);
  });

  it("a fresh allowance can reach every tier (the feasibility guarantee, client-side)", () => {
    for (const t of LADDER.tiers) expect(tierReachable(t, fresh())).toBe(true);
  });

  it("a spent allowance can reach nothing it has not already earned", () => {
    const spent = { completedRuns: 0, completedShots: 0, remainingMicros: 0 };
    for (const t of LADDER.tiers) expect(tierReachable(t, spent)).toBe(false);
  });

  it("an earned-past threshold stays reachable even on a dead budget (never un-earns)", () => {
    const done = { completedRuns: RUNS, completedShots: DEEP, remainingMicros: 0 };
    for (const t of LADDER.tiers) expect(tierReachable(t, done)).toBe(true);
  });
});

describe("remainingLadderPlan — the plan quoted from where the learner stands", () => {
  it("from zero, it is exactly the plan the fixture advertises", () => {
    const plan = remainingLadderPlan(fresh());
    expect(plan).toMatchObject({
      runs: LADDER.cheapestPath.runs,
      shots: LADDER.cheapestPath.shots,
      micros: LADDER.cheapestPath.costMicros,
      complete: false,
      fits: true,
    });
  });

  it("shots must land inside runs: a shots-only remainder still needs a run to carry them", () => {
    // Run tiers already banked; 700 shots to go — that still costs a task fee.
    const plan = remainingLadderPlan({
      completedRuns: RUNS,
      completedShots: 300,
      remainingMicros: CAP,
    });
    expect(plan.runs).toBe(Math.ceil((DEEP - 300) / MAX_SHOTS));
    expect(plan.shots).toBe(DEEP - 300);
    expect(plan.micros).toBe(IQM_TASK_MICROS * plan.runs + IQM_SHOT_MICROS * plan.shots);
  });

  it("says it NO LONGER FITS once the money is gone — the claim the guide used to assert blindly", () => {
    const after3 = {
      completedRuns: 3,
      completedShots: 300,
      remainingMicros: CAP - 3 * costMicros(100),
    };
    const plan = remainingLadderPlan(after3);
    expect(plan.fits).toBe(false);
    expect(plan.micros).toBeGreaterThan(after3.remainingMicros);
  });

  it("is complete once every tier is held", () => {
    const plan = remainingLadderPlan({
      completedRuns: RUNS,
      completedShots: DEEP,
      remainingMicros: 0,
    });
    expect(plan).toMatchObject({ runs: 0, shots: 0, micros: 0, complete: true });
  });

  it("never quotes a plan that is cheaper than the frontier allows (no over-promise)", () => {
    // Property: whenever the plan claims to fit, the shots it demands really are
    // buyable on the remaining budget.
    for (let rem = 0; rem <= CAP; rem += 6_113) {
      const reach = { completedRuns: 0, completedShots: 0, remainingMicros: rem };
      const plan = remainingLadderPlan(reach);
      if (!plan.fits) continue;
      expect(maxShotsAffordable(rem)).toBeGreaterThanOrEqual(plan.shots);
    }
  });
});
