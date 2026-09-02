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

/**
 * Published pay-as-you-go top-up bounds, in whole USD. ONE declaration, read by
 * everything: the hero chip and the wallet principle on the page, the TopUp
 * widget's input and its client-side validation (lib/billing-client.ts re-exports
 * these rather than restating them), and the FAQ copy, which interpolates them
 * instead of spelling the figures into prose. `lambda/stripe/index.mjs` holds the
 * server copy under its own names; __tests__/infra/tier-catalog-parity.test.ts
 * compares the two offline, because an advertised floor that differs from the
 * enforced one rejects a valid amount before a request is ever sent.
 */
export const TOPUP_MIN_USD = 5;
export const TOPUP_MAX_USD = 500;

/** Provider price-sheet revision the hardware rates below reflect. */
export const PRICES_AS_OF = "July 2026";

export function creditsToUsd(credits: number): number {
  return credits * CREDIT_USD;
}

/**
 * A credit figure with no unit — grouped for the reader's locale, at most one
 * decimal. The unit is COPY and belongs in the dictionaries: this used to return
 * "N credits" with the word hardcoded in English and the grouping pinned to
 * en-US, and since it was the only path to a credit figure on the page, the
 * Spanish storefront rendered "1,900 credits cada mes" and "Comprar 2,000 credits"
 * on its most number-dense surface. Compose it with `pricingUi.creditsCount`,
 * which carries the translated, plural-aware unit — never re-append one here.
 */
