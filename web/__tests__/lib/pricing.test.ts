// web/__tests__/lib/pricing.test.ts
//
// Guards the published pricing sheet. The critical invariant: published credit
// rates must always COVER the provider list rates in the curriculum's PRICING
// table (components/quantum/cost.ts) — the platform never sells compute below
// the provider's own published price.
import {
  CREDIT_USD,
  STARTER_GRANT_CREDITS,
  TASK_FEE_CREDITS,
  HARDWARE_RATES,
  SIMULATOR_RATES,
  TUTOR_RATES,
  TIERS,
  jobCredits,
  creditsToUsd,
  formatCredits,
  formatUsd,
} from "@/lib/pricing";
import { PRICING } from "@/components/quantum/cost";

describe("pricing peg and helpers", () => {
  it("pegs one credit to one cent", () => {
    expect(CREDIT_USD).toBe(0.01);
    expect(creditsToUsd(500)).toBeCloseTo(5, 10);
  });

  it("formats credits with locale grouping and at most one decimal", () => {
    expect(formatCredits(197.0000000003)).toBe("197 credits");
    expect(formatCredits(50.3)).toBe("50.3 credits");
    expect(formatCredits(1664)).toBe("1,664 credits");
  });

  it("formats USD with two decimals", () => {
    expect(formatUsd(1.97)).toBe("$1.97");
    expect(formatUsd(18)).toBe("$18.00");
  });

  it("computes a job as shots x rate + task fee", () => {
    const garnet = HARDWARE_RATES.find((r) => r.name === "IQM Garnet")!;
    expect(jobCredits(garnet, 1000)).toBeCloseTo(0.163 * 1000 + TASK_FEE_CREDITS, 6);
  });
});

describe("published rates cover provider list rates", () => {
  // Devices with a direct row in the curriculum's PRICING table.
  const coherence: Array<{ name: string; provider: keyof typeof PRICING }> = [
    { name: "IonQ Forte-1", provider: "IonQ" },
    { name: "IonQ Forte Enterprise", provider: "IonQ" },
    { name: "IQM Garnet", provider: "IQM" },
    { name: "QuEra Aquila", provider: "QuEra" },
    { name: "Rigetti Cepheus-1-108Q", provider: "Rigetti" },
  ];

  it.each(coherence)("$name per-shot rate covers the provider list rate", ({ name, provider }) => {
    const published = HARDWARE_RATES.find((r) => r.name === name)!;
    const list = PRICING[provider];
    if (!("perShot" in list)) throw new Error("expected a per-shot provider");
    expect(published.creditsPerShot * CREDIT_USD).toBeGreaterThanOrEqual(list.perShot);
  });

  it("the task fee covers the provider per-task fee", () => {
    expect(TASK_FEE_CREDITS * CREDIT_USD).toBeGreaterThanOrEqual(PRICING.IonQ.perTask);
  });

  it("simulator rates cover the provider per-minute rate", () => {
    for (const sim of SIMULATOR_RATES) {
      const list = PRICING[sim.name as "SV1" | "DM1"];
      expect(sim.creditsPerMinute * CREDIT_USD).toBeGreaterThanOrEqual(list.perMinute);
    }
  });

  it("every hardware rate is positive and per-task", () => {
    for (const r of HARDWARE_RATES) {
      expect(r.creditsPerShot).toBeGreaterThan(0);
      expect(r.perTask).toBe(true);
    }
  });
});

describe("tiers", () => {
  it("defines exactly Free, Plus, Pro in order", () => {
    expect(TIERS.map((t) => t.id)).toEqual(["free", "plus", "pro"]);
  });

  it("monthly credits are worth at least the price paid (never worse than PAYG)", () => {
    for (const tier of TIERS.filter((t) => t.priceUsdPerMonth > 0)) {
      expect(tier.monthlyCredits * CREDIT_USD).toBeGreaterThanOrEqual(tier.priceUsdPerMonth);
    }
  });

  it("Free costs nothing and carries the welcome grant in its feature copy", () => {
    const free = TIERS[0];
    expect(free.priceUsdPerMonth).toBe(0);
    expect(free.monthlyCredits).toBe(0);
    expect(free.features.join(" ")).toContain(`${STARTER_GRANT_CREDITS}-credit`);
  });

  it("every tutor model maps to a real tier", () => {
    const ids = new Set(TIERS.map((t) => t.id));
    for (const r of TUTOR_RATES) {
      expect(ids.has(r.tier)).toBe(true);
      expect(r.typicalCreditsPerQuestion).toBeGreaterThan(0);
    }
  });
});
