// Direct tests for fulfillment: the two grant paths, the debt split they share,
// and the Stripe-shape helpers, driven against the stateful stub with no router
// in between. index.test.mjs still proves each event type reaches the right
// path; these pin what the path does once it is reached.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWalletStore } from "./wallet-store.mjs";
import { CLAWBACK_UNRECLAIMED } from "./clawback.mjs";
import {
  createFulfillment,
  GRANT_WITHHELD,
  idOf,
  invoiceSubscriptionId,
  looksSubscriptionInvoice,
} from "./fulfillment.mjs";
import { ledgerDdb, recording, racing } from "./__fixtures__/ledger-ddb.mjs";
import { captureConsoleError } from "./__fixtures__/console.mjs";

const TABLE = "quantum-stripe-wallet";

/** The two Stripe calls the invoice path makes, canned. */
function stubStripe({ subscription, invoice, retrieveThrows } = {}) {
  const calls = { subsRetrieve: [], invoicesRetrieve: [] };
  return {
    calls,
    subscriptions: {
      retrieve: async (id) => {
        calls.subsRetrieve.push(id);
        return subscription ?? { metadata: {} };
      },
    },
    invoices: {
      retrieve: async (id, opts) => {
        calls.invoicesRetrieve.push({ id, opts });
        if (retrieveThrows) throw Object.assign(new Error("boom"), { name: "StripeConnectionError" });
        return invoice ?? { payments: { data: [] } };
      },
    },
  };
}

function fulfillment(ddb, stripeOver) {
  const store = createWalletStore({ ddb, tableName: TABLE, eventTtlSeconds: 60 });
  const stripe = stubStripe(stripeOver);
  return { ...createFulfillment({ stripe, store }), stripe };
}

const wallet = (attrs) => ({ "WALLET#user-9": { pk: { S: "WALLET#user-9" }, ...attrs } });
const owed = (ddb) => ddb.wallet("user-9").clawbackOwedCredits?.N ?? "0";
const txCount = (ddb) => ddb.calls.filter((c) => c.name === "TransactWriteItemsCommand").length;

const topup = (over = {}) => ({
  id: "cs_1",
  mode: "payment",
  payment_status: "paid",
  payment_intent: "pi_topup",
  client_reference_id: "user-9",
  amount_total: 2000,
  metadata: { credits: "2000" },
  ...over,
});
const EVT = { id: "evt_cs", type: "checkout.session.completed" };
const INVOICE = { id: "evt_inv", type: "invoice.paid" };
const modernInvoice = (over = {}) => ({
  id: "in_1",
  billing_reason: "subscription_cycle",
  amount_paid: 1900,
  parent: { type: "subscription_details", subscription_details: { subscription: "sub_1" } },
  ...over,
});
const SUBSCRIPTION = { metadata: { userId: "user-9", tier: "plus", credits: "1900" } };
const PAYMENTS = { payments: { data: [{ payment: { payment_intent: "pi_renewal" } }] } };

// ---- the Stripe-shape helpers ------------------------------------------------

test("idOf normalizes a bare id, an expanded object, and nothing", () => {
  assert.equal(idOf("pi_1"), "pi_1");
  assert.equal(idOf({ id: "sub_1", object: "subscription" }), "sub_1");
  assert.equal(idOf(null), undefined);
  assert.equal(idOf(undefined), undefined);
  assert.equal(idOf({}), undefined);
  assert.equal(idOf({ id: 42 }), undefined, "an id is a string or it is not an id");
});

test("invoiceSubscriptionId reads the modern shape first, then the legacy one, expanded or bare", () => {
  assert.equal(invoiceSubscriptionId(modernInvoice()), "sub_1");
  assert.equal(
    invoiceSubscriptionId(modernInvoice({ parent: { type: "subscription_details", subscription_details: { subscription: { id: "sub_x" } } } })),
    "sub_x"
  );
  assert.equal(invoiceSubscriptionId({ subscription: "sub_legacy" }), "sub_legacy");
  assert.equal(invoiceSubscriptionId({ subscription: { id: "sub_legacy_obj" } }), "sub_legacy_obj");
  assert.equal(
    invoiceSubscriptionId({ ...modernInvoice(), subscription: "sub_legacy" }),
    "sub_1",
    "when both are present the modern location wins"
  );
  assert.equal(invoiceSubscriptionId({ parent: { type: "subscription_details", subscription_details: null } }), undefined);
  assert.equal(invoiceSubscriptionId({ billing_reason: "manual", parent: null }), undefined);
});

