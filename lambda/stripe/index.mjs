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

/**
 * applyOnce's third outcome: nothing was decided, the write simply lost a race
 * — a guarded row moved under us, or DynamoDB cancelled on TransactionConflict.
 * Every caller must re-read and retry rather than treat it as a result.
 */
export const CLAWBACK_RETRY = Symbol("clawback-retry");

/**
 * The ONE literal phrase every unreclaimable-money branch ends with. A single
 * CloudWatch metric filter pins this string, so a branch added later is
 * covered for free — the deliberate mirror of "credits NOT granted".
 */
export const CLAWBACK_UNRECLAIMED = "credits NOT reclaimed";

/**
 * The mirror of CLAWBACK_UNRECLAIMED for money coming IN. Every branch that
 * ends a settled purchase without moving the wallet ends with this phrase, and
 * one metric filter pins it, so a grant-side branch added later is covered for
 * free. It has to be an umbrella rather than one literal per branch because
 * these paths all answer 200: Stripe marks the event delivered and never
 * retries, so an unwatched branch is a buyer who paid and was never credited.
 */
export const GRANT_WITHHELD = "credits NOT granted";

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
  async function readWallet(sub) {
    const res = await ddb.send(
      new GetItemCommand({ TableName: tableName, Key: walletKey(sub) })
    );
    return res.Item ?? null;
  }

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
    // OCC for debt paydowns. Every owedCredits < 0 is computed from a GetItem
    // OUTSIDE this transaction; two concurrent money-in events (a renewal
    // racing a top-up, two invoice.paid deliveries) would otherwise both read
    // owed=N and both ADD -N, driving the field negative — which the spend
    // gates (clawbackOwedCredits = 0) refuse as hard as a positive debt, and
    // which no code path can ever repair (splitAgainstDebt exits on owed <= 0).
    // Passing the read value pins the wallet leg to it; a loser returns
    // CLAWBACK_RETRY so the caller re-reads and recomputes.
    expectedOwed,
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

    const hasOwedGuard = Number.isFinite(expectedOwed);
    if (hasOwedGuard) {
      values[":expectedOwed"] = { N: String(expectedOwed) };
    }

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
                ...(hasOwedGuard
                  ? { ConditionExpression: "clawbackOwedCredits = :expectedOwed" }
                  : {}),
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
        if (hasOwedGuard && failed(WALLET_LEG)) return CLAWBACK_RETRY; // lost update
        if (receiptLeg && failed(RECEIPT_LEG)) return CLAWBACK_RETRY; // lost update
        // DynamoDB also cancels with TransactionConflict when another
        // transaction is touching one of these items — exactly the renewal-
        // racing-a-top-up interleaving the debt paths are built for. It is
        // pure contention, not a decision: re-reading and retrying in-process
        // settles it in milliseconds, whereas letting it escape becomes a 500,
        // pages the operator, and defers a paid grant to Stripe's exponential
        // redelivery. (lambda/qpu/reconcile.mjs draws the same distinction.)
        if (reasons.some((r) => r?.Code === "TransactionConflict")) return CLAWBACK_RETRY;
      }
      throw err;
    }
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
   *  purchases under one row (e.g. a 100%-off session, which has no PI at all).
   *
   *  `amountPaidCents` is what the buyer actually paid (session.amount_total or
   *  invoice.amount_paid, both already in the smallest currency unit). It is the
   *  denominator a partial DISPUTE needs: the Dispute object carries only its own
   *  amount, never the charge total, so without this field a $5 dispute on a $20
   *  purchase is indistinguishable from a full one. Refunds never need it — the
   *  Charge object carries both numbers itself. */
  function receiptRowLeg(paymentIntent, sub, credits, amountPaidCents) {
    if (!paymentIntent || !(credits > 0)) return undefined;
    const item = {
      ...receiptKey(paymentIntent),
      sub: { S: sub },
      purchasedCredits: { N: String(credits) },
      refundedCredits: { N: "0" },
      disputedCredits: { N: "0" },
      createdAt: { N: String(Date.now()) },
    };
    if (Number.isFinite(amountPaidCents) && amountPaidCents > 0) {
      item.amountPaidCents = { N: String(Math.round(amountPaidCents)) };
    }
    return { Put: { TableName: tableName, Item: item } };
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
  function invoiceSubscriptionId(invoice) {
    return idOf(invoice.parent?.subscription_details?.subscription ?? invoice.subscription);
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
   * Split a purchase between clearing debt and adding spendable credits.
   *
   * Product rule: an owing learner must CLEAR the debt — so money pays down
   * `clawbackOwedCredits` before any of it becomes spendable. A purchase
   * smaller than the debt adds nothing spendable, which is the honest outcome:
   * the learner is buying their way back to zero, and the top-up surface says
   * so rather than quietly crediting a balance they cannot use.
   */
  async function splitAgainstDebt(sub, credits) {
    const item = await readWallet(sub);
    const owed = Number(item?.clawbackOwedCredits?.N ?? 0);
    // expectedOwed is the OCC token for the paydown: applyOnce pins the wallet
    // leg to the value read here, so a concurrent paydown cancels the
    // transaction instead of compounding into a negative, gate-wedging debt.
    if (!(owed > 0)) return { deltaCredits: credits, owedCredits: 0 };
    const applied = Math.min(owed, credits);
    return { deltaCredits: credits - applied, owedCredits: -applied, expectedOwed: owed };
  }

  /**
   * applyOnce for the writes that read nothing first — a tier light-up, a
   * cancellation, a status change. Their only CLAWBACK_RETRY is a
   * TransactionConflict, which is contention and nothing else, so retrying the
   * IDENTICAL write is always correct; there is no state to recompute. The
   * debt paths keep their own loops because they must re-read before retrying.
   *
   * Same budget and same ending as those loops: past it, throw, and let
   * Stripe redeliver rather than drop a write on the floor.
   */
  async function applyOnceRetrying(label, args) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const outcome = await applyOnce(args);
      if (outcome !== CLAWBACK_RETRY) {
        return { sub: args.sub, outcome: outcome ? "applied" : "replay" };
      }
    }
    throw new Error(`${label}: wallet write contended past retry budget for ${args.sub}`);
  }

  /**
   * Grant credits through the debt split, retrying a lost paydown race against
   * freshly read state — the same loop-and-reread discipline reclaim() uses,
   * with the same ending: past the budget, throw so Stripe redelivers.
   */
  async function grantThroughDebt(evt, sub, credits, extra) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const split = await splitAgainstDebt(sub, credits);
      const outcome = await applyOnce({ eventId: evt.id, sub, ...split, ...extra });
      if (outcome !== CLAWBACK_RETRY) {
        return {
          sub,
          deltaCredits: split.deltaCredits,
          owedDelta: split.owedCredits,
          outcome: outcome ? "applied" : "replay",
        };
      }
      // Lost the race: loop, re-read the debt, recompute the split.
    }
    throw new Error(`${evt.type}: debt paydown contended past retry budget for ${sub}`);
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
  async function fulfillCheckoutSession(evt, obj) {
    // Settlement first, identity second — deliberately in that order. An
    // unpaid session is a non-event and must stay quiet; a SETTLED one with
    // nobody to credit is money taken and withheld, and has to say so.
    if (obj.payment_status === "unpaid") return; // money not settled yet
    const sub = obj.client_reference_id;
    if (!sub) {
      console.error(
        `${evt.type}: settled session carries no client_reference_id; ${GRANT_WITHHELD}`,
        evt.id,
        obj.id
      );
      return;
    }
    if (obj.mode === "payment") {
      const credits = Number(obj.metadata?.credits);
      if (Number.isFinite(credits) && credits > 0) {
        return await grantThroughDebt(evt, sub, credits, {
          receiptLeg: receiptRowLeg(idOf(obj.payment_intent), sub, credits, Number(obj.amount_total)),
        });
      } else {
        // The credit count is written into metadata server-side at session
        // creation, so its absence means the session was minted somewhere
        // else (a Dashboard payment link, an older deploy) — the buyer paid
        // and there is nothing here that says what they bought.
        console.error(
          `${evt.type}: settled top-up session carries no usable metadata.credits; ${GRANT_WITHHELD}`,
          evt.id,
          obj.id,
          sub
        );
      }
    } else if (obj.mode === "subscription") {
      // Credits for the period arrive on invoice.paid; here we only light up
      // the tier immediately so the UI reflects the purchase without waiting.
      return await applyOnceRetrying(evt.type, {
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
  async function reclaim({ eventId, paymentIntent, field, fraction, disputedAmountCents, restore = false, label }) {
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

      // Disputes pro-rate against what was actually PAID (#230): the Dispute
      // object carries only its own amount — "usually the amount of the charge,
      // but it can differ" (partial disputes, currency conversion, banks
      // bundling recurring charges) — so the denominator must come from the
      // receipt. A receipt without one (written before amountPaidCents existed)
      // gets NO reclaim rather than a guessed `fraction: 1`: rule 7 says fail
      // toward undercharging, and the pinned phrase routes it to a human. The
      // legacy set is empty today (zero live volume), so this branch is a
      // safety net, not a live cost.
      let effectiveFraction = fraction;
      if (!restore && disputedAmountCents !== undefined) {
        const paidCents = Number(row.amountPaidCents?.N ?? 0);
        if (!(paidCents > 0)) {
          console.error(
            `${label}: no amountPaidCents on the receipt to pro-rate the disputed amount against; ${CLAWBACK_UNRECLAIMED}`,
            eventId,
            paymentIntent
          );
          return;
        }
        if (!(disputedAmountCents > 0)) {
          console.error(
            `${label}: dispute carries no usable amount to pro-rate; ${CLAWBACK_UNRECLAIMED}`,
            eventId,
            paymentIntent,
            disputedAmountCents
          );
          return;
        }
        // The min-1 cap is what keeps a cross-currency dispute (amount
        // denominated differently than the charge) from over-reclaiming.
        effectiveFraction = Math.min(1, disputedAmountCents / paidCents);
      }

      // Never reclaim more than was purchased, and never let a stale event push
      // the counter backwards into a re-grant. `floor` so a rounding edge
      // always favours the customer.
      const target = restore ? 0 : Math.min(purchased, Math.floor(purchased * effectiveFraction));
      if (!Number.isFinite(target)) {
        // Unreachable while the callers Number() their inputs — but NaN passes
        // both move checks below and would be written into DynamoDB as the
        // counter, so refuse loudly rather than trust the callers forever.
        console.error(`${label}: computed a non-finite target; ${CLAWBACK_UNRECLAIMED}`, eventId, paymentIntent);
        return;
      }
      const move = target - seen;
      if (move === 0) return; // nothing owed — no write at all
      if (move < 0 && !restore) {
        // For refunds this is a stale/out-of-order delivery and silence is
        // right. For disputes it is new information — the disputed amount went
        // DOWN, so the learner sits over-reclaimed — and the counter cannot
        // move down outside `restore` without opening the re-grant hole. Defer
        // to a human, loudly: the pinned phrase is what the metric filter pages on.
        if (disputedAmountCents !== undefined) {
          console.error(
            `${label}: dispute target ${target} is below the ${seen} already reclaimed — learner is over-reclaimed pending manual review; ${CLAWBACK_UNRECLAIMED}`,
            eventId,
            paymentIntent
          );
        }
        return; // never re-grant outside restore
      }

      // Floor the balance at zero and record any shortfall separately. A
      // negative `credits` would read as "metering unconfigured" to the
      // client's counter() and hide the top-up path exactly when the learner
      // needs it; debt belongs in its own field, as an explicit decision.
      const wallet = await readWallet(sub);
      const balance = Number(wallet?.credits?.N ?? 0);
      const owedNow = Number(wallet?.clawbackOwedCredits?.N ?? 0);
      // How much of this counter's clawback landed in DEBT rather than coming out
      // of credits. Tracked per counter on the receipt because a restore has to
      // undo BOTH halves, and `move` alone cannot say how the original clawback
      // split. No `attribute_exists` init in receiptRowLeg and no OCC clause of
      // its own: unlike `${field}`, nothing conditions on it, so the `?? 0`
      // default is the whole legacy story — a receipt written before this field
      // existed restores exactly as it used to.
      const unrecoveredField = `${field}Unrecovered`;
      const seenUnrecovered = Number(row[unrecoveredField]?.N ?? 0);

      let deltaCredits, owedDelta, targetUnrecovered;
      if (move > 0) {
        const applied = Math.min(move, Math.max(0, balance));
        deltaCredits = -applied;
        owedDelta = move - applied;
        targetUnrecovered = seenUnrecovered + owedDelta;
      } else {
        // Restoring: give back exactly what was TAKEN and clear exactly the debt
        // that was CREATED. Returning the whole `move` while leaving the debt
        // standing hands a learner who WON their dispute a balance the spend
        // gates then refuse (both gates test `clawbackOwedCredits = 0`), payable
        // only by buying their way clear — rule 7 inverted.
        //
        // Bounded by `owedNow` because the learner may have already paid part of
        // it down mid-dispute; clearing the full original shortfall would drive
        // the field NEGATIVE, and `= 0` locks a negative debt out just as hard as
        // a positive one. Whatever the debt no longer needs comes back as credits,
        // which is what keeps the learner whole across a paydown.
        const owedCleared = Math.min(Math.max(0, owedNow), seenUnrecovered);
        deltaCredits = -move - owedCleared;
        owedDelta = -owedCleared;
        targetUnrecovered = 0;
      }

      const outcome = await applyOnce({
        eventId,
        sub,
        deltaCredits,
        owedCredits: owedDelta,
        // A restore subtracts debt computed from the owedNow read above — the
        // same outside-the-transaction read the grant paths make, with the
        // same negative-debt race. Pin it; a loser lands on CLAWBACK_RETRY and
        // this loop re-reads. (Additions never need the guard: ADD of a
        // positive cannot drive the field negative.)
        ...(owedDelta < 0 ? { expectedOwed: owedNow } : {}),
        receiptLeg: {
          Update: {
            TableName: tableName,
            Key: receiptKey(paymentIntent),
            // ABSOLUTE set guarded by the value we read — the optimistic
            // concurrency token. TransactWriteItems has no read leg, so the
            // GetItem above is outside the transaction and this condition is
            // the only thing closing the lost-update window. Guarding `${field}`
            // alone is sufficient: the two counters only ever move together.
            UpdateExpression: `SET ${field} = :target, ${unrecoveredField} = :targetUnrecovered`,
            ConditionExpression: `attribute_exists(pk) AND ${field} = :seen`,
            ExpressionAttributeValues: {
              ":target": { N: String(target) },
              ":seen": { N: String(seen) },
              ":targetUnrecovered": { N: String(targetUnrecovered) },
            },
          },
        },
      });
      if (outcome !== CLAWBACK_RETRY) {
        // Committed, or a replay.
        return { sub, deltaCredits, owedDelta, outcome: outcome ? "applied" : "replay" };
      }
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
              `invoice.paid: no subscription id resolved on a subscription invoice; ${GRANT_WITHHELD}`,
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
        if (!sub) {
          // subscription_data.metadata is stamped by /checkout, so a paid
          // subscription without a userId is one this handler cannot attribute
          // to any learner. Same 200-and-never-retried shape as the branch
          // above, so it needs the same pinned phrase.
          console.error(
            `invoice.paid: subscription carries no metadata.userId; ${GRANT_WITHHELD}`,
            evt.id,
            obj.id,
            subId
          );
          return;
        }
        const credits = Number(subscription.metadata?.credits);
        const granted = Number.isFinite(credits) && credits > 0 ? credits : 0;
        if (granted === 0) {
          // The tier still lights up below (they are a paying subscriber), but
          // the period's credits do not land — the one case where the wallet
          // and the tier disagree, and therefore the one that must be visible.
          console.error(
            `invoice.paid: subscription carries no parseable metadata.credits, tier set but period ${GRANT_WITHHELD}`,
            evt.id,
            obj.id,
            subId
          );
        }
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
        // Renewals garnish FULLY (founder decision 2026-08-17, issue #218): the
        // grant pays clawbackOwedCredits down to zero before anything becomes
        // spendable — the identical splitAgainstDebt rule top-ups use, so
        // money-in behaves one way everywhere. Before this, invoice.paid was
        // the one grant path that skipped the split, so a renewing subscriber
        // accumulated credits the debt-gate refused while the debt never moved.
        // The receipt still records the FULL grant: a refund of this invoice
        // claws back against what was granted, not the post-garnish remainder.
        const extra = {
          setTier: subscription.metadata?.tier,
          setSubStatus: "active",
          receiptLeg: receiptRowLeg(pi, sub, granted, Number(obj.amount_paid)),
        };
        return granted > 0
          ? await grantThroughDebt(evt, sub, granted, extra)
          : await applyOnceRetrying(evt.type, { eventId: evt.id, sub, ...extra });
      }

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
  apiVersion: "2026-06-24.dahlia",
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
