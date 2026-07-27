/**
 * Published pricing for the Quantum Workspace — the single source of truth for
 * the /pricing page, the cost estimator, and any tier copy elsewhere in the UI.
 *
 * Credits are the wallet currency: 1 credit = $0.01, always. Every figure here
 * is a PUBLISHED customer rate (what the user pays), stated as launch pricing.
 * Hardware rates track the underlying provider list prices, so they can change
 * when providers reprice — `PRICES_AS_OF` records the sheet revision this file
 * reflects.
 */

/** USD value of one credit. The peg never moves; prices move in credit terms. */
export const CREDIT_USD = 0.01;

/** Smallest pay-as-you-go top-up, in USD. */
export const MIN_TOPUP_USD = 5;

/** Provider price-sheet revision the hardware rates below reflect. */
export const PRICES_AS_OF = "July 2026";

export function creditsToUsd(credits: number): number {
  return credits * CREDIT_USD;
}

/** "196 credits ($1.96)" — the standard dual display used across the page. */
export function formatCredits(credits: number): string {
  const rounded = Math.round(credits * 10) / 10;
  const display = Number.isInteger(rounded)
    ? rounded.toLocaleString("en-US")
    : rounded.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${display} credits`;
}

export function formatUsd(usd: number): string {
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* ------------------------------------------------------------------------- */
/* Quantum hardware                                                          */
/* ------------------------------------------------------------------------- */

export interface HardwareRate {
  /** Device name as shown to users. */
  name: string;
  provider: string;
  /** Short technology descriptor for the rate table. */
  technology: string;
  /** Published credits per shot. */
  creditsPerShot: number;
  /** True when the device also carries the flat per-task fee. */
  perTask: boolean;
}

/** Flat per-task fee in credits, applied once per QPU submission. */
export const TASK_FEE_CREDITS = 34;

/**
 * Published QPU rates, cheapest first. These are all-in customer rates in
 * credits; the sheet tracks provider repricing (see PRICES_AS_OF).
 */
export const HARDWARE_RATES: HardwareRate[] = [
  {
    name: "Rigetti Cepheus-1-108Q",
    provider: "Rigetti",
    technology: "Superconducting, 108 qubits",
    creditsPerShot: 0.048,
    perTask: true,
  },
  {
    name: "Rigetti Ankaa-3",
    provider: "Rigetti",
    technology: "Superconducting",
    creditsPerShot: 0.101,
    perTask: true,
  },
  {
    name: "IQM Garnet",
    provider: "IQM",
    technology: "Superconducting",
    creditsPerShot: 0.163,
    perTask: true,
  },
  {
    name: "IQM Emerald",
    provider: "IQM",
    technology: "Superconducting",
    creditsPerShot: 0.18,
    perTask: true,
  },
  {
    name: "QuEra Aquila",
    provider: "QuEra",
    technology: "Neutral-atom analog",
    creditsPerShot: 1.12,
    perTask: true,
  },
  {
    name: "AQT IBEX-Q1",
    provider: "AQT",
    technology: "Trapped-ion",
    creditsPerShot: 2.64,
    perTask: true,
  },
  {
    name: "IonQ Forte-1",
    provider: "IonQ",
    technology: "Trapped-ion",
    creditsPerShot: 9.0,
    perTask: true,
  },
  {
    name: "IonQ Forte Enterprise",
    provider: "IonQ",
    technology: "Trapped-ion",
    creditsPerShot: 9.0,
    perTask: true,
  },
];

export interface SimulatorRate {
  name: string;
  description: string;
  creditsPerMinute: number;
}

/** Managed cloud simulators, billed per minute of simulation time. */
export const SIMULATOR_RATES: SimulatorRate[] = [
  {
    name: "SV1",
    description: "State-vector simulator, up to 34 qubits",
    creditsPerMinute: 8.4,
  },
  {
    name: "DM1",
    description: "Density-matrix (noise) simulator, up to 17 qubits",
    creditsPerMinute: 8.4,
  },
];

/** Total published cost of one QPU job, in credits. */
export function jobCredits(rate: HardwareRate, shots: number): number {
  return rate.creditsPerShot * shots + (rate.perTask ? TASK_FEE_CREDITS : 0);
}

/* ------------------------------------------------------------------------- */
/* AI tutor                                                                  */
/* ------------------------------------------------------------------------- */

export interface TutorRate {
  /** Model name as shown to users. */
  model: string;
  /** Typical credits for one question (a full asked-and-answered exchange). */
  typicalCreditsPerQuestion: number;
  note: string;
}

/**
 * PLANNED per-question tutor rates. These are published prices, not charges:
 * nothing on this platform debits the wallet yet. `lambda/tutor/index.mjs` binds one
 * `process.env.TUTOR_MODEL_ID` (the deployed profile resolves to Claude Haiku 4.5) and
 * `<AskTutor />` posts only `{slug, question}` — there is no model parameter, no tier
 * lookup, and no wallet call anywhere on the tutor path. Every question today is
 * answered free by that single model.
 *
 * Deliberately NO "which tier unlocks this model" field: a `plus`/`pro` chip beside
 * Sonnet or Opus advertised an unlock the codebase cannot perform, which is the same
 * dishonesty as the credentials wall promising a medal the budget cannot buy. The
 * tier mapping comes back when model selection and metering actually ship.
 *
 * Tutor pricing will be metered by tokens under the hood; these are the typical
 * per-question figures for a normal lesson exchange, used for display and the
 * estimator. Long questions or long answers will cost proportionally more.
 */
export const TUTOR_RATES: TutorRate[] = [
  {
    model: "Claude Haiku",
    typicalCreditsPerQuestion: 1,
    note: "Fast and sharp — the everyday tutor.",
  },
  {
    model: "Claude Sonnet",
    typicalCreditsPerQuestion: 2,
    note: "Deeper reasoning for tougher derivations.",
  },
  {
    model: "Claude Opus",
    typicalCreditsPerQuestion: 4,
    note: "Full-strength reasoning, circuit review.",
  },
  {
    model: "Claude Fable",
    typicalCreditsPerQuestion: 7,
    note: "The frontier model, for the hardest questions.",
  },
];

/* ------------------------------------------------------------------------- */
/* Tiers                                                                     */
/* ------------------------------------------------------------------------- */

export interface Tier {
  id: "free" | "plus" | "pro";
  name: string;
  /** i18n key for the one-line positioning shown under the tier name. */
  taglineKey: string;
  priceUsdPerMonth: number;
  /** Credits included every month (0 for Free — pay-as-you-go from the wallet). */
  monthlyCredits: number;
  /**
   * The Stripe price lookup key checkout uses for this tier (undefined for Free,
   * which has nothing to buy). Must match a key in the backend CATALOG and the
   * Stripe catalog.
   */
  checkoutLookupKey?: "ql_plus_monthly" | "ql_pro_monthly";
  /**
   * i18n keys for the feature bullets, in display order. The card renders THESE, so a
   * bullet cannot ship without a translation in both locales and cannot appear on the
   * page without appearing in this array.
   *
   * These were plain English strings until an audit found the card actually rendered
   * `pricingUi.{tier}F{0..4}` from the dictionaries and never read this array — so the
   * strings here were dead copy, and the copy-honesty test that asserted on them passed
   * vacuously while the page shipped claims the platform could not deliver. Keys, not
   * copy: one source of truth, and the guard now asserts on rendered DOM.
   *
   * The count is deliberately per-tier rather than a fixed five. Removing the false
   * claims left Plus with three bullets and Pro with two; padding them back to five
   * would mean inventing benefits, which is the defect this array now prevents.
   */
  featureKeys: string[];
  /** i18n key for the fine print under the tier's call to action. */
  footnoteKey: string;
}

export const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    taglineKey: "pricingUi.freeTagline",
    priceUsdPerMonth: 0,
    monthlyCredits: 0,
    featureKeys: [
      "pricingUi.freeF0",
      "pricingUi.freeF1",
      "pricingUi.freeF2",
      "pricingUi.freeF3",
      "pricingUi.freeF4",
    ],
    footnoteKey: "pricingUi.freeFootnote",
  },
  {
    id: "plus",
    name: "Plus",
    taglineKey: "pricingUi.plusTagline",
    priceUsdPerMonth: 18,
    monthlyCredits: 1890,
    checkoutLookupKey: "ql_plus_monthly",
    // Three bullets, all true today (the credit grant lands via lambda/stripe's
    // invoice.paid handler, and WALLET# rows carry no expiresAt so credits do roll
    // over). The two dropped bullets — "Claude Sonnet and Opus unlocked in the tutor"
    // and "Run on any quantum backend from your balance" — described capabilities with
    // no implementation anywhere: the tutor binds one model id and never reads the
    // wallet, and lambda/qpu hardcodes IQM Garnet as a platform-sponsored allowance.
    featureKeys: ["pricingUi.plusF0", "pricingUi.plusF1", "pricingUi.plusF2"],
    footnoteKey: "pricingUi.plusFootnote",
  },
  {
    id: "pro",
    name: "Pro",
    taglineKey: "pricingUi.proTagline",
    priceUsdPerMonth: 59,
    monthlyCredits: 6200,
    checkoutLookupKey: "ql_pro_monthly",
    // Two bullets: a larger grant is genuinely all Pro delivers over Plus today.
    // "Claude Fable unlocked", "Priority queue on quantum hardware", and "Early access
    // to new backends" all named machinery that does not exist — grep finds no priority
    // queue, no backend gating, and no per-tier model routing in the repo.
    featureKeys: ["pricingUi.proF0", "pricingUi.proF1"],
    footnoteKey: "pricingUi.proFootnote",
  },
];