test("looksSubscriptionInvoice: parent.type OR a subscription billing_reason; one-offs stay quiet", () => {
  assert.equal(looksSubscriptionInvoice(modernInvoice()), true);
  assert.equal(looksSubscriptionInvoice({ billing_reason: "subscription_create" }), true, "survives another relocation of the id");
  assert.equal(looksSubscriptionInvoice({ billing_reason: "subscription_cycle", parent: null }), true);
  assert.equal(looksSubscriptionInvoice({ billing_reason: "manual", parent: null }), false);
  assert.equal(looksSubscriptionInvoice({ parent: { type: "quote_details" } }), false);
  assert.equal(looksSubscriptionInvoice({}), false);
});

// ---- the debt split ------------------------------------------------------------

test("splitAgainstDebt: no debt grants everything with no OCC token; debt is paid down first and pinned", async () => {
  const clean = fulfillment(ledgerDdb(wallet({ credits: { N: "100" } })));
  assert.deepEqual(await clean.splitAgainstDebt("user-9", 2000), { deltaCredits: 2000, owedCredits: 0 });

  const absent = fulfillment(ledgerDdb());
  assert.deepEqual(await absent.splitAgainstDebt("user-9", 2000), { deltaCredits: 2000, owedCredits: 0 }, "no row is no debt");

  const partial = fulfillment(ledgerDdb(wallet({ clawbackOwedCredits: { N: "800" } })));
  assert.deepEqual(await partial.splitAgainstDebt("user-9", 2000), { deltaCredits: 1200, owedCredits: -800, expectedOwed: 800 });

  const larger = fulfillment(ledgerDdb(wallet({ clawbackOwedCredits: { N: "5000" } })));
  assert.deepEqual(
    await larger.splitAgainstDebt("user-9", 500),
    { deltaCredits: 0, owedCredits: -500, expectedOwed: 5000 },
    "nothing spendable: the learner is buying their way back to zero"
  );
});

test("grantThroughDebt applies the split exactly once and reports what moved", async () => {
  const ddb = ledgerDdb(wallet({ credits: { N: "0" }, clawbackOwedCredits: { N: "800" } }));
  const { grantThroughDebt } = fulfillment(ddb);
  const res = await grantThroughDebt(EVT, "user-9", 2000, { setTier: "plus" });
  assert.deepEqual(res, { sub: "user-9", deltaCredits: 1200, owedDelta: -800, outcome: "applied" });
  assert.equal(ddb.wallet("user-9").credits.N, "1200");
  assert.equal(owed(ddb), "0");
  assert.equal(ddb.wallet("user-9").tier.S, "plus", "the extra fields ride the same transaction");

  const replay = await grantThroughDebt(EVT, "user-9", 2000, {});
  assert.equal(replay.outcome, "replay");
  assert.equal(ddb.wallet("user-9").credits.N, "1200", "the same event grants nothing twice");
});

test("grantThroughDebt re-reads the debt after a lost paydown race instead of compounding it", async () => {
  // This delivery reads owed=800; a concurrent event clears the debt before the
  // write commits. The wallet leg's OCC token cancels the transaction; the retry
  // reads owed=0 and grants in full — never ADD -800 into a negative debt.
  const ddb = recording(
    racing(ledgerDdb(wallet({ credits: { N: "0" }, clawbackOwedCredits: { N: "800" } })), (store) => {
      store.set("WALLET#user-9", { ...store.get("WALLET#user-9"), clawbackOwedCredits: { N: "0" } });
    })
  );
  const res = await fulfillment(ddb).grantThroughDebt(EVT, "user-9", 2000, {});
  assert.equal(txCount(ddb), 2, "one lost race, one retry");
  assert.deepEqual(res, { sub: "user-9", deltaCredits: 2000, owedDelta: 0, outcome: "applied" });
  assert.equal(ddb.wallet("user-9").credits.N, "2000");
  assert.equal(owed(ddb), "0", "never negative");
});

test("grantThroughDebt contended past the budget throws with the event type", async () => {
  const ddb = recording(
    racing(
      ledgerDdb(wallet({ credits: { N: "0" }, clawbackOwedCredits: { N: "8000" } })),
      (store, attempt) => {
        store.set("WALLET#user-9", { ...store.get("WALLET#user-9"), clawbackOwedCredits: { N: String(8000 - attempt * 100) } });
      },
      { times: Infinity }
    )
  );
  await assert.rejects(
    () => fulfillment(ddb).grantThroughDebt(EVT, "user-9", 2000, {}),
    /checkout\.session\.completed: debt paydown contended past retry budget for user-9/
  );
  assert.equal(txCount(ddb), 4);
});

// ---- Checkout Sessions -----------------------------------------------------------

