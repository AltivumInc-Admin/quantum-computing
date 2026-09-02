// Money going BACK to the customer takes its credits with it.
//
// reclaim() is the whole of the refund and dispute arithmetic: absolute targets
// recomputed from live Stripe state, a separate counter per clawback kind,
// partial disputes pro-rated against what was actually paid, a wallet that
// floors at zero with the shortfall recorded as debt, and a restore that undoes
// exactly what a withdrawal took. It reads receipts and wallets through the
// injected store and writes only through the store's applyOnce, so nothing here
// can move a balance that transaction does not guard.
//
// Split out of index.mjs on 2026-09-02: this is the most intricate money logic
// in the repo, and until then it was reachable in tests only by delivering a
// stub-signed webhook through the whole router. clawback.test.mjs drives it
// directly against a stateful stub. index.mjs still decides WHICH Stripe events
// reach it and with what fraction — see the charge.* cases there.

import { GetItemCommand } from "@aws-sdk/client-dynamodb";
import { CLAWBACK_RETRY, receiptKey } from "./wallet-store.mjs";

/**
 * The ONE literal phrase every unreclaimable-money branch ends with. A single
 * CloudWatch metric filter pins this string, so a branch added later is
 * covered for free — the deliberate mirror of "credits NOT granted".
 */
export const CLAWBACK_UNRECLAIMED = "credits NOT reclaimed";

/**
 * `store` is a createWalletStore() instance; `ddb` and `tableName` are the
 * same client and table it was built on, needed here because the receipt read
 * and the receipt's OCC leg address the RECEIPT# row directly.
 */
export function createClawback({ ddb, tableName, store }) {
  const { readWallet, applyOnce } = store;

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

  return { reclaim };
}
