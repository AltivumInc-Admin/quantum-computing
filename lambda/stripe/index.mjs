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
// One table, qpu-style pk-prefixed rows: WALLET#<sub> (never expires),
// EVENT#<stripeEventId> (TTL'd — idempotency only needs to outlive Stripe's
// retry window), and RECEIPT#<paymentIntentId> (never expires — a refund may
// arrive long after the EVENT marker has aged out). NOTHING here ever adds
// credits a learner did not pay for: there are no free, promotional, or
// starter credits, and every positive wallet delta is a completed purchase or
// the return of the learner's own unused reserve.
//
// That invariant is scoped to THIS FUNCTION and still holds exactly as
// written. Elsewhere in the repo there is one — and only one — approved
// exception: scripts/founding-credit/ gifts 1,000 credits to the first 20
// learners ($200 ceiling), by hand, from a roster reviewed in git. It is
// deliberately NOT here: an admin path on an internet-facing function is a
// credit mint the day anyone adds a Function URL or a new event source, and
// web/__tests__/infra/credit-writers.test.ts asserts no module this function
// ships ever learns the cohort's key prefix. If you are reading this because
// the gift looks like a contradiction — it is not one, and deleting it is not
// the fix.
// DI-core like lambda/sync + lambda/qpu: createHandlerCore(deps)
// unit-tests under node --test with stubbed Stripe + DynamoDB; the production
// handler lazily builds the real deps from env on first invocation.
//
// Four modules, one entry point (this file exports createHandlerCore and the
// production handler; index.test.mjs drives the routes through it):
//   catalog.mjs       what is sold, which events matter, the API version — no imports
//   wallet-store.mjs  the rows and applyOnce, the ONLY place a balance is written
//   fulfillment.mjs   money IN: checkout sessions, paid invoices, the debt split
//   clawback.mjs      money OUT: refunds and disputes, reclaim() and its arithmetic
// index.mjs keeps the HTTP routes, the Checkout construction and the webhook
// switch that decides which event reaches which module.

import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import Stripe from "stripe";
import {
  CATALOG,
  CUSTOM_TOPUP_MAX_USD,
  CUSTOM_TOPUP_MIN_USD,
  CUSTOM_TOPUP_PRODUCT,
  STRIPE_API_VERSION,
} from "./catalog.mjs";
import { createWalletStore, walletKey } from "./wallet-store.mjs";
import { createClawback, CLAWBACK_UNRECLAIMED } from "./clawback.mjs";
import { createFulfillment, idOf } from "./fulfillment.mjs";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

// The pinned phrases and the retry sentinel moved with the code that uses them;
// re-exported so every importer of this module (the suite, the operator
// scripts) is unchanged.
export { CLAWBACK_RETRY } from "./wallet-store.mjs";
export { CLAWBACK_UNRECLAIMED } from "./clawback.mjs";
export { GRANT_WITHHELD } from "./fulfillment.mjs";

/**
 * Pinned phrase for a webhook whose signature did not verify. A metric filter in
 * template.yaml watches for it, so a secret mismatch pages instead of vanishing.
 *
 * This exists because a rehearsed rotation proved how invisible it is otherwise:
 * with a stale secret in a warm container, Stripe delivered, the handler returned
 * 400, and nothing anywhere recorded it — 24 invocations, no logs, no metrics, a
 * dead money path. AWS/Lambda Errors cannot see it (the invocation SUCCEEDS) and
 * the 5xx alarm cannot see it (this is a 4xx).
 */
export const SIGNATURE_REJECTED = "stripe-webhook: signature verification failed";

/**
 * Pinned phrase for a delivery whose mode does not match the key this stack
 * holds. Signature verification proves the payload came from Stripe; it does
 * NOT prove it came from the account this stack is supposed to serve, and the
 * same template deploys twice by design (NamePrefix quantum-stripe-sandbox).
 * A live event landing on the sandbox function would grant a real purchase
 * into the sandbox wallet table while the live table never moves — money taken
 * and credits written where nobody will look for them.
 */
export const LIVEMODE_MISMATCH = "stripe-webhook: event livemode does not match the key this stack holds";

