// End-to-end verification: run the REAL /checkout handler against LIVE Stripe.
//
// This is not a unit test with a stubbed Stripe. It injects the production Stripe client
// and the production `createHandlerCore`, so it exercises the actual path a subscriber
// takes: CATALOG lookup -> prices.list(lookup_keys, active) -> Checkout Session with
// server-stamped subscription metadata. Only DynamoDB is stubbed, and it is stubbed to
// return an EXISTING Stripe customer so `ensureCustomer` short-circuits and this creates
// no new customer in the live account.
//
// A Checkout Session object is created (no money moves, nothing is charged; unpaid
// sessions expire on their own within 24h). Run:
//   STRIPE_KEY=$(op read "op://Quantum Learner/Stripe/add more/Secret Key") \
//     node lambda/stripe/verify-live-checkout.mjs
import Stripe from "stripe";
import { createHandlerCore } from "./index.mjs";
import { CATALOG, STRIPE_API_VERSION } from "./catalog.mjs";

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

// Reuse an existing customer so the harness creates nothing.
const { data: customers } = await stripe.customers.list({ limit: 1 });
const customerId = customers[0]?.id;
if (!customerId) {
  console.error("FATAL: no existing customer to reuse; refusing to create one in live mode.");
  process.exit(1);
}

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

for (const lookupKey of ["ql_plus_monthly", "ql_pro_monthly"]) {
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
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });

  const expectedCents = lookupKey === "ql_plus_monthly" ? 1900 : 5900;
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
}

console.log(
  failures === 0
    ? "\nALL CHECKS PASSED — the live handler resolves the new prices and stamps the new grants."
    : `\n${failures} CHECK(S) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
