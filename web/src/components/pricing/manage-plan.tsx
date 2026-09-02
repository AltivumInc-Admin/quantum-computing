"use client";

import { useState } from "react";
import { useLocale } from "@/i18n";
import { openPortal } from "@/lib/billing-client";
import { defaultNavigate, routeIfSignedOut } from "@/components/pricing/navigate";

/**
 * What the learner's CURRENT tier card shows instead of a buy button.
 *
 * The card used to render CheckoutButton for Plus and Pro whenever billing was
 * live, regardless of who was looking, and the /checkout handler consults
 * hasPaidTier only for mode "payment" — so an active Plus subscriber saw an
 * enabled "Get Plus" that would open Checkout for a SECOND Plus subscription.
 * Meanwhile the self-serve portal was fully built (POST /portal in the Lambda,
 * openPortal() in the client) and no component imported it, so a subscriber had
 * no on-site way to change or cancel a plan.
 *
 * This is the page telling a subscriber the truth. A server-side guard against
 * duplicate subscriptions is a separate correctness concern and does not live
 * here.
 */
export function ManagePlan({
  navigate = defaultNavigate,
}: {
  navigate?: (url: string) => void;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function go() {
    // Same trade as the purchase controls: guard the double-submit in code, not
    // with `disabled`, so the control the learner just pressed stays focusable.
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      navigate(await openPortal()); // leaves the page
    } catch (e) {
      if (routeIfSignedOut(e, navigate)) return;
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="inline-flex w-fit items-center rounded-control border border-accent/60 px-4 py-2 text-sm font-medium text-accent-dark dark:text-accent-light">
        {t("pricingUi.currentPlan")}
      </span>
      <button
        type="button"
        onClick={go}
        aria-busy={busy}
        className={`inline-flex w-fit items-center rounded-control border border-(--bd) px-4 py-2 text-sm font-medium text-(--ink) interactive focus-ring ${
          busy ? "opacity-60" : ""
        }`}
      >
        {busy ? t("pricingUi.starting") : t("pricingUi.managePlan")}
      </button>
      {error && (
        <p role="alert" className="text-xs text-danger-dark dark:text-danger-light">
          {t("pricingUi.portalFailed")}
        </p>
      )}
    </div>
  );
}
