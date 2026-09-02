// What this handler sells, what it must be told about, and the API version it
// speaks — with ZERO imports.
//
// These four constants are the contract between the deployed function and the
// operator scripts under scripts/stripe/ that audit the Stripe Dashboard against
// it. They used to live in index.mjs, whose first statements import
// @aws-sdk/client-dynamodb, @aws-sdk/client-secrets-manager and stripe. That made
// `make stripe-parity` unrunnable on a clean checkout — the parity scripts use
// raw fetch and touch none of those SDKs, but importing one constant dragged all
// three in, and lambda/stripe/node_modules is not committed. Splitting the
// constants out is what lets those scripts keep their stated promise: plain node,
// no build step, nothing to install.
//
// index.mjs re-exports every name here, so nothing that imported them before had
// to change.

/**
 * The API version this integration is pinned to, in ONE place.
 *
 * It had three representations and no source of truth: a string literal inside
 * index.mjs's handler factory, a regex scrape of that file in two scripts (each
 * taking the FIRST quoted `apiVersion:` in the file, so a second one anywhere
 * would silently repin every endpoint those scripts create), and a fourth copy
 * hand-typed into verify-live-checkout.mjs. Pinning the version is the entire
 * premise of that tooling.
 *
 * Note what it does and does not govern: this pin shapes our OUTBOUND REST
 * calls. The shape of an inbound event is decided by the version pinned on the
 * WEBHOOK ENDPOINT, which is creation-only and is what provision-sandbox.mjs and
 * rotate-webhook-endpoint.mjs set — to this same value, deliberately, so nobody
 * debugs a difference that does not exist.
 */
export const STRIPE_API_VERSION = "2026-06-24.dahlia";

/**
 * Exactly the event types this handler acts on. Exported so a test can assert
 * it matches the switch's cases, and so the Dashboard subscription in the
 * runbook has a single source of truth to be checked against. A type we handle
 * but never receive is dead code; one we receive but ignore is silent loss.
 */
export const REQUIRED_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "invoice.paid",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.refunded",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
];

// The published catalog's lookup keys -> what checking out each one means.
// A /checkout request may name ONLY these keys, so a caller can never coerce an
// arbitrary Stripe price or credit amount. The credit counts are the server-
// side source of truth (mirroring web/src/lib/pricing.ts): they are written
// into Stripe metadata at session creation and read back, verbatim, by the
// webhook, so the wallet is never at the mercy of a mis-tagged price.
export const CATALOG = {
  ql_plus_monthly: { mode: "subscription", tier: "plus", credits: 1900 },
  ql_pro_monthly: { mode: "subscription", tier: "pro", credits: 6500 },
  ql_credits_500: { mode: "payment", tier: null, credits: 500 },
  ql_credits_2000: { mode: "payment", tier: null, credits: 2000 },
  ql_credits_5000: { mode: "payment", tier: null, credits: 5000 },
  ql_credits_10000: { mode: "payment", tier: null, credits: 10000 },
};

// Custom top-ups: any whole-dollar amount in [MIN, MAX], credited 1:1 at the
// $0.01 peg (100 credits per dollar). Priced ad hoc via price_data against the
// catalog's ql_credits product, so the Stripe dashboard groups every top-up —
// fixed pack or custom — under one product. The ceiling bounds fraud and
// chargeback exposure per transaction, not legitimate use.
export const CUSTOM_TOPUP_MIN_USD = 5;
export const CUSTOM_TOPUP_MAX_USD = 500;
export const CUSTOM_TOPUP_PRODUCT = "ql_credits";
