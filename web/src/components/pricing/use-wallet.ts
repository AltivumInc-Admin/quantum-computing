"use client";

import { useEffect, useState } from "react";
import { getWallet, isBillingConfigured, type Wallet } from "@/lib/billing-client";

/**
 * The signed-in learner's wallet, fetched once.
 *
 * Lifted out of WalletBadge, which used to own the only getWallet() call in
 * web/src. The tier cards need the same answer — a Plus subscriber was shown an
 * enabled "Get Plus" that opens Checkout for a SECOND Plus subscription — and two
 * components each fetching would mean two requests for one page.
 *
 * Failure is silence, deliberately: unconfigured billing, a signed-out visitor
 * and a momentarily unreachable backend all produce `null`, and every consumer
 * has to render sensibly without a wallet. A pricing page must never break
 * because the wallet did not answer.
 */
export function useWallet(): Wallet | null {
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

  return wallet;
}
