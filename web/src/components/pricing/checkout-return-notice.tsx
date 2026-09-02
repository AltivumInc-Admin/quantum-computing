"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/i18n";

export type CheckoutOutcome = "success" | "cancelled";

/**
 * The return legs of a Stripe Checkout, honoured.
 *
 * Every session the Lambda creates sends the learner back to
 * `/workspace?checkout=success` or `/pricing?checkout=cancelled`, and nothing in
 * web/src read either parameter — a repo-wide grep matched only the Lambda. So
 * after paying real money a learner landed on the bench with no confirmation, no
 * balance and no hint that credits arrive asynchronously; and a cancelled
 * checkout dropped them back on the pricing page, indistinguishable from a fresh
 * visit.
 *
 * It reads the parameter from `window.location.search` and clears it with
 * `history.replaceState`, touching the Next router not at all. `useSearchParams`
 * on a statically exported page forces a Suspense boundary onto every host for
 * one string, and `useRouter` would make this component unmountable in any test
 * that has not stubbed next/navigation — for a notice that is invisible on every
 * ordinary visit, neither is a reasonable price. The parameter is stripped so a
 * reload does not re-announce a purchase.
 *
 * The success wording is deliberately "on the way", not "added": the webhook
 * grants the credits, so at the moment of this render the balance may not have
 * moved yet. Saying otherwise would be the same overstatement the pricing copy
 * is guarded against everywhere else.
 */
export function CheckoutReturnNotice({ outcome }: { outcome: CheckoutOutcome }) {
  const { t } = useLocale();
  const [shown, setShown] = useState(false);
  // Read the URL exactly once per mount, so a later re-render cannot re-latch a
  // notice the learner has just dismissed.
  const read = useRef(false);

  // First mount only. This MUST be a post-hydration effect — the statically
  // exported HTML carries no query string, so reading it during render (or in a
  // state initializer) is a hydration mismatch on exactly the visits that matter.
  // Same trade, and the same disable, as playground-bench.tsx's share-hash read.
  useEffect(() => {
    if (read.current) return;
    read.current = true;
    const url = new URL(window.location.href);
    if (url.searchParams.get("checkout") !== outcome) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown(true);
    url.searchParams.delete("checkout");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, [outcome]);

  if (!shown) return null;

  const success = outcome === "success";
  return (
    <div
      role="status"
      data-testid={`checkout-${outcome}`}
      className={`mb-6 flex items-start gap-4 rounded-card border px-5 py-4 text-sm ${
        success ? "border-accent/40 bg-accent/5 text-(--ink)" : "border-(--bd) text-(--mut)"
      }`}
    >
      <p className="flex-1">
        {t(success ? "pricingUi.checkoutSuccess" : "pricingUi.checkoutCancelled")}
      </p>
      <button
        type="button"
        onClick={() => setShown(false)}
        className="shrink-0 rounded text-xs font-medium text-caption hover:text-(--ink) focus-ring"
      >
        {t("pricingUi.dismissNotice")}
      </button>
    </div>
  );
}
