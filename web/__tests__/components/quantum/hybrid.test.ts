import {
  INSTANCES,
  standaloneWallClockSec,
  hybridWallClockSec,
  qpuCost,
  instanceCost,
  jobTotalCost,
  paramTimeNaive,
  paramTimeReused,
  paramSavedSec,
  wastedNoCheckpoint,
  wastedWithCheckpoint,
} from "@/components/quantum/hybrid";
import { PRICING } from "@/components/quantum/cost";

describe("hybrid wall-clock models", () => {
  it("standalone pays a queue wait per iteration; hybrid pays startup once", () => {
    // n=10, queue wait 30s/iter, compute 5s/iter, startup 60s
    expect(standaloneWallClockSec(10, 30, 5)).toBe(350); // 10*(30+5)
    expect(hybridWallClockSec(10, 60, 5)).toBe(110); // 60 + 10*5
  });
  it("hybrid beats standalone whenever the queue wait exceeds the amortized startup", () => {
    const n = 50, queue = 20, iter = 4, startup = 60;
    expect(hybridWallClockSec(n, startup, iter)).toBeLessThan(
      standaloneWallClockSec(n, queue, iter)
    );
  });
});

describe("hybrid cost models", () => {
  it("qpuCost uses the cost.ts per-task + per-shot rates for per-shot providers", () => {
    // IonQ Forte: perTask $0.30 + perShot $0.08 (cost.ts); 10 iters * 1000 shots.
    // The old comment here quoted $0.01/shot — retired Aria's rate, ~8x under.
    const expected = 10 * (PRICING.IonQ.perTask + PRICING.IonQ.perShot * 1000);
    expect(qpuCost("IonQ", 10, 1000)).toBeCloseTo(expected, 10);
    expect(qpuCost("IonQ", 10, 1000)).toBeCloseTo(803, 10); // 10*(0.3+80) — Forte $0.08/shot
  });
  it("qpuCost is 0 for per-minute simulators (no per-task/shot rate)", () => {
    expect(qpuCost("SV1", 10, 1000)).toBe(0);
  });
  it("instanceCost is linear in hours", () => {
    expect(instanceCost("ml.m5.large", 3600)).toBeCloseTo(INSTANCES["ml.m5.large"], 10);
    expect(instanceCost("ml.m5.large", 1800)).toBeCloseTo(INSTANCES["ml.m5.large"] / 2, 10);
  });
  it("jobTotalCost = QPU cost + instance cost", () => {
    const total = jobTotalCost("IonQ", "ml.m5.large", 10, 1000, 7200);
    expect(total).toBeCloseTo(qpuCost("IonQ", 10, 1000) + instanceCost("ml.m5.large", 7200), 10);
  });
});

describe("parametric compilation", () => {
  it("reused compilation saves (n-1) * compile time", () => {
    const n = 50, compile = 8, run = 2;
    expect(paramTimeNaive(n, compile, run)).toBe(50 * 10); // 500
    expect(paramTimeReused(n, compile, run)).toBe(8 + 50 * 2); // 108
    expect(paramTimeNaive(n, compile, run) - paramTimeReused(n, compile, run)).toBe(
      paramSavedSec(n, compile)
    );
    expect(paramSavedSec(n, compile)).toBe(49 * 8);
  });
  it("paramSavedSec never goes negative for n=0 or n=1", () => {
    expect(paramSavedSec(1, 8)).toBe(0);
    expect(paramSavedSec(0, 8)).toBe(0);
  });
});

describe("checkpointing", () => {
  it("no checkpoint redoes all completed iterations; checkpoint redoes only since last", () => {
    expect(wastedNoCheckpoint(37)).toBe(37);
    expect(wastedWithCheckpoint(37, 10)).toBe(7); // last checkpoint at 30
    expect(wastedWithCheckpoint(40, 10)).toBe(0); // failure right on a checkpoint
  });
  it("checkpointing never wastes more than no checkpointing", () => {
    for (let k = 0; k <= 50; k++) {
      expect(wastedWithCheckpoint(k, 8)).toBeLessThanOrEqual(wastedNoCheckpoint(k));
    }
  });
  it("every<=0 degrades gracefully to no-checkpoint", () => {
    expect(wastedWithCheckpoint(20, 0)).toBe(20);
  });
});
