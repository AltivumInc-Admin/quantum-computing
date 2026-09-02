"use client";

import { useEffect, useState } from "react";
import { getWallet, isBillingConfigured, type Wallet } from "@/lib/billing-client";
import { formatCreditNumber, roundCredits } from "@/lib/pricing";
import { useLocale, localeCode } from "@/i18n";


/**
 * A quiet chip showing the signed-in learner's wallet. Renders nothing until it
 * has data — inert when billing is unconfigured, signed out, or the fetch fails
 * (a pricing page must never break because the wallet is momentarily
 * unreachable).
 */
function tierLabel(
  tier: Wallet["tier"],
  t: (key: string) => string,
): string {
  if (tier === "free") return t("pricingUi.free");
  // Product tier names stay English (Plus / Pro).
  return tier === "plus" ? "Plus" : "Pro";
}

export function WalletBadge() {
  const { t, locale } = useLocale();
  const [wallet, setWallet] = useState<Wallet | null>(null);

  useEffect(() => {
    if (!isBillingConfigured()) return;
    let live = true;
    getWallet()
      .then((w) => {
        if (live) setWallet(w);
      })
      .catch(() => {
        /* signed out or transient — show nothing */
      });
    return () => {
      live = false;
    };
  }, []);

  if (!wallet) return null;

  return (
    // The hero chip recipe, verbatim from its two siblings in
    // pricing-page-content.tsx. This chip was painted in the pre-token dialect —
    // border-gray-200 / dark:border-white/10 over an OPAQUE --surface-1 — so it
    // sat beside two translucent --field chips with a visibly different hairline
    // and fill in both themes.
    <span
      className="inline-flex items-center gap-2 rounded-chip border border-(--bd) bg-(--field) px-3 py-1.5 text-sm font-medium text-(--mut) tabular-nums"
      data-testid="wallet-badge"
    >
      {/* Everything measured is mono (docs/instrument-after-dark.md): this was the
          only credits readout in the product still set in the body face. */}
      <span className="font-mono text-accent-dark dark:text-accent-light">
        {t(
          "pricingUi.creditsCount",
          { n: formatCreditNumber(wallet.credits, localeCode(locale)) },
          roundCredits(wallet.credits),
        )}
      </span>
      <span aria-hidden="true" className="text-caption">·</span>
      <span>
        {tierLabel(wallet.tier, t)} {t("pricingUi.plan")}
      </span>
    </span>
  );
}
