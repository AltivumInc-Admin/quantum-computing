// web/__tests__/lib/pricing.test.ts
//
// Guards the published pricing sheet. The critical invariant: published credit
// rates must always COVER the provider list rates in the curriculum's PRICING
// table (components/quantum/cost.ts) — the platform never sells compute below
// the provider's own published price.
import {
  CREDIT_USD,
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
import { translate } from "@/i18n";

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

  it("Free costs nothing and includes no monthly credits", () => {
    const free = TIERS[0];
    expect(free.priceUsdPerMonth).toBe(0);
    expect(free.monthlyCredits).toBe(0);
  });

  it("every tutor rate is a positive per-question figure", () => {
    for (const r of TUTOR_RATES) {
      expect(r.typicalCreditsPerQuestion).toBeGreaterThan(0);
    }
  });

  /**
   * Tier copy lives in the dictionaries, not in this module. The card used to carry a
   * second, English-only copy of every bullet here that rendered NOWHERE — the page
   * resolved `pricingUi.{tier}F{i}` instead — so the copy-honesty assertions written
   * against it passed no matter what shipped. These rows now check the wiring (keys
   * exist, resolve, and are not the raw key echoed back); the claims themselves are
   * checked against rendered DOM in __tests__/app/pricing-page.test.tsx.
   */
  it("every tier's copy keys resolve to real text in both locales", () => {
    for (const tier of TIERS) {
      expect(tier.featureKeys.length).toBeGreaterThan(0);
      const keys = [tier.taglineKey, tier.footnoteKey, ...tier.featureKeys];
      // A key can only be rendered once, and only from this array — duplicates would
      // silently repeat a bullet on the card.
      expect(new Set(tier.featureKeys).size).toBe(tier.featureKeys.length);
      for (const key of keys) {
        for (const locale of ["en", "es"] as const) {
          const text = translate(locale, key);
          expect(text).not.toBe(key); // translate() echoes the key when it misses
          expect(text.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });
});
