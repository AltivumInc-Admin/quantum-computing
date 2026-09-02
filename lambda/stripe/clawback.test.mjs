// Direct tests for reclaim(): the refund and dispute arithmetic driven against
// the stateful stub with no webhook, no signature and no router in between.
// index.test.mjs (R1-R17) still proves each Stripe event reaches reclaim() with
// the right field and fraction; these pin what reclaim() does once it has them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWalletStore } from "./wallet-store.mjs";
import { createClawback, CLAWBACK_UNRECLAIMED } from "./clawback.mjs";
import { ledgerDdb, recording, racing } from "./__fixtures__/ledger-ddb.mjs";
import { captureConsoleError } from "./__fixtures__/console.mjs";

const TABLE = "quantum-stripe-wallet";

/** reclaim() over a real store on the given ddb — the same composition index.mjs makes. */
function reclaimer(ddb) {
  const store = createWalletStore({ ddb, tableName: TABLE, eventTtlSeconds: 60 });
  return createClawback({ ddb, tableName: TABLE, store }).reclaim;
}

// A receipt as the post-#230 writer produces it: $20.00 paid for 2000 credits.
const PRICED_RECEIPT = {
  pk: { S: "RECEIPT#pi_1" },
  sub: { S: "user-9" },
  purchasedCredits: { N: "2000" },
  refundedCredits: { N: "0" },
  disputedCredits: { N: "0" },
  amountPaidCents: { N: "2000" },
};
const rows = (wallet, receipt = PRICED_RECEIPT) => ({
  "RECEIPT#pi_1": { ...receipt },
  "WALLET#user-9": { pk: { S: "WALLET#user-9" }, ...wallet },
});

// The three shapes index.mjs's charge.* cases hand to reclaim().
const refund = (over = {}) => ({
  eventId: "evt_refund",
  paymentIntent: "pi_1",
  field: "refundedCredits",
  fraction: 1,
  label: "charge.refunded",
  ...over,
});
const withdraw = (disputedAmountCents, over = {}) => ({
  eventId: "evt_withdrawn",
  paymentIntent: "pi_1",
  field: "disputedCredits",
  disputedAmountCents,
  label: "charge.dispute.funds_withdrawn",
  ...over,
});
const reinstate = (over = {}) => ({
  eventId: "evt_reinstated",
  paymentIntent: "pi_1",
  field: "disputedCredits",
  fraction: 0,
  restore: true,
  label: "charge.dispute.funds_reinstated",
  ...over,
});

const owed = (ddb) => ddb.wallet("user-9").clawbackOwedCredits?.N ?? "0";
const txCount = (ddb) => ddb.calls.filter((c) => c.name === "TransactWriteItemsCommand").length;
const receiptReads = (ddb) =>
  ddb.calls.filter((c) => c.name === "GetItemCommand" && c.input.Key.pk.S === "RECEIPT#pi_1").length;

test("C1: a full refund reclaims the whole grant and reports the negative delta it applied", async () => {
  const ddb = ledgerDdb(rows({ credits: { N: "5000" } }));
  const res = await reclaimer(ddb)(refund());
  assert.deepEqual(res, { sub: "user-9", deltaCredits: -2000, owedDelta: 0, outcome: "applied" });
  assert.equal(ddb.wallet("user-9").credits.N, "3000");
  assert.equal(ddb.receipt("pi_1").refundedCredits.N, "2000");
  assert.equal(ddb.receipt("pi_1").refundedCreditsUnrecovered.N, "0", "nothing landed in debt");
  assert.ok(ddb.store.has("EVENT#evt_refund"), "exactly-once: the event is marked in the same transaction");
});

