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

/** One-time welcome grant credited to every new verified account. */
export const STARTER_GRANT_CREDITS = 500;

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
  /** Which tier unlocks this model. */
  tier: "free" | "plus" | "pro";
  /** Typical credits for one question (a full asked-and-answered exchange). */
  typicalCreditsPerQuestion: number;
  note: string;
}

/**
 * Tutor pricing is metered by tokens under the hood; these are the typical
 * per-question figures for a normal lesson exchange, used for display and the
 * estimator. Long questions or long answers cost proportionally more.
 */
export const TUTOR_RATES: TutorRate[] = [
  {
    model: "Claude Haiku",
    tier: "free",
    typicalCreditsPerQuestion: 1,
    note: "Fast and sharp — the everyday tutor.",
  },
  {
    model: "Claude Sonnet",
    tier: "plus",
    typicalCreditsPerQuestion: 2,
    note: "Deeper reasoning for tougher derivations.",
  },
  {
    model: "Claude Opus",
    tier: "plus",
    typicalCreditsPerQuestion: 4,
    note: "Full-strength reasoning, circuit review.",
  },
  {
    model: "Claude Fable",
    tier: "pro",
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
  tagline: string;
  priceUsdPerMonth: number;
  /** Credits included every month (0 for Free — it gets the one-time grant). */
  monthlyCredits: number;
  /**
   * The Stripe price lookup key checkout uses for this tier (undefined for Free,
   * which has nothing to buy). Must match a key in the backend CATALOG and the
   * Stripe catalog.
   */
  checkoutLookupKey?: "ql_plus_monthly" | "ql_pro_monthly";
  /** Feature bullets, in display order. */
  features: string[];
  footnote: string;
}

export const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    tagline: "The entire learning platform. No card, no clock.",
    priceUsdPerMonth: 0,
    monthlyCredits: 0,
    features: [
      "Full curriculum — every section, every notebook",
      "Unlimited browser simulation — circuits run on your machine",
      "Playground, glossary, spaced-repetition review",
      "Progress and saved circuits synced across devices",
      `${STARTER_GRANT_CREDITS}-credit welcome grant — sample the tutor and real hardware`,
      "Pay-as-you-go top-ups whenever you want more",
    ],
    footnote: "Free forever. Learning never moves behind the wallet.",
  },
  {
    id: "plus",
    name: "Plus",
    tagline: "Monthly credits and stronger tutor models.",
    priceUsdPerMonth: 18,
    monthlyCredits: 1890,
    checkoutLookupKey: "ql_plus_monthly",
    features: [
      "Everything in Free",
      "1,890 credits every month — a 5% bonus over pay-as-you-go",
      "Credits roll over while you are subscribed",
      "Claude Sonnet and Opus unlocked in the tutor",
      "Run on any quantum backend from your balance",
    ],
    footnote: "Cancel anytime. Purchased credits never expire.",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "The full model roster and first in line for metal.",
    priceUsdPerMonth: 59,
    monthlyCredits: 6200,
    checkoutLookupKey: "ql_pro_monthly",
    features: [
      "Everything in Plus",
      "6,200 credits every month",
      "Claude Fable unlocked — the frontier tutor",
      "Priority queue on quantum hardware",
      "Early access to new backends as they land",
    ],
    footnote: "For daily practitioners. Team seats are on the roadmap.",
  },
];
