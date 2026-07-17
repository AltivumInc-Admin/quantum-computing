import type { Metadata } from "next";
import Link from "next/link";
import { isAuthConfigured } from "@/lib/auth-config";
import {
  TIERS,
  TUTOR_RATES,
  HARDWARE_RATES,
  SIMULATOR_RATES,
  TASK_FEE_CREDITS,
  STARTER_GRANT_CREDITS,
  MIN_TOPUP_USD,
  PRICES_AS_OF,
  jobCredits,
  creditsToUsd,
  formatCredits,
  formatUsd,
} from "@/lib/pricing";
import { CostEstimator } from "@/components/pricing/cost-estimator";

const PAGE_TITLE = "Pricing";
const PAGE_DESCRIPTION =
  "The entire quantum curriculum and simulator are free with a free account. One dollar-pegged credit wallet meters the only two things that cost real money: AI tutoring and real quantum hardware.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "/pricing",
    type: "website",
  },
  twitter: { card: "summary", title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

/** Sign-up CTA gated on Cognito env, mirroring the home AuthCtas / glossary WorkspaceCta. */
function SignupCta({ size = "base" }: { size?: "base" | "sm" }) {
  const configured = isAuthConfigured();
  const pad = size === "base" ? "px-6 py-3 text-base" : "px-4 py-2 text-sm";
  return configured ? (
    <Link
      href="/login?mode=signup"
      className={`surface-accent inline-flex items-center rounded-control font-semibold interactive focus-ring ${pad}`}
    >
      Sign up free
    </Link>
  ) : (
    <span
      className={`inline-flex items-center rounded-control border border-gray-200 dark:border-white/10 font-medium text-caption ${pad}`}
    >
      Sign-up coming soon
    </span>
  );
}

const principles = [
  {
    title: "Learning is the product",
    body: "Lessons, notebooks, and the circuit simulator run in your browser, so we can keep them free for everyone, forever. The curriculum never moves behind the wallet.",
  },
  {
    title: "One wallet, pegged to the dollar",
    body: `One credit is one cent — always. Top up from ${formatUsd(MIN_TOPUP_USD)}, spend on any backend or any tutor model, and purchased credits never expire.`,
  },
  {
    title: "A clear line",
    body: "Credits meter exactly two things: questions to the AI tutor and runs on real quantum hardware. If it is neither of those, it is free.",
  },
];

const faqs = [
  {
    q: "Is learning really free forever?",
    a: "Yes. The full curriculum, the browser simulator, the playground, the glossary, and spaced-repetition review are free with a free account — email or Google, no credit card. That is the product, not a trial.",
  },
  {
    q: "What do credits buy?",
    a: "Two things: AI tutor questions and real quantum compute (QPU runs and managed cloud simulators). One credit equals one cent. Before any hardware run executes, you see the exact cost and approve it — nothing spends your balance without a number in front of you.",
  },
  {
    q: "Do credits expire?",
    a: "Purchased credits never expire. Monthly Plus and Pro credits roll over for as long as the subscription is active.",
  },
  {
    q: "Why do backends cost such different amounts?",
    a: "Because the machines really do. A trapped-ion shot on IonQ lists at roughly 180 times a superconducting shot on Rigetti. We publish every backend's rate and let you choose the physics your budget wants — the estimate is always shown before you commit.",
  },
  {
    q: "What happens when a provider changes its prices?",
    a: `Hardware rates track the providers' published price sheets (currently the ${PRICES_AS_OF} revision). When a provider reprices, our credit rates follow, and the pre-flight estimate always reflects the live rate at submission time.`,
  },
  {
    q: "When can I buy credits?",
    a: "Billing is launching soon; the prices on this page are launch pricing. Until then, the tutor is free to try and hardware runs inside the curriculum are sponsored — create a free account and your 500-credit welcome grant will be waiting at launch.",
  },
];

export default function PricingPage() {
  const configured = isAuthConfigured();
  const exampleShots = 1000;

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-atmosphere-light dark:bg-atmosphere" />
      <div className="absolute inset-0 bg-grid-dots-light dark:bg-grid-dots [mask-image:radial-gradient(ellipse_70%_40%_at_50%_0%,black,transparent)]" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        {/* ------------------------------------------------------------ */}
        {/* Hero — the thesis.                                            */}
        {/* ------------------------------------------------------------ */}
        <header className="max-w-3xl animate-hero-enter">
          <p className="text-sm font-medium tracking-widest uppercase text-accent dark:text-accent-light mb-5">
            Pricing
          </p>
          <h1 className="font-display text-display-2xl tracking-tight text-gray-900 dark:text-white">
            The learning is{" "}
            <span className="bg-gradient-to-br from-accent-dark to-warm-dark dark:from-accent-light dark:to-warm-light bg-clip-text text-transparent">
              free
            </span>
            . The metal is metered.
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-600 dark:text-gray-300 leading-relaxed">
            The entire curriculum, simulator, and playground are free with a
            free account — forever. One credit wallet meters the only two
            things that cost real money: frontier AI tutoring and real quantum
            hardware. One credit is one cent, always.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3 animate-slide-in" style={{ animationDelay: "200ms" }}>
            <span className="inline-flex items-center rounded-chip border border-gray-200 dark:border-white/10 bg-(--surface-1) px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 tabular-nums">
              1 credit = $0.01
            </span>
            <span className="inline-flex items-center rounded-chip border border-gray-200 dark:border-white/10 bg-(--surface-1) px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 tabular-nums">
              {STARTER_GRANT_CREDITS}-credit welcome grant with every account
            </span>
          </div>
        </header>

        {/* ------------------------------------------------------------ */}
        {/* Principles.                                                   */}
        {/* ------------------------------------------------------------ */}
        <div className="mt-20 grid gap-5 sm:grid-cols-3 reveal">
          {principles.map((p) => (
            <div
              key={p.title}
              className="rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) p-6 shadow-(--shadow-resting)"
            >
              <h2 className="font-display text-display-md text-gray-900 dark:text-white">
                {p.title}
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {p.body}
              </p>
            </div>
          ))}
        </div>

        {/* ------------------------------------------------------------ */}
        {/* Tiers.                                                        */}
        {/* ------------------------------------------------------------ */}
        <section aria-labelledby="tiers-heading" className="mt-24 reveal">
          <div className="flex items-center gap-4 mb-4">
            <h2
              id="tiers-heading"
              className="font-display text-display-xl text-gray-900 dark:text-white"
            >
              Three ways to fund the wallet
            </h2>
            <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent" />
          </div>
          <p className="max-w-3xl text-base text-gray-600 dark:text-gray-400 mb-12">
            Every account is pay-as-you-go at heart: top up any amount, spend it
            on anything metered. Plus and Pro are monthly credit bundles with
            stronger tutor models — never an all-you-can-eat plan, so the deal
            stays honest in both directions.
          </p>

          <div className="grid gap-5 lg:grid-cols-3 items-start">
            {TIERS.map((tier) => {
              const featured = tier.id === "plus";
              return (
                <div
                  key={tier.id}
                  className={`relative rounded-card border bg-(--surface-1) p-7 flex flex-col ${
                    featured
                      ? "border-accent/60 shadow-(--shadow-raised) lg:-translate-y-2"
                      : "border-gray-200/60 dark:border-white/[0.06] shadow-(--shadow-resting)"
                  }`}
                >
                  {featured && (
                    <span className="absolute -top-3 left-7 inline-flex items-center rounded-chip bg-accent-dark px-2.5 py-1 text-xs font-semibold text-white">
                      Best for regulars
                    </span>
                  )}
                  <h3 className="font-display text-display-md text-gray-900 dark:text-white">
                    {tier.name}
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 min-h-10">
                    {tier.tagline}
                  </p>
                  <p className="mt-5 flex items-baseline gap-1.5 tabular-nums">
                    <span className="font-display text-display-lg text-gray-900 dark:text-white">
                      {tier.priceUsdPerMonth === 0
                        ? "$0"
                        : formatUsd(tier.priceUsdPerMonth).replace(".00", "")}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {tier.priceUsdPerMonth === 0 ? "forever" : "/ month"}
                    </span>
                  </p>
                  {tier.monthlyCredits > 0 && (
                    <p className="mt-1 text-sm text-accent-dark dark:text-accent-light font-medium tabular-nums">
                      {formatCredits(tier.monthlyCredits)} every month
                    </p>
                  )}

                  <ul className="mt-6 space-y-3 flex-1">
                    {tier.features.map((f) => (
                      <li
                        key={f}
                        className="flex gap-2.5 text-sm text-gray-600 dark:text-gray-400"
                      >
                        <svg
                          className="w-4 h-4 mt-0.5 shrink-0 text-accent dark:text-accent-light"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-7 pt-5 border-t border-gray-200/60 dark:border-white/[0.08]">
                    {tier.id === "free" ? (
                      <SignupCta size="sm" />
                    ) : (
                      <div className="flex flex-col gap-2">
                        <span className="inline-flex w-fit items-center rounded-control border border-gray-200 dark:border-white/10 px-4 py-2 text-sm font-medium text-caption">
                          Launching soon
                        </span>
                        {configured && (
                          <Link
                            href="/login?mode=signup"
                            className="text-sm font-medium text-accent-dark dark:text-accent-light hover:underline underline-offset-4 focus-ring rounded w-fit"
                          >
                            Start free while you wait
                          </Link>
                        )}
                      </div>
                    )}
                    <p className="mt-3 text-xs text-caption">{tier.footnote}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Early-access honesty note — keeps this page consistent with the
              sponsored-runs story the curriculum tells today. */}
          <div className="mt-8 rounded-card border border-warm/30 bg-warm/5 px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
            <span className="font-semibold">Early access:</span> billing has not
            launched yet — these are launch prices. Today the tutor is free to
            try, and hardware runs inside the curriculum are sponsored. Your
            welcome grant is credited when wallets go live.
          </div>
        </section>

        {/* ------------------------------------------------------------ */}
        {/* Estimator.                                                    */}
        {/* ------------------------------------------------------------ */}
        <section aria-labelledby="estimator-heading" className="mt-24 reveal">
          <div className="flex items-center gap-4 mb-4">
            <h2
              id="estimator-heading"
              className="font-display text-display-xl text-gray-900 dark:text-white"
            >
              Know the number before you run
            </h2>
            <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent" />
          </div>
          <p className="max-w-3xl text-base text-gray-600 dark:text-gray-400 mb-10">
            No quantum platform should surprise you with a bill. Price any
            backend and any tutor habit here — the identical estimate gates
            every real submission.
          </p>
          <CostEstimator />
        </section>

        {/* ------------------------------------------------------------ */}
        {/* Rate tables.                                                  */}
        {/* ------------------------------------------------------------ */}
        <section aria-labelledby="rates-heading" className="mt-24 reveal">
          <div className="flex items-center gap-4 mb-4">
            <h2
              id="rates-heading"
              className="font-display text-display-xl text-gray-900 dark:text-white"
            >
              Every rate, published
            </h2>
            <div className="flex-1 h-px bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent" />
            <span className="text-sm text-gray-500 dark:text-gray-500">
              {PRICES_AS_OF} rates
            </span>
          </div>
          <p className="max-w-3xl text-base text-gray-600 dark:text-gray-400 mb-10">
            The full price list — no enterprise-sales veil. QPU runs add a flat{" "}
            {TASK_FEE_CREDITS}-credit task fee; managed simulators bill by the
            minute; the browser simulator is free and always will be.
          </p>

          <div className="grid gap-5 lg:grid-cols-5">
            {/* Tutor rates */}
            <div className="lg:col-span-2 rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) shadow-(--shadow-resting) overflow-hidden">
              <h3 className="font-display text-display-md text-gray-900 dark:text-white px-6 pt-6">
                AI tutor
              </h3>
              <p className="px-6 pt-1 pb-4 text-sm text-gray-600 dark:text-gray-400">
                Typical credits per question.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-gray-200/60 dark:border-white/[0.08] text-left">
                    <th scope="col" className="px-6 py-2.5 font-medium text-caption">Model</th>
                    <th scope="col" className="px-3 py-2.5 font-medium text-caption">Tier</th>
                    <th scope="col" className="px-6 py-2.5 font-medium text-caption text-right">Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {TUTOR_RATES.map((r) => (
                    <tr
                      key={r.model}
                      className="border-t border-gray-200/60 dark:border-white/[0.08]"
                    >
                      <td className="px-6 py-3 font-medium text-gray-900 dark:text-white">
                        {r.model}
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center rounded-chip bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent-dark dark:text-accent-light capitalize">
                          {r.tier}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        ~{r.typicalCreditsPerQuestion}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Hardware rates */}
            <div className="lg:col-span-3 rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) shadow-(--shadow-resting) overflow-hidden">
              <h3 className="font-display text-display-md text-gray-900 dark:text-white px-6 pt-6">
                Quantum hardware
              </h3>
              <p className="px-6 pt-1 pb-4 text-sm text-gray-600 dark:text-gray-400">
                Credits per shot, plus the {TASK_FEE_CREDITS}-credit task fee.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="border-t border-gray-200/60 dark:border-white/[0.08] text-left">
                      <th scope="col" className="px-6 py-2.5 font-medium text-caption">Backend</th>
                      <th scope="col" className="px-3 py-2.5 font-medium text-caption text-right">Per shot</th>
                      <th scope="col" className="px-6 py-2.5 font-medium text-caption text-right">
                        {exampleShots.toLocaleString("en-US")}-shot run
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {HARDWARE_RATES.map((r) => {
                      const total = jobCredits(r, exampleShots);
                      return (
                        <tr
                          key={r.name}
                          className="border-t border-gray-200/60 dark:border-white/[0.08]"
                        >
                          <td className="px-6 py-3">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {r.name}
                            </span>
                            <span className="block text-xs text-caption">
                              {r.technology}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                            {r.creditsPerShot}
                          </td>
                          <td className="px-6 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                            {formatCredits(total)}
                            <span className="block text-xs text-caption">
                              {formatUsd(creditsToUsd(total))}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {SIMULATOR_RATES.map((s) => (
                      <tr
                        key={s.name}
                        className="border-t border-gray-200/60 dark:border-white/[0.08]"
                      >
                        <td className="px-6 py-3">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {s.name}
                          </span>
                          <span className="block text-xs text-caption">{s.description}</span>
                        </td>
                        <td
                          className="px-3 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300"
                          colSpan={2}
                        >
                          {s.creditsPerMinute} credits / minute
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ */}
        {/* FAQ.                                                          */}
        {/* ------------------------------------------------------------ */}
        <section aria-labelledby="faq-heading" className="mt-24 max-w-3xl reveal">
          <h2
            id="faq-heading"
            className="font-display text-display-xl text-gray-900 dark:text-white mb-8"
          >
            Fair questions
          </h2>
          <div className="space-y-3">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="group rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) shadow-(--shadow-resting)"
              >
                <summary className="cursor-pointer list-none px-6 py-4 flex items-center justify-between gap-4 font-medium text-gray-900 dark:text-white focus-ring rounded-card">
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
                <p className="px-6 pb-5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ */}
        {/* Closing CTA.                                                  */}
        {/* ------------------------------------------------------------ */}
        <section
          aria-labelledby="pricing-cta-heading"
          className="mt-24 rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) shadow-(--shadow-raised) px-6 py-12 sm:px-12 text-center reveal"
        >
          <h2
            id="pricing-cta-heading"
            className="font-display text-display-xl text-gray-900 dark:text-white text-balance"
          >
            Start learning today. The wallet can wait.
          </h2>
          <p className="mt-4 max-w-xl mx-auto text-base text-gray-600 dark:text-gray-400">
            Everything you need to learn quantum computing is already free —
            just a free account. Email or Google, no credit card.
          </p>
          <div className="mt-8 flex justify-center">
            <SignupCta />
          </div>
        </section>
      </div>
    </div>
  );
}