test("C2: refunds are ABSOLUTE — cumulative fractions move only the delta, and a stale one writes nothing", async () => {
  const ddb = ledgerDdb(rows({ credits: { N: "5000" } }));
  const reclaim = reclaimer(ddb);
  await reclaim(refund({ eventId: "evt_a", fraction: 0.25 }));
  assert.equal(ddb.receipt("pi_1").refundedCredits.N, "500");
  assert.equal(ddb.wallet("user-9").credits.N, "4500");

  await reclaim(refund({ eventId: "evt_b", fraction: 0.75 }));
  assert.equal(ddb.receipt("pi_1").refundedCredits.N, "1500", "the counter is set to the target, not incremented");
  assert.equal(ddb.wallet("user-9").credits.N, "3500", "only the 1000 delta moved");

  // Out of order: a delivery describing an EARLIER cumulative state.
  const stale = await reclaim(refund({ eventId: "evt_stale", fraction: 0.5 }));
  assert.equal(stale, undefined, "nothing owed, no result");
  assert.equal(ddb.wallet("user-9").credits.N, "3500", "never re-granted");
  assert.equal(ddb.store.has("EVENT#evt_stale"), false, "no write at all, so the event stays reprocessable");

  // Replayed: the same event again is a no-op even though its work is done.
  const replay = await reclaim(refund({ eventId: "evt_b", fraction: 0.75 }));
  assert.equal(replay, undefined);
});

test("C3: the wallet floors at zero and the shortfall becomes debt, tracked per counter on the receipt", async () => {
  const ddb = ledgerDdb(rows({ credits: { N: "300" } }));
  const res = await reclaimer(ddb)(refund());
  assert.deepEqual(res, { sub: "user-9", deltaCredits: -300, owedDelta: 1700, outcome: "applied" });
  assert.equal(ddb.wallet("user-9").credits.N, "0", "never a negative balance");
  assert.equal(owed(ddb), "1700");
  assert.equal(ddb.receipt("pi_1").refundedCredits.N, "2000");
  assert.equal(ddb.receipt("pi_1").refundedCreditsUnrecovered.N, "1700", "how much of THIS counter landed in debt");
});

test("C4: the target is floored, so a rounding edge always favours the customer", async () => {
  const ddb = ledgerDdb(rows({ credits: { N: "5000" } }));
  const res = await reclaimer(ddb)(refund({ fraction: 0.33335 })); // 666.7 credits
  assert.equal(res.deltaCredits, -666);
  assert.equal(ddb.receipt("pi_1").refundedCredits.N, "666");
});

test("C5: a dispute pro-rates against amountPaidCents, and never above the whole purchase", async () => {
  const partial = ledgerDdb(rows({ credits: { N: "2000" } }));
  await reclaimer(partial)(withdraw(500)); // $5 of $20
  assert.equal(partial.wallet("user-9").credits.N, "1500");
  assert.equal(partial.receipt("pi_1").disputedCredits.N, "500");
  assert.equal(owed(partial), "0", "covered by credits, no debt");

  // A cross-currency dispute can carry MORE than the charge: the fraction is
  // capped at 1, so the reclaim is capped at what was bought.
  const over = ledgerDdb(rows({ credits: { N: "5000" } }));
  await reclaimer(over)(withdraw(5000));
  assert.equal(over.wallet("user-9").credits.N, "3000");
  assert.equal(over.receipt("pi_1").disputedCredits.N, "2000");
});

test("C6: a receipt with no denominator reclaims NOTHING for a dispute and leaves the pinned phrase", async () => {
  // Rule 7: where metering is uncertain the learner is charged less, never more.
  const { amountPaidCents: _legacy, ...unpriced } = PRICED_RECEIPT;
  const ddb = recording(ledgerDdb(rows({ credits: { N: "2000" } }, unpriced)));
  let res;
  const lines = await captureConsoleError(async () => {
    res = await reclaimer(ddb)(withdraw(500));
  });
  assert.equal(res, undefined);
  assert.equal(ddb.wallet("user-9").credits.N, "2000");
  assert.equal(txCount(ddb), 0, "no write, so a human can still reconcile from a clean slate");
  assert.equal(lines.length, 1);
  assert.ok(lines[0].join(" ").includes(CLAWBACK_UNRECLAIMED), "the phrase UnreclaimedRefundMetricFilter pins");
  assert.match(lines[0].join(" "), /pi_1/);
});