test("an unpaid session writes nothing and stays silent — the money has not moved yet", async () => {
  const ddb = recording(ledgerDdb());
  const { fulfillCheckoutSession } = fulfillment(ddb);
  let res;
  const lines = await captureConsoleError(async () => {
    res = await fulfillCheckoutSession(EVT, topup({ payment_status: "unpaid" }));
  });
  assert.equal(res, undefined);
  assert.equal(ddb.calls.length, 0);
  assert.deepEqual(lines, []);
});

test("a settled top-up grants through the debt split and writes a priced receipt", async () => {
  const ddb = ledgerDdb(wallet({ credits: { N: "0" }, clawbackOwedCredits: { N: "800" } }));
  const res = await fulfillment(ddb).fulfillCheckoutSession(EVT, topup());
  assert.deepEqual(res, { sub: "user-9", deltaCredits: 1200, owedDelta: -800, outcome: "applied" });
  assert.equal(ddb.wallet("user-9").credits.N, "1200");
  assert.equal(owed(ddb), "0");
  const receipt = ddb.receipt("pi_topup");
  assert.equal(receipt.sub.S, "user-9");
  assert.equal(receipt.purchasedCredits.N, "2000", "the FULL grant, not the post-garnish remainder");
  assert.equal(receipt.amountPaidCents.N, "2000", "the denominator a partial dispute needs");
  assert.ok(ddb.store.has("EVENT#evt_cs"));
});

test("no_payment_required still fulfills, and without a PaymentIntent writes no receipt", async () => {
  const ddb = ledgerDdb();
  await fulfillment(ddb).fulfillCheckoutSession(EVT, topup({ payment_status: "no_payment_required", payment_intent: null }));
  assert.equal(ddb.wallet("user-9").credits.N, "2000");
  assert.equal([...ddb.store.keys()].some((k) => k.startsWith("RECEIPT#")), false, "a falsy key must never merge purchases");
});

test("a settled session with nobody to credit leaves the pinned phrase and no write", async () => {
  const ddb = recording(ledgerDdb());
  const lines = await captureConsoleError(() => fulfillment(ddb).fulfillCheckoutSession(EVT, topup({ client_reference_id: undefined })));
  assert.equal(ddb.calls.length, 0);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].join(" ").includes(GRANT_WITHHELD), "the phrase UncreditedInvoiceMetricFilter pins");
  assert.match(lines[0].join(" "), /cs_1/);
});

test("a settled top-up with unusable metadata.credits grants nothing and says so", async () => {
  for (const credits of ["not-a-number", "0", "-5", undefined]) {
    const ddb = recording(ledgerDdb());
    const lines = await captureConsoleError(() =>
      fulfillment(ddb).fulfillCheckoutSession(EVT, topup({ metadata: credits === undefined ? {} : { credits } }))
    );
    assert.equal(ddb.calls.length, 0, `credits=${credits}`);
    assert.equal(lines.length, 1, `credits=${credits}`);
    assert.ok(lines[0].join(" ").includes(GRANT_WITHHELD));
  }
});

test("a subscription session lights the tier immediately and grants no credits", async () => {
  const ddb = ledgerDdb();
  const res = await fulfillment(ddb).fulfillCheckoutSession(EVT, topup({ mode: "subscription", metadata: { tier: "pro" } }));
  assert.deepEqual(res, { sub: "user-9", outcome: "applied" });
  const w = ddb.wallet("user-9");
  assert.equal(w.tier.S, "pro");
  assert.equal(w.subscriptionStatus.S, "active");
  assert.equal(w.credits, undefined, "the period's credits arrive on invoice.paid");
});

// ---- paid invoices ---------------------------------------------------------------

test("a paid subscription invoice grants the period's credits, lights the tier, and writes a receipt keyed by the invoice's PaymentIntent", async () => {
  const ddb = ledgerDdb();
  const f = fulfillment(ddb, { subscription: SUBSCRIPTION, invoice: PAYMENTS });
  const res = await f.fulfillInvoicePaid(INVOICE, modernInvoice());
  assert.deepEqual(res, { sub: "user-9", deltaCredits: 1900, owedDelta: 0, outcome: "applied" });
  assert.deepEqual(f.stripe.calls.subsRetrieve, ["sub_1"]);
  assert.deepEqual(f.stripe.calls.invoicesRetrieve, [{ id: "in_1", opts: { expand: ["payments"] } }]);
  const w = ddb.wallet("user-9");
  assert.equal(w.credits.N, "1900");
  assert.equal(w.tier.S, "plus");
  assert.equal(w.subscriptionStatus.S, "active");
  const receipt = ddb.receipt("pi_renewal");
  assert.equal(receipt.purchasedCredits.N, "1900");
  assert.equal(receipt.amountPaidCents.N, "1900");
});

