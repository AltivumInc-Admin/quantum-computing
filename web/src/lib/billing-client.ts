// The billing backend client (quantum-stripe): create a Checkout Session, open
// the Billing Portal, read the wallet. Modeled on sync-client / qpu-client —
// the base URL is env-gated (NEXT_PUBLIC_BILLING_URL), auth is the Cognito ID
// token via aws-amplify's fetchAuthSession, and the aws-amplify import is LAZY
// so this module is import-safe before the auth bridge configures Amplify.

import { isAuthConfigured } from "./auth-config";
import { TOPUP_MIN_USD, TOPUP_MAX_USD, type TierLookupKey } from "./pricing";

/** All credit top-up lookup keys, matching the backend CATALOG + Stripe. */
export type TopUpLookupKey =
  | "ql_credits_500"
  | "ql_credits_2000"
  | "ql_credits_5000"
  | "ql_credits_10000";

/**
 * The tier half comes from lib/pricing.ts, which owns the published catalog; this
 * module owns only the top-up packs. Both halves are checked against the backend
 * CATALOG by __tests__/infra/tier-catalog-parity.test.ts.
 */
export type CheckoutLookupKey = TierLookupKey | TopUpLookupKey;

export interface Wallet {
  tier: "free" | "plus" | "pro";
  credits: number;
  subscriptionStatus: string | null;
  /**
   * Debt left by a clawback (refund/dispute) that exceeded the balance. While
   * nonzero, BOTH metered backends refuse every spend regardless of `credits`,
   * so any surface showing the balance must be able to explain the refusal.
   * Optional because a deployed Lambda may predate the field; treat absent as 0.
   */
  clawbackOwedCredits?: number;
}

/** A billing round trip the server refused — carries the status for triage. */
export class BillingHttpError extends Error {
  constructor(
    op: string,
    readonly status: number,
  ) {
    super(`billing ${op} failed (${status})`);
    this.name = "BillingHttpError";
  }
}

/** fetchAuthSession produced no usable token — the caller must sign in first. */
export class BillingAuthError extends Error {
  constructor() {
    super("not signed in");
    this.name = "BillingAuthError";
  }
}

export function billingUrl(): string | null {
  return process.env.NEXT_PUBLIC_BILLING_URL || null;
}

/** Billing is live only when its URL is set AND auth is configured. */
export function isBillingConfigured(): boolean {
  return billingUrl() !== null && isAuthConfigured();
}

async function authHeader(): Promise<string> {
  // Lazy import: keep this module free of aws-amplify at load time so it can be
  // imported before Amplify.configure has run (the auth bridge configures it).
  const { fetchAuthSession } = await import("aws-amplify/auth");
  const { tokens } = await fetchAuthSession();
  const token = tokens?.idToken?.toString();
  if (!token) throw new BillingAuthError();
  return `Bearer ${token}`;
}

/**
 * Custom top-up bounds — mirrors the server's validation (whole dollars).
 * Re-exported from lib/pricing.ts, which publishes them, so the amount this
 * client refuses to send and the amount the page advertises cannot diverge.
 */
export { TOPUP_MIN_USD, TOPUP_MAX_USD };

/**
 * Every round trip to the billing backend: base-URL guard, bearer header, the
 * BillingHttpError throw that preserves the status, and the parse. The three
 * routes below each carried their own copy of this sequence, which is how one of
 * them could quietly stop preserving the status the 403 branch depends on.
 * Modeled on qpu-client's private `req`.
 */
async function billingFetch<T>(op: string, path: string, init?: RequestInit): Promise<T> {
  const base = billingUrl();
  if (!base) throw new Error("billing not configured");
  const auth = await authHeader();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { authorization: auth, ...init?.headers },
  });
  if (!res.ok) throw new BillingHttpError(op, res.status);
  return (await res.json()) as T;
}

async function createSession(body: Record<string, unknown>): Promise<string> {
  const { url } = await billingFetch<{ url: string }>("checkout", "/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return url;
}

/**
 * Create a Checkout Session for a subscription tier or a fixed credit pack and
 * return its hosted URL. The caller redirects the browser there.
 */
export async function startCheckout(lookupKey: CheckoutLookupKey): Promise<string> {
  return createSession({ lookupKey });
}

/**
 * Create a Checkout Session for a custom whole-dollar top-up (credits are
 * granted 1:1 at the $0.01 peg, computed server-side).
 */
export async function startTopUp(amountUsd: number): Promise<string> {
  if (!Number.isInteger(amountUsd) || amountUsd < TOPUP_MIN_USD || amountUsd > TOPUP_MAX_USD) {
    throw new Error(`top-up must be a whole dollar amount from ${TOPUP_MIN_USD} to ${TOPUP_MAX_USD}`);
  }
  return createSession({ amountUsd });
}

/** Open the Stripe Billing Portal for the signed-in customer; returns its URL. */
export async function openPortal(): Promise<string> {
  const { url } = await billingFetch<{ url: string }>("portal", "/portal", {
    method: "POST",
  });
  return url;
}

/** The caller's wallet — tier, credit balance, and subscription status. */
export async function getWallet(): Promise<Wallet> {
  return billingFetch<Wallet>("wallet", "/wallet");
}
