// quantum-stripe: billing for the Quantum Learner credit wallet.
//
// One Lambda, four routes behind an HTTP API v2:
//   POST /checkout  (Cognito JWT)  -> a Stripe Checkout Session URL for a tier
//                                     subscription or a credit top-up
//   POST /portal    (Cognito JWT)  -> a Billing Portal Session URL (self-serve)
//   GET  /wallet    (Cognito JWT)  -> the caller's tier + credit balance
//   POST /webhook   (PUBLIC)       -> Stripe-signed events; the ONLY writer of
//                                     credits and tier. Verified by signature,
//                                     never by the JWT authorizer — Stripe is
//                                     not a logged-in user.
//
// Money -> credits is EXACTLY ONCE. Every wallet mutation runs as a DynamoDB
// TransactWriteItems that (a) conditionally records the Stripe event id and
// (b) applies the wallet change, atomically. A duplicate delivery re-attempts
// the same conditional put, the transaction is cancelled, and the wallet is
// untouched. Credits are a dollar-pegged wallet (1 credit = $0.01); the credit
// count for each purchase is set server-side from CATALOG (never trusted from
// the client) and carried in Stripe metadata to the webhook.
//
// One table, qpu-style pk-prefixed rows: WALLET#<sub> (never expires) and
// EVENT#<stripeEventId> (TTL'd — idempotency only needs to outlive Stripe's
// retry window). DI-core like lambda/sync + lambda/qpu: createHandlerCore(deps)
// unit-tests under node --test with stubbed Stripe + DynamoDB; the production
// handler lazily builds the real deps from env on first invocation.

import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import Stripe from "stripe";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const walletKey = (sub) => ({ pk: { S: `WALLET#${sub}` } });
const eventKey = (id) => ({ pk: { S: `EVENT#${id}` } });

