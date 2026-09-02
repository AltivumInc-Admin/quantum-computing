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
  TOPUP_MIN_USD,
  TOPUP_MAX_USD,
  jobCredits,
  creditsToUsd,
  formatCreditNumber,
  roundCredits,
  formatUsd,
  formatUsdWhole,
} from "@/lib/pricing";
import { PRICING } from "@/components/quantum/cost";
import { translate } from "@/i18n";

describe("pricing peg and helpers", () => {
  it("pegs one credit to one cent", () => {
    expect(CREDIT_USD).toBe(0.01);
    expect(creditsToUsd(500)).toBeCloseTo(5, 10);
  });

  it("formats credits with locale grouping and at most one decimal", () => {
    expect(formatCreditNumber(197.0000000003)).toBe("197");
    expect(formatCreditNumber(50.3)).toBe("50.3");
    expect(formatCreditNumber(1664)).toBe("1,664");
  });

  it("carries no unit, and groups for the locale it is given", () => {
    // The word "credits" was baked into this helper in English, which is how the
    // Spanish page rendered "Comprar 2,000 credits". The unit is copy now
    // (pricingUi.creditsCount); this returns a bare figure, and it must stay bare.
    expect(formatCreditNumber(1664)).not.toMatch(/[A-Za-z]/);
    expect(formatCreditNumber(1664, "es-MX")).not.toMatch(/[A-Za-z]/);
    // es-MX groups thousands the same way, which is exactly why the untranslated
    // unit was the visible half of the defect and the grouping was not.
    expect(formatCreditNumber(1664, "es-MX")).toBe("1,664");
  });

  it("rounds to the figure that is displayed, so the plural form matches it", () => {
    expect(roundCredits(197.0000000003)).toBe(197);
    expect(roundCredits(1.02)).toBe(1);
    expect(roundCredits(50.34)).toBe(50.3);
  });

  it("formats USD with two decimals", () => {
    expect(formatUsd(1.97)).toBe("$1.97");
    expect(formatUsd(18)).toBe("$18.00");
  });

  it("drops dead cents from whole-dollar figures, zero included", () => {
    // The page carried this as an inline `.replace(".00", "")` twice, one of which
    // also special-cased 0 — "$0.00" reduces to "$0" under the same rule, so the
    // branch was dead weight that only invited the two copies to diverge.
    expect(formatUsdWhole(19)).toBe("$19");
    expect(formatUsdWhole(0)).toBe("$0");
    expect(formatUsdWhole(TOPUP_MIN_USD)).toBe("$5");
    // Non-whole amounts keep their cents rather than being silently truncated.
    expect(formatUsdWhole(1.97)).toBe("$1.97");
  });

  it("publishes top-up bounds as one ordered whole-dollar pair", () => {
    expect(Number.isInteger(TOPUP_MIN_USD)).toBe(true);
    expect(Number.isInteger(TOPUP_MAX_USD)).toBe(true);
    expect(TOPUP_MAX_USD).toBeGreaterThan(TOPUP_MIN_USD);
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

  /**
   * ANTI-DOMINATION GUARD. Credits are sold openly at CREDIT_USD, so a subscriber can
   * always compare their monthly grant against simply topping up the same dollar amount.
   * If the grant is worth less than the price, the tier is strictly dominated by
   * pay-as-you-go and there is no rational reason to subscribe — including for someone
   * already subscribed, looking at their own renewal. Parity is the floor.
   *
   * This was briefly inverted on 2026-08-03 to "worth LESS than the price paid", on the
   * theory that a grant below the price is what makes a tier profitable. That was wrong:
   * solvency comes from the markup between what a credit sells for and what it costs to
   * serve, not from shrinking the grant. Under a markup, a grant at parity is comfortably
   * profitable. Do not invert this again.
   *
   * There is deliberately NO upper bound asserted here. The real ceiling is a function of
   * the markup, and this repository is public — encoding it would disclose the spread.
   * Before raising a grant, check it against the private economics, not against this file.
   */
  it("monthly credits are worth at least the price paid (never worse than pay-as-you-go)", () => {
    for (const tier of TIERS.filter((t) => t.priceUsdPerMonth > 0)) {
      expect(tier.monthlyCredits * CREDIT_USD).toBeGreaterThanOrEqual(tier.priceUsdPerMonth);
    }
  });

  it("a larger tier is never a worse credit rate than a smaller one", () => {
    // Monotonic value: if Pro costs more than Plus, its credits-per-dollar must not be
    // worse, or the upgrade is a downgrade at the only thing the tiers are measured on.
    const paid = TIERS.filter((t) => t.priceUsdPerMonth > 0).sort(
      (a, b) => a.priceUsdPerMonth - b.priceUsdPerMonth,
    );
    for (let i = 1; i < paid.length; i++) {
      const prev = paid[i - 1].monthlyCredits / paid[i - 1].priceUsdPerMonth;
      const curr = paid[i].monthlyCredits / paid[i].priceUsdPerMonth;
      expect(curr).toBeGreaterThanOrEqual(prev);
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
  /**
   * The same wiring check for the RATE rows, which carried the identical defect
   * one file over: HardwareRate.technology, SimulatorRate.description and
   * TutorRate.note were English literals, reverse-mapped back to keys three
   * different ways (a Record on the page, a ternary chain in the estimator, and
   * — for the tutor note — not at all), each with a silent raw-English fallback.
   * A key that misses now reddens here instead of shipping English inside the
   * Spanish page.
   */
  it("every rate row's copy key resolves to real text in both locales", () => {
    const keys = [
      ...HARDWARE_RATES.map((r) => r.technologyKey),
      ...SIMULATOR_RATES.map((s) => s.descriptionKey),
      ...TUTOR_RATES.map((r) => r.noteKey),
    ];
    expect(keys.length).toBe(
      HARDWARE_RATES.length + SIMULATOR_RATES.length + TUTOR_RATES.length,
    );
    for (const key of keys) {
      expect(key).toMatch(/^pricingUi\./);
      for (const locale of ["en", "es"] as const) {
        const text = translate(locale, key);
        expect(text).not.toBe(key); // translate() echoes the key when it misses
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("every tutor rate has its OWN note key, so none is dead copy", () => {
    // The estimator chose the blurb by a ternary on the model name, so a fifth
    // model would have silently rendered the Fable note. One key per row.
    const notes = TUTOR_RATES.map((r) => r.noteKey);
    expect(new Set(notes).size).toBe(notes.length);
  });

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
