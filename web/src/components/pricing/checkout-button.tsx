"use client";

import { useState } from "react";
import { useLocale } from "@/i18n";
import { startCheckout, type CheckoutLookupKey } from "@/lib/billing-client";
import { defaultNavigate, routeIfSignedOut } from "@/components/pricing/navigate";

/**
 * Starts a Stripe Checkout for a tier or top-up and sends the browser to the
 * hosted page. A signed-out click routes to sign-up first (you cannot buy
 * without an account — the same account-gate story the rest of the site tells).
 * `navigate` is injectable so the redirect is testable (jsdom locks
 * window.location); it defaults to a real navigation.
 */
export function CheckoutButton({
  lookupKey,
  label,
  className,
  navigate = defaultNavigate,
}: {
  lookupKey: CheckoutLookupKey;
  label: string;
  className?: string;
  navigate?: (url: string) => void;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function go() {
    // Guards double-submit without `disabled`, which would blur the button the
    // buyer just pressed — a disabled control is not focusable — dropping focus
    // to <body> for the whole Checkout Session round trip, with nothing to
    // restore it. On failure the alert asks for a retry the learner would then
    // have to re-tab the page to reach. Same trade challenge.tsx documents.
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const url = await startCheckout(lookupKey);
      navigate(url); // leaves the page; no need to reset busy
    } catch (e) {
      if (routeIfSignedOut(e, navigate)) return;
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={go}
        // Not `disabled`: see go(). The control stays focusable, and aria-busy
        // carries the state to assistive tech instead.
        aria-busy={busy}
        className={
          className ??
          // opacity-60 is the repo-wide disabled treatment (auth-form and eleven
          // other controls); this was the only opacity-70 in web/src, and the two
          // pricing CTAs sit inches apart.
          `surface-accent inline-flex items-center rounded-control px-4 py-2 text-sm font-semibold interactive focus-ring ${
            busy ? "opacity-60" : ""
          }`
        }
      >
        {busy ? t("pricingUi.starting") : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger-dark dark:text-danger-light">
          {t("pricingUi.checkoutFailed")}
        </p>
      )}
    </div>
  );
}