test("C7: a dispute with no usable amount reclaims nothing and says so", async () => {
  for (const amount of [0, -1, NaN]) {
    const ddb = recording(ledgerDdb(rows({ credits: { N: "2000" } })));
    const lines = await captureConsoleError(() => reclaimer(ddb)(withdraw(amount)));
    assert.equal(txCount(ddb), 0, `amount=${amount}`);
    assert.equal(lines.length, 1, `amount=${amount}`);
    assert.ok(lines[0].join(" ").includes(CLAWBACK_UNRECLAIMED));
  }
});

test("C8: a restore returns exactly what was TAKEN and clears exactly the debt it CREATED", async () => {
  // Bought 2000, spent 1500: the withdrawal takes 500 and leaves 1500 of debt.
  const ddb = ledgerDdb(rows({ credits: { N: "500" } }));
  const reclaim = reclaimer(ddb);
  const taken = await reclaim(withdraw(2000));
  assert.deepEqual(taken, { sub: "user-9", deltaCredits: -500, owedDelta: 1500, outcome: "applied" });
  assert.equal(ddb.wallet("user-9").credits.N, "0");
  assert.equal(owed(ddb), "1500");
  assert.equal(ddb.receipt("pi_1").disputedCreditsUnrecovered.N, "1500");

  const restored = await reclaim(reinstate());
  assert.deepEqual(restored, { sub: "user-9", deltaCredits: 500, owedDelta: -1500, outcome: "applied" });
  assert.equal(ddb.wallet("user-9").credits.N, "500", "back to the pre-dispute balance, not 2000");
  assert.equal(owed(ddb), "0", "a learner who WON is not locked out by the gates");
  assert.equal(ddb.receipt("pi_1").disputedCredits.N, "0");
  assert.equal(ddb.receipt("pi_1").disputedCreditsUnrecovered.N, "0");
});

test("C9: a restore clears only the debt still standing, and returns the rest as credits", async () => {
  // 1000 of the 1500 debt was already bought down mid-dispute.
  const ddb = ledgerDdb(
    rows(
      { credits: { N: "0" }, clawbackOwedCredits: { N: "500" } },
      { ...PRICED_RECEIPT, disputedCredits: { N: "2000" }, disputedCreditsUnrecovered: { N: "1500" } }
    )
  );
  const res = await reclaimer(ddb)(reinstate());
  assert.deepEqual(res, { sub: "user-9", deltaCredits: 1500, owedDelta: -500, outcome: "applied" });
  assert.equal(owed(ddb), "0", "never driven negative");
  assert.equal(ddb.wallet("user-9").credits.N, "1500");
});

test("C10: a restore on a legacy receipt (no Unrecovered field) returns the credits and touches no debt", async () => {
  const ddb = ledgerDdb(rows({ credits: { N: "0" } }, { ...PRICED_RECEIPT, disputedCredits: { N: "2000" } }));
  const res = await reclaimer(ddb)(reinstate());
  assert.equal(res.outcome, "applied");
  assert.equal(res.deltaCredits, 2000);
  // No debt was ever recorded for this counter, so none is cleared. (The value
  // is a negated zero; the audit line serializes it as 0 and the wallet leg is
  // not written at all, so the sign carries no meaning.)
  assert.equal(Math.abs(res.owedDelta), 0);
  assert.equal(ddb.wallet("user-9").credits.N, "2000");
  assert.equal(owed(ddb), "0");
});