test("a renewal garnishes the debt FULLY before anything becomes spendable; the receipt records the full grant", async () => {
  const ddb = ledgerDdb(wallet({ credits: { N: "0" }, clawbackOwedCredits: { N: "2500" } }));
  const res = await fulfillment(ddb, { subscription: SUBSCRIPTION, invoice: PAYMENTS }).fulfillInvoicePaid(INVOICE, modernInvoice());
  assert.deepEqual(res, { sub: "user-9", deltaCredits: 0, owedDelta: -1900, outcome: "applied" });
  assert.equal(ddb.wallet("user-9").credits.N, "0");
  assert.equal(owed(ddb), "600");
  assert.equal(ddb.receipt("pi_renewal").purchasedCredits.N, "1900");
});

test("an invoice with no resolvable subscription: silent for a one-off, the pinned phrase for a subscription invoice", async () => {
  const quiet = recording(ledgerDdb());
  const quietLines = await captureConsoleError(() =>
    fulfillment(quiet).fulfillInvoicePaid(INVOICE, { id: "in_manual", billing_reason: "manual", parent: null })
  );
  assert.deepEqual(quietLines, []);
  assert.equal(quiet.calls.length, 0);

  const loud = recording(ledgerDdb());
  const f = fulfillment(loud);
  const lines = await captureConsoleError(() =>
    f.fulfillInvoicePaid(INVOICE, modernInvoice({ parent: { type: "subscription_details", subscription_details: null } }))
  );
  assert.equal(loud.calls.length, 0, "nothing granted");
  assert.equal(f.stripe.calls.subsRetrieve.length, 0, "no Stripe round-trip on an unresolvable id");
  assert.equal(lines.length, 1);
  assert.ok(lines[0].join(" ").includes(GRANT_WITHHELD));
  assert.match(lines[0].join(" "), /in_1/);
});

test("a subscription with no metadata.userId cannot be attributed: pinned phrase, no write", async () => {
  const ddb = recording(ledgerDdb());
  const lines = await captureConsoleError(() => fulfillment(ddb).fulfillInvoicePaid(INVOICE, modernInvoice()));
  assert.equal(ddb.calls.length, 0);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].join(" ").includes(GRANT_WITHHELD));
  assert.match(lines[0].join(" "), /sub_1/);
});

test("no parseable credits: the tier still lights, the period is withheld, and the phrase says so", async () => {
  const ddb = recording(ledgerDdb());
  const f = fulfillment(ddb, { subscription: { metadata: { userId: "user-9", tier: "plus" } } });
  let res;
  const lines = await captureConsoleError(async () => {
    res = await f.fulfillInvoicePaid(INVOICE, modernInvoice());
  });
  assert.deepEqual(res, { sub: "user-9", outcome: "applied" });
  assert.equal(ddb.wallet("user-9").tier.S, "plus");
  assert.equal(ddb.wallet("user-9").credits, undefined);
  assert.equal(f.stripe.calls.invoicesRetrieve.length, 0, "no receipt to key, so no expand round-trip");
  assert.equal(lines.length, 1);
  assert.ok(lines[0].join(" ").includes(GRANT_WITHHELD));
});

test("no PaymentIntent resolvable: the grant still lands, without a receipt, and CLAWBACK_UNRECLAIMED says why", async () => {
  const ddb = ledgerDdb();
  const lines = await captureConsoleError(() =>
    fulfillment(ddb, { subscription: SUBSCRIPTION }).fulfillInvoicePaid(INVOICE, modernInvoice())
  );
  assert.equal(ddb.wallet("user-9").credits.N, "1900", "the buyer paid");
  assert.equal([...ddb.store.keys()].some((k) => k.startsWith("RECEIPT#")), false, "not auto-refundable");
  assert.equal(lines.length, 1);
  assert.ok(lines[0].join(" ").includes(CLAWBACK_UNRECLAIMED));
});

test("invoicePaymentIntent swallows a failed expand, logs it, and returns nothing", async () => {
  const f = fulfillment(ledgerDdb(), { retrieveThrows: true });
  let pi;
  const lines = await captureConsoleError(async () => {
    pi = await f.invoicePaymentIntent("in_1");
  });
  assert.equal(pi, undefined);
  assert.equal(lines.length, 1);
  assert.match(lines[0].join(" "), /could not expand payments/);
  assert.match(lines[0].join(" "), /StripeConnectionError/);
});
