// Offline tests for quantum-stripe. No AWS, no network: DynamoDB and Stripe are
// both stubbed and injected into createHandlerCore, mirroring lambda/sync.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandlerCore, lazyCore, CATALOG, SIGNATURE_REJECTED } from "./index.mjs";

const TABLE = "quantum-stripe-wallet";
const ORIGIN = "https://quantum.altivum.ai";
const SECRET = "whsec_test";

function makeEvent({ method = "GET", path = "/wallet", sub = "user-1", email, body, rawBody, headers } = {}) {
  return {
    requestContext: {
      http: { method, path },
      authorizer: sub ? { jwt: { claims: { sub, ...(email ? { email } : {}) } } } : undefined,
    },
    headers: headers ?? {},
    body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body),
  };
}

// Records every command and returns a canned response keyed by command class,
// or throws it if the canned value is an Error (the sync test idiom).
function stubDdb(responses = {}) {
  const calls = [];
  return {
    calls,
    send: async (cmd) => {
      calls.push(cmd);
      const r = responses[cmd.constructor.name];
      if (r instanceof Error) throw r;
      return r ?? {};
    },
  };
}

function stubStripe(over = {}) {
  const calls = {
    customersCreate: [],
    pricesList: [],
    sessionsCreate: [],
    portalCreate: [],
    subsRetrieve: [],
    constructEvent: [],
  };
  return {
    calls,
    customers: {
      create: async (p) => {
        calls.customersCreate.push(p);
        return over.customer ?? { id: "cus_new" };
      },
    },
    prices: {
      list: async (p) => {
        calls.pricesList.push(p);
        return over.prices ?? { data: [{ id: "price_resolved" }] };
      },
    },
    checkout: {
      sessions: {
        create: async (p) => {
          calls.sessionsCreate.push(p);
          return over.session ?? { id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" };
        },
      },
    },
    billingPortal: {
      sessions: {
        create: async (p) => {
          calls.portalCreate.push(p);
          return over.portal ?? { url: "https://billing.stripe.com/p/1" };
        },
      },
    },
    subscriptions: {
      retrieve: async (id) => {
        calls.subsRetrieve.push(id);
        return over.subscription ?? { metadata: {} };
      },
    },
    invoices: {
      // invoicePaymentIntent re-retrieves the invoice with payments expanded
      // (Basil removed Invoice.charge/payment_intent). Default: no payments
      // resolve, matching the pre-existing tests that assert the grant still
      // lands without a receipt leg.
      retrieve: async (id, opts) => {
        calls.invoicesRetrieve = calls.invoicesRetrieve ?? [];
        calls.invoicesRetrieve.push({ id, opts });
        return over.invoice ?? { payments: { data: [] } };
      },
    },
    webhooks: {
      constructEventAsync: async (raw, sig, secret) => {
        calls.constructEvent.push({ raw, sig, secret });
        if (over.constructThrows) throw new Error("bad signature");
        return over.event;
      },
    },
  };
}

const mk = (over) =>
  createHandlerCore({
    stripe: stubStripe(over?.stripe),
    ddb: over?.ddb ?? stubDdb(),
    tableName: TABLE,
    webhookSecret: SECRET,
    siteOrigin: ORIGIN,
  });

/** The transaction a delivery wrote, found by command NAME rather than call
 *  index — the handler reads the wallet's debt first on grant paths, so a
 *  positional pin silently grabs the wrong command. */
const txItems = (ddb) =>
  ddb.calls.find((c) => (c.constructor?.name ?? c.name) === "TransactWriteItemsCommand")?.input
    ?.TransactItems ??
  ddb.calls.find((c) => c.input?.TransactItems)?.input?.TransactItems;

// ---- CATALOG guardrail -----------------------------------------------------

test("CATALOG credit counts mirror the published pricing", () => {
  assert.equal(CATALOG.ql_plus_monthly.credits, 1900);
  assert.equal(CATALOG.ql_pro_monthly.credits, 6500);
  assert.equal(CATALOG.ql_credits_500.credits, 500);
  assert.equal(CATALOG.ql_credits_10000.credits, 10000);
  assert.equal(CATALOG.ql_plus_monthly.mode, "subscription");
  assert.equal(CATALOG.ql_credits_2000.mode, "payment");
});

// ---- auth ------------------------------------------------------------------

test("authenticated routes reject a request without a verified sub", async () => {
  const core = mk();
  const res = await core(makeEvent({ path: "/wallet", sub: null }));
  assert.equal(res.statusCode, 401);
});

// ---- GET /wallet -----------------------------------------------------------

test("GET /wallet defaults to the free tier and zero credits when absent", async () => {
  const core = createHandlerCore({
    stripe: stubStripe(),
    ddb: stubDdb({ GetItemCommand: {} }),
    tableName: TABLE,
    webhookSecret: SECRET,
    siteOrigin: ORIGIN,
  });
  const res = await core(makeEvent({ method: "GET", path: "/wallet" }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), {
    tier: "free",
    credits: 0,
    subscriptionStatus: null,
    clawbackOwedCredits: 0,
  });
});

test("GET /wallet returns the stored tier, balance, and status", async () => {
  const ddb = stubDdb({
    GetItemCommand: {
      Item: {
        pk: { S: "WALLET#user-1" },
        tier: { S: "plus" },
        credits: { N: "1890" },
        subscriptionStatus: { S: "active" },
      },
    },
  });
  const core = createHandlerCore({ stripe: stubStripe(), ddb, tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
  const res = await core(makeEvent({ method: "GET", path: "/wallet" }));
  assert.deepEqual(JSON.parse(res.body), {
    tier: "plus",
    credits: 1890,
    subscriptionStatus: "active",
    clawbackOwedCredits: 0,
  });
  // keyed by the WALLET# pk, never anything from the request body
  assert.equal(ddb.calls[0].input.Key.pk.S, "WALLET#user-1");
});

// ---- POST /checkout --------------------------------------------------------

test("POST /checkout rejects an unknown lookup key", async () => {
  const core = mk();
  const res = await core(makeEvent({ method: "POST", path: "/checkout", body: { lookupKey: "ql_free" } }));
  assert.equal(res.statusCode, 400);
});

test("POST /checkout creates a subscription session with server-set metadata", async () => {
  const ddb = stubDdb({ GetItemCommand: {} }); // no existing customer
  const stripe = stubStripe();
  const core = createHandlerCore({ stripe, ddb, tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
  const res = await core(
    makeEvent({ method: "POST", path: "/checkout", email: "a@b.co", body: { lookupKey: "ql_plus_monthly" } })
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).url, "https://checkout.stripe.com/c/cs_1");

  // a customer was created bound to the sub, then a subscription session built
  assert.equal(stripe.calls.customersCreate.length, 1);
  assert.equal(stripe.calls.customersCreate[0].metadata.userId, "user-1");
  const s = stripe.calls.sessionsCreate[0];
  assert.equal(s.mode, "subscription");
  assert.equal(s.client_reference_id, "user-1");
  assert.equal(s.customer, "cus_new");
  assert.equal(s.line_items[0].price, "price_resolved");
  // credits/tier are set server-side from CATALOG, not from the client.
  // NOTE: this stamp is permanent for the life of the subscription — invoice.paid reads
  // subscription.metadata.credits on every renewal, so repricing CATALOG changes NEW
  // subscribers only. Existing subscribers keep the grant they signed up with until their
  // subscription metadata is explicitly backfilled.
  assert.equal(s.subscription_data.metadata.credits, "1900");
  assert.equal(s.subscription_data.metadata.tier, "plus");
  assert.equal(s.subscription_data.metadata.userId, "user-1");
  // dynamic payment methods: payment_method_types must NEVER be set
  assert.equal("payment_method_types" in s, false);
});

test("POST /checkout reuses an existing Stripe customer", async () => {
  const ddb = stubDdb({
    GetItemCommand: { Item: { pk: { S: "WALLET#user-1" }, stripeCustomerId: { S: "cus_existing" } } },
  });
  const stripe = stubStripe();
  const core = createHandlerCore({ stripe, ddb, tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
  await core(makeEvent({ method: "POST", path: "/checkout", body: { lookupKey: "ql_pro_monthly" } }));
  assert.equal(stripe.calls.customersCreate.length, 0); // reused, not recreated
  assert.equal(stripe.calls.sessionsCreate[0].customer, "cus_existing");
});

/** A wallet already on a paid tier. Top-ups are subscriber-only, so every
 *  top-up test needs one; `stripeCustomerId` also short-circuits ensureCustomer. */
const paidWallet = (tier = "plus") =>
  stubDdb({
    GetItemCommand: {
      Item: { pk: { S: "WALLET#user-1" }, tier: { S: tier }, stripeCustomerId: { S: "cus_existing" } },
    },
  });

test("POST /checkout builds a one-time payment session for a top-up", async () => {
  const stripe = stubStripe();
  const core = createHandlerCore({ stripe, ddb: paidWallet(), tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
  await core(makeEvent({ method: "POST", path: "/checkout", body: { lookupKey: "ql_credits_2000" } }));
  const s = stripe.calls.sessionsCreate[0];
  assert.equal(s.mode, "payment");
  assert.equal(s.metadata.credits, "2000");
  assert.equal(s.metadata.kind, "topup");
  assert.equal("subscription_data" in s, false);
});

test("POST /checkout accepts a custom whole-dollar top-up and prices it ad hoc", async () => {
  const stripe = stubStripe();
  const core = createHandlerCore({ stripe, ddb: paidWallet("pro"), tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
  const res = await core(makeEvent({ method: "POST", path: "/checkout", body: { amountUsd: 37 } }));
  assert.equal(res.statusCode, 200);
  const s = stripe.calls.sessionsCreate[0];
  assert.equal(s.mode, "payment");
  // ad hoc price against the shared credits product, $37.00
  assert.equal(s.line_items[0].price_data.product, "ql_credits");
  assert.equal(s.line_items[0].price_data.unit_amount, 3700);
  assert.equal(s.line_items[0].price_data.currency, "usd");
  // credits computed SERVER-side at the 1:1 peg
  assert.equal(s.metadata.credits, "3700");
  assert.equal(s.metadata.kind, "topup");
  // no lookup-key price resolution happened
  assert.equal(stripe.calls.pricesList.length, 0);
});

test("POST /checkout rejects out-of-bounds or fractional custom amounts", async () => {
  const core = createHandlerCore({ stripe: stubStripe(), ddb: paidWallet(), tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
  for (const amountUsd of [4, 501, 12.5, -5, "20", 0]) {
    const res = await core(makeEvent({ method: "POST", path: "/checkout", body: { amountUsd } }));
    assert.equal(res.statusCode, 400, `amountUsd=${amountUsd} must be rejected`);
  }
});

// ---- top-ups are subscriber-only -------------------------------------------

test("POST /checkout refuses a top-up from a free account", async () => {
  // Free gets the curriculum and a capped tutor trial and nothing purchasable.
  // Selling credits to an account whose tier cannot spend them is a dead-weight
  // liability and a small fraud on the buyer.
  for (const body of [{ lookupKey: "ql_credits_2000" }, { amountUsd: 37 }]) {
    const stripe = stubStripe();
    const core = createHandlerCore({
      stripe,
      ddb: stubDdb({ GetItemCommand: {} }), // no wallet row => free
      tableName: TABLE,
      webhookSecret: SECRET,
      siteOrigin: ORIGIN,
    });
    const res = await core(makeEvent({ method: "POST", path: "/checkout", body }));
    assert.equal(res.statusCode, 403, `${JSON.stringify(body)} must be refused`);
    // and nothing was created on Stripe's side
    assert.equal(stripe.calls.sessionsCreate.length, 0);
    assert.equal(stripe.calls.customersCreate.length, 0);
  }
});

test("POST /checkout refuses a top-up after a subscription is cancelled", async () => {
  // customer.subscription.deleted resets tier to "free", so a lapsed subscriber
  // loses the top-up path with it — no separate Stripe round-trip needed.
  const ddb = stubDdb({
    GetItemCommand: { Item: { pk: { S: "WALLET#user-1" }, tier: { S: "free" }, credits: { N: "400" } } },
  });
  const core = createHandlerCore({ stripe: stubStripe(), ddb, tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
  const res = await core(makeEvent({ method: "POST", path: "/checkout", body: { amountUsd: 20 } }));
  assert.equal(res.statusCode, 403);
});

test("POST /checkout still allows a SUBSCRIPTION from a free account", async () => {
  // The gate is on top-ups only — subscribing is the entry point and must stay open.
  const stripe = stubStripe();
  const core = createHandlerCore({ stripe, ddb: stubDdb({ GetItemCommand: {} }), tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
  const res = await core(makeEvent({ method: "POST", path: "/checkout", body: { lookupKey: "ql_plus_monthly" } }));
  assert.equal(res.statusCode, 200);
  assert.equal(stripe.calls.sessionsCreate[0].mode, "subscription");
});

// ---- POST /portal ----------------------------------------------------------

test("POST /portal 400s before a customer exists, else returns a portal URL", async () => {
  const none = createHandlerCore({ stripe: stubStripe(), ddb: stubDdb({ GetItemCommand: {} }), tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
  assert.equal((await none(makeEvent({ method: "POST", path: "/portal" }))).statusCode, 400);

  const stripe = stubStripe();
  const has = createHandlerCore({
    stripe,
    ddb: stubDdb({ GetItemCommand: { Item: { stripeCustomerId: { S: "cus_1" } } } }),
    tableName: TABLE,
    webhookSecret: SECRET,
    siteOrigin: ORIGIN,
  });
  const res = await has(makeEvent({ method: "POST", path: "/portal" }));
  assert.equal(res.statusCode, 200);
  assert.equal(stripe.calls.portalCreate[0].customer, "cus_1");
});

// ---- POST /webhook ---------------------------------------------------------

test("POST /webhook rejects a missing or invalid signature", async () => {
  const core = mk();
  const missing = await core(makeEvent({ method: "POST", path: "/webhook", sub: null, rawBody: "{}" }));
  assert.equal(missing.statusCode, 400);

  const bad = createHandlerCore({
    stripe: stubStripe({ constructThrows: true }),
    ddb: stubDdb(),
    tableName: TABLE,
    webhookSecret: SECRET,
    siteOrigin: ORIGIN,
  });
  const res = await bad(
    makeEvent({ method: "POST", path: "/webhook", sub: null, rawBody: "{}", headers: { "stripe-signature": "t=1,v1=x" } })
  );
  assert.equal(res.statusCode, 400);
});

test("a rejected signature is ALERTABLE, not silent", async () => {
  // Found by rehearsing a signing-secret rotation against a real sandbox: after
  // the secret was rotated, every delivery to a still-warm container was
  // rejected — 24 invocations, 2-38ms each, wallet untouched, and NOT ONE log
  // line, because this branch was a bare `catch { return 400 }`. The money path
  // was completely down and the only evidence lived in Stripe's dashboard.
  //
  // A secret mismatch is the single most likely webhook outage (rotation, a
  // half-finished deploy, the wrong endpoint's secret), so it must page.
  const core = createHandlerCore({
    stripe: stubStripe({ constructThrows: true }),
    ddb: stubDdb(),
    tableName: TABLE,
    webhookSecret: SECRET,
    siteOrigin: ORIGIN,
  });
  let res;
  const lines = await captureConsoleError(async () => {
    res = await core(
      makeEvent({ method: "POST", path: "/webhook", sub: null, rawBody: "{}", headers: { "stripe-signature": "t=1,v1=x" } })
    );
  });
  assert.equal(res.statusCode, 400, "contract unchanged: Stripe must not retry a forgery forever");
  assert.equal(lines.length, 1, "a rejected signature must leave evidence in the log group");
  assert.ok(
    lines[0].join(" ").includes(SIGNATURE_REJECTED),
    `must carry the pinned phrase ${JSON.stringify(SIGNATURE_REJECTED)} so the metric filter can see it`
  );
});

test("webhook checkout.session.completed (top-up) grants credits atomically, once", async () => {
  const ddb = stubDdb();
  const event = {
    id: "evt_1",
    type: "checkout.session.completed",
    data: { object: { mode: "payment", client_reference_id: "user-9", metadata: { credits: "2000" } } },
  };
  const core = createHandlerCore({
    stripe: stubStripe({ event }),
    ddb,
    tableName: TABLE,
    webhookSecret: SECRET,
    siteOrigin: ORIGIN,
  });
  const res = await core(
    makeEvent({ method: "POST", path: "/webhook", sub: null, rawBody: "{}", headers: { "stripe-signature": "sig" } })
  );
  assert.equal(res.statusCode, 200);
  const tx = txItems(ddb);
  // one atomic transaction: record the event id (idempotency), add the credits
  assert.equal(tx[0].Put.Item.pk.S, "EVENT#evt_1");
  assert.equal(tx[0].Put.ConditionExpression, "attribute_not_exists(pk)");
  assert.equal(tx[1].Update.Key.pk.S, "WALLET#user-9");
  assert.match(tx[1].Update.UpdateExpression, /ADD credits :amt/);
  assert.equal(tx[1].Update.ExpressionAttributeValues[":amt"].N, "2000");
});

test("webhook is idempotent — a duplicate event grants nothing and still 200s", async () => {
  const cancelled = new Error("cancelled");
  cancelled.name = "TransactionCanceledException";
  cancelled.CancellationReasons = [{ Code: "ConditionalCheckFailed" }];
  const event = {
    id: "evt_dup",
    type: "checkout.session.completed",
    data: { object: { mode: "payment", client_reference_id: "user-9", metadata: { credits: "500" } } },
  };
  const core = createHandlerCore({
    stripe: stubStripe({ event }),
    ddb: stubDdb({ TransactWriteItemsCommand: cancelled }),
    tableName: TABLE,
    webhookSecret: SECRET,
    siteOrigin: ORIGIN,
  });
  const res = await core(
    makeEvent({ method: "POST", path: "/webhook", sub: null, rawBody: "{}", headers: { "stripe-signature": "sig" } })
  );
  assert.equal(res.statusCode, 200); // swallowed, not surfaced as an error
});

// The invoice.paid shape is the one place a stale mock cost real money: the
// original test here pinned the RETIRED top-level `subscription` field, so it
// stayed green for months while production granted zero subscription credits.
// The modern shape is the contract; the legacy shape is back-compat only.

/** Drive one signed webhook delivery of `event` and return { res, ddb, stripe }. */
async function deliverWebhook(event, stripeOver = {}) {
  const ddb = stubDdb();
  const stripe = stubStripe({ event, ...stripeOver });
  const core = createHandlerCore({ stripe, ddb, tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
  const res = await core(
    makeEvent({ method: "POST", path: "/webhook", sub: null, rawBody: "{}", headers: { "stripe-signature": "sig" } })
  );
  return { res, ddb, stripe };
}

/** Capture console.error for the duration of `fn` (node:test has no spy sugar). */
async function captureConsoleError(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args);
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return lines;
}

test("webhook invoice.paid grants period credits from the CURRENT parent.subscription_details shape", async () => {
  // This is what a modern Stripe endpoint actually sends: no top-level
  // `subscription` property exists on Invoice in stripe 18.5.0 at all.
  const event = {
    id: "evt_inv_modern",
    type: "invoice.paid",
    data: {
      object: {
        id: "in_modern",
        billing_reason: "subscription_create",
        parent: { type: "subscription_details", subscription_details: { subscription: "sub_1" } },
      },
    },
  };
  const { res, ddb, stripe } = await deliverWebhook(event, {
    subscription: { metadata: { userId: "user-7", tier: "pro", credits: "6200" } },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(stripe.calls.subsRetrieve, ["sub_1"]);
  const tx = txItems(ddb);
  assert.equal(tx[1].Update.Key.pk.S, "WALLET#user-7");
  assert.equal(tx[1].Update.ExpressionAttributeValues[":amt"].N, "6200");
  assert.equal(tx[1].Update.ExpressionAttributeValues[":tier"].S, "pro");
});

test("webhook invoice.paid credits a renewal when subscription_details is expanded, not an id", async () => {
  // parent.subscription_details.subscription is typed `string | Subscription`,
  // so an endpoint configured to expand it must not break the grant.
  const event = {
    id: "evt_inv_expanded",
    type: "invoice.paid",
    data: {
      object: {
        id: "in_expanded",
        billing_reason: "subscription_cycle",
        parent: { type: "subscription_details", subscription_details: { subscription: { id: "sub_exp" } } },
      },
    },
  };
  const { res, ddb, stripe } = await deliverWebhook(event, {
    subscription: { metadata: { userId: "user-8", tier: "plus", credits: "1890" } },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(stripe.calls.subsRetrieve, ["sub_exp"]); // the id, never the object
  assert.equal(txItems(ddb)[1].Update.ExpressionAttributeValues[":amt"].N, "1890");
});

test("webhook invoice.paid still credits the LEGACY top-level subscription field", async () => {
  // Back-compat only: an endpoint pinned to an API version from before the id
  // moved under `parent` sends this. Do NOT copy this shape into new tests.
  const event = {
    id: "evt_inv_legacy",
    type: "invoice.paid",
    data: { object: { id: "in_legacy", billing_reason: "subscription_cycle", subscription: "sub_1" } },
  };
  const { res, ddb, stripe } = await deliverWebhook(event, {
    subscription: { metadata: { userId: "user-7", tier: "pro", credits: "6200" } },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(stripe.calls.subsRetrieve, ["sub_1"]);
  assert.equal(txItems(ddb)[1].Update.ExpressionAttributeValues[":amt"].N, "6200");
});

test("webhook invoice.paid LOGS when a subscription invoice has no resolvable id", async () => {
  // The failure mode that hid the bug: return early, answer 200, Stripe never
  // retries, buyer silently uncredited. It must at least leave evidence.
  const event = {
    id: "evt_inv_unresolvable",
    type: "invoice.paid",
    data: {
      object: {
        id: "in_unresolvable",
        billing_reason: "subscription_cycle",
        parent: { type: "subscription_details", subscription_details: null },
      },
    },
  };
  let out;
  const lines = await captureConsoleError(async () => {
    out = await deliverWebhook(event);
  });
  assert.equal(out.res.statusCode, 200); // contract unchanged: no retry storm
  assert.equal(out.ddb.calls.length, 0); // nothing granted
  assert.equal(out.stripe.calls.subsRetrieve.length, 0);
  assert.equal(lines.length, 1, "an uncredited subscription invoice must be logged");
  const logged = lines[0].join(" ");
  assert.match(logged, /invoice\.paid/);
  assert.match(logged, /evt_inv_unresolvable/); // the event id, for log lookup
  assert.match(logged, /in_unresolvable/); // and the invoice id
});

test("webhook invoice.paid stays silent for a genuine one-off invoice", async () => {
  // A manual/quote invoice has no subscription by design. Logging it would be
  // alarm noise that trains us to ignore the real signal above.
  const event = {
    id: "evt_inv_manual",
    type: "invoice.paid",
    data: { object: { id: "in_manual", billing_reason: "manual", parent: null } },
  };
  let out;
  const lines = await captureConsoleError(async () => {
    out = await deliverWebhook(event);
  });
  assert.equal(out.res.statusCode, 200);
  assert.equal(out.ddb.calls.length, 0);
  assert.deepEqual(lines, []);
});

// ---- every withheld grant leaves the ONE alertable phrase -------------------
// All the branches below answer 200, so Stripe marks the event delivered and
// never retries: a buyer paid and their balance did not move. GRANT_WITHHELD is
// the umbrella phrase one metric filter pins (template.yaml's
// UncreditedInvoiceMetricFilter), the grant-side mirror of CLAWBACK_UNRECLAIMED.

/** Drive `event` and return the delivery plus every console.error, joined. */
async function deliverCapturing(event, stripeOver = {}) {
  let out;
  const lines = await captureConsoleError(async () => {
    out = await deliverWebhook(event, stripeOver);
  });
  return { out, lines, logged: lines.map((l) => l.join(" ")) };
}

test("webhook settled session with no client_reference_id LOGS the withheld grant", async () => {
  const event = {
    id: "evt_cs_nosub",
    type: "checkout.session.completed",
    data: {
      object: { id: "cs_nosub", mode: "payment", payment_status: "paid", metadata: { credits: "2000" } },
    },
  };
  const { out, lines, logged } = await deliverCapturing(event);
  assert.equal(out.res.statusCode, 200); // contract unchanged: no retry storm
  assert.equal(out.ddb.calls.length, 0, "nothing granted");
  assert.equal(lines.length, 1, "a settled session nobody owns must be logged");
  assert.match(logged[0], /credits NOT granted/);
  assert.match(logged[0], /evt_cs_nosub/); // the event id, for log lookup
  assert.match(logged[0], /cs_nosub/); // and the session id
});

test("webhook UNPAID session with no client_reference_id stays silent", async () => {
  // The settlement guard runs first on purpose: an unpaid session is a
  // non-event, and logging it would be the noise that trains us to ignore the
  // line the test above pins.
  const event = {
    id: "evt_cs_unpaid_nosub",
    type: "checkout.session.completed",
    data: { object: { id: "cs_unpaid_nosub", mode: "payment", payment_status: "unpaid" } },
  };
  const { out, lines } = await deliverCapturing(event);
  assert.equal(out.res.statusCode, 200);
  assert.equal(out.ddb.calls.length, 0);
  assert.deepEqual(lines, []);
});

test("webhook settled top-up with unusable metadata.credits LOGS the withheld grant", async () => {
  const event = {
    id: "evt_cs_nocredits",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_nocredits",
        mode: "payment",
        payment_status: "paid",
        client_reference_id: "user-11",
        metadata: { credits: "not-a-number" },
      },
    },
  };
  const { out, lines, logged } = await deliverCapturing(event);
  assert.equal(out.res.statusCode, 200);
  assert.equal(out.ddb.calls.length, 0, "nothing granted");
  assert.equal(lines.length, 1);
  assert.match(logged[0], /credits NOT granted/);
  assert.match(logged[0], /evt_cs_nocredits/);
  assert.match(logged[0], /user-11/);
});

test("webhook invoice.paid LOGS when the subscription carries no metadata.userId", async () => {
  const event = {
    id: "evt_inv_nouser",
    type: "invoice.paid",
    data: {
      object: {
        id: "in_nouser",
        billing_reason: "subscription_cycle",
        parent: { type: "subscription_details", subscription_details: { subscription: "sub_nouser" } },
      },
    },
  };
  // stubStripe's default subscription is `{ metadata: {} }` — exactly this shape.
  const { out, lines, logged } = await deliverCapturing(event);
  assert.equal(out.res.statusCode, 200);
  assert.equal(out.ddb.calls.length, 0, "nothing granted");
  assert.equal(lines.length, 1);
  assert.match(logged[0], /credits NOT granted/);
  assert.match(logged[0], /evt_inv_nouser/);
  assert.match(logged[0], /sub_nouser/);
});

test("webhook invoice.paid LOGS a tier lit with no parseable credits", async () => {
  // The one case where the wallet and the tier disagree: the subscriber goes
  // active but the period's credits never land.
  const event = {
    id: "evt_inv_zerocredits",
    type: "invoice.paid",
    data: {
      object: {
        id: "in_zerocredits",
        billing_reason: "subscription_cycle",
        parent: { type: "subscription_details", subscription_details: { subscription: "sub_z" } },
      },
    },
  };
  const { out, lines, logged } = await deliverCapturing(event, {
    subscription: { metadata: { userId: "user-12", tier: "plus" } }, // no credits
  });
  assert.equal(out.res.statusCode, 200);
  assert.equal(lines.length, 1);
  assert.match(logged[0], /credits NOT granted/);
  assert.match(logged[0], /evt_inv_zerocredits/);
  // The tier still lights up — that half is correct and must not regress.
  const tx = txItems(out.ddb);
  assert.equal(tx[1].Update.ExpressionAttributeValues[":tier"].S, "plus");
  assert.equal(tx[1].Update.ExpressionAttributeValues[":amt"], undefined, "no credit delta");
});

// ---- delayed-notification payment methods ----------------------------------
// Klarna / Cash App / Amazon Pay / ACH complete the Checkout Session BEFORE the
// money settles: checkout.session.completed arrives with payment_status
// "unpaid", and the money outcome arrives later as async_payment_succeeded or
// async_payment_failed. Fulfilling on `completed` alone hands out credits for
// payments that then fail. Stripe's fulfillment contract: fulfill when
// payment_status != "unpaid"; otherwise wait for async_payment_succeeded.

test("webhook checkout.session.completed with payment_status unpaid grants NOTHING", async () => {
  const event = {
    id: "evt_unpaid",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_unpaid",
        mode: "payment",
        payment_status: "unpaid", // Klarna et al: session done, money not
        client_reference_id: "user-9",
        metadata: { credits: "2000" },
      },
    },
  };
  const { res, ddb } = await deliverWebhook(event);
  assert.equal(res.statusCode, 200);
  assert.equal(ddb.calls.length, 0, "an unpaid session must not touch the wallet");
});

test("webhook checkout.session.completed (subscription) with payment_status unpaid defers the tier", async () => {
  // The tier light-up must wait too: invoice.paid sets tier + credits when the
  // delayed payment actually settles.
  const event = {
    id: "evt_sub_unpaid",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_sub_unpaid",
        mode: "subscription",
        payment_status: "unpaid",
        client_reference_id: "user-9",
        metadata: { tier: "plus" },
      },
    },
  };
  const { res, ddb } = await deliverWebhook(event);
  assert.equal(res.statusCode, 200);
  assert.equal(ddb.calls.length, 0);
});

test("webhook checkout.session.completed with payment_status no_payment_required still fulfills", async () => {
  // A 100%-off promotion settles nothing but IS complete; Stripe's contract is
  // fulfill on anything except "unpaid". Pins the gate at the right boundary.
  const event = {
    id: "evt_npr",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_npr",
        mode: "payment",
        payment_status: "no_payment_required",
        client_reference_id: "user-9",
        metadata: { credits: "500" },
      },
    },
  };
  const { ddb } = await deliverWebhook(event);
  assert.equal(txItems(ddb)[1].Update.ExpressionAttributeValues[":amt"].N, "500");
});

test("webhook checkout.session.async_payment_succeeded fulfills like a paid completion", async () => {
  const event = {
    id: "evt_async_ok",
    type: "checkout.session.async_payment_succeeded",
    data: {
      object: {
        id: "cs_async",
        mode: "payment",
        payment_status: "paid",
        client_reference_id: "user-9",
        metadata: { credits: "2000" },
      },
    },
  };
  const { res, ddb } = await deliverWebhook(event);
  assert.equal(res.statusCode, 200);
  const tx = txItems(ddb);
  // its OWN event id is the idempotency key — completed(unpaid) wrote nothing,
  // so this is the one and only grant for the purchase
  assert.equal(tx[0].Put.Item.pk.S, "EVENT#evt_async_ok");
  assert.equal(tx[1].Update.Key.pk.S, "WALLET#user-9");
  assert.equal(tx[1].Update.ExpressionAttributeValues[":amt"].N, "2000");
});

test("webhook checkout.session.async_payment_failed grants nothing and leaves loud evidence", async () => {
  const event = {
    id: "evt_async_fail",
    type: "checkout.session.async_payment_failed",
    data: {
      object: {
        id: "cs_failed",
        mode: "payment",
        payment_status: "unpaid",
        client_reference_id: "user-9",
        metadata: { credits: "2000" },
      },
    },
  };
  let out;
  const lines = await captureConsoleError(async () => {
    out = await deliverWebhook(event);
  });
  assert.equal(out.res.statusCode, 200); // nothing to retry — the payment failed
  assert.equal(out.ddb.calls.length, 0, "a failed payment must never touch the wallet");
  assert.equal(lines.length, 1, "a failed async payment must be logged");
  const logged = lines[0].join(" ");
  assert.match(logged, /async_payment_failed/);
  assert.match(logged, /evt_async_fail/);
  assert.match(logged, /cs_failed/);
});

test("webhook customer.subscription.deleted downgrades the tier to free", async () => {
  const ddb = stubDdb();
  const event = {
    id: "evt_del",
    type: "customer.subscription.deleted",
    data: { object: { metadata: { userId: "user-3" }, status: "canceled" } },
  };
  const core = createHandlerCore({ stripe: stubStripe({ event }), ddb, tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
  await core(makeEvent({ method: "POST", path: "/webhook", sub: null, rawBody: "{}", headers: { "stripe-signature": "sig" } }));
  const tx = txItems(ddb);
  assert.equal(tx[1].Update.ExpressionAttributeValues[":tier"].S, "free");
  assert.equal(tx[1].Update.ExpressionAttributeValues[":ss"].S, "canceled");
});

// ---- container lifecycle -----------------------------------------------------

test("lazyCore builds once and reuses the core across invocations", async () => {
  let builds = 0;
  const handler = lazyCore(async () => {
    builds++;
    return async () => ({ statusCode: 200, body: "ok" });
  });
  assert.equal((await handler({})).statusCode, 200);
  assert.equal((await handler({})).statusCode, 200);
  assert.equal(builds, 1, "a healthy core must be built exactly once per container");
});

test("lazyCore retries the build after a failed secret load instead of poisoning the container", async () => {
  // The failure mode: loadSecret rejects once (Secrets Manager throttle, IAM
  // hiccup, mid-rotation read), the rejected promise is memoized, and every
  // subsequent invocation of the warm container replays the same rejection —
  // a permanent 500 until Lambda happens to recycle it.
  let builds = 0;
  const handler = lazyCore(async () => {
    builds++;
    if (builds === 1) throw new Error("secrets manager unavailable");
    return async () => ({ statusCode: 200, body: "recovered" });
  });
  await assert.rejects(() => handler({}), /secrets manager unavailable/);
  const res = await handler({});
  assert.equal(res.statusCode, 200, "the next invocation must rebuild, not replay the rejection");
  assert.equal(builds, 2);
});

test("webhook ignores unrelated event types without touching DynamoDB", async () => {
  const ddb = stubDdb();
  const event = { id: "evt_x", type: "payment_intent.created", data: { object: {} } };
  const core = createHandlerCore({ stripe: stubStripe({ event }), ddb, tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
  const res = await core(makeEvent({ method: "POST", path: "/webhook", sub: null, rawBody: "{}", headers: { "stripe-signature": "sig" } }));
  assert.equal(res.statusCode, 200);
  assert.equal(ddb.calls.length, 0);
});

// ---- refund / dispute clawback ------------------------------------------------
// Money that comes back to the platform must take its credits with it. This
// design was rewritten after an adversarial review overturned three of four
// original steps; each test below pins one of those corrections.
import { readFileSync } from "node:fs";
import { CLAWBACK_UNRECLAIMED, REQUIRED_WEBHOOK_EVENTS } from "./index.mjs";

/** A ddb stub with per-row state, so the OCC conditions are really exercised. */
function walletDdb({ grant, wallet, transactOutcomes } = {}) {
  const calls = [];
  const queue = Array.isArray(transactOutcomes) ? [...transactOutcomes] : undefined;
  return {
    calls,
    async send(cmd) {
      const name = cmd.constructor.name;
      calls.push({ name, input: cmd.input });
      if (name === "GetItemCommand") {
        const pk = cmd.input.Key.pk.S;
        if (pk.startsWith("RECEIPT#")) return grant ? { Item: grant } : {};
        if (pk.startsWith("WALLET#")) return wallet ? { Item: wallet } : {};
        return {};
      }
      if (name === "TransactWriteItemsCommand") {
        const o = queue ? queue.shift() : undefined;
        if (o instanceof Error) throw o;
        return {};
      }
      return {};
    },
  };
}

const cancelledAt = (leg) => {
  const e = new Error("cancelled");
  e.name = "TransactionCanceledException";
  const reasons = [{ Code: "None" }, { Code: "None" }, { Code: "None" }];
  reasons[leg] = { Code: "ConditionalCheckFailed" };
  e.CancellationReasons = reasons;
  return e;
};

const deliver = (ddb, event) =>
  createHandlerCore({ stripe: stubStripe({ event }), ddb, tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN })(
    makeEvent({ method: "POST", path: "/webhook", sub: null, rawBody: "{}", headers: { "stripe-signature": "sig" } })
  );

const refundEvt = (over = {}) => ({
  id: "evt_refund_1",
  type: "charge.refunded",
  data: { object: { id: "ch_1", payment_intent: "pi_1", amount: 2000, amount_refunded: 2000, ...over } },
});

const RECEIPT_ROW = {
  pk: { S: "RECEIPT#pi_1" },
  sub: { S: "user-9" },
  purchasedCredits: { N: "2000" },
  refundedCredits: { N: "0" },
  // $20.00 paid — the denominator dispute pro-rating (#230) reads. Refund tests
  // never touch it (the Charge object carries its own amounts).
  amountPaidCents: { N: "2000" },
};
const txOf = (ddb) => ddb.calls.find((c) => c.name === "TransactWriteItemsCommand")?.input.TransactItems;

test("R1: a full refund claws back against the PaymentIntent key, with a NEGATIVE wallet delta", async () => {
  // charge.invoice was REMOVED in Basil (the same relocation that broke
  // invoice.paid), so payment_intent is the only surviving Charge->grant link.
  const ddb = walletDdb({ grant: RECEIPT_ROW, wallet: { credits: { N: "5000" } } });
  const res = await deliver(ddb, refundEvt());
  assert.equal(res.statusCode, 200);
  assert.ok(ddb.calls.some((c) => c.name === "GetItemCommand" && c.input.Key.pk.S === "RECEIPT#pi_1"));
  const tx = txOf(ddb);
  // EVENT# stays leg 0 and WALLET# stays leg 1 — GRANT is APPENDED, so the
  // existing reason-index contract and the suite's positional pins still hold.
  assert.equal(tx[0].Put.Item.pk.S, "EVENT#evt_refund_1");
  assert.equal(tx[1].Update.Key.pk.S, "WALLET#user-9");
  assert.equal(tx[1].Update.ExpressionAttributeValues[":amt"].N, "-2000");
  const g = tx[2].Update;
  assert.equal(g.Key.pk.S, "RECEIPT#pi_1");
  assert.match(g.UpdateExpression, /SET refundedCredits = :target/);
  assert.equal(g.ExpressionAttributeValues[":target"].N, "2000");
  assert.match(g.ConditionExpression, /refundedCredits = :seen/);
});

test("R2: a partial refund is proportional; a second partial moves only the delta", async () => {
  const ddb = walletDdb({ grant: { ...RECEIPT_ROW, refundedCredits: { N: "500" } }, wallet: { credits: { N: "5000" } } });
  await deliver(ddb, refundEvt({ amount_refunded: 1500 }));
  const tx = txOf(ddb);
  assert.equal(tx[2].Update.ExpressionAttributeValues[":target"].N, "1500");
  assert.equal(tx[1].Update.ExpressionAttributeValues[":amt"].N, "-1000");
});

test("R3: a stale/out-of-order event never RE-GRANTS credits", async () => {
  const ddb = walletDdb({ grant: { ...RECEIPT_ROW, refundedCredits: { N: "2000" } }, wallet: { credits: { N: "5000" } } });
  const res = await deliver(ddb, refundEvt({ amount_refunded: 500 }));
  assert.equal(res.statusCode, 200);
  assert.equal(txOf(ddb), undefined, "nothing owed -> no write at all");
});

test("R4: the wallet floors at zero; the shortfall is recorded, never a negative balance", async () => {
  // A negative `credits` makes counter() in qpu-client.ts read the wallet as
  // UNCONFIGURED, hiding the top-up path exactly when it is needed.
  const ddb = walletDdb({ grant: RECEIPT_ROW, wallet: { credits: { N: "300" } } });
  await deliver(ddb, refundEvt());
  const w = txOf(ddb)[1].Update;
  assert.equal(w.ExpressionAttributeValues[":amt"].N, "-300");
  assert.equal(w.ExpressionAttributeValues[":owed"].N, "1700");
  assert.match(w.UpdateExpression, /clawbackOwedCredits :owed/);
});

test("R5: a lost-update race retries in-process against freshly read state", async () => {
  const ddb = walletDdb({
    grant: RECEIPT_ROW,
    wallet: { credits: { N: "5000" } },
    transactOutcomes: [cancelledAt(2), {}],
  });
  const res = await deliver(ddb, refundEvt());
  assert.equal(res.statusCode, 200);
  assert.equal(ddb.calls.filter((c) => c.name === "TransactWriteItemsCommand").length, 2);
  assert.ok(ddb.calls.filter((c) => c.name === "GetItemCommand" && c.input.Key.pk.S === "RECEIPT#pi_1").length >= 2);
});

test("R6: a replayed refund is a no-op that still 200s and does not retry", async () => {
  const ddb = walletDdb({ grant: RECEIPT_ROW, wallet: { credits: { N: "5000" } }, transactOutcomes: [cancelledAt(0)] });
  const res = await deliver(ddb, refundEvt());
  assert.equal(res.statusCode, 200);
  assert.equal(ddb.calls.filter((c) => c.name === "TransactWriteItemsCommand").length, 1);
});

test("R7: a missing grant row logs the shared pinned phrase and does NOT throw", async () => {
  const ddb = walletDdb({ grant: null, wallet: null });
  let res;
  const lines = await captureConsoleError(async () => {
    res = await deliver(ddb, refundEvt());
  });
  assert.equal(res.statusCode, 200, "a charge that was never ours must not retry-storm");
  assert.equal(lines.length, 1);
  const logged = lines[0].join(" ");
  assert.ok(logged.includes(CLAWBACK_UNRECLAIMED), "must carry the shared pinned phrase");
  assert.match(logged, /pi_1/);
});

test("R8: dispute clawback uses funds_withdrawn; funds_reinstated restores it", async () => {
  // charge.dispute.created ALSO fires for inquiries where Stripe withdraws
  // nothing — clawing back there would zero a paying customer for free.
  const ddb = walletDdb({ grant: RECEIPT_ROW, wallet: { credits: { N: "5000" } } });
  await deliver(ddb, {
    id: "evt_dw",
    type: "charge.dispute.funds_withdrawn",
    data: { object: { id: "dp_1", charge: "ch_1", payment_intent: "pi_1", amount: 2000 } },
  });
  const tx = txOf(ddb);
  assert.equal(tx[1].Update.ExpressionAttributeValues[":amt"].N, "-2000");
  // tracked SEPARATELY from refundedCredits so the two arithmetics can't interact
  assert.match(tx[2].Update.UpdateExpression, /disputedCredits/);

  const ddb2 = walletDdb({
    grant: { ...RECEIPT_ROW, disputedCredits: { N: "2000" } },
    wallet: { credits: { N: "0" }, clawbackOwedCredits: { N: "0" } },
  });
  await deliver(ddb2, {
    id: "evt_dr",
    type: "charge.dispute.funds_reinstated",
    data: { object: { id: "dp_1", charge: "ch_1", payment_intent: "pi_1", amount: 2000 } },
  });
  assert.equal(txOf(ddb2)[1].Update.ExpressionAttributeValues[":amt"].N, "2000", "credits restored");
});

test("R9: the required webhook subscription list matches the switch's handled cases", async () => {
  // The Dashboard subscription and the code must not drift: a type we handle
  // but never receive is dead code; one we receive but ignore is silent loss.
  const src = readFileSync(new URL("./index.mjs", import.meta.url), "utf8");
  const cases = [...src.matchAll(/^\s+case "([a-z_]+\.[a-z_.]+)":/gm)].map((m) => m[1]);
  for (const t of REQUIRED_WEBHOOK_EVENTS) {
    assert.ok(cases.includes(t), `${t} is required but has no case`);
  }
  for (const c of new Set(cases)) {
    assert.ok(REQUIRED_WEBHOOK_EVENTS.includes(c), `${c} is handled but not in REQUIRED_WEBHOOK_EVENTS`);
  }
});

/**
 * A stateful stub: TransactWriteItems is actually APPLIED to the row store, so a
 * withdraw-then-reinstate round trip can be asserted end to end. walletDdb above
 * returns a fixed snapshot, which is right for single-event tests but cannot
 * express "the second event sees what the first one wrote" — and that sequence is
 * exactly where the dispute arithmetic goes wrong.
 *
 * Only the expression shapes this handler actually emits are supported:
 * `SET a = :x, b = :y` and `ADD credits :amt, clawbackOwedCredits :owed`.
 */
function ledgerDdb(rows = {}) {
  const store = new Map(Object.entries(rows));
  const num = (item, k) => Number(item?.[k]?.N ?? 0);
  return {
    store,
    wallet: (sub) => store.get(`WALLET#${sub}`),
    receipt: (pi) => store.get(`RECEIPT#${pi}`),
    async send(cmd) {
      const name = cmd.constructor.name;
      if (name === "GetItemCommand") {
        const item = store.get(cmd.input.Key.pk.S);
        return item ? { Item: item } : {};
      }
      if (name !== "TransactWriteItemsCommand") return {};
      // Validate every condition BEFORE applying anything (transaction semantics).
      for (const leg of cmd.input.TransactItems) {
        const op = leg.Put ?? leg.Update ?? leg.ConditionCheck;
        const pk = (leg.Put ? leg.Put.Item.pk : op.Key.pk).S;
        const cond = op.ConditionExpression;
        if (!cond) continue;
        const cur = store.get(pk);
        if (cond.includes("attribute_not_exists(pk)") && cur) {
          const e = new Error("cancelled");
          e.name = "TransactionCanceledException";
          e.CancellationReasons = cmd.input.TransactItems.map((l) =>
            l === leg ? { Code: "ConditionalCheckFailed" } : { Code: "None" }
          );
          throw e;
        }
        const eq = cond.match(/(\w+) = (:\w+)/);
        if (eq && cur && num(cur, eq[1]) !== Number(op.ExpressionAttributeValues[eq[2]].N)) {
          const e = new Error("cancelled");
          e.name = "TransactionCanceledException";
          e.CancellationReasons = cmd.input.TransactItems.map((l) =>
            l === leg ? { Code: "ConditionalCheckFailed" } : { Code: "None" }
          );
          throw e;
        }
      }
      for (const leg of cmd.input.TransactItems) {
        if (leg.Put) {
          store.set(leg.Put.Item.pk.S, { ...leg.Put.Item });
          continue;
        }
        if (!leg.Update) continue;
        const pk = leg.Update.Key.pk.S;
        const item = { ...(store.get(pk) ?? { pk: { S: pk } }) };
        const vals = leg.Update.ExpressionAttributeValues ?? {};
        const expr = leg.Update.UpdateExpression;
        const setPart = expr.match(/SET (.*?)(?= ADD |$)/)?.[1];
        for (const a of setPart ? setPart.split(",") : []) {
          const [k, v] = a.split("=").map((s) => s.trim());
          if (vals[v]) item[k] = { ...vals[v] };
        }
        const addPart = expr.match(/ADD (.*)$/)?.[1];
        for (const a of addPart ? addPart.split(",") : []) {
          const [k, v] = a.trim().split(/\s+/);
          item[k] = { N: String(num(item, k) + Number(vals[v].N)) };
        }
        store.set(pk, item);
      }
      return {};
    },
  };
}

const disputeEvt = (id, type, amount = 2000) => ({
  id,
  type,
  data: { object: { id: "dp_1", charge: "ch_1", payment_intent: "pi_1", amount } },
});

// A receipt as the post-#230 writer produces it: amountPaidCents carries what the
// buyer actually paid, so a dispute's own amount can be pro-rated against it.
const PRICED_RECEIPT = {
  pk: { S: "RECEIPT#pi_1" },
  sub: { S: "user-9" },
  purchasedCredits: { N: "2000" },
  refundedCredits: { N: "0" },
  disputedCredits: { N: "0" },
  amountPaidCents: { N: "2000" }, // $20.00 for 2000 credits
};

test("R10: a reinstated dispute returns the wallet to EXACTLY its pre-dispute state", async () => {
  // The learner bought 2000 and spent 1500, so the clawback cannot come out of
  // credits alone: 500 is taken and 1500 becomes debt. Winning the dispute must
  // undo both halves. Restoring the full 2000 while leaving the debt standing
  // hands back credits the hard gate then refuses to let them spend
  // (qpu-core.mjs:398, tutor/index.mjs:390) — a learner who WON is locked out
  // until they buy their way clear.
  const ddb = ledgerDdb({
    "RECEIPT#pi_1": { ...PRICED_RECEIPT },
    "WALLET#user-9": { pk: { S: "WALLET#user-9" }, credits: { N: "500" } },
  });

  await deliver(ddb, disputeEvt("evt_dw", "charge.dispute.funds_withdrawn"));
  assert.equal(ddb.wallet("user-9").credits.N, "0", "credits floor at zero");
  assert.equal(ddb.wallet("user-9").clawbackOwedCredits.N, "1500", "the shortfall becomes debt");

  await deliver(ddb, disputeEvt("evt_dr", "charge.dispute.funds_reinstated"));
  assert.equal(ddb.wallet("user-9").credits.N, "500", "only what was TAKEN comes back");
  assert.equal(ddb.wallet("user-9").clawbackOwedCredits.N, "0", "the debt the dispute created is cleared");
  assert.equal(ddb.receipt("pi_1").disputedCredits.N, "0");
});

test("R11: a reinstated dispute that took only credits restores exactly those credits", async () => {
  // The control case: the wallet covered the whole clawback, so no debt was ever
  // created and the restore is a plain credit return. This is what the code
  // already gets right, and the fix must not disturb it.
  const ddb = ledgerDdb({
    "RECEIPT#pi_1": { ...PRICED_RECEIPT },
    "WALLET#user-9": { pk: { S: "WALLET#user-9" }, credits: { N: "5000" } },
  });

  await deliver(ddb, disputeEvt("evt_dw2", "charge.dispute.funds_withdrawn"));
  assert.equal(ddb.wallet("user-9").credits.N, "3000");
  assert.equal(ddb.wallet("user-9").clawbackOwedCredits?.N ?? "0", "0", "no debt when credits cover it");

  await deliver(ddb, disputeEvt("evt_dr2", "charge.dispute.funds_reinstated"));
  assert.equal(ddb.wallet("user-9").credits.N, "5000", "back where it started");
  assert.equal(ddb.wallet("user-9").clawbackOwedCredits?.N ?? "0", "0");
});

test("R12: a debt already paid down before the reinstate is not cleared twice", async () => {
  // The learner bought their way out mid-dispute: 1000 of the 1500 debt is gone
  // and that top-up bought them no spendable credits. Winning the dispute must
  // clear only the 500 still standing and return the rest as credits — clearing
  // the full 1500 would drive clawbackOwedCredits negative, and the gate tests
  // `= 0`, so a negative debt locks the learner out exactly as a positive one does.
  const ddb = ledgerDdb({
    "RECEIPT#pi_1": {
      pk: { S: "RECEIPT#pi_1" },
      sub: { S: "user-9" },
      purchasedCredits: { N: "2000" },
      refundedCredits: { N: "0" },
      disputedCredits: { N: "2000" },
      disputedCreditsUnrecovered: { N: "1500" },
    },
    "WALLET#user-9": {
      pk: { S: "WALLET#user-9" },
      credits: { N: "0" },
      clawbackOwedCredits: { N: "500" },
    },
  });

  await deliver(ddb, disputeEvt("evt_dr3", "charge.dispute.funds_reinstated"));
  assert.equal(ddb.wallet("user-9").clawbackOwedCredits.N, "0", "never negative");
  assert.equal(ddb.wallet("user-9").credits.N, "1500", "the rest returns as spendable credits");
});

// ---- partial disputes (#230) ---------------------------------------------------
// Stripe: a Dispute's `amount` is "usually the amount of the charge, but it can
// differ" — partial disputes, currency conversion, banks bundling recurring
// charges. The clawback must be pro-rated against what the buyer actually paid
// (receipt.amountPaidCents), the way charge.refunded already pro-rates against
// the Charge's own amount.

test("R13: a partial dispute claws back only the disputed fraction of the grant", async () => {
  // $5 disputed of a $20 purchase -> a quarter of the 2000 credits, not all of them.
  const ddb = ledgerDdb({
    "RECEIPT#pi_1": { ...PRICED_RECEIPT },
    "WALLET#user-9": { pk: { S: "WALLET#user-9" }, credits: { N: "2000" } },
  });
  await deliver(ddb, disputeEvt("evt_dw_part", "charge.dispute.funds_withdrawn", 500));
  assert.equal(ddb.wallet("user-9").credits.N, "1500", "only the disputed quarter leaves");
  assert.equal(ddb.receipt("pi_1").disputedCredits.N, "500");
  assert.equal(ddb.wallet("user-9").clawbackOwedCredits?.N ?? "0", "0", "covered by credits, no debt");
});

test("R14: a dispute against a receipt with no amountPaidCents reclaims NOTHING and logs", async () => {
  // Rule 7: where metering is uncertain the learner is charged less, never more.
  // Without the denominator we cannot know the disputed fraction, so we do not
  // guess `1` — we leave the pinned phrase for manual reconciliation instead.
  const ddb = ledgerDdb({
    "RECEIPT#pi_1": {
      pk: { S: "RECEIPT#pi_1" },
      sub: { S: "user-9" },
      purchasedCredits: { N: "2000" },
      refundedCredits: { N: "0" },
      disputedCredits: { N: "0" },
    },
    "WALLET#user-9": { pk: { S: "WALLET#user-9" }, credits: { N: "2000" } },
  });
  let lines;
  lines = await captureConsoleError(async () => {
    await deliver(ddb, disputeEvt("evt_dw_legacy", "charge.dispute.funds_withdrawn", 500));
  });
  assert.equal(ddb.wallet("user-9").credits.N, "2000", "nothing reclaimed");
  assert.equal(ddb.receipt("pi_1").disputedCredits.N, "0");
  assert.equal(lines.length, 1);
  assert.ok(lines[0].join(" ").includes(CLAWBACK_UNRECLAIMED), "must carry the shared pinned phrase");
});

test("R15: reinstating a partial dispute returns exactly the partial amount", async () => {
  const ddb = ledgerDdb({
    "RECEIPT#pi_1": { ...PRICED_RECEIPT },
    "WALLET#user-9": { pk: { S: "WALLET#user-9" }, credits: { N: "2000" } },
  });
  await deliver(ddb, disputeEvt("evt_dw_p2", "charge.dispute.funds_withdrawn", 500));
  assert.equal(ddb.wallet("user-9").credits.N, "1500");
  await deliver(ddb, disputeEvt("evt_dr_p2", "charge.dispute.funds_reinstated", 500));
  assert.equal(ddb.wallet("user-9").credits.N, "2000", "the quarter comes back, not the whole grant");
  assert.equal(ddb.receipt("pi_1").disputedCredits.N, "0");
});

test("R16: a partial refund followed by a dispute of the remainder never reclaims more than the purchase", async () => {
  // The double-clawback the hardcoded `fraction: 1` used to cause: refund half,
  // dispute the other half, and the dispute leg would target the WHOLE grant on
  // its own counter — 3000 credits reclaimed for 2000 cents returned. With both
  // paths pro-rated the two counters can only ever sum to the purchase.
  const ddb = ledgerDdb({
    "RECEIPT#pi_1": { ...PRICED_RECEIPT },
    "WALLET#user-9": { pk: { S: "WALLET#user-9" }, credits: { N: "2000" } },
  });
  await deliver(ddb, {
    id: "evt_refund_half",
    type: "charge.refunded",
    data: { object: { id: "ch_1", payment_intent: "pi_1", amount: 2000, amount_refunded: 1000 } },
  });
  assert.equal(ddb.wallet("user-9").credits.N, "1000");
  await deliver(ddb, disputeEvt("evt_dw_rest", "charge.dispute.funds_withdrawn", 1000));
  assert.equal(ddb.wallet("user-9").credits.N, "0", "exactly the purchase, never more");
  assert.equal(ddb.wallet("user-9").clawbackOwedCredits?.N ?? "0", "0", "no phantom debt");
  assert.equal(ddb.receipt("pi_1").refundedCredits.N, "1000");
  assert.equal(ddb.receipt("pi_1").disputedCredits.N, "1000");
});

test("R17: a dispute whose amount DECREASES logs the pinned phrase instead of silently keeping the over-reclaim", async () => {
  // Reachable only now that the fraction is data-driven: a dispute updated to a
  // smaller amount, then another funds-movement delivery. The counter cannot
  // move down outside `restore` (that guard protects refunds from re-grants),
  // so the learner stays over-reclaimed — which is fine to defer to a human,
  // and NOT fine to do silently.
  const ddb = ledgerDdb({
    "RECEIPT#pi_1": { ...PRICED_RECEIPT },
    "WALLET#user-9": { pk: { S: "WALLET#user-9" }, credits: { N: "4000" } },
  });
  await deliver(ddb, disputeEvt("evt_dw_big", "charge.dispute.funds_withdrawn", 2000));
  assert.equal(ddb.wallet("user-9").credits.N, "2000");
  const lines = await captureConsoleError(async () => {
    await deliver(ddb, disputeEvt("evt_dw_small", "charge.dispute.funds_withdrawn", 500));
  });
  assert.equal(ddb.wallet("user-9").credits.N, "2000", "no write either way");
  assert.equal(ddb.receipt("pi_1").disputedCredits.N, "2000");
  assert.equal(lines.length, 1, "the over-reclaim must be visible to the metric filter");
  assert.ok(lines[0].join(" ").includes(CLAWBACK_UNRECLAIMED));
});

// ---- debt clearing ------------------------------------------------------------
// Product decision: an owing learner MUST clear the debt. So a purchase pays
// down clawbackOwedCredits BEFORE it adds spendable credits, and the spend
// gates refuse while a debt stands (asserted in qpu-core/tutor suites).

test("D1: a top-up pays down the debt first, then credits only the remainder", async () => {
  const ddb = walletDdb({ wallet: { credits: { N: "0" }, clawbackOwedCredits: { N: "800" } } });
  await deliver(ddb, {
    id: "evt_topup_debt",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_x",
        mode: "payment",
        payment_status: "paid",
        payment_intent: "pi_new",
        client_reference_id: "user-9",
        metadata: { credits: "2000" },
      },
    },
  });
  const w = txOf(ddb)[1].Update;
  // 2000 bought, 800 owed -> 800 clears the debt, 1200 becomes spendable
  assert.equal(w.ExpressionAttributeValues[":amt"].N, "1200");
  assert.equal(w.ExpressionAttributeValues[":owed"].N, "-800", "debt is paid down");
});

test("D2: a purchase smaller than the debt adds NO spendable credits", async () => {
  const ddb = walletDdb({ wallet: { credits: { N: "0" }, clawbackOwedCredits: { N: "5000" } } });
  await deliver(ddb, {
    id: "evt_topup_small",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_y",
        mode: "payment",
        payment_status: "paid",
        payment_intent: "pi_small",
        client_reference_id: "user-9",
        metadata: { credits: "500" },
      },
    },
  });
  const w = txOf(ddb)[1].Update;
  assert.ok(!("​:amt" in w.ExpressionAttributeValues), "no positive credit delta");
  assert.equal(w.ExpressionAttributeValues[":amt"]?.N ?? "0", "0");
  assert.equal(w.ExpressionAttributeValues[":owed"].N, "-500", "all of it clears debt");
});

test("D3: with no debt, a purchase behaves exactly as before", async () => {
  const ddb = walletDdb({ wallet: { credits: { N: "100" } } });
  await deliver(ddb, {
    id: "evt_topup_clean",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_z",
        mode: "payment",
        payment_status: "paid",
        payment_intent: "pi_clean",
        client_reference_id: "user-9",
        metadata: { credits: "2000" },
      },
    },
  });
  const w = txOf(ddb)[1].Update;
  assert.equal(w.ExpressionAttributeValues[":amt"].N, "2000");
  assert.equal(w.ExpressionAttributeValues[":owed"], undefined, "no debt leg at all");
});

// invoice.paid is the OTHER path that moves money in, and until #218 it was the
// one that skipped the split: a renewing subscriber accumulated credits the
// debt-gate refused while the debt never shrank. Founder decision (2026-08-17,
// issue #218): renewals garnish FULLY — the same splitAgainstDebt rule top-ups
// use, so money-in behaves one way everywhere.

test("D5: a renewal grant pays down clawback debt before granting spendable credits", async () => {
  const ddb = stubDdb({
    GetItemCommand: {
      Item: { pk: { S: "WALLET#user-8" }, credits: { N: "0" }, clawbackOwedCredits: { N: "800" } },
    },
  });
  const stripe = stubStripe({
    event: {
      id: "evt_inv_garnish",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_garnish",
          billing_reason: "subscription_cycle",
          amount_paid: 1900,
          parent: { type: "subscription_details", subscription_details: { subscription: "sub_g" } },
        },
      },
    },
    subscription: { metadata: { userId: "user-8", tier: "plus", credits: "1900" } },
  });
  const core = createHandlerCore({ stripe, ddb, tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
  const res = await core(
    makeEvent({ method: "POST", path: "/webhook", sub: null, rawBody: "{}", headers: { "stripe-signature": "sig" } })
  );
  assert.equal(res.statusCode, 200);
  const tx = ddb.calls.find((c) => c.constructor.name === "TransactWriteItemsCommand").input.TransactItems;
  const w = tx[1].Update;
  assert.equal(w.ExpressionAttributeValues[":amt"].N, "1100", "1900 granted, 800 garnished");
  assert.equal(w.ExpressionAttributeValues[":owed"].N, "-800", "the debt is paid down");
  assert.equal(w.ExpressionAttributeValues[":tier"].S, "plus", "tier still lights up");
});

test("D6: a debt larger than the grant consumes the whole renewal, and the receipt still records the full grant", async () => {
  const ddb = stubDdb({
    GetItemCommand: {
      Item: { pk: { S: "WALLET#user-8" }, credits: { N: "0" }, clawbackOwedCredits: { N: "2500" } },
    },
  });
  const stripe = stubStripe({
    event: {
      id: "evt_inv_garnish_all",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_garnish_all",
          billing_reason: "subscription_cycle",
          amount_paid: 1900,
          parent: { type: "subscription_details", subscription_details: { subscription: "sub_g" } },
        },
      },
    },
    subscription: { metadata: { userId: "user-8", tier: "plus", credits: "1900" } },
    invoice: { payments: { data: [{ payment: { payment_intent: "pi_renewal" } }] } },
  });
  const core = createHandlerCore({ stripe, ddb, tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
  await core(
    makeEvent({ method: "POST", path: "/webhook", sub: null, rawBody: "{}", headers: { "stripe-signature": "sig" } })
  );
  const tx = ddb.calls.find((c) => c.constructor.name === "TransactWriteItemsCommand").input.TransactItems;
  const w = tx[1].Update;
  assert.equal(w.ExpressionAttributeValues[":amt"], undefined, "nothing spendable this period");
  assert.equal(w.ExpressionAttributeValues[":owed"].N, "-1900", "the whole grant garnishes");
  // The receipt still says 1900 purchased: a refund of THIS invoice claws back
  // against the full grant, not the post-garnish remainder.
  const receipt = tx.find((l) => l.Put?.Item?.pk?.S?.startsWith("RECEIPT#"));
  assert.equal(receipt.Put.Item.purchasedCredits.N, "1900");
});

// ---- the debt-paydown race -----------------------------------------------------
// splitAgainstDebt reads clawbackOwedCredits OUTSIDE the transaction. Without an
// OCC condition on the wallet leg, two concurrent money-in events (a renewal
// racing a top-up, or two invoice.paid deliveries) both read owed=N and both
// ADD -N — driving the field NEGATIVE, which the spend gates refuse exactly as
// hard as a positive debt, permanently, with no self-healing path.

test("D7: a debt paydown carries the read debt as an OCC condition on the wallet leg", async () => {
  const ddb = walletDdb({ wallet: { credits: { N: "0" }, clawbackOwedCredits: { N: "800" } } });
  await deliver(ddb, {
    id: "evt_topup_occ",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_occ",
        mode: "payment",
        payment_status: "paid",
        payment_intent: "pi_occ",
        client_reference_id: "user-9",
        metadata: { credits: "2000" },
      },
    },
  });
  const w = txOf(ddb)[1].Update;
  assert.match(w.ConditionExpression ?? "", /clawbackOwedCredits = :expectedOwed/);
  assert.equal(w.ExpressionAttributeValues[":expectedOwed"].N, "800");
});

test("D8: a lost debt-paydown race re-reads and retries against fresh state", async () => {
  // Interleaving: this delivery reads owed=800, but a concurrent event pays the
  // debt off before our transaction commits. The OCC condition cancels the
  // wallet leg; the retry re-reads owed=0 and grants in full — instead of
  // blindly ADDing -800 into a negative, gate-wedging debt.
  const walletReads = [
    { Item: { pk: { S: "WALLET#user-9" }, credits: { N: "0" }, clawbackOwedCredits: { N: "800" } } },
    { Item: { pk: { S: "WALLET#user-9" }, credits: { N: "1200" }, clawbackOwedCredits: { N: "0" } } },
  ];
  const outcomes = [cancelledAt(1), {}];
  const calls = [];
  const ddb = {
    calls,
    async send(cmd) {
      const name = cmd.constructor.name;
      calls.push({ name, input: cmd.input });
      if (name === "GetItemCommand") return walletReads.shift() ?? {};
      if (name === "TransactWriteItemsCommand") {
        const o = outcomes.shift();
        if (o instanceof Error) throw o;
        return o ?? {};
      }
      return {};
    },
  };
  await deliver(ddb, {
    id: "evt_topup_race",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_race",
        mode: "payment",
        payment_status: "paid",
        payment_intent: "pi_race",
        client_reference_id: "user-9",
        metadata: { credits: "2000" },
      },
    },
  });
  const txs = calls.filter((c) => c.name === "TransactWriteItemsCommand");
  assert.equal(txs.length, 2, "one lost race, one retry");
  const second = txs[1].input.TransactItems[1].Update;
  assert.equal(second.ExpressionAttributeValues[":amt"].N, "2000", "fresh read: no debt, full grant");
  assert.equal(second.ExpressionAttributeValues[":owed"], undefined, "nothing left to garnish");
});

// ---- the denominator a partial dispute needs (#230) ----------------------------

test("a checkout purchase records amountPaidCents on the receipt", async () => {
  const ddb = walletDdb({ wallet: { credits: { N: "0" } } });
  await deliver(ddb, {
    id: "evt_topup_price",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_p",
        mode: "payment",
        payment_status: "paid",
        payment_intent: "pi_price",
        client_reference_id: "user-9",
        amount_total: 500,
        metadata: { credits: "500" },
      },
    },
  });
  const receipt = txOf(ddb).find((l) => l.Put?.Item?.pk?.S?.startsWith("RECEIPT#"));
  assert.equal(receipt.Put.Item.amountPaidCents.N, "500");
});

test("a subscription invoice records amountPaidCents on the receipt", async () => {
  const { ddb } = await deliverWebhook(
    {
      id: "evt_inv_price",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_price",
          billing_reason: "subscription_cycle",
          amount_paid: 1900,
          parent: { type: "subscription_details", subscription_details: { subscription: "sub_p" } },
        },
      },
    },
    {
      subscription: { metadata: { userId: "user-8", tier: "plus", credits: "1900" } },
      invoice: { payments: { data: [{ payment: { payment_intent: "pi_renewal" } }] } },
    }
  );
  const tx = ddb.calls.find((c) => c.constructor.name === "TransactWriteItemsCommand").input.TransactItems;
  const receipt = tx.find((l) => l.Put?.Item?.pk?.S?.startsWith("RECEIPT#"));
  assert.equal(receipt.Put.Item.amountPaidCents.N, "1900");
});

test("GET /wallet exposes clawback debt so a lockout is diagnosable", async () => {
  // Until now no surface carried the debt: the gate refused with
  // "insufficient-credits" while the wallet showed a balance. The client (and
  // support) need the number to explain WHY a spend was refused.
  const ddb = stubDdb({
    GetItemCommand: {
      Item: {
        pk: { S: "WALLET#user-1" },
        tier: { S: "plus" },
        credits: { N: "2000" },
        clawbackOwedCredits: { N: "1500" },
        subscriptionStatus: { S: "active" },
      },
    },
  });
  const core = createHandlerCore({ stripe: stubStripe(), ddb, tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
  const res = await core(makeEvent({ method: "GET", path: "/wallet" }));
  assert.equal(JSON.parse(res.body).clawbackOwedCredits, 1500);
});