test("C11: the transaction's shape — the receipt leg is an ABSOLUTE set guarded by the value read", async () => {
  const ddb = recording(ledgerDdb(rows({ credits: { N: "5000" } }, { ...PRICED_RECEIPT, refundedCredits: { N: "500" } })));
  await reclaimer(ddb)(refund({ fraction: 0.75 }));
  const tx = ddb.calls.find((c) => c.name === "TransactWriteItemsCommand").input.TransactItems;
  assert.equal(tx[0].Put.Item.pk.S, "EVENT#evt_refund");
  const wallet = tx[1].Update;
  assert.equal(wallet.Key.pk.S, "WALLET#user-9");
  assert.equal(wallet.ExpressionAttributeValues[":amt"].N, "-1000");
  assert.equal(wallet.ConditionExpression, undefined, "money OUT adds to debt at most: no negative-debt race to pin");
  const receipt = tx[2].Update;
  assert.equal(receipt.Key.pk.S, "RECEIPT#pi_1");
  assert.equal(receipt.UpdateExpression, "SET refundedCredits = :target, refundedCreditsUnrecovered = :targetUnrecovered");
  assert.equal(receipt.ConditionExpression, "attribute_exists(pk) AND refundedCredits = :seen");
  assert.equal(receipt.ExpressionAttributeValues[":seen"].N, "500");
  assert.equal(receipt.ExpressionAttributeValues[":target"].N, "1500");
});

test("C12: a restore pins the wallet leg to the debt it read, since it SUBTRACTS debt", async () => {
  const ddb = recording(
    ledgerDdb(
      rows(
        { credits: { N: "0" }, clawbackOwedCredits: { N: "1500" } },
        { ...PRICED_RECEIPT, disputedCredits: { N: "2000" }, disputedCreditsUnrecovered: { N: "1500" } }
      )
    )
  );
  await reclaimer(ddb)(reinstate());
  const wallet = ddb.calls.find((c) => c.name === "TransactWriteItemsCommand").input.TransactItems[1].Update;
  assert.equal(wallet.ConditionExpression, "clawbackOwedCredits = :expectedOwed");
  assert.equal(wallet.ExpressionAttributeValues[":expectedOwed"].N, "1500");
  assert.equal(wallet.ExpressionAttributeValues[":owed"].N, "-1500");
});

test("C13: a lost race re-reads and recomputes — a refund that landed mid-flight is not applied twice", async () => {
  // Between this delivery's GetItem and its conditional write, another delivery
  // moves the counter to 500. The receipt leg's OCC token no longer matches, the
  // transaction cancels, and the retry computes the delta from the fresh 500.
  const ddb = recording(
    racing(ledgerDdb(rows({ credits: { N: "5000" } })), (store) => {
      store.set("RECEIPT#pi_1", { ...store.get("RECEIPT#pi_1"), refundedCredits: { N: "500" } });
    })
  );
  const res = await reclaimer(ddb)(refund());
  assert.equal(txCount(ddb), 2, "one lost race, one commit");
  assert.equal(receiptReads(ddb), 2, "the retry re-read rather than replaying stale state");
  assert.equal(res.deltaCredits, -1500, "2000 target minus the 500 somebody else already reclaimed");
  assert.equal(ddb.receipt("pi_1").refundedCredits.N, "2000");
});

test("C14: a TransactionConflict is contention, not a decision — it retries in-process", async () => {
  const conflict = () => {
    const e = new Error("cancelled");
    e.name = "TransactionCanceledException";
    e.CancellationReasons = [{ Code: "TransactionConflict" }, { Code: "TransactionConflict" }, { Code: "TransactionConflict" }];
    return e;
  };
  const ddb = recording(
    racing(ledgerDdb(rows({ credits: { N: "5000" } })), () => {
      throw conflict();
    })
  );
  const res = await reclaimer(ddb)(refund());
  assert.equal(res.outcome, "applied");
  assert.equal(txCount(ddb), 2);
  assert.equal(ddb.wallet("user-9").credits.N, "3000");
});

test("C15: contended past the retry budget, reclaim() throws with its label so the webhook 500s", async () => {
  // Every attempt loses: the counter moves under each read. Real money must
  // never be dropped silently, so the fourth loss escapes for Stripe to redeliver.
  const ddb = recording(
    racing(
      ledgerDdb(rows({ credits: { N: "5000" } })),
      (store, attempt) => {
        store.set("RECEIPT#pi_1", { ...store.get("RECEIPT#pi_1"), refundedCredits: { N: String(attempt) } });
      },
      { times: Infinity }
    )
  );
  await assert.rejects(() => reclaimer(ddb)(refund()), /charge\.refunded: contended past retry budget for pi_1/);
  assert.equal(txCount(ddb), 4, "the budget is four attempts, not an unbounded spin");
  assert.equal(receiptReads(ddb), 4, "each attempt re-read the receipt");
});

