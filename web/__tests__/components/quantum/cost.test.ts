import { readFileSync } from "fs";
import path from "path";
import {
  estimateCost,
  costLabel,
  providerLabel,
  isRetired,
  RETIRED_PROVIDERS,
  PRICING,
  type Provider,
} from "@/components/quantum/cost";
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
  it("IonQ 1000 shots, 1 task = $80.30", () => {
    expect(estimateCost("IonQ", 1000, 1, 1)).toBeCloseTo(80.3, 4);
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
    expect(estimateCost("IonQ", 1000, 1, 3)).toBeCloseTo(240.9, 4);
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
    expect(costLabel("IonQ")).toBe("$0.30/task + $0.08/shot");
    expect(costLabel("IQM")).toBe("$0.30/task + $0.00145/shot");
  });
  it("prices IQM's two devices apart", () => {
    // Emerald is $0.0016/shot, Garnet $0.00145. One shared key would quote every
    // Emerald run at Garnet's rate, ~10% under true cost.
    expect(costLabel("IQM_Emerald")).toBe("$0.30/task + $0.0016/shot");
    expect(costLabel("IQM_Emerald")).not.toBe(costLabel("IQM"));
  });
  it("formats the devices adopted with the 2026-09-04 fleet refresh", () => {
    expect(costLabel("AQT")).toBe("$0.30/task + $0.0235/shot");
    expect(costLabel("Rigetti")).toBe("$0.30/task + $0.000425/shot");
  });
  it("formats per-minute simulators", () => {
    expect(costLabel("SV1")).toBe("$0.075/min");
    // TN1 is retired but still priced: its row in devices.ts renders as Retired,
    // and a retired row with no rate of its own could only be priced at some
    // other device's rate — the exact bug the removed Aria row shipped.
    expect(costLabel("TN1")).toBe("$0.275/min");
  });
  it("labels the free local simulator", () => {
    expect(costLabel("LocalSimulator")).toBe("Free");
  });
});

describe("providerLabel", () => {
  it("names the device behind an ambiguous vendor key", () => {
    expect(providerLabel("IQM")).toBe("IQM Garnet");
    expect(providerLabel("IQM_Emerald")).toBe("IQM Emerald");
  });
  it("never leaks a raw rate key into learner-facing text", () => {
    for (const provider of Object.keys(PRICING) as Provider[]) {
      expect(providerLabel(provider)).not.toContain("_");
    }
  });
  it("covers every pricing key (the Record is exhaustive by type)", () => {
    for (const provider of Object.keys(PRICING) as Provider[]) {
      expect(providerLabel(provider)).toBeTruthy();
    }
  });
});

describe("retired rates", () => {
  it("flags TN1, and only TN1, as retired", () => {
    expect(isRetired("TN1")).toBe(true);
    for (const provider of Object.keys(PRICING) as Provider[]) {
      if (provider !== "TN1") expect(isRetired(provider)).toBe(false);
    }
  });

  it("keeps a retired rate in the table rather than deleting it", () => {
    // Deleting it is what would force the retired row in devices.ts to render at
    // some other device's price — the Aria bug. The rate stays; isRetired is how
    // a surface knows not to present it as a live quote.
    for (const provider of RETIRED_PROVIDERS) {
      expect(Object.keys(PRICING)).toContain(provider);
      expect(costLabel(provider)).toBeTruthy();
    }
  });
});
