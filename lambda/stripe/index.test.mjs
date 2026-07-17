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

test("webhook invoice.paid grants the subscription's period credits and sets tier", async () => {
  const ddb = stubDdb();
  const event = { id: "evt_inv", type: "invoice.paid", data: { object: { subscription: "sub_1" } } };
  const stripe = stubStripe({
    event,
    subscription: { metadata: { userId: "user-7", tier: "pro", credits: "6200" } },
  });
  const core = createHandlerCore({ stripe, ddb, tableName: TABLE, webhookSecret: SECRET, siteOrigin: ORIGIN });
  const res = await core(
    makeEvent({ method: "POST", path: "/webhook", sub: null, rawBody: "{}", headers: { "stripe-signature": "sig" } })
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(stripe.calls.subsRetrieve, ["sub_1"]);
  const tx = ddb.calls[0].input.TransactItems;
  assert.equal(tx[1].Update.Key.pk.S, "WALLET#user-7");
  assert.equal(tx[1].Update.ExpressionAttributeValues[":amt"].N, "6200");
  assert.equal(tx[1].Update.ExpressionAttributeValues[":tier"].S, "pro");
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