// The published catalog's lookup keys -> what checking out each one means.
// A /checkout request may name ONLY these keys, so a caller can never coerce an
// arbitrary Stripe price or credit amount. The credit counts are the server-
// side source of truth (mirroring web/src/lib/pricing.ts): they are written
// into Stripe metadata at session creation and read back, verbatim, by the
// webhook, so the wallet is never at the mercy of a mis-tagged price.
export const CATALOG = {
  ql_plus_monthly: { mode: "subscription", tier: "plus", credits: 1890 },
  ql_pro_monthly: { mode: "subscription", tier: "pro", credits: 6200 },
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

export function createHandlerCore({
  stripe,
  ddb,
  tableName,
  webhookSecret,
  siteOrigin,
  // Idempotency rows self-expire — 30 days comfortably outstrips Stripe's
  // ~3-day event-retry window, then TTL reclaims them.
  eventTtlSeconds = 60 * 60 * 24 * 30,
}) {
  async function readWallet(sub) {
    const res = await ddb.send(
      new GetItemCommand({ TableName: tableName, Key: walletKey(sub) })
    );
    return res.Item ?? null;
  }

  /**
   * Apply a wallet change exactly once for a given Stripe event. The event-id
   * put and the wallet update are one transaction: a repeated delivery fails
   * the attribute_not_exists condition, the whole transaction cancels, and the
   * balance is left alone. Returns false when the event was already applied.
   */
  async function applyOnce({ eventId, sub, addCredits = 0, setTier, setSubStatus }) {
    const sets = ["updatedAt = :now"];
    const adds = [];
    const values = { ":now": { N: String(Date.now()) } };
    if (addCredits > 0) {
      adds.push("credits :amt");
      values[":amt"] = { N: String(addCredits) };
    }
    if (setTier) {
      sets.push("tier = :tier");
      values[":tier"] = { S: setTier };
    }
    if (setSubStatus) {
      sets.push("subscriptionStatus = :ss");
      values[":ss"] = { S: setSubStatus };
    }
    let expr = "SET " + sets.join(", ");
    if (adds.length) expr += " ADD " + adds.join(", ");

    try {
      await ddb.send(
        new TransactWriteItemsCommand({
          TransactItems: [
            {
              Put: {
                TableName: tableName,
                Item: {
                  ...eventKey(eventId),
                  expiresAt: {
                    N: String(Math.floor(Date.now() / 1000) + eventTtlSeconds),
                  },
                },
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
            {
              Update: {
                TableName: tableName,
                Key: walletKey(sub),
                UpdateExpression: expr,
                ExpressionAttributeValues: values,
              },
            },
          ],
        })
      );
      return true;
    } catch (err) {
      // Only the event-id condition can cancel this transaction; a cancellation
      // whose first reason is a failed condition means the event was already
      // processed. Anything else is a real fault — throw so Stripe retries.
      if (err?.name === "TransactionCanceledException") {
        const reasons = err.CancellationReasons ?? [];
        if (reasons[0]?.Code === "ConditionalCheckFailed") return false;
      }
      throw err;
    }
  }

  /** Reuse the user's Stripe customer, or create one bound to their sub. */
  async function ensureCustomer(sub, email) {
    const item = await readWallet(sub);
    const existing = item?.stripeCustomerId?.S;
    if (existing) return existing;

    const customer = await stripe.customers.create({
      metadata: { userId: sub },
      ...(email ? { email } : {}),
    });
    try {
      await ddb.send(
        new UpdateItemCommand({
          TableName: tableName,
          Key: walletKey(sub),
          UpdateExpression: "SET stripeCustomerId = :c, updatedAt = :now",
          ConditionExpression: "attribute_not_exists(stripeCustomerId)",
          ExpressionAttributeValues: {
            ":c": { S: customer.id },
            ":now": { N: String(Date.now()) },
          },
        })
      );
      return customer.id;
    } catch (err) {
      // A concurrent checkout won the race and stored its own customer. Ours is
      // orphaned (harmless — no charges), and the stored one is authoritative.
      if (err?.name === "ConditionalCheckFailedException") {
        const after = await readWallet(sub);
        return after?.stripeCustomerId?.S ?? customer.id;
      }
      throw err;
    }
  }

  async function handleEvent(evt) {
    const obj = evt.data?.object ?? {};
    switch (evt.type) {
      case "checkout.session.completed": {
        const sub = obj.client_reference_id;
        if (!sub) return;
        if (obj.mode === "payment") {
          const credits = Number(obj.metadata?.credits);
          if (Number.isFinite(credits) && credits > 0) {
            await applyOnce({ eventId: evt.id, sub, addCredits: credits });
          }
        } else if (obj.mode === "subscription") {
          // Credits for the period arrive on invoice.paid; here we only light up
          // the tier immediately so the UI reflects the purchase without waiting.
          await applyOnce({
            eventId: evt.id,
            sub,
            setTier: obj.metadata?.tier,
            setSubStatus: "active",
          });
        }
        return;
      }

      // Exactly one economic event per subscription payment. Stripe also emits
      // invoice.payment_succeeded for the same money; handling both would grant
      // twice (distinct event ids dodge idempotency), so we handle invoice.paid
      // alone — first period and every renewal.
      case "invoice.paid": {
        const subId = obj.subscription;
        if (!subId) return; // not a subscription invoice
        const subscription = await stripe.subscriptions.retrieve(subId);
        const sub = subscription.metadata?.userId;
        if (!sub) return;
        const credits = Number(subscription.metadata?.credits);
        await applyOnce({
          eventId: evt.id,
          sub,
          addCredits: Number.isFinite(credits) && credits > 0 ? credits : 0,
          setTier: subscription.metadata?.tier,
          setSubStatus: "active",
        });
        return;
      }

      case "customer.subscription.deleted": {
        const sub = obj.metadata?.userId;
        if (!sub) return;
        await applyOnce({ eventId: evt.id, sub, setTier: "free", setSubStatus: "canceled" });
        return;
      }

      case "customer.subscription.updated": {
        const sub = obj.metadata?.userId;
        if (!sub) return;
        await applyOnce({ eventId: evt.id, sub, setSubStatus: obj.status });
        return;
      }

      default:
        return; // every other event type is intentionally ignored
    }
  }

  return async function core(event) {
    const method = event.requestContext?.http?.method;
    const path = event.requestContext?.http?.path ?? event.rawPath ?? "";
    const claims = event.requestContext?.authorizer?.jwt?.claims;

    // ---- POST /webhook (public; authenticity is the Stripe signature) ----
    if (path.endsWith("/webhook") && method === "POST") {
      const sig = event.headers?.["stripe-signature"];
      if (!sig) return json(400, { error: "missing signature" });
      const raw = event.isBase64Encoded
        ? Buffer.from(event.body ?? "", "base64")
        : (event.body ?? "");
      let evt;
      try {
        evt = await stripe.webhooks.constructEventAsync(raw, sig, webhookSecret);
      } catch {
        return json(400, { error: "signature verification failed" });
      }
      try {
        await handleEvent(evt);
      } catch (err) {
        // A 5xx tells Stripe to retry later; idempotency makes that safe.
        console.error("webhook handling failed", evt.type, err);
        return json(500, { error: "handler error" });
      }
      return json(200, { received: true });
    }

    // ---- Authenticated routes: identity is the verified Cognito sub ----
    const sub = claims?.sub;
    if (!sub) return json(401, { error: "unauthorized" });
    const email = typeof claims?.email === "string" ? claims.email : undefined;

    if (path.endsWith("/wallet") && method === "GET") {
      const item = await readWallet(sub);
      return json(200, {
        tier: item?.tier?.S ?? "free",
        credits: item?.credits?.N ? Number(item.credits.N) : 0,
        subscriptionStatus: item?.subscriptionStatus?.S ?? null,
      });
    }

    if (path.endsWith("/checkout") && method === "POST") {
      let body;
      try {
        body = JSON.parse(event.body ?? "");
      } catch {
        return json(400, { error: "invalid JSON body" });
      }

      // ---- Custom top-up: { amountUsd } — whole dollars, bounded, 1:1 credits ----
      if (body?.amountUsd !== undefined) {
        const amountUsd = body.amountUsd;
        if (
          !Number.isInteger(amountUsd) ||
          amountUsd < CUSTOM_TOPUP_MIN_USD ||
          amountUsd > CUSTOM_TOPUP_MAX_USD
        ) {
          return json(400, {
            error: `amountUsd must be a whole dollar amount from ${CUSTOM_TOPUP_MIN_USD} to ${CUSTOM_TOPUP_MAX_USD}`,
          });
        }
        const credits = amountUsd * 100; // the $0.01 peg, server-computed
        const customer = await ensureCustomer(sub, email);
        const session = await stripe.checkout.sessions.create({
          customer,
          client_reference_id: sub,
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "usd",
                product: CUSTOM_TOPUP_PRODUCT,
                unit_amount: amountUsd * 100,
              },
              quantity: 1,
            },
          ],
          metadata: { userId: sub, credits: String(credits), kind: "topup" },
          success_url: `${siteOrigin}/workspace?checkout=success`,
          cancel_url: `${siteOrigin}/pricing?checkout=cancelled`,
        });
        return json(200, { url: session.url });
      }

      const spec = CATALOG[body?.lookupKey];
      if (!spec) return json(400, { error: "unknown lookupKey" });

      const prices = await stripe.prices.list({
        lookup_keys: [body.lookupKey],
        active: true,
        limit: 1,
      });
      const price = prices.data?.[0];
      if (!price) return json(500, { error: "price not configured" });

      const customer = await ensureCustomer(sub, email);
      const common = {
        customer,
        client_reference_id: sub,
        line_items: [{ price: price.id, quantity: 1 }],
        success_url: `${siteOrigin}/workspace?checkout=success`,
        cancel_url: `${siteOrigin}/pricing?checkout=cancelled`,
      };
      const params =
        spec.mode === "subscription"
          ? {
              ...common,
              mode: "subscription",
              metadata: { userId: sub, tier: spec.tier, kind: "subscription" },
              subscription_data: {
                metadata: { userId: sub, tier: spec.tier, credits: String(spec.credits) },
              },
            }
          : {
              ...common,
              mode: "payment",
              metadata: { userId: sub, credits: String(spec.credits), kind: "topup" },
            };

      const session = await stripe.checkout.sessions.create(params);
      return json(200, { url: session.url });
    }

    if (path.endsWith("/portal") && method === "POST") {
      const item = await readWallet(sub);
      const customer = item?.stripeCustomerId?.S;
      if (!customer) return json(400, { error: "no billing account yet" });
      const portal = await stripe.billingPortal.sessions.create({
        customer,
        return_url: `${siteOrigin}/workspace`,
      });
      return json(200, { url: portal.url });
    }

    return json(405, { error: "method not allowed" });
  };
}

// ---------------------------------------------------------------------------
// Production wiring: build the core once per container, lazily on first
// invocation (so importing this module for tests never constructs a Stripe
// client or touches AWS). The Stripe keys live in ONE Secrets Manager secret
// ({ secretKey, webhookSecret }); the Lambda reads it with its own least-
// privilege execution role at cold start. Keeping the secret out of the env
// entirely means it is never visible via GetFunctionConfiguration — a step up
// from injecting it as an environment variable.
// ---------------------------------------------------------------------------

let corePromise;

async function loadSecret(secretId) {
  const sm = new SecretsManagerClient({});
  const res = await sm.send(new GetSecretValueCommand({ SecretId: secretId }));
  return JSON.parse(res.SecretString);
}

export const handler = async (event) => {
  if (!corePromise) {
    corePromise = loadSecret(process.env.SECRET_ID).then(({ secretKey, webhookSecret }) =>
      createHandlerCore({
        stripe: new Stripe(secretKey, { apiVersion: "2026-06-24.dahlia" }),
        ddb: new DynamoDBClient({}),
        tableName: process.env.TABLE_NAME,
        webhookSecret,
        siteOrigin: process.env.SITE_ORIGIN,
      })
    );
  }
  return (await corePromise)(event);
};
