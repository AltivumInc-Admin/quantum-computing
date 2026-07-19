"use client";

import { useId, useState } from "react";
import {
  startTopUp,
  BillingAuthError,
  TOPUP_MIN_USD,
  TOPUP_MAX_USD,
} from "@/lib/billing-client";
import { formatCredits } from "@/lib/pricing";

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
  const [amount, setAmount] = useState("20");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

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
      setError("Could not start checkout. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-gray-200/60 dark:border-white/[0.06] bg-(--surface-1) p-6 sm:p-8 shadow-(--shadow-resting)">
      <h3 className="font-display text-display-md text-(--ink)">
        Top up any amount
      </h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {`${formatCredits(100)} per dollar — the $0.01 peg, always. Whole dollars from $${TOPUP_MIN_USD} to $${TOPUP_MAX_USD}.`}
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Amount presets">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(String(p))}
              className={`rounded-chip px-3 py-1.5 text-sm font-medium tabular-nums interactive focus-ring ${
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
            Custom amount (USD)
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
              className="w-24 rounded-control border border-(--bd) bg-(--surface-2) px-3 py-1.5 text-sm text-(--ink) tabular-nums focus-ring"
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
            ? "Starting…"
            : valid
              ? `Buy ${formatCredits(parsed * 100)}`
              : "Buy credits"}
        </button>
      </div>

      {!valid && amount !== "" && (
        <p className="mt-3 text-xs text-warm-dark dark:text-warm-light">
          Enter a whole dollar amount from ${TOPUP_MIN_USD} to ${TOPUP_MAX_USD}.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-danger-dark dark:text-danger-light">
          {error}
        </p>
      )}
      <p className="mt-4 text-xs text-caption">
        Purchased credits never expire. You will see the exact amount on the
        Stripe checkout page before paying.
      </p>
    </div>
  );
}
