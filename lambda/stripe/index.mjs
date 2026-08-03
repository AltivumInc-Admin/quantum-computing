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
// web/__tests__/infra/credit-writers.test.ts asserts this file never learns
// the cohort's key prefix. If you are reading this because the gift looks
// like a contradiction — it is not one, and deleting it is not the fix.
// DI-core like lambda/sync + lambda/qpu: createHandlerCore(deps)
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
/**
 * A PURCHASE RECEIPT — "PaymentIntent pi_X bought N credits for user Y".
 *
 * NOT a gift. No wallet delta THIS FUNCTION writes is a gift: every one is
 * either a completed Stripe purchase or the return of the learner's own unused
 * reserve (lambda/qpu releaseReservation, lambda/tutor settle). This row exists
 * solely so a REFUND can reverse exactly what a specific payment bought.
 *
 * The founding-cohort gift (scripts/founding-credit/) writes no receipt, by
 * design: reclaim() finds receipts only by GetItem on receiptKey(paymentIntent)
 * — no scan, no index — so gifted credits are structurally unreachable from
 * every refund path and can never be clawed back against a payment that never
 * happened.
 *
 * Keyed by PaymentIntent id because that is the only link surviving from a
 * Charge back to what it bought: `Charge.invoice` was removed in the Basil
 * relocation — the same wave that moved the subscription id under
 * `Invoice.parent` and silently broke every credit purchase — so a refund
 * cannot re-derive the purchase from Stripe's object graph. No TTL: Stripe's
 * dispute window outlives the 30-day EVENT# marker.
 */
const receiptKey = (pi) => ({ pk: { S: `RECEIPT#${pi}` } });

// Transaction leg positions. EVENT and WALLET keep their historical indexes so
// the reason-code contract stays stable; RECEIPT is appended.
const EVENT_LEG = 0;
const WALLET_LEG = 1;
const RECEIPT_LEG = 2;

/** applyOnce's third outcome: the RECEIPT row moved under us — re-read, retry. */
export const CLAWBACK_RETRY = Symbol("clawback-retry");

/**
 * The ONE literal phrase every unreclaimable-money branch ends with. A single
 * CloudWatch metric filter pins this string, so a branch added later is
 * covered for free — the deliberate mirror of "credits NOT granted".
 */
