"use client";

import { useId, useState } from "react";
import {
  startTopUp,
  BillingAuthError,
  BillingHttpError,
  TOPUP_MIN_USD,
  TOPUP_MAX_USD,
} from "@/lib/billing-client";
import { formatCreditNumber, roundCredits } from "@/lib/pricing";
import { useLocale, localeCode } from "@/i18n";

const PRESETS = [5, 20, 50, 100];

function defaultNavigate(url: string) {
  window.location.assign(url);
}

/**
 * Buy credits for any whole-dollar amount from TOPUP_MIN_USD to TOPUP_MAX_USD —
 * presets fill the field, the field takes anything in range, and the credits
 * preview keeps the 1:1 peg visible. A signed-out click routes to sign-up.
 * `navigate` is injectable for tests (jsdom locks window.location).
 */
export function TopUp({ navigate = defaultNavigate }: { navigate?: (url: string) => void }) {
  const { t, locale } = useLocale();
  const [amount, setAmount] = useState("20");
  const [busy, setBusy] = useState(false);
  // A refusal reason, never a message. The message used to be an English literal
  // set here, the only setError("…") string in web/src, rendered inside
  // role="alert" under Spanish copy — while the sibling CheckoutButton took the
  // byte-identical sentence from pricingUi.checkoutFailed, which both
  // dictionaries carry.
  //
  // "needsPlan" is its own state because the two refusals want opposite advice:
  // the Lambda answers every top-up from a free account with 403 "subscription
  // required" (index.mjs, both the custom and fixed-pack branches), which no
  // amount of retrying will change, and the button is enabled for anyone with a
  // valid amount. Telling that learner to try again is advice that cannot work.
  const [error, setError] = useState<"failed" | "needsPlan" | null>(null);
  const inputId = useId();

  /** A credit figure with its localized, plural-aware unit. */
  const credits = (n: number) =>
    t("pricingUi.creditsCount", { n: formatCreditNumber(n, localeCode(locale)) }, roundCredits(n));

  const parsed = Number(amount);
  const valid =
    Number.isInteger(parsed) && parsed >= TOPUP_MIN_USD && parsed <= TOPUP_MAX_USD;

  async function go() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const url = await startTopUp(parsed);
      navigate(url); // leaves the page
    } catch (e) {
      if (e instanceof BillingAuthError) {
        navigate("/login?mode=signup");
        return;
      }
      const needsPlan = e instanceof BillingHttpError && e.status === 403;
      setError(needsPlan ? "needsPlan" : "failed");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) p-6 sm:p-8 shadow-(--shadow-resting)">
      <h3 className="font-display text-display-md text-(--ink)">
        {t("pricingUi.topUpTitle")}
      </h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {t("pricingUi.topUpBody", {
          credits: credits(100),
          min: TOPUP_MIN_USD,
          max: TOPUP_MAX_USD,
        })}
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("pricingUi.amountPresets")}>
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(String(p))}
              // The repo's chip contract. Selection here was colour-only, so a
              // screen reader announced four unrelated buttons and could not say
              // which one the amount field currently matches.
              aria-pressed={parsed === p}
              className={`rounded-chip px-3 py-1.5 font-mono text-sm font-medium tabular-nums interactive focus-ring ${
                parsed === p
                  ? "chip-selected"
                  : "border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-accent/50"
              }`}
            >
              ${p}
            </button>
          ))}
        </div>

        <div>
          <label
            htmlFor={inputId}
            className="block text-xs font-medium text-caption mb-1"
          >
            {t("pricingUi.customAmount")}
          </label>
          <div className="flex items-center gap-1.5">
            <span aria-hidden="true" className="text-gray-500 dark:text-gray-400">$</span>
            <input
              id={inputId}
              type="number"
              inputMode="numeric"
              min={TOPUP_MIN_USD}
              max={TOPUP_MAX_USD}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-24 rounded-control border border-(--bd) bg-(--surface-2) px-3 py-1.5 font-mono text-sm text-(--ink) tabular-nums focus-ring"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={go}
          disabled={!valid || busy}
          className="surface-accent inline-flex items-center rounded-control px-4 py-2 text-sm font-semibold interactive focus-ring disabled:opacity-60"
        >
          {busy
            ? t("pricingUi.starting")
            : valid
              ? t("pricingUi.buyCreditsAmount", {
                  amount: credits(parsed * 100),
                })
              : t("pricingUi.buyCredits")}
        </button>
      </div>

      {!valid && amount !== "" && (
        <p className="mt-3 text-xs text-warm-dark dark:text-warm-light">
          {t("pricingUi.invalidAmount", {
            min: TOPUP_MIN_USD,
            max: TOPUP_MAX_USD,
          })}
        </p>
      )}
      {error === "needsPlan" && (
        // A refusal, not a fault: warm, the same tint the range hint uses, rather
        // than the danger tint a retryable failure earns.
        <p role="alert" className="mt-3 text-xs text-warm-dark dark:text-warm-light">
          {t("pricingUi.topUpNeedsPlan")}
        </p>
      )}
      {error === "failed" && (
        <p role="alert" className="mt-3 text-xs text-danger-dark dark:text-danger-light">
          {t("pricingUi.checkoutFailed")}
        </p>
      )}
      <p className="mt-4 text-xs text-caption">
        {t("pricingUi.topUpFootnote")}
      </p>
    </div>
  );
}