/**
 * Refuse a live Stripe key in a stack named as a sandbox. The mirror of
 * scripts/stripe/e2e-sandbox.mjs's `if (!/sandbox/.test(table))` refusal,
 * moved to where it actually matters: the scripts hold a key for one run, the
 * deployed function holds it for the life of the container. Thrown from the
 * lazy build so the function never serves a request with the wrong key, and
 * lazyCore un-memoizes the failure so a corrected secret recovers on the next
 * invocation without a redeploy.
 */
export function assertKeyMatchesStack(secretKey, stackPrefix) {
  const live = /^(sk|rk)_live_/.test(secretKey ?? "");
  if (live && /sandbox/.test(stackPrefix ?? "")) {
    throw new Error(
      `refusing to start: a LIVE Stripe key in stack "${stackPrefix}" — a sandbox stack must never hold one`
    );
  }
  return live;
}

// What this handler sells, what it must be told about, and the version it speaks
// live in ./catalog.mjs, which imports NOTHING. The operator scripts that audit
// the Stripe Dashboard against them use raw fetch and none of the three SDKs
// imported at the top of this file — importing one constant from here pulled all
// three in, so `make stripe-parity` could not run on a clean checkout.
//
// Re-exported so every existing importer of this module is unchanged.
export { REQUIRED_WEBHOOK_EVENTS } from "./catalog.mjs";
export { CATALOG, CUSTOM_TOPUP_MIN_USD, CUSTOM_TOPUP_MAX_USD, CUSTOM_TOPUP_PRODUCT, STRIPE_API_VERSION };