export const CLAWBACK_UNRECLAIMED = "credits NOT reclaimed";

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
  async function applyOnce({
    eventId,
    sub,
    // SIGNED. A clawback passes a negative value; the old `addCredits > 0`
    // guard silently dropped it while still burning the idempotency key, so
    // the event could never be reprocessed and the credits never moved.
    deltaCredits = 0,
    setTier,
    setSubStatus,
    owedCredits = 0,
    // Optional third leg: the purchase receipt that makes a refund findable.
    // ALWAYS APPENDED at index RECEIPT_LEG so EVENT_LEG/WALLET_LEG keep their
    // positions — the catch below and the suite's positional pins both depend
    // on the reason indexes not shifting.
    receiptLeg,
  }) {
    const sets = ["updatedAt = :now"];
    const adds = [];
    const values = { ":now": { N: String(Date.now()) } };
    if (deltaCredits !== 0) {
      adds.push("credits :amt");
      values[":amt"] = { N: String(deltaCredits) };
    }
    if (owedCredits !== 0) {
      adds.push("clawbackOwedCredits :owed");
      values[":owed"] = { N: String(owedCredits) };
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
            ...(receiptLeg ? [receiptLeg] : []),
          ],
        })
      );
      return true;
    } catch (err) {
      // Branch PER LEG by name, never on "the first reason" — with the GRANT
      // leg present, more than one condition can cancel this transaction and
      // conflating them would read an OCC loss as a replay (silently dropping
      // a clawback) or a replay as a fault (a pointless Stripe retry storm).
      if (err?.name === "TransactionCanceledException") {
        const reasons = err.CancellationReasons ?? [];
        const failed = (i) => reasons[i]?.Code === "ConditionalCheckFailed";
        if (failed(EVENT_LEG)) return false; // already processed
        if (receiptLeg && failed(RECEIPT_LEG)) return CLAWBACK_RETRY; // lost update
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

  // Where the subscription id lives on an Invoice, across API versions.
  //
  // The shape of evt.data.object is decided by the API version pinned on the
  // WEBHOOK ENDPOINT in the Stripe Dashboard, NOT by the SDK's apiVersion at the
  // bottom of this file: that pin only shapes our outbound REST calls, while the
  // event object is parsed verbatim out of the raw request body. So this handler
  // can be handed either shape at any time and must read both.
  //
  // Modern (the vendored stripe 18.5.0 Invoice type in
  // node_modules/stripe/types/Invoices.d.ts): there is NO top-level
  // `subscription` property at all; the id moved to
  // parent.subscription_details.subscription. Reading only the retired
  // top-level field is exactly what made every subscription credit grant fail
  // silently: the id came back undefined, the handler returned early, and the
  // route still answered 200.
  //
  // Legacy (an endpoint still pinned to an API version from before the move):
  // obj.subscription.
  //
  // Either form may be an expanded Subscription object instead of a bare id
  // string (the type is `string | Stripe.Subscription`), so normalize to the id.
  /** Normalize `string | Object | null` to an id — every Stripe reference may
   *  arrive expanded depending on the endpoint's configuration. */
  function idOf(ref) {
    if (typeof ref === "string") return ref;
    return typeof ref?.id === "string" ? ref.id : undefined;
  }

  /**
   * The PaymentIntent behind a paid invoice. `Invoice.charge` and
   * `Invoice.payment_intent` were BOTH removed in Basil; the surviving link is
   * `payments[].payment.payment_intent`, and `payments` is not expanded on the
   * raw webhook payload, so the invoice must be re-retrieved. Guarded the same
   * way invoiceSubscriptionId is: an unresolvable id is logged, never guessed.
   */
  async function invoicePaymentIntent(invoiceId) {
    try {
      const full = await stripe.invoices.retrieve(invoiceId, { expand: ["payments"] });
      for (const p of full?.payments?.data ?? []) {
        const pi = idOf(p?.payment?.payment_intent);
        if (pi) return pi;
      }
    } catch (err) {
      console.error("invoice.paid: could not expand payments", invoiceId, err?.name);
    }
    return undefined;
  }

  /** The durable purchase receipt a future refund will look up. Only built when the
   *  key is a real PaymentIntent — a falsy key would merge unrelated users'
   *  purchases under one row (e.g. a 100%-off session, which has no PI at all). */
  function receiptRowLeg(paymentIntent, sub, credits) {
    if (!paymentIntent || !(credits > 0)) return undefined;
    return {
      Put: {
        TableName: tableName,
        Item: {
          ...receiptKey(paymentIntent),
          sub: { S: sub },
          purchasedCredits: { N: String(credits) },
          refundedCredits: { N: "0" },
          disputedCredits: { N: "0" },
          createdAt: { N: String(Date.now()) },
        },
      },
    };
  }

  function invoiceSubscriptionId(invoice) {
    const raw = invoice.parent?.subscription_details?.subscription ?? invoice.subscription;
    if (typeof raw === "string") return raw;
    return typeof raw?.id === "string" ? raw.id : undefined;
  }

  // Does this invoice claim to have come from a subscription? Used ONLY to
  // decide whether an unresolvable subscription id is worth shouting about. A
  // genuine one-off invoice (billing_reason "manual", parent.type
  // "quote_details", or no parent at all) legitimately has no subscription and
  // must stay quiet, or the noise trains us to ignore the signal.
  //
  // billing_reason is checked as well as parent.type because it is the field
  // that would survive ANOTHER relocation of the id: if Stripe moves the
  // subscription reference a second time, `parent` may be gone too, but
  // billing_reason "subscription_cycle" still tells us a renewal just went
  // uncredited.
  function looksSubscriptionInvoice(invoice) {
    return (
      invoice.parent?.type === "subscription_details" ||
      (typeof invoice.billing_reason === "string" &&
        invoice.billing_reason.startsWith("subscription"))
    );
  }

  /**
   * Fulfill a Checkout Session: credits for a top-up, tier light-up for a
   * subscription. Shared by checkout.session.completed and
   * checkout.session.async_payment_succeeded — for delayed-notification
   * methods (Klarna, Cash App, Amazon Pay, ACH) the session "completes" with
   * payment_status "unpaid" BEFORE any money moves, and the money outcome
   * arrives later as async_payment_succeeded/failed. Stripe's fulfillment
   * contract: fulfill when payment_status != "unpaid" ("no_payment_required",
   * e.g. a 100%-off promotion, still fulfills); an unpaid session fulfills
   * nothing and waits. Idempotency is per EVENT id, and the unpaid completion
   * writes nothing, so the eventual async_payment_succeeded is the one and
   * only grant for the purchase — no double-credit window.
   */
  /**
   * Split a purchase between clearing debt and adding spendable credits.
   *
   * Product rule: an owing learner must CLEAR the debt — so money pays down
   * `clawbackOwedCredits` before any of it becomes spendable. A purchase
   * smaller than the debt adds nothing spendable, which is the honest outcome:
   * the learner is buying their way back to zero, and the top-up surface says
   * so rather than quietly crediting a balance they cannot use.
   */
  async function splitAgainstDebt(sub, credits) {
    const res = await ddb.send(
      new GetItemCommand({ TableName: tableName, Key: walletKey(sub) })
    );
    const owed = Number(res.Item?.clawbackOwedCredits?.N ?? 0);
    if (!(owed > 0)) return { deltaCredits: credits, owedCredits: 0 };
    const applied = Math.min(owed, credits);
    return { deltaCredits: credits - applied, owedCredits: -applied };
  }

  async function fulfillCheckoutSession(evt, obj) {
    const sub = obj.client_reference_id;
    if (!sub) return;
    if (obj.payment_status === "unpaid") return; // money not settled yet
    if (obj.mode === "payment") {
      const credits = Number(obj.metadata?.credits);
      if (Number.isFinite(credits) && credits > 0) {
        const split = await splitAgainstDebt(sub, credits);
        await applyOnce({
          eventId: evt.id,
          sub,
          ...split,
          receiptLeg: receiptRowLeg(idOf(obj.payment_intent), sub, credits),
        });
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
  }

  /**
   * Reclaim credits for money that went back to the customer.
   *
   * The arithmetic is ABSOLUTE, not incremental: Stripe's `amount_refunded` is
   * cumulative, so we compute a target ("this purchase should be reclaimed to N")
   * and move only `target - alreadyReclaimed`. That makes a replayed, stale, or
   * out-of-order delivery a no-op rather than a double-clawback, and — because
   * the target is recomputed from live Stripe state — it stays correct even
   * after the 30-day EVENT# idempotency marker has expired, which matters
   * because Stripe's dispute window is longer than that.
   *
   * `field` is which counter this kind of clawback owns. Refunds and disputes
   * keep SEPARATE counters so their numerators can never interact: a partial
   * refund arriving after a dispute must not look like a reduction and hand
   * credits back.
   */
  async function reclaim({ eventId, paymentIntent, field, fraction, restore = false, label }) {
    if (!paymentIntent) {
      console.error(`${label}: no payment_intent on the charge; ${CLAWBACK_UNRECLAIMED}`, eventId);
      return;
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const got = await ddb.send(
        new GetItemCommand({ TableName: tableName, Key: receiptKey(paymentIntent) })
      );
      const row = got.Item;
      if (!row) {
        // Not ours (a Dashboard-created charge, or one predating this feature).
        // 200 rather than throw: a retry storm cannot conjure a receipt that was
        // never written, and Stripe would hammer us for days.
        console.error(
          `${label}: no purchase receipt for this payment_intent; ${CLAWBACK_UNRECLAIMED}`,
          eventId,
          paymentIntent
        );
        return;
      }
      const sub = row.sub?.S;
      const purchased = Number(row.purchasedCredits?.N ?? 0);
      const seen = Number(row[field]?.N ?? 0);
      if (!sub || !Number.isFinite(purchased)) {
        console.error(`${label}: purchase receipt is malformed; ${CLAWBACK_UNRECLAIMED}`, eventId, paymentIntent);
        return;
      }

      // Never reclaim more than was purchased, and never let a stale event push
      // the counter backwards into a re-grant. `floor` so a rounding edge
      // always favours the customer.
      const target = restore ? 0 : Math.min(purchased, Math.floor(purchased * fraction));
      const move = target - seen;
      if (move === 0) return; // nothing owed — no write at all
      if (move < 0 && !restore) return; // stale/out-of-order: never re-grant

      // Floor the balance at zero and record any shortfall separately. A
      // negative `credits` would read as "metering unconfigured" to the
      // client's counter() and hide the top-up path exactly when the learner
      // needs it; debt belongs in its own field, as an explicit decision.
      const walletRes = await ddb.send(
        new GetItemCommand({ TableName: tableName, Key: walletKey(sub) })
      );
      const balance = Number(walletRes.Item?.credits?.N ?? 0);
      const applied = move > 0 ? Math.min(move, Math.max(0, balance)) : move;
      const unrecovered = move > 0 ? move - applied : 0;

      const outcome = await applyOnce({
        eventId,
        sub,
        deltaCredits: -applied,
        owedCredits: unrecovered,
        receiptLeg: {
          Update: {
            TableName: tableName,
            Key: receiptKey(paymentIntent),
            // ABSOLUTE set guarded by the value we read — the optimistic
            // concurrency token. TransactWriteItems has no read leg, so the
            // GetItem above is outside the transaction and this condition is
            // the only thing closing the lost-update window.
            UpdateExpression: `SET ${field} = :target`,
            ConditionExpression: `attribute_exists(pk) AND ${field} = :seen`,
            ExpressionAttributeValues: {
              ":target": { N: String(target) },
              ":seen": { N: String(seen) },
            },
          },
        },
      });
      if (outcome !== CLAWBACK_RETRY) return; // committed, or a replay
      // Lost the race: loop, re-read, recompute against fresh state.
    }
    // Contended past the retry budget. Throw so Stripe retries the delivery —
    // this is real money and dropping it silently is the one unacceptable end.
    throw new Error(`${label}: contended past retry budget for ${paymentIntent}`);
  }

  async function handleEvent(evt) {
    const obj = evt.data?.object ?? {};
    switch (evt.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        await fulfillCheckoutSession(evt, obj);
        return;
      }

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
      case "invoice.paid": {
        const subId = invoiceSubscriptionId(obj);
        if (!subId) {
          // An invoice that says it came from a subscription but carries no
          // resolvable subscription id is a silently withheld credit grant: we
          // answer 200, Stripe treats the event as delivered and never retries,
          // and the buyer's balance never moves for that period. Leave evidence
          // in the log group instead of returning into the void.
          //
          // NOTE: this console.error does NOT by itself trip quantum-stripe-errors
          // (that alarm watches AWS/Lambda Errors, which counts FAILED
          // invocations) or quantum-stripe-5xx (this path still returns 200).
          // Turning it into a page needs a log metric filter on this message in
          // template.yaml. Throwing here would trip both alarms, but it would
          // also make Stripe retry for days an invoice we can never handle, so
          // the retry storm buys nothing.
          if (looksSubscriptionInvoice(obj)) {
            console.error(
              "invoice.paid: no subscription id resolved on a subscription invoice; credits NOT granted",
              evt.id,
              obj.id,
              obj.billing_reason,
              obj.parent?.type
            );
          }
          return; // otherwise a genuine one-off invoice: nothing to grant
        }
        const subscription = await stripe.subscriptions.retrieve(subId);
        const sub = subscription.metadata?.userId;
        if (!sub) return;
        const credits = Number(subscription.metadata?.credits);
        const granted = Number.isFinite(credits) && credits > 0 ? credits : 0;
        // Resolve the PaymentIntent NOW, while the invoice is in hand — at
        // refund time the charge carries no link back to it.
        const pi = granted > 0 ? await invoicePaymentIntent(obj.id) : undefined;
        if (granted > 0 && !pi) {
          // The grant still happens (the buyer paid), but it will not be
          // refundable automatically. Same pinned phrase, so the one filter
          // covers it and a human can reconcile.
          console.error(
            `invoice.paid: no payment_intent resolved, grant will not be auto-refundable; ${CLAWBACK_UNRECLAIMED}`,
            evt.id,
            obj.id
          );
        }
        await applyOnce({
          eventId: evt.id,
          sub,
          deltaCredits: granted,
          setTier: subscription.metadata?.tier,
          setSubStatus: "active",
          receiptLeg: receiptRowLeg(pi, sub, granted),
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

      // Money going back to the customer takes its credits with it.
      case "charge.refunded": {
        const c = evt.data.object;
        const amount = Number(c.amount ?? 0);
        const refunded = Number(c.amount_refunded ?? 0);
        if (!(amount > 0)) return;
        // amount_refunded is CUMULATIVE, so this fraction is absolute: the
        // target it produces is "what this grant should total", not a delta.
        await reclaim({
          eventId: evt.id,
          paymentIntent: idOf(c.payment_intent),
          field: "refundedCredits",
          fraction: refunded / amount,
          label: "charge.refunded",
        });
        return;
      }

      // Disputes: act on the FUNDS-MOVEMENT events, never charge.dispute.created
      // — that also fires for inquiries where Stripe withdraws nothing, and
      // clawing back there would zero a paying customer's wallet for free.
      case "charge.dispute.funds_withdrawn": {
        const d = evt.data.object;
        await reclaim({
          eventId: evt.id,
          paymentIntent: idOf(d.payment_intent),
          field: "disputedCredits",
          // A funds-withdrawn dispute takes the whole charge, so the whole
          // grant goes with it. Tracked on its own counter, so a later partial
          // refund's arithmetic cannot read this as a reduction and re-grant.
          fraction: 1,
          label: "charge.dispute.funds_withdrawn",
        });
        return;
      }

      case "charge.dispute.funds_reinstated": {
        const d = evt.data.object;
        await reclaim({
          eventId: evt.id,
          paymentIntent: idOf(d.payment_intent),
          field: "disputedCredits",
          fraction: 0,
          restore: true,
          label: "charge.dispute.funds_reinstated",
        });
        return;
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
  return createHandlerCore({
    stripe: new Stripe(secretKey, { apiVersion: "2026-06-24.dahlia" }),
    ddb: new DynamoDBClient({}),
    tableName: process.env.TABLE_NAME,
    webhookSecret,
    siteOrigin: process.env.SITE_ORIGIN,
  });
});
