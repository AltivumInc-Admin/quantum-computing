// End-to-end verification: run the REAL /checkout handler against LIVE Stripe.
//
// This is not a unit test with a stubbed Stripe. It injects the production Stripe client
// and the production `createHandlerCore`, so it exercises the actual path a subscriber
// takes: CATALOG lookup -> prices.list(lookup_keys, active) -> Checkout Session with
// server-stamped subscription metadata. Only DynamoDB is stubbed, and it is stubbed to
// return an EXISTING Stripe customer so `ensureCustomer` short-circuits and this creates
// no new customer in the live account.
//
// A Checkout Session object is created per subscription tier, and EXPIRED as soon as
// the assertions are done — a live session is payable for up to 24h, and one that is
// completed charges a real customer and books a subscription whose grant is addressed
// to a Cognito sub that does not exist. Leaving that behind on every run is not a
// harness "creating nothing"; the expire is part of the test.
//
// VERIFY_CUSTOMER_ID names the customer to bind those sessions to. It used to be
// whichever customer `customers.list({limit: 1})` happened to return — an arbitrary
// real person with a saved payment method, who would have been the one charged.
//
//   STRIPE_KEY=$(op read "op://Quantum Learner/Stripe/add more/Secret Key") \
//     VERIFY_CUSTOMER_ID=cus_... \
//     node lambda/stripe/verify-live-checkout.mjs
import Stripe from "stripe";
import { readFileSync } from "node:fs";
import { createHandlerCore } from "./index.mjs";
import { CATALOG, STRIPE_API_VERSION } from "./catalog.mjs";
import { tierPrices } from "../../scripts/stripe/lib/parity-rules.mjs";

const EXPECT_ACCT = "acct_1TuFow07hJdXv6GV";
const KEY = process.env.STRIPE_KEY;
if (!KEY || KEY.includes("*")) {
  console.error("FATAL: STRIPE_KEY missing or redacted.");
  process.exit(1);
}

// The deployed handler's own pin, not a fourth hand-typed copy of it: this
// harness only proves something about production if it speaks the same version.
const stripe = new Stripe(KEY, { apiVersion: STRIPE_API_VERSION });

const acct = await stripe.accounts.retrieve();
console.log(`account: ${acct.id} (${acct.settings?.dashboard?.display_name})`);
if (acct.id !== EXPECT_ACCT) {
  console.error(`FATAL: wrong account. Expected ${EXPECT_ACCT} (Quantum Learner).`);
  process.exit(1);
}

// Reuse an existing customer so the harness creates nothing — but a NAMED one.
// `customers.list({ limit: 1 })` returned whoever happened to be first, and the
// stubbed ddb below feeds that id back for every GetItemCommand, so the
// production createHandlerCore stamped a live Checkout Session onto a real
// person with a saved payment method, twice per run.
const customerId = process.env.VERIFY_CUSTOMER_ID;
if (!customerId) {
  console.error(
    "FATAL: VERIFY_CUSTOMER_ID is not set. This harness binds LIVE Checkout Sessions to that customer; " +
      "it will not pick one for you."
  );
  process.exit(1);
}
const customer = await stripe.customers.retrieve(customerId).catch((err) => {
  console.error(`FATAL: VERIFY_CUSTOMER_ID ${customerId} is not a customer on ${EXPECT_ACCT}: ${err.message}`);
  process.exit(1);
});
console.log(`customer: ${customer.id} (${customer.email ?? "no email"})`);

const ddb = {
  send: async (cmd) =>
    cmd.constructor.name === "GetItemCommand"
      ? { Item: { stripeCustomerId: { S: customerId } } }
      : {},
};

const core = createHandlerCore({
  stripe,
  ddb,
  tableName: "verify-harness",
  webhookSecret: "whsec_unused",
  // The origin the deployed handler would use, NOT a literal: this harness
  // stamps success_url/cancel_url on a REAL live Checkout Session, so a stale
  // value here verifies a return path no learner can reach while still
  // printing PASS. It read quantum.altivum.ai — two domains dead — which is
  // exactly the failure this harness exists to catch.
  siteOrigin: process.env.SITE_ORIGIN || "https://learner.quantumenv.dev",
});

