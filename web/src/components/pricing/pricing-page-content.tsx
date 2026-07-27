"use client";

import Link from "next/link";
import { isAuthConfigured } from "@/lib/auth-config";
import {
  TIERS,
  type Tier,
  TUTOR_RATES,
  HARDWARE_RATES,
  SIMULATOR_RATES,
  TASK_FEE_CREDITS,
  MIN_TOPUP_USD,
  PRICES_AS_OF,
  jobCredits,
  creditsToUsd,
  formatCredits,
  formatUsd,
} from "@/lib/pricing";
import { isBillingConfigured } from "@/lib/billing-client";
import { CostEstimator } from "@/components/pricing/cost-estimator";
import { CheckoutButton } from "@/components/pricing/checkout-button";
import { WalletBadge } from "@/components/pricing/wallet-badge";
import { TopUp } from "@/components/pricing/top-up";
import { useLocale, type TFunction } from "@/i18n";
import { localeCode } from "@/i18n";

const TECH_KEY: Record<string, string> = {
  "Superconducting, 108 qubits": "pricingUi.techSuperconducting108",
  Superconducting: "pricingUi.techSuperconducting",
  "Neutral-atom analog": "pricingUi.techNeutralAtom",
  "Trapped-ion": "pricingUi.techTrappedIon",
};

const SIM_DESC_KEY: Record<string, string> = {
  "State-vector simulator, up to 34 qubits": "pricingUi.simSv1",
  "Density-matrix (noise) simulator, up to 17 qubits": "pricingUi.simDm1",
};

/**
 * Resolve a tier's copy from the keys the tier itself carries. The keys used to be
 * rebuilt here from the tier id with a hardcoded five-bullet range, which silently
 * required every tier to have exactly five features and let lib/pricing.ts's own
 * feature strings drift out of sight. Reading Tier.featureKeys means the card renders
 * exactly what the data says, at whatever length the data says.
 */
function tierCopy(t: TFunction, tier: Tier) {
  return {
    tagline: t(tier.taglineKey),
    footnote: t(tier.footnoteKey),
    features: tier.featureKeys.map((key) => t(key)),
  };
}

function SignupCta({
  size = "base",
  t,
}: {
  size?: "base" | "sm";
  t: TFunction;
}) {
  const configured = isAuthConfigured();
  const pad = size === "base" ? "px-6 py-3 text-base" : "px-4 py-2 text-sm";
  return configured ? (
    <Link
      href="/login?mode=signup"
      className={`surface-accent inline-flex items-center rounded-control font-semibold interactive focus-ring ${pad}`}
    >
      {t("pricingUi.signUpFree")}
    </Link>
  ) : (
    <span
      className={`inline-flex items-center rounded-control border border-(--bd) font-medium text-caption ${pad}`}
    >
      {t("pricingUi.signUpSoon")}
    </span>
  );
}

