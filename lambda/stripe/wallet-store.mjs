// The wallet table and the ONE primitive that moves money on it.
//
// Three row kinds on quantum-stripe-wallet — WALLET#<sub>, EVENT#<stripeEventId>
// and RECEIPT#<paymentIntentId> — and applyOnce, the exactly-once transaction
// that writes them (the contract is spelled out in index.mjs's header). This
// module knows nothing about Stripe events: index.mjs decides WHAT a delivery
// means, fulfillment.mjs and clawback.mjs decide HOW MUCH moves, and every
// balance change they decide on lands here, through applyOnce, and nowhere
// else. That is why the two repo-wide guards that watch the wallet —
// web/__tests__/infra/credit-writers.test.ts (which files may move a balance)
// and wallet-ttl.test.ts (which rows may carry the TTL attribute) — pin THIS
// file, and why nothing in here may ever learn the founding cohort's key prefix.
//
// Split out of index.mjs on 2026-09-02 so the money arithmetic in the other two
// modules can be exercised against a stateful DynamoDB stub without a signed
// webhook delivery. Same DI shape as the rest: createWalletStore(deps), with the
// DynamoDB client injected, offline-tested in wallet-store.test.mjs.

import { GetItemCommand, TransactWriteItemsCommand } from "@aws-sdk/client-dynamodb";

export const walletKey = (sub) => ({ pk: { S: `WALLET#${sub}` } });
export const eventKey = (id) => ({ pk: { S: `EVENT#${id}` } });
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
export const receiptKey = (pi) => ({ pk: { S: `RECEIPT#${pi}` } });

// Transaction leg positions. EVENT and WALLET keep their historical indexes so
// the reason-code contract stays stable; RECEIPT is appended.
export const EVENT_LEG = 0;
export const WALLET_LEG = 1;
export const RECEIPT_LEG = 2;

/**
 * applyOnce's third outcome: nothing was decided, the write simply lost a race
 * — a guarded row moved under us, or DynamoDB cancelled on TransactionConflict.
 * Every caller must re-read and retry rather than treat it as a result.
 */
export const CLAWBACK_RETRY = Symbol("clawback-retry");

/**
 * The store's dependencies, explicitly: the DynamoDB client, the wallet table,
 * and how long an EVENT# idempotency marker lives. `eventTtlSeconds` has no
 * default here on purpose — index.mjs owns the one default and the reasoning
 * behind it, and a second copy is how two numbers drift apart.
 */
export function createWalletStore({ ddb, tableName, eventTtlSeconds }) {
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

  return { readWallet, applyOnce, applyOnceRetrying, receiptRowLeg };
}
