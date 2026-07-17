"use client";

import { useState } from "react";
import { startCheckout, BillingAuthError, type CheckoutLookupKey } from "@/lib/billing-client";

function defaultNavigate(url: string) {
  window.location.assign(url);
}

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function go() {
    setBusy(true);
    setError(false);
    try {
      const url = await startCheckout(lookupKey);
      navigate(url); // leaves the page; no need to reset busy
    } catch (e) {
      if (e instanceof BillingAuthError) {
        navigate("/login?mode=signup");
        return;
      }
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className={
          className ??
          "surface-accent inline-flex items-center rounded-control px-4 py-2 text-sm font-semibold interactive focus-ring disabled:opacity-70"
        }
      >
        {busy ? "Starting…" : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger-dark dark:text-danger-light">
          Could not start checkout. Please try again.
        </p>
      )}
    </div>
  );
}
