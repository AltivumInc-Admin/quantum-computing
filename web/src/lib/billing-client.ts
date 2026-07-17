// The billing backend client (quantum-stripe): create a Checkout Session, open
// the Billing Portal, read the wallet. Modeled on sync-client / qpu-client —
// the base URL is env-gated (NEXT_PUBLIC_BILLING_URL), auth is the Cognito ID
// token via aws-amplify's fetchAuthSession, and the aws-amplify import is LAZY
// so this module is import-safe before the auth bridge configures Amplify.

import { isAuthConfigured } from "./auth-config";

/** All credit top-up lookup keys, matching the backend CATALOG + Stripe. */
export type TopUpLookupKey =
  | "ql_credits_500"
  | "ql_credits_2000"
  | "ql_credits_5000"
  | "ql_credits_10000";

export type CheckoutLookupKey = "ql_plus_monthly" | "ql_pro_monthly" | TopUpLookupKey;

export interface Wallet {
  tier: "free" | "plus" | "pro";
  credits: number;
  subscriptionStatus: string | null;
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
 * Create a Checkout Session for a subscription tier or a credit top-up and
 * return its hosted URL. The caller redirects the browser there.
 */
export async function startCheckout(lookupKey: CheckoutLookupKey): Promise<string> {
  const base = billingUrl();
  if (!base) throw new Error("billing not configured");
  const auth = await authHeader();
  const res = await fetch(`${base}/checkout`, {
    method: "POST",
    headers: { authorization: auth, "content-type": "application/json" },
    body: JSON.stringify({ lookupKey }),
  });
  if (!res.ok) throw new BillingHttpError("checkout", res.status);
  const { url } = (await res.json()) as { url: string };
  return url;
}

/** Open the Stripe Billing Portal for the signed-in customer; returns its URL. */
export async function openPortal(): Promise<string> {
  const base = billingUrl();
  if (!base) throw new Error("billing not configured");
  const auth = await authHeader();
  const res = await fetch(`${base}/portal`, {
    method: "POST",
    headers: { authorization: auth },
  });
  if (!res.ok) throw new BillingHttpError("portal", res.status);
  const { url } = (await res.json()) as { url: string };
  return url;
}

/** The caller's wallet — tier, credit balance, and subscription status. */
export async function getWallet(): Promise<Wallet> {
  const base = billingUrl();
  if (!base) throw new Error("billing not configured");
  const auth = await authHeader();
  const res = await fetch(`${base}/wallet`, { headers: { authorization: auth } });
  if (!res.ok) throw new BillingHttpError("wallet", res.status);
  return (await res.json()) as Wallet;
}