export function PricingPageContent() {
  const { t, locale } = useLocale();
  const loc = localeCode(locale);
  const configured = isAuthConfigured();
  const billingLive = isBillingConfigured();
  const exampleShots = 1000;
  const minTop = formatUsd(MIN_TOPUP_USD).replace(".00", "");

  const principles = [
    {
      title: t("pricingUi.principleLearning"),
      body: t("pricingUi.principleLearningBody"),
    },
    {
      title: t("pricingUi.principleWallet"),
      body: t("pricingUi.principleWalletBody", { min: minTop }),
    },
    {
      title: t("pricingUi.principleLine"),
      body: t("pricingUi.principleLineBody"),
    },
  ];

  const faqs = [
    { q: t("pricingUi.faqLearningQ"), a: t("pricingUi.faqLearningA") },
    { q: t("pricingUi.faqCreditsQ"), a: t("pricingUi.faqCreditsA") },
    { q: t("pricingUi.faqExpireQ"), a: t("pricingUi.faqExpireA") },
    { q: t("pricingUi.faqBackendsQ"), a: t("pricingUi.faqBackendsA") },
    {
      q: t("pricingUi.faqProviderQ"),
      a: t("pricingUi.faqProviderA", { date: PRICES_AS_OF }),
    },
    billingLive
      ? { q: t("pricingUi.faqBuyQ"), a: t("pricingUi.faqBuyA") }
      : { q: t("pricingUi.faqWhenQ"), a: t("pricingUi.faqWhenA") },
  ];

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-atmosphere" />
      <div className="absolute inset-0 bg-grid-dots [mask-image:radial-gradient(ellipse_70%_40%_at_50%_0%,black,transparent)]" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <header className="max-w-3xl animate-hero-enter">
          <p className="text-sm font-medium tracking-[0.2em] uppercase text-accent-dark dark:text-accent-light font-mono mb-5">
            {t("pricingUi.eyebrow")}
          </p>
          <h1 className="font-display text-display-2xl tracking-tight text-(--ink)">
            {t("pricingUi.headlineBefore")}{" "}
            <span className="bg-gradient-to-br from-accent-dark to-warm-dark dark:from-accent-light dark:to-warm-light bg-clip-text text-transparent">
              {t("pricingUi.headlineFree")}
            </span>
            {t("pricingUi.headlineAfter")}
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-(--mut) leading-relaxed">
            {t("pricingUi.heroBody")}
          </p>
          <div
            className="mt-8 flex flex-wrap items-center gap-3 animate-slide-in"
            style={{ animationDelay: "200ms" }}
          >
            <span className="inline-flex items-center rounded-chip border border-(--bd) bg-(--field) px-3 py-1.5 text-sm font-medium text-(--mut) tabular-nums">
              {t("pricingUi.creditPeg")}
            </span>
            <span className="inline-flex items-center rounded-chip border border-(--bd) bg-(--field) px-3 py-1.5 text-sm font-medium text-(--mut) tabular-nums">
              {t("pricingUi.topUpFrom", { amount: minTop })}
            </span>
            <WalletBadge />
          </div>
        </header>

        <div className="mt-20 grid gap-5 sm:grid-cols-3 reveal">
          {principles.map((p) => (
            <div key={p.title} className="rounded-card glass p-6 shadow-(--shadow-resting)">
              <h2 className="font-display text-display-md text-(--ink)">{p.title}</h2>
              <p className="mt-2 text-sm text-(--mut) leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>

        <section aria-labelledby="tiers-heading" className="mt-24 reveal">
          <div className="flex items-center gap-4 mb-4">
            <h2 id="tiers-heading" className="font-display text-display-xl text-(--ink)">
              {t("pricingUi.tiersHeading")}
            </h2>
            <div className="flex-1 h-px bg-gradient-to-r from-(--bd) to-transparent" />
          </div>
          <p className="max-w-3xl text-base text-(--mut) mb-6">{t("pricingUi.tiersIntro")}</p>

          {/* The not-yet-metered disclosure renders ABOVE the tier grid and the top-up,
              because every purchase control on this page is below it: two checkout
              buttons in the grid and the top-up's buy button. It used to sit after all
              three, which was survivable while its label read "Launch pricing:" and
              actively misleading once the label became "Before you buy:". Renaming a
              label does not move it. The structural assertion in pricing-page.test.tsx
              compares document position against every purchase control, so this cannot
              drift back silently. */}
          <div className="mb-12 rounded-card border border-warm/30 bg-warm/5 px-5 py-4 text-sm text-(--mut)">
            {billingLive ? (
              <>
                <span className="font-semibold">{t("pricingUi.launchPricing")}</span>
                {t("pricingUi.launchPricingBody")}
              </>
            ) : (
              <>
                <span className="font-semibold">{t("pricingUi.earlyAccess")}</span>
                {t("pricingUi.earlyAccessBody")}
              </>
            )}
          </div>

          <div className="grid gap-5 lg:grid-cols-3 items-start">
            {TIERS.map((tier) => {
              const featured = tier.id === "plus";
              const copy = tierCopy(t, tier);
              const displayName =
                tier.id === "free" ? t("pricingUi.free") : tier.name;
              return (
                <div
                  key={tier.id}
                  className={`relative rounded-card glass p-7 flex flex-col ${
                    featured
                      ? "border-accent/60 shadow-(--shadow-raised) lg:-translate-y-2"
                      : "shadow-(--shadow-resting)"
                  }`}
                >
                  {featured && (
                    <span className="absolute -top-3 left-7 inline-flex items-center rounded-chip bg-accent-dark px-2.5 py-1 text-xs font-semibold text-white">
                      {t("pricingUi.bestForRegulars")}
                    </span>
                  )}
                  <h3 className="font-display text-display-md text-(--ink)">
                    {displayName}
                  </h3>
                  <p className="mt-1 text-sm text-(--mut) min-h-10">{copy.tagline}</p>
                  <p className="mt-5 flex items-baseline gap-1.5 tabular-nums">
                    <span className="font-display text-display-lg text-(--ink)">
                      {tier.priceUsdPerMonth === 0
                        ? "$0"
                        : formatUsd(tier.priceUsdPerMonth).replace(".00", "")}
                    </span>
                    <span className="text-sm text-caption">
                      {tier.priceUsdPerMonth === 0
                        ? t("pricingUi.forever")
                        : t("pricingUi.perMonth")}
                    </span>
                  </p>
                  {tier.monthlyCredits > 0 && (
                    <p className="mt-1 text-sm text-accent-dark dark:text-accent-light font-medium tabular-nums">
                      {t("pricingUi.creditsEveryMonth", {
                        credits: formatCredits(tier.monthlyCredits),
                      })}
                    </p>
                  )}

                  <ul className="mt-6 space-y-3 flex-1">
                    {copy.features.map((f) => (
                      <li key={f} className="flex gap-2.5 text-sm text-(--mut)">
                        <svg
                          className="w-4 h-4 mt-0.5 shrink-0 text-accent-dark dark:text-accent-light"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-7 pt-5 border-t border-(--bd)">
                    {tier.id === "free" ? (
                      <SignupCta size="sm" t={t} />
                    ) : billingLive && tier.checkoutLookupKey ? (
                      <CheckoutButton
                        lookupKey={tier.checkoutLookupKey}
                        label={t("pricingUi.getTier", { name: tier.name })}
                      />
                    ) : (
                      <div className="flex flex-col gap-2">
                        <span className="inline-flex w-fit items-center rounded-control border border-(--bd) px-4 py-2 text-sm font-medium text-caption">
                          {t("pricingUi.launchingSoon")}
                        </span>
                        {configured && (
                          <Link
                            href="/login?mode=signup"
                            className="text-sm font-medium text-accent-dark dark:text-accent-light hover:underline underline-offset-4 focus-ring rounded w-fit"
                          >
                            {t("pricingUi.startFreeWhileWait")}
                          </Link>
                        )}
                      </div>
                    )}
                    <p className="mt-3 text-xs text-caption">{copy.footnote}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {billingLive && (
            <div className="mt-8">
              <TopUp />
            </div>
          )}
        </section>

        <section aria-labelledby="estimator-heading" className="mt-24 reveal">
          <div className="flex items-center gap-4 mb-4">
            <h2
              id="estimator-heading"
              className="font-display text-display-xl text-(--ink)"
            >
              {t("pricingUi.estimatorHeading")}
            </h2>
            <div className="flex-1 h-px bg-gradient-to-r from-(--bd) to-transparent" />
          </div>
          <p className="max-w-3xl text-base text-(--mut) mb-10">
            {t("pricingUi.estimatorIntro")}
          </p>
          <CostEstimator />
        </section>

        <section aria-labelledby="rates-heading" className="mt-24 reveal">
          <div className="flex items-center gap-4 mb-4">
            <h2 id="rates-heading" className="font-display text-display-xl text-(--ink)">
              {t("pricingUi.ratesHeading")}
            </h2>
            <div className="flex-1 h-px bg-gradient-to-r from-(--bd) to-transparent" />
            <span className="text-sm text-caption">
              {t("pricingUi.ratesAsOf", { date: PRICES_AS_OF })}
            </span>
          </div>
          <p className="max-w-3xl text-base text-(--mut) mb-10">
            {t("pricingUi.ratesIntro", { fee: TASK_FEE_CREDITS })}
          </p>

          <div className="grid gap-5 lg:grid-cols-5">
            <div className="lg:col-span-2 rounded-card glass shadow-(--shadow-resting) overflow-hidden">
              <h3 className="font-display text-display-md text-(--ink) px-6 pt-6">
                {t("pricingUi.aiTutor")}
              </h3>
              <p className="px-6 pt-1 pb-4 text-sm text-(--mut)">
                {t("pricingUi.tutorTypical")}
              </p>
              <table className="w-full text-sm">
                <thead>
                  {/* No "Tier" column. It rendered a plus/pro chip beside Sonnet, Opus,
                      and Fable, which reads as "this tier unlocks this model" — an unlock
                      nothing in the codebase performs (the tutor lambda binds one model
                      id and takes no model parameter). The column returns with the
                      feature, not before it. */}
                  <tr className="border-t border-(--bd) text-left">
                    <th scope="col" className="px-6 py-2.5 font-medium text-caption">
                      {t("pricingUi.model")}
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-2.5 font-medium text-caption text-right"
                    >
                      {t("pricingUi.credits")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {TUTOR_RATES.map((r) => (
                    <tr key={r.model} className="border-t border-(--bd)">
                      <td className="px-6 py-3 font-medium text-(--ink)">{r.model}</td>
                      <td className="px-6 py-3 text-right tabular-nums text-(--mut)">
                        ~{r.typicalCreditsPerQuestion}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lg:col-span-3 rounded-card glass shadow-(--shadow-resting) overflow-hidden">
              <h3 className="font-display text-display-md text-(--ink) px-6 pt-6">
                {t("pricingUi.quantumHardware")}
              </h3>
              <p className="px-6 pt-1 pb-4 text-sm text-(--mut)">
                {t("pricingUi.hardwarePerShotPlusFee", { fee: TASK_FEE_CREDITS })}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="border-t border-(--bd) text-left">
                      <th scope="col" className="px-6 py-2.5 font-medium text-caption">
                        {t("pricingUi.backend")}
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2.5 font-medium text-caption text-right"
                      >
                        {t("pricingUi.perShot")}
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-2.5 font-medium text-caption text-right"
                      >
                        {t("pricingUi.shotRun", {
                          n: exampleShots.toLocaleString(loc),
                        })}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {HARDWARE_RATES.map((r) => {
                      const total = jobCredits(r, exampleShots);
                      const techKey = TECH_KEY[r.technology];
                      return (
                        <tr key={r.name} className="border-t border-(--bd)">
                          <td className="px-6 py-3">
                            <span className="font-medium text-(--ink)">{r.name}</span>
                            <span className="block text-xs text-caption">
                              {techKey ? t(techKey) : r.technology}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-(--mut)">
                            {r.creditsPerShot}
                          </td>
                          <td className="px-6 py-3 text-right tabular-nums text-(--mut)">
                            {formatCredits(total)}
                            <span className="block text-xs text-caption">
                              {formatUsd(creditsToUsd(total))}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {SIMULATOR_RATES.map((s) => {
                      const descKey = SIM_DESC_KEY[s.description];
                      return (
                        <tr key={s.name} className="border-t border-(--bd)">
                          <td className="px-6 py-3">
                            <span className="font-medium text-(--ink)">{s.name}</span>
                            <span className="block text-xs text-caption">
                              {descKey ? t(descKey) : s.description}
                            </span>
                          </td>
                          <td
                            className="px-3 py-3 text-right tabular-nums text-(--mut)"
                            colSpan={2}
                          >
                            {t("pricingUi.creditsPerMinute", {
                              n: s.creditsPerMinute,
                            })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="faq-heading" className="mt-24 max-w-3xl reveal">
          <h2 id="faq-heading" className="font-display text-display-xl text-(--ink) mb-8">
            {t("pricingUi.faqHeading")}
          </h2>
          <div className="space-y-3">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="group rounded-card glass shadow-(--shadow-resting)"
              >
                <summary className="cursor-pointer list-none px-6 py-4 flex items-center justify-between gap-4 font-medium text-(--ink) focus-ring rounded-card">
                  {f.q}
                  <svg
                    className="w-4 h-4 shrink-0 text-caption transition-transform group-open:rotate-45"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </summary>
                <p className="px-6 pb-5 text-sm text-(--mut) leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="pricing-cta-heading"
          className="mt-24 rounded-card glass shadow-(--shadow-raised) px-6 py-12 sm:px-12 text-center reveal"
        >
          <h2
            id="pricing-cta-heading"
            className="font-display text-display-xl text-(--ink) text-balance"
          >
            {t("pricingUi.ctaHeading")}
          </h2>
          <p className="mt-4 max-w-xl mx-auto text-base text-(--mut)">
            {t("pricingUi.ctaBody")}
          </p>
          <div className="mt-8 flex justify-center">
            <SignupCta t={t} />
          </div>
        </section>
      </div>
    </div>
  );
}