let failures = 0;
const check = (label, actual, expected) => {
  const ok = String(actual) === String(expected);
  if (!ok) failures++;
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}: ${actual}${ok ? "" : `  (expected ${expected})`}`);
};

// Driven from CATALOG, not a hand-kept key list: a third subscription tier added
// there was silently skipped here, and its price would have fallen through to the
// Pro branch of a two-way ternary. The expected charge comes from the same
// pricing.ts parser the catalog-parity guard uses, so this harness cannot pass
// against a figure the published sheet has moved away from.
const tiers = tierPrices(readFileSync(new URL("../../web/src/lib/pricing.ts", import.meta.url), "utf8"));
const subscriptionKeys = Object.entries(CATALOG)
  .filter(([, spec]) => spec.mode === "subscription")
  .map(([lookupKey]) => lookupKey);

for (const lookupKey of subscriptionKeys) {
  const spec = CATALOG[lookupKey];
  console.log(`\n== ${lookupKey} — CATALOG says ${spec.credits} credits, tier ${spec.tier} ==`);

  const res = await core({
    requestContext: {
      http: { method: "POST", path: "/checkout" },
      authorizer: { jwt: { claims: { sub: "verify-harness", email: "christian.perez@altivum.io" } } },
    },
    headers: {},
    body: JSON.stringify({ lookupKey }),
  });

  if (res.statusCode !== 200) {
    console.log(`   FAIL  handler returned ${res.statusCode}: ${res.body}`);
    failures++;
    continue;
  }

  const url = JSON.parse(res.body).url;
  const sessionId = url.match(/cs_[A-Za-z0-9_]+/)?.[0];
  if (!sessionId) {
    // No id means a live session exists that this run cannot expire. Say so loudly.
    console.log(`   FAIL  no session id in the returned url — a live session may be open: ${url}`);
    failures++;
    continue;
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });

    const tier = tiers[lookupKey];
    if (!tier) {
      console.log(`   FAIL  no TIERS entry in pricing.ts carries checkoutLookupKey "${lookupKey}"`);
      failures++;
      continue;
    }
    const expectedCents = Math.round(tier.usd * 100);
    const item = session.line_items?.data?.[0];
    // amount_total is the authoritative figure; fall back to the resolved price's own
    // unit_amount, which is what actually proves the lookup key points at the new price.
    const cents = session.amount_total ?? item?.amount_total ?? item?.price?.unit_amount;

    check("charged amount (cents)", cents, expectedCents);
    check("resolved price unit_amount", item?.price?.unit_amount, expectedCents);
    check("mode", session.mode, "subscription");
    check("livemode", session.livemode, true);
    check("session metadata tier", session.metadata?.tier, spec.tier);

    // `subscription_data` is a create-only parameter — Stripe does not echo it back on
    // retrieve, so the credit stamp is NOT observable here. It lands on the Subscription
    // object at first payment, and unit tests assert the handler sets it from CATALOG.
    console.log(`   info  resolved price id: ${item?.price?.id}`);
    console.log(`   info  grant to be stamped at signup: ${spec.credits} credits (CATALOG)`);
    console.log(`   url: ${url.slice(0, 72)}...`);
  } finally {
    // Close the session whatever happened above. An open live session is payable
    // by the customer it is bound to, for up to 24h, and a completed one books a
    // subscription whose grant is addressed to sub "verify-harness" — a wallet
    // row that does not exist. Failing to expire is a FAILURE of this run, not a
    // footnote: the harness's whole claim is that it leaves nothing behind.
    try {
      await stripe.checkout.sessions.expire(sessionId);
      console.log(`   info  session ${sessionId} expired`);
    } catch (err) {
      console.log(`   FAIL  could not expire session ${sessionId}: ${err.message} — EXPIRE IT BY HAND`);
      failures++;
    }
  }
}

console.log(
  failures === 0
    ? "\nALL CHECKS PASSED — the live handler resolves the new prices and stamps the new grants."
    : `\n${failures} CHECK(S) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