export function createHandlerCore({
  stripe,
  ddb,
  tableName,
  webhookSecret,
  siteOrigin,
  // Idempotency rows self-expire — 30 days comfortably outstrips Stripe's
  // ~3-day event-retry window, then TTL reclaims them.
  eventTtlSeconds = 60 * 60 * 24 * 30,
  // Which Stripe mode this deployment's key belongs to, or undefined to make
  // no claim (every offline test). When it IS a boolean, a delivery whose
  // evt.livemode disagrees is refused: the wallet table is per-stack, so a
  // live event reaching the sandbox function grants a real purchase into the
  // sandbox table while the live table never moves.
  expectLivemode,
}) {
  // The money logic, composed once per core. The store is the only thing that
  // writes the wallet table; fulfillment and clawback decide how much moves and
  // hand it to the store; this file decides which Stripe event reaches which.
  const store = createWalletStore({ ddb, tableName, eventTtlSeconds });
  const { readWallet, applyOnceRetrying } = store;
  const { reclaim } = createClawback({ ddb, tableName, store });
  const { fulfillCheckoutSession, fulfillInvoicePaid } = createFulfillment({ stripe, store });

  /**
   * Top-ups are a subscriber convenience, not a way in.
   *
   * A free account gets the curriculum and a capped tutor trial and nothing
   * purchasable — so selling it credits would be selling something its tier
   * cannot spend, which is both a dead-weight liability and a small fraud on
   * the buyer. Subscriptions are therefore the only entry point; top-ups exist
   * to extend a subscription that ran dry mid-month.
   *
   * This also removes the pay-as-you-go path as a competitor to the tiers: a
   * grant can never be "worse than just topping up" for someone who has no
   * ability to top up in the first place.
   *
   * The webhook is the ONLY writer of `tier` and resets it to "free" on
   * customer.subscription.deleted, so this read is authoritative and needs no
   * separate Stripe round-trip. Absent row => free, matching GET /wallet.
   *
   * Takes the ALREADY-READ wallet item rather than a sub: /checkout needs the
   * same row again for the Stripe customer id, and reading it twice per click
   * bought nothing.
   */
  function isPaidTier(item) {
    const tier = item?.tier?.S ?? "free";
    return tier === "plus" || tier === "pro";
  }

  /**
   * A published lookup key -> the Stripe price id behind it, remembered for the
   * life of the container.
   *
   * CATALOG is six fixed keys, and the id behind one changes only when somebody
   * re-points the lookup key in the Dashboard — yet every Subscribe/Buy click
   * spent a Stripe round trip re-deriving it, in front of the round trip the
   * request genuinely cannot avoid. Bounded rather than permanent so a
   * re-pointed key heals on its own without a redeploy, and evicted outright
   * when Checkout rejects the id, which is how a stale one actually surfaces.
   *
   * The freshness field is `validUntil` on purpose. The obvious name for it is
   * the DynamoDB TTL attribute's, which is reserved: web/__tests__/infra/
   * wallet-ttl counts every occurrence of that attribute name in this file, so
   * that one can never drift onto a row TTL would delete whole. An in-memory
   * cache has no business spending one of those occurrences.
   */
  const priceIds = new Map();
  const PRICE_ID_TTL_MS = 10 * 60 * 1000;

  async function resolvePriceId(lookupKey) {
    const cached = priceIds.get(lookupKey);
    if (cached && cached.validUntil > Date.now()) return cached.priceId;
    const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    const priceId = prices.data?.[0]?.id;
    // A miss is never cached: "not configured" is a state someone is about to
    // fix, and remembering it would outlast the fix.
    if (priceId) priceIds.set(lookupKey, { priceId, validUntil: Date.now() + PRICE_ID_TTL_MS });
    return priceId;
  }

  const forgetPriceId = (lookupKey) => priceIds.delete(lookupKey);

  /** Reuse the user's Stripe customer, or create one bound to their sub.
   *
   *  `preRead` is the wallet row the caller already has (null is a real answer
   *  — no row yet — so only `undefined` means "read it yourself"). The lost-race
   *  path below still re-reads, which is the only read that has to be fresh. */
  async function ensureCustomer(sub, email, preRead) {
    const item = preRead === undefined ? await readWallet(sub) : preRead;
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
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        return await fulfillCheckoutSession(evt, obj);

      case "checkout.session.async_payment_failed": {
        // The delayed payment fell through: the buyer was told at checkout,
        // Stripe emails them (dashboard setting), and no credits were ever
        // granted (the unpaid completion wrote nothing). Nothing to unwind —
        // but leave loud evidence, because a buyer who insists they paid will
        // be looked up by session id. Same alertability caveat as the
        // invoice.paid log below: console.error inside a 200 trips no alarm.
        console.error(
          "checkout.session.async_payment_failed: delayed payment failed; nothing granted",
          evt.id,
          obj.id,
          obj.client_reference_id
        );
        return;
      }

      // Exactly one economic event per subscription payment. Stripe also emits
      // invoice.payment_succeeded for the same money; handling both would grant
      // twice (distinct event ids dodge idempotency), so we handle invoice.paid
      // alone — first period and every renewal.
      case "invoice.paid":
        return await fulfillInvoicePaid(evt, obj);

      case "customer.subscription.deleted": {
        const sub = obj.metadata?.userId;
        if (!sub) return;
        return await applyOnceRetrying(evt.type, {
          eventId: evt.id,
          sub,
          setTier: "free",
          setSubStatus: "canceled",
        });
      }

      case "customer.subscription.updated": {
        const sub = obj.metadata?.userId;
        if (!sub) return;
        return await applyOnceRetrying(evt.type, { eventId: evt.id, sub, setSubStatus: obj.status });
      }

      // Money going back to the customer takes its credits with it.
      case "charge.refunded": {
        const amount = Number(obj.amount ?? 0);
        const refunded = Number(obj.amount_refunded ?? 0);
        if (!(amount > 0)) return;
        // amount_refunded is CUMULATIVE, so this fraction is absolute: the
        // target it produces is "what this grant should total", not a delta.
        return await reclaim({
          eventId: evt.id,
          paymentIntent: idOf(obj.payment_intent),
          field: "refundedCredits",
          fraction: refunded / amount,
          label: "charge.refunded",
        });
      }

      // Disputes: act on the FUNDS-MOVEMENT events, never charge.dispute.created
      // — that also fires for inquiries where Stripe withdraws nothing, and
      // clawing back there would zero a paying customer's wallet for free.
      case "charge.dispute.funds_withdrawn": {
        return await reclaim({
          eventId: evt.id,
          paymentIntent: idOf(obj.payment_intent),
          field: "disputedCredits",
          // Pro-rated by reclaim() against the receipt's amountPaidCents — a
          // dispute's amount is NOT guaranteed to be the whole charge (#230).
          // Tracked on its own counter, so a later partial refund's arithmetic
          // cannot read this as a reduction and re-grant.
          disputedAmountCents: Number(obj.amount),
          label: "charge.dispute.funds_withdrawn",
        });
      }

      case "charge.dispute.funds_reinstated": {
        return await reclaim({
          eventId: evt.id,
          paymentIntent: idOf(obj.payment_intent),
          field: "disputedCredits",
          fraction: 0,
          restore: true,
          label: "charge.dispute.funds_reinstated",
        });
      }

      default:
        // A money-shaped event we do not handle is indistinguishable from a
        // quiet day unless it says so. Same pinned phrase, so the existing
        // filter covers it with no new resource.
        if (/^(charge|refund|payout|radar)\./.test(evt.type)) {
          console.error(
            `stripe-webhook: unhandled money event type; ${CLAWBACK_UNRECLAIMED}`,
            evt.type,
            evt.id
          );
        }
        return;
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
      } catch (err) {
        // 400 (not 5xx) is deliberate: a forged or unverifiable payload must not
        // put Stripe into a multi-day retry loop. But it must not be silent —
        // the overwhelmingly likely cause is OUR secret being wrong, not an
        // attacker, and that means every real event is being dropped too.
        console.error(SIGNATURE_REJECTED, err?.message ?? "unknown");
        return json(400, { error: "signature verification failed" });
      }
      // A verified signature says "Stripe sent this", not "the account this
      // stack serves sent this". 400 rather than 5xx for the same reason as
      // above: retrying cannot make a sandbox stack the right home for a live
      // event. The pinned phrase is what turns it into a page.
      if (
        typeof expectLivemode === "boolean" &&
        typeof evt.livemode === "boolean" &&
        evt.livemode !== expectLivemode
      ) {
        console.error(LIVEMODE_MISMATCH, evt.id, evt.type, `livemode=${evt.livemode}`);
        return json(400, { error: "livemode mismatch" });
      }
      let summary;
      try {
        summary = await handleEvent(evt);
      } catch (err) {
        // A 5xx tells Stripe to retry later; idempotency makes that safe.
        console.error("webhook handling failed", evt.type, err);
        return json(500, { error: "handler error" });
      }
      // ONE structured line per accepted delivery — the only console.log in
      // this file. Until it existed the money path could not be audited from
      // CloudWatch at all: a learner saying "I paid and got nothing" could
      // only be investigated by reading DynamoDB rows and the Stripe Dashboard
      // side by side, a redelivery storm was indistinguishable from a run of
      // fresh purchases, and no Logs Insights query could count grants,
      // clawbacks or replays. `outcome` distinguishes a committed write from a
      // replayed one (which applyOnce already knew and every caller threw
      // away) and from a delivery that decided to write nothing.
      //
      // CREDITS ONLY — never a dollar amount, never a customer email. The log
      // group is a support tool, not a second copy of the ledger.
      console.log(
        JSON.stringify({ msg: "stripe-webhook", type: evt.type, eventId: evt.id, outcome: "noop", ...summary })
      );
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
        // The debt-gate (qpu-core.mjs / tutor index.mjs) refuses any spend while
        // this is nonzero. Without exposing it, a locked-out learner sees a
        // positive balance and "insufficient-credits" — undiagnosable from the
        // outside. Zero when absent, so the client needs no null handling.
        clawbackOwedCredits: item?.clawbackOwedCredits?.N ? Number(item.clawbackOwedCredits.N) : 0,
      });
    }

    if (path.endsWith("/checkout") && method === "POST") {
      let body;
      try {
        body = JSON.parse(event.body ?? "");
      } catch {
        return json(400, { error: "invalid JSON body" });
      }

      // Where Stripe sends the buyer back, either way. Built once: both
      // branches below hand Checkout the same pair, and two copies is how one
      // of them quietly keeps pointing at a route the other has moved off.
      const returnUrls = {
        success_url: `${siteOrigin}/workspace?checkout=success`,
        cancel_url: `${siteOrigin}/pricing?checkout=cancelled`,
      };

      // ONE wallet read per click, reused for both things this route asks of
      // it: the paid-tier gate and the Stripe customer id.
      const wallet = await readWallet(sub);

      // ---- Custom top-up: { amountUsd } — whole dollars, bounded, 1:1 credits ----
      if (body?.amountUsd !== undefined) {
        if (!isPaidTier(wallet)) return json(403, { error: "subscription required" });
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
        const customer = await ensureCustomer(sub, email, wallet);
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
          ...returnUrls,
        });
        return json(200, { url: session.url });
      }

      const spec = CATALOG[body?.lookupKey];
      if (!spec) return json(400, { error: "unknown lookupKey" });
      if (spec.mode === "payment" && !isPaidTier(wallet)) {
        return json(403, { error: "subscription required" });
      }

      const priceId = await resolvePriceId(body.lookupKey);
      if (!priceId) return json(500, { error: "price not configured" });

      const customer = await ensureCustomer(sub, email, wallet);
      const common = {
        customer,
        client_reference_id: sub,
        line_items: [{ price: priceId, quantity: 1 }],
        ...returnUrls,
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

      let session;
      try {
        session = await stripe.checkout.sessions.create(params);
      } catch (err) {
        // The memo is the only thing here that can go stale, and a rejected
        // price id is exactly how that shows up. Drop it so the next click
        // re-resolves rather than repeating the same bad id until the
        // container recycles.
        forgetPriceId(body.lookupKey);
        throw err;
      }
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

async function loadSecret(secretId) {
  const sm = new SecretsManagerClient({});
  const res = await sm.send(new GetSecretValueCommand({ SecretId: secretId }));
  return JSON.parse(res.SecretString);
}

/**
 * Build-once-per-container, but never memoize a FAILURE: if `build` rejects
 * (a Secrets Manager throttle, an IAM hiccup, a read that raced a secret
 * rotation), the memo is cleared before rethrowing, so the invocation that
 * hit the fault still 500s but the next one rebuilds instead of replaying
 * the same rejection until Lambda happens to recycle the container.
 * Exported for tests; the retry semantics are load-bearing during webhook
 * secret rotation.
 */
/**
 * Every Stripe call must finish INSIDE the Lambda's own timeout, or the
 * runtime kills the invocation and none of this handler's error paths run:
 * the webhook's "webhook handling failed" line is never emitted (so
 * WebhookHandlerFaultAlarm stays silent and only the dimensionless Errors
 * alarm fires, with no event type recorded), and a /checkout killed between
 * customers.create and the UpdateItem that stores the id orphans a Stripe
 * customer with no retry able to reach it.
 *
 * stripe-node's defaults are an 80,000 ms per-request timeout and 2 network
 * retries — five times the template's `Timeout: 15` for a single attempt, so
 * a stalled call is ALWAYS ended by the runtime rather than by us. These
 * numbers are chosen so the worst case stays under it: two attempts of 6 s
 * plus the SDK's jittered backoff (capped at 2 s) is ~14 s, leaving a stalled
 * call to surface as a StripeConnectionError inside the handler — logged with
 * the event type and 500'd for redelivery on the webhook, rendered as a
 * failure by the button on /checkout.
 *
 * template.test.mjs pins this against the template's Timeout; change one and
 * it reddens rather than silently reopening the gap.
 */
export const STRIPE_CLIENT_OPTIONS = {
  apiVersion: STRIPE_API_VERSION,
  timeout: 6000,
  maxNetworkRetries: 1,
};

export function lazyCore(build) {
  let corePromise;
  return async (event) => {
    if (!corePromise) {
      corePromise = Promise.resolve()
        .then(build)
        .catch((err) => {
          corePromise = undefined;
          throw err;
        });
    }
    return (await corePromise)(event);
  };
}

export const handler = lazyCore(async () => {
  const { secretKey, webhookSecret } = await loadSecret(process.env.SECRET_ID);
  // Before the client exists, not after: a sandbox stack holding the live key
  // would mint real Checkout Sessions and grant real purchases into the
  // sandbox wallet table. STACK_PREFIX is the template's NamePrefix, so the
  // stack names itself and the function believes the name.
  const live = assertKeyMatchesStack(secretKey, process.env.STACK_PREFIX);
  return createHandlerCore({
    stripe: new Stripe(secretKey, STRIPE_CLIENT_OPTIONS),
    ddb: new DynamoDBClient({}),
    tableName: process.env.TABLE_NAME,
    webhookSecret,
    siteOrigin: process.env.SITE_ORIGIN,
    expectLivemode: live,
  });
});