export function formatCreditNumber(credits: number, localeTag = "en-US"): string {
  const rounded = roundCredits(credits);
  return Number.isInteger(rounded)
    ? rounded.toLocaleString(localeTag)
    : rounded.toLocaleString(localeTag, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * Credits as they are DISPLAYED — one decimal. The plural form has to be chosen
 * from the same rounded figure the reader sees, or 1.02 credits renders as "1
 * credits".
 */
export function roundCredits(credits: number): number {
  return Math.round(credits * 10) / 10;
}

export function formatUsd(usd: number): string {
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * "$19" — a whole-dollar figure without its dead cents. Sticker prices and the
 * top-up floor are always whole dollars, and the page stripped the ".00" inline
 * in two places, one of which additionally special-cased 0 even though "$0.00"
 * reduces to "$0" under the very same rule.
 */
export function formatUsdWhole(usd: number): string {
  return formatUsd(usd).replace(".00", "");
}

/* ------------------------------------------------------------------------- */
/* Quantum hardware                                                          */
/* ------------------------------------------------------------------------- */

export interface HardwareRate {
  /** Device name as shown to users. */
  name: string;
  provider: string;
  /**
   * i18n key for the short technology descriptor in the rate table.
   *
   * A KEY, not copy — the same correction the Tier docblock below records. This
   * was an English literal, and both components that render it recovered the key
   * by looking the English string up (a Record in pricing-page-content.tsx, a
   * hand-written ternary chain in cost-estimator.tsx), each falling back to
   * rendering the raw English on a miss. A new row, or a one-character edit to a
   * descriptor, silently shipped English inside the Spanish page in whichever
   * component had not been updated.
   */
  technologyKey: string;
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
    technologyKey: "pricingUi.techSuperconducting108",
    creditsPerShot: 0.048,
    perTask: true,
  },
  {
    name: "Rigetti Ankaa-3",
    provider: "Rigetti",
    technologyKey: "pricingUi.techSuperconducting",
    creditsPerShot: 0.101,
    perTask: true,
  },
  {
    name: "IQM Garnet",
    provider: "IQM",
    technologyKey: "pricingUi.techSuperconducting",
    creditsPerShot: 0.163,
    perTask: true,
  },
  {
    name: "IQM Emerald",
    provider: "IQM",
    technologyKey: "pricingUi.techSuperconducting",
    creditsPerShot: 0.18,
    perTask: true,
  },
  {
    name: "QuEra Aquila",
    provider: "QuEra",
    technologyKey: "pricingUi.techNeutralAtom",
    creditsPerShot: 1.12,
    perTask: true,
  },
  {
    name: "AQT IBEX-Q1",
    provider: "AQT",
    technologyKey: "pricingUi.techTrappedIon",
    creditsPerShot: 2.64,
    perTask: true,
  },
  {
    name: "IonQ Forte-1",
    provider: "IonQ",
    technologyKey: "pricingUi.techTrappedIon",
    creditsPerShot: 9.0,
    perTask: true,
  },
  {
    name: "IonQ Forte Enterprise",
    provider: "IonQ",
    technologyKey: "pricingUi.techTrappedIon",
    creditsPerShot: 9.0,
    perTask: true,
  },
];

export interface SimulatorRate {
  name: string;
  /** i18n key for the one-line description in the rate table. Key, not copy. */
  descriptionKey: string;
  creditsPerMinute: number;
}

/** Managed cloud simulators, billed per minute of simulation time. */
export const SIMULATOR_RATES: SimulatorRate[] = [
  {
    name: "SV1",
    descriptionKey: "pricingUi.simSv1",
    creditsPerMinute: 8.4,
  },
  {
    name: "DM1",
    descriptionKey: "pricingUi.simDm1",
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
  /**
   * i18n key for the one-line character note under the estimator's readout. This
   * was an English literal duplicated verbatim into en.ts as tutorNote*, and
   * nothing read it: the estimator picked the blurb with a ternary on `model`, so
   * all four strings here were dead copy — the exact defect the Tier docblock
   * below records for the old `features` array.
   */
  noteKey: string;
}

/**
 * PLANNED per-question tutor rates. These are published prices, not charges:
 * nothing on this platform debits the wallet yet.
 *
 * The MECHANISM exists — `lambda/tutor/index.mjs` reads `body.model`, resolves it
 * against `ROSTER` in `lambda/tutor/tutor-billing.mjs`, reads the caller's tier and
 * reserves against the wallet, and `<AskTutor />` posts `{slug, question, model,
 * meta}`. What is missing is CONFIGURATION: the deployed function carries an empty
 * `WalletTableName` and an empty `RATE_CARD`, so `metering` is undefined, every
 * paid-model request is refused rather than served, and each question is answered
 * free on the free-tier default. That configuration gate — not absent code — is what
 * keeps this page's future-tense copy honest, and flipping it is a deploy, not a
 * feature. (This docblock asserted the opposite as fact until 2026-09, which would
 * lead a maintainer to badly wrong conclusions about what a deploy would enable.)
 *
 * Deliberately NO "which tier unlocks this model" field: a `plus`/`pro` chip beside
 * Sonnet or Opus advertises an unlock this page cannot demonstrate while metering is
 * off, which is the same dishonesty as the credentials wall promising a medal the
 * budget cannot buy. `ROSTER` is the server-authoritative tier-to-model mapping and
 * stays the only one; the column comes back when metering is switched on.
 *
 * Tutor pricing will be metered by tokens under the hood; these are the typical
 * per-question figures for a normal lesson exchange, used for display and the
 * estimator. Long questions or long answers will cost proportionally more.
 */
export const TUTOR_RATES: TutorRate[] = [
  {
    model: "Claude Haiku",
    typicalCreditsPerQuestion: 1,
    noteKey: "pricingUi.tutorNoteHaiku",
  },
  {
    model: "Claude Sonnet",
    typicalCreditsPerQuestion: 2,
    noteKey: "pricingUi.tutorNoteSonnet",
  },
  {
    model: "Claude Opus",
    typicalCreditsPerQuestion: 4,
    noteKey: "pricingUi.tutorNoteOpus",
  },
  {
    model: "Claude Fable",
    typicalCreditsPerQuestion: 7,
    noteKey: "pricingUi.tutorNoteFable",
  },
];

/* ------------------------------------------------------------------------- */
/* Tiers                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Stripe price lookup keys for the two subscription tiers. Declared here, beside
 * the tiers themselves, and imported by lib/billing-client.ts — the union was
 * retyped by hand in both files, and two hand-kept copies of a key set can drift
 * against each other and against the backend CATALOG with no compiler complaint.
 */
export type TierLookupKey = "ql_plus_monthly" | "ql_pro_monthly";

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
  checkoutLookupKey?: TierLookupKey;
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
    priceUsdPerMonth: 19,
    monthlyCredits: 1900,
    checkoutLookupKey: "ql_plus_monthly",
    // Three bullets, all true today (the credit grant lands via lambda/stripe's
    // invoice.paid handler, and WALLET# rows carry no expiresAt so credits do roll
    // over). The two dropped bullets — "Claude Sonnet and Opus unlocked in the tutor"
    // and "Run on any quantum backend from your balance" — describe capabilities the
    // deployed configuration refuses: the tutor's roster gate exists but every paid
    // model is refused while WalletTableName and RATE_CARD are empty, and lambda/qpu
    // hardcodes IQM Garnet with LIFETIME_CAP_MICROS = 0, so there is no allowance at
    // all. They come back with the deploy that turns metering on, not before.
    featureKeys: ["pricingUi.plusF0", "pricingUi.plusF1", "pricingUi.plusF2"],
    footnoteKey: "pricingUi.plusFootnote",
  },
  {
    id: "pro",
    name: "Pro",
    taglineKey: "pricingUi.proTagline",
    priceUsdPerMonth: 59,
    monthlyCredits: 6500,
    checkoutLookupKey: "ql_pro_monthly",
    // Two bullets: a larger grant is genuinely all Pro delivers over Plus today.
    // "Claude Fable unlocked", "Priority queue on quantum hardware", and "Early access
    // to new backends" all named machinery that does not exist — grep finds no priority
    // queue, no backend gating, and no per-tier model routing in the repo.
    featureKeys: ["pricingUi.proF0", "pricingUi.proF1"],
    footnoteKey: "pricingUi.proFootnote",
  },
];
