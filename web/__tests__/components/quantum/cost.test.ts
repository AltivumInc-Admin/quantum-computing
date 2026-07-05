import { readFileSync } from "fs";
import path from "path";
import { estimateCost, costLabel, PRICING } from "@/components/quantum/cost";
import { qpuCost } from "@/components/quantum/hybrid";

// The committed parity fixture, generated from lib/utils/cost.py — the single
// source of truth for rates. tests/test_cost_fixture.py guards the Python side;
// the fixture blocks here guard the TS side, locking cost.py <-> cost.json <->
// cost.ts (and hybrid.ts's independent qpuCost re-implementation).
const FIXTURE = JSON.parse(
  readFileSync(
    path.join(__dirname, "../../../src/components/quantum/__fixtures__/cost.json"),
    "utf-8"
  )
) as {
  pricing: Record<string, { per_task?: number; per_shot?: number; per_minute?: number }>;
  expected: { provider: string; shots: number; minutes: number; cost: number }[];
};

describe("estimateCost", () => {
  it("IonQ 1000 shots, 1 task = $10.30", () => {
    expect(estimateCost("IonQ", 1000, 1, 1)).toBeCloseTo(10.3, 4);
  });
  it("IQM 1000 shots = $1.745", () => {
    expect(estimateCost("IQM", 1000, 1, 1)).toBeCloseTo(0.3 + 1.45, 4);
  });
  it("SV1 2 minutes = $0.15", () => {
    expect(estimateCost("SV1", 1000, 2, 1)).toBeCloseTo(0.15, 4);
  });
  it("LocalSimulator is free", () => {
    expect(estimateCost("LocalSimulator", 1000, 5, 3)).toBe(0);
  });
  it("scales by task count for per-shot devices", () => {
    expect(estimateCost("IonQ", 1000, 1, 3)).toBeCloseTo(30.9, 4);
  });
  it("throws on unknown provider", () => {
    expect(() => estimateCost("Nope" as keyof typeof PRICING, 1, 1, 1)).toThrow();
  });
});

describe("cost.py parity fixture", () => {
  it("has the exact same provider set as PRICING", () => {
    expect(Object.keys(FIXTURE.pricing).sort()).toEqual(Object.keys(PRICING).sort());
  });

  it("every TS rate equals the Python rate byte-for-byte", () => {
    for (const [provider, rates] of Object.entries(FIXTURE.pricing)) {
      const ts = PRICING[provider as keyof typeof PRICING] as Record<string, number>;
      if (rates.per_shot !== undefined) {
        expect(ts.perTask).toBe(rates.per_task);
        expect(ts.perShot).toBe(rates.per_shot);
      } else {
        expect(ts.perMinute).toBe(rates.per_minute);
      }
    }
  });

  it("estimateCost reproduces every Python probe point (tasks = 1)", () => {
    for (const row of FIXTURE.expected) {
      expect(
        estimateCost(row.provider as keyof typeof PRICING, row.shots, row.minutes, 1)
      ).toBeCloseTo(row.cost, 10);
    }
  });

  it("hybrid.qpuCost (the independent re-implementation) matches the per-shot probe points", () => {
    for (const row of FIXTURE.expected) {
      const provider = row.provider as keyof typeof PRICING;
      if ("perShot" in PRICING[provider]) {
        expect(qpuCost(provider, 1, row.shots)).toBeCloseTo(row.cost, 10);
      } else {
        expect(qpuCost(provider, 1, row.shots)).toBe(0);
      }
    }
  });
});

describe("costLabel", () => {
  it("formats per-shot providers exactly as the device table did", () => {
    expect(costLabel("IonQ")).toBe("$0.30/task + $0.01/shot");
    expect(costLabel("IQM")).toBe("$0.30/task + $0.00145/shot");
  });
  it("formats per-minute simulators", () => {
    expect(costLabel("SV1")).toBe("$0.075/min");
    expect(costLabel("TN1")).toBe("$0.275/min");
  });
  it("labels the free local simulator", () => {
    expect(costLabel("LocalSimulator")).toBe("Free");
  });
});
