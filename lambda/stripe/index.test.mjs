// Offline tests for quantum-stripe. No AWS, no network: DynamoDB and Stripe are
// both stubbed and injected into createHandlerCore, mirroring lambda/sync.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandlerCore, CATALOG } from "./index.mjs";

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

// ---- CATALOG guardrail -----------------------------------------------------

test("CATALOG credit counts mirror the published pricing", () => {
  assert.equal(CATALOG.ql_plus_monthly.credits, 1890);
  assert.equal(CATALOG.ql_pro_monthly.credits, 6200);
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
  assert.deepEqual(JSON.parse(res.body), { tier: "free", credits: 0, subscriptionStatus: null });
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
  assert.deepEqual(JSON.parse(res.body), { tier: "plus", credits: 1890, subscriptionStatus: "active" });
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
  // credits/tier are set server-side from CATALOG, not from the client
  assert.equal(s.subscription_data.metadata.credits, "1890");
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

test("POST /checkout builds a one-time payment session for a top-up", async () => {
  const stripe = stubStripe();
  const core = createHandlerCore({ stripe, ddb: stubDdb({ GetItemCommand: {} }), tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
  await core(makeEvent({ method: "POST", path: "/checkout", body: { lookupKey: "ql_credits_2000" } }));
  const s = stripe.calls.sessionsCreate[0];
  assert.equal(s.mode, "payment");
  assert.equal(s.metadata.credits, "2000");
  assert.equal(s.metadata.kind, "topup");
  assert.equal("subscription_data" in s, false);
});

test("POST /checkout accepts a custom whole-dollar top-up and prices it ad hoc", async () => {
  const stripe = stubStripe();
  const core = createHandlerCore({ stripe, ddb: stubDdb({ GetItemCommand: {} }), tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
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
  const core = mk();
  for (const amountUsd of [4, 501, 12.5, -5, "20", 0]) {
    const res = await core(makeEvent({ method: "POST", path: "/checkout", body: { amountUsd } }));
    assert.equal(res.statusCode, 400, `amountUsd=${amountUsd} must be rejected`);
  }
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
  const tx = ddb.calls[0].input.TransactItems;
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
  const tx = ddb.calls[0].input.TransactItems;
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
  assert.equal(ddb.calls[0].input.TransactItems[1].Update.ExpressionAttributeValues[":amt"].N, "1890");
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
  assert.equal(ddb.calls[0].input.TransactItems[1].Update.ExpressionAttributeValues[":amt"].N, "6200");
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
  assert.equal(ddb.calls[0].input.TransactItems[1].Update.ExpressionAttributeValues[":amt"].N, "500");
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
  const tx = ddb.calls[0].input.TransactItems;
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
  const tx = ddb.calls[0].input.TransactItems;
  assert.equal(tx[1].Update.ExpressionAttributeValues[":tier"].S, "free");
  assert.equal(tx[1].Update.ExpressionAttributeValues[":ss"].S, "canceled");
});

test("webhook ignores unrelated event types without touching DynamoDB", async () => {
  const ddb = stubDdb();
  const event = { id: "evt_x", type: "payment_intent.created", data: { object: {} } };
  const core = createHandlerCore({ stripe: stubStripe({ event }), ddb, tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
  const res = await core(makeEvent({ method: "POST", path: "/webhook", sub: null, rawBody: "{}", headers: { "stripe-signature": "sig" } }));
  assert.equal(res.statusCode, 200);
  assert.equal(ddb.calls.length, 0);
});
