"use client";

import { useEffect, useId, useState } from "react";
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
  const owedNoteId = useId();

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

  // A clawback (refund or dispute) that outran the balance leaves a debt, and
  // while it is nonzero BOTH metered backends refuse every spend regardless of
  // `credits` — their debit conditions require the attribute to be absent or
  // zero. The Wallet type says any surface showing the balance must be able to
  // explain that refusal, and /wallet returns the field for exactly this; this
  // was the only balance surface and it read the field nowhere, so a learner in
  // debt saw a healthy number and nothing said why the wallet would not spend.
  const owed = wallet.clawbackOwedCredits ?? 0;
  const paused = owed > 0;

  return (
    <>
      {/* The hero chip recipe, verbatim from its two siblings in
          pricing-page-content.tsx. This chip was painted in the pre-token dialect —
          border-gray-200 / dark:border-white/10 over an OPAQUE --surface-1 — so it
          sat beside two translucent --field chips with a visibly different hairline
          and fill in both themes. */}
      <span
        className={`inline-flex items-center gap-2 rounded-chip border px-3 py-1.5 text-sm font-medium tabular-nums ${
          paused
            ? "border-warm/40 bg-warm/5 text-warm-dark dark:text-warm-light"
            : "border-(--bd) bg-(--field) text-(--mut)"
        }`}
        aria-describedby={paused ? owedNoteId : undefined}
        data-testid="wallet-badge"
      >
        {/* Everything measured is mono (docs/instrument-after-dark.md): this was the
            only credits readout in the product still set in the body face. */}
        <span
          className={
            paused ? "font-mono" : "font-mono text-accent-dark dark:text-accent-light"
          }
        >
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
        {paused && (
          <>
            <span aria-hidden="true" className="text-caption">·</span>
            <span className="font-semibold">{t("pricingUi.spendPaused")}</span>
          </>
        )}
      </span>
      {paused && (
        // The chip has room for a two-word label, not the reason. The full
        // sentence rides along as the chip's description so a screen reader gets
        // the explanation, not just the word "paused".
        <span id={owedNoteId} className="sr-only">
          {t("pricingUi.spendPausedDetail", {
            owed: t(
              "pricingUi.creditsCount",
              { n: formatCreditNumber(owed, localeCode(locale)) },
              roundCredits(owed),
            ),
          })}
        </span>
      )}
    </>
  );
}
