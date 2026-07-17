"use client";

import { useEffect, useState } from "react";
import { getWallet, isBillingConfigured, type Wallet } from "@/lib/billing-client";
import { formatCredits } from "@/lib/pricing";

const TIER_LABEL: Record<Wallet["tier"], string> = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
};

/**
 * A quiet chip showing the signed-in learner's wallet. Renders nothing until it
 * has data — inert when billing is unconfigured, signed out, or the fetch fails
 * (a pricing page must never break because the wallet is momentarily
 * unreachable).
 */
export function WalletBadge() {
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
    <span
      className="inline-flex items-center gap-2 rounded-chip border border-gray-200 dark:border-white/10 bg-(--surface-1) px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 tabular-nums"
      data-testid="wallet-badge"
    >
      <span className="text-accent-dark dark:text-accent-light">{formatCredits(wallet.credits)}</span>
      <span aria-hidden="true" className="text-gray-300 dark:text-gray-600">·</span>
      <span>{TIER_LABEL[wallet.tier]} plan</span>
    </span>
  );
}
