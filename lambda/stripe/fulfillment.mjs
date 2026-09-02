// Money coming IN: what a settled purchase grants, and the debt it clears first.
//
// The two fulfillment paths — a Checkout Session (a top-up's credits, or a
// subscription's tier light-up) and a paid subscription invoice (the period's
// credits) — plus the split every grant goes through: an owing learner's money
// pays down clawbackOwedCredits before any of it becomes spendable. The
// Stripe-shape helpers live here too, because the invoice path is where
// Stripe's object relocations have bitten this handler (invoiceSubscriptionId).
//
// Split out of index.mjs on 2026-09-02, alongside clawback.mjs. Every write goes
// through the injected store's applyOnce; fulfillment.test.mjs drives these
// paths directly. index.mjs still owns the switch that decides which event
// reaches which path.

import { CLAWBACK_RETRY } from "./wallet-store.mjs";
import { CLAWBACK_UNRECLAIMED } from "./clawback.mjs";

/**
 * The mirror of CLAWBACK_UNRECLAIMED for money coming IN. Every branch that
 * ends a settled purchase without moving the wallet ends with this phrase, and
 * one metric filter pins it, so a grant-side branch added later is covered for
 * free. It has to be an umbrella rather than one literal per branch because
 * these paths all answer 200: Stripe marks the event delivered and never
 * retries, so an unwatched branch is a buyer who paid and was never credited.
 */
export const GRANT_WITHHELD = "credits NOT granted";

/** Normalize `string | Object | null` to an id — every Stripe reference may
 *  arrive expanded depending on the endpoint's configuration. */
export function idOf(ref) {
  if (typeof ref === "string") return ref;
  return typeof ref?.id === "string" ? ref.id : undefined;
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
export function invoiceSubscriptionId(invoice) {
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
export function looksSubscriptionInvoice(invoice) {
  return (
    invoice.parent?.type === "subscription_details" ||
    (typeof invoice.billing_reason === "string" &&
      invoice.billing_reason.startsWith("subscription"))
  );
}

/**
 * `stripe` is the Stripe client (the invoice path re-retrieves the invoice and
 * the subscription); `store` is a createWalletStore() instance, the only way
 * anything here reaches the wallet table.
 */
export function createFulfillment({ stripe, store }) {
  const { readWallet, applyOnce, applyOnceRetrying, receiptRowLeg } = store;

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
   * Fulfill a paid subscription invoice: the period's credits (through the
   * debt split) plus the tier and status, first period and every renewal. The
   * body is the invoice.paid case exactly as index.mjs ran it inline until
   * 2026-09-02; the switch there still decides that invoice.paid, and not
   * invoice.payment_succeeded, is the one economic event per payment.
   */
  async function fulfillInvoicePaid(evt, obj) {
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

  return { fulfillCheckoutSession, fulfillInvoicePaid, grantThroughDebt, splitAgainstDebt, invoicePaymentIntent };
}