test("C16: no receipt — the pinned phrase, no throw, no write (a retry storm cannot conjure one)", async () => {
  const ddb = recording(ledgerDdb({ "WALLET#user-9": { pk: { S: "WALLET#user-9" }, credits: { N: "5000" } } }));
  let res;
  const lines = await captureConsoleError(async () => {
    res = await reclaimer(ddb)(refund());
  });
  assert.equal(res, undefined);
  assert.equal(txCount(ddb), 0);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].join(" ").includes(CLAWBACK_UNRECLAIMED));
  assert.match(lines[0].join(" "), /pi_1/, "the PaymentIntent, for the human who reconciles");
});

test("C17: no PaymentIntent — the pinned phrase before any read at all", async () => {
  const ddb = recording(ledgerDdb(rows({ credits: { N: "5000" } })));
  const lines = await captureConsoleError(() => reclaimer(ddb)(refund({ paymentIntent: undefined })));
  assert.equal(ddb.calls.length, 0, "nothing was read or written");
  assert.equal(lines.length, 1);
  assert.ok(lines[0].join(" ").includes(CLAWBACK_UNRECLAIMED));
  assert.match(lines[0].join(" "), /evt_refund/);
});

test("C18: a malformed receipt (no sub) reclaims nothing and says so", async () => {
  const { sub: _missing, ...noSub } = PRICED_RECEIPT;
  const ddb = recording(ledgerDdb(rows({ credits: { N: "5000" } }, noSub)));
  const lines = await captureConsoleError(() => reclaimer(ddb)(refund()));
  assert.equal(txCount(ddb), 0);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].join(" ").includes(CLAWBACK_UNRECLAIMED));
});

test("C19: a non-finite fraction is refused before it can become the counter", async () => {
  // NaN passes both move checks and would be written as the receipt counter;
  // the guard refuses it loudly instead of trusting every caller forever.
  const ddb = recording(ledgerDdb(rows({ credits: { N: "5000" } })));
  const lines = await captureConsoleError(() => reclaimer(ddb)(refund({ fraction: NaN })));
  assert.equal(txCount(ddb), 0);
  assert.equal(ddb.wallet("user-9").credits.N, "5000");
  assert.equal(lines.length, 1);
  assert.match(lines[0].join(" "), /non-finite target/);
  assert.ok(lines[0].join(" ").includes(CLAWBACK_UNRECLAIMED));
});

test("C20: a dispute whose amount went DOWN leaves the over-reclaim standing, loudly", async () => {
  // The counter cannot move down outside `restore` without reopening the
  // re-grant hole, so this defers to a human — with the phrase the filter pages on.
  const ddb = ledgerDdb(rows({ credits: { N: "4000" } }));
  const reclaim = reclaimer(ddb);
  await reclaim(withdraw(2000));
  assert.equal(ddb.wallet("user-9").credits.N, "2000");
  const lines = await captureConsoleError(() => reclaim(withdraw(500, { eventId: "evt_smaller" })));
  assert.equal(ddb.wallet("user-9").credits.N, "2000", "no write either way");
  assert.equal(ddb.receipt("pi_1").disputedCredits.N, "2000");
  assert.equal(lines.length, 1);
  assert.match(lines[0].join(" "), /over-reclaimed/);
  assert.ok(lines[0].join(" ").includes(CLAWBACK_UNRECLAIMED));

  // The same DOWNWARD move for a refund is a stale delivery and stays silent.
  const quiet = await captureConsoleError(() => reclaim(refund({ eventId: "evt_stale_refund", fraction: 0 })));
  assert.deepEqual(quiet, []);
});
