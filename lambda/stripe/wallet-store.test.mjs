// Direct tests for the wallet store: applyOnce's three outcomes, leg by leg,
// and the receipt row it appends. index.test.mjs reaches the same primitive
// through signed webhook deliveries; these pin the contract fulfillment.mjs and
// clawback.mjs build on, with no router and no Stripe stub in between.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createWalletStore,
  CLAWBACK_RETRY,
  EVENT_LEG,
  WALLET_LEG,
  RECEIPT_LEG,
  walletKey,
  eventKey,
  receiptKey,
} from "./wallet-store.mjs";
import { ledgerDdb, recording } from "./__fixtures__/ledger-ddb.mjs";

const TABLE = "quantum-stripe-wallet";
const TTL = 60 * 60 * 24 * 30;
const mkStore = (ddb) => createWalletStore({ ddb, tableName: TABLE, eventTtlSeconds: TTL });

/** A ddb whose TransactWriteItems answers from a queue (an Error is thrown), recording every command. */
function queuedDdb(outcomes = []) {
  const calls = [];
  const queue = [...outcomes];
  return {
    calls,
    async send(cmd) {
      calls.push({ name: cmd.constructor.name, input: cmd.input });
      if (cmd.constructor.name === "TransactWriteItemsCommand") {
        const o = queue.shift();
        if (o instanceof Error) throw o;
      }
      return {};
    },
  };
}

const cancelledAt = (leg) => {
  const e = new Error("cancelled");
  e.name = "TransactionCanceledException";
  const reasons = [{ Code: "None" }, { Code: "None" }, { Code: "None" }];
  reasons[leg] = { Code: "ConditionalCheckFailed" };
  e.CancellationReasons = reasons;
  return e;
};
const cancelledWith = (code) => {
  const e = new Error("cancelled");
  e.name = "TransactionCanceledException";
  e.CancellationReasons = [{ Code: code }, { Code: code }, { Code: code }];
  return e;
};
const txOf = (ddb) => ddb.calls.find((c) => c.name === "TransactWriteItemsCommand")?.input.TransactItems;
const txCount = (ddb) => ddb.calls.filter((c) => c.name === "TransactWriteItemsCommand").length;

test("the key builders produce the three row prefixes the README documents", () => {
  assert.deepEqual(walletKey("user-1"), { pk: { S: "WALLET#user-1" } });
  assert.deepEqual(eventKey("evt_1"), { pk: { S: "EVENT#evt_1" } });
  assert.deepEqual(receiptKey("pi_1"), { pk: { S: "RECEIPT#pi_1" } });
  // The reason-code contract applyOnce's catch and the suites' positional pins share.
  assert.deepEqual([EVENT_LEG, WALLET_LEG, RECEIPT_LEG], [0, 1, 2]);
});

test("applyOnce records the event and moves the wallet in ONE transaction, and returns true", async () => {
  const ddb = ledgerDdb();
  const { applyOnce } = mkStore(ddb);
  const before = Math.floor(Date.now() / 1000);
  const outcome = await applyOnce({
    eventId: "evt_1",
    sub: "user-9",
    deltaCredits: 500,
    setTier: "plus",
    setSubStatus: "active",
  });
  assert.equal(outcome, true);
  const marker = ddb.store.get("EVENT#evt_1");
  assert.ok(marker, "the EVENT# idempotency marker was written");
  const ttl = Number(marker.expiresAt.N);
  assert.ok(ttl >= before + TTL && ttl <= before + TTL + 5, "the marker self-expires after eventTtlSeconds");
  const wallet = ddb.wallet("user-9");
  assert.equal(wallet.credits.N, "500");
  assert.equal(wallet.tier.S, "plus");
  assert.equal(wallet.subscriptionStatus.S, "active");
  assert.ok(wallet.updatedAt, "updatedAt is stamped on every write");
});

test("a replayed event returns false and leaves the wallet exactly as it was", async () => {
  const ddb = ledgerDdb();
  const { applyOnce } = mkStore(ddb);
  assert.equal(await applyOnce({ eventId: "evt_1", sub: "user-9", deltaCredits: 500 }), true);
  assert.equal(await applyOnce({ eventId: "evt_1", sub: "user-9", deltaCredits: 500 }), false);
  assert.equal(ddb.wallet("user-9").credits.N, "500", "the second delivery granted nothing");
});

test("a signed delta and a debt paydown ADD; tier and status SET; nothing is written for an absent field", async () => {
  const ddb = queuedDdb([{}]);
  const { applyOnce } = mkStore(ddb);
  await applyOnce({ eventId: "evt_1", sub: "user-9", deltaCredits: -300, owedCredits: -200 });
  const w = txOf(ddb)[WALLET_LEG].Update;
  assert.equal(w.UpdateExpression, "SET updatedAt = :now ADD credits :amt, clawbackOwedCredits :owed");
  assert.equal(w.ExpressionAttributeValues[":amt"].N, "-300", "a clawback's negative delta is applied, not dropped");
  assert.equal(w.ExpressionAttributeValues[":owed"].N, "-200");
  assert.equal(w.ExpressionAttributeValues[":tier"], undefined);
  assert.equal(w.ExpressionAttributeValues[":ss"], undefined);
  assert.equal(w.ConditionExpression, undefined, "no OCC clause unless expectedOwed is given");

  const ddb2 = queuedDdb([{}]);
  await mkStore(ddb2).applyOnce({ eventId: "evt_2", sub: "user-9", setTier: "free", setSubStatus: "canceled" });
  const w2 = txOf(ddb2)[WALLET_LEG].Update;
  assert.equal(w2.UpdateExpression, "SET updatedAt = :now, tier = :tier, subscriptionStatus = :ss");
  assert.equal(w2.ExpressionAttributeValues[":amt"], undefined, "no credit leg at all");
});

test("expectedOwed pins the wallet leg to the debt the caller read", async () => {
  const ddb = queuedDdb([{}]);
  const { applyOnce } = mkStore(ddb);
  await applyOnce({ eventId: "evt_1", sub: "user-9", deltaCredits: 1200, owedCredits: -800, expectedOwed: 800 });
  const w = txOf(ddb)[WALLET_LEG].Update;
  assert.equal(w.ConditionExpression, "clawbackOwedCredits = :expectedOwed");
  assert.equal(w.ExpressionAttributeValues[":expectedOwed"].N, "800");
});

test("the receipt leg is APPENDED at RECEIPT_LEG; EVENT# and WALLET# keep their positions", async () => {
  const ddb = queuedDdb([{}]);
  const { applyOnce, receiptRowLeg } = mkStore(ddb);
  await applyOnce({
    eventId: "evt_1",
    sub: "user-9",
    deltaCredits: 2000,
    receiptLeg: receiptRowLeg("pi_1", "user-9", 2000, 2000),
  });
  const tx = txOf(ddb);
  assert.equal(tx.length, 3);
  assert.equal(tx[EVENT_LEG].Put.Item.pk.S, "EVENT#evt_1");
  assert.equal(tx[EVENT_LEG].Put.ConditionExpression, "attribute_not_exists(pk)");
  assert.equal(tx[WALLET_LEG].Update.Key.pk.S, "WALLET#user-9");
  assert.equal(tx[RECEIPT_LEG].Put.Item.pk.S, "RECEIPT#pi_1");
  assert.equal(tx[RECEIPT_LEG].Put.TableName, TABLE, "the receipt lives on the wallet table");
});

test("cancellation reasons are read PER LEG: replay, lost update, contention, or a real fault", async () => {
  const args = { eventId: "evt_1", sub: "user-9", deltaCredits: 100 };
  const receiptLeg = { Put: { TableName: TABLE, Item: { pk: { S: "RECEIPT#pi_1" } } } };
  const outcomeOf = async (err, extra = {}) => mkStore(queuedDdb([err])).applyOnce({ ...args, ...extra });

  assert.equal(await outcomeOf(cancelledAt(EVENT_LEG)), false, "EVENT# condition failed: already processed");
  assert.equal(await outcomeOf(cancelledAt(WALLET_LEG), { expectedOwed: 800 }), CLAWBACK_RETRY, "owed guard lost");
  assert.equal(await outcomeOf(cancelledAt(RECEIPT_LEG), { receiptLeg }), CLAWBACK_RETRY, "receipt OCC lost");
  assert.equal(await outcomeOf(cancelledWith("TransactionConflict")), CLAWBACK_RETRY, "contention, not a decision");

  // A wallet-leg or receipt-leg failure with NO guard on that leg is not a race
  // this store staged, and an unknown reason is not a decision either: both
  // must escape so the webhook 500s and Stripe redelivers.
  await assert.rejects(() => outcomeOf(cancelledAt(WALLET_LEG)), /cancelled/, "no owed guard: rethrown");
  await assert.rejects(() => outcomeOf(cancelledAt(RECEIPT_LEG)), /cancelled/, "no receipt leg: rethrown");
  await assert.rejects(() => outcomeOf(cancelledWith("ValidationError")), /cancelled/);
  await assert.rejects(() => outcomeOf(new Error("ProvisionedThroughputExceeded")), /ProvisionedThroughputExceeded/);
});

test("receiptRowLeg is built only for a real PaymentIntent and a positive grant", () => {
  const { receiptRowLeg } = mkStore(ledgerDdb());
  assert.equal(receiptRowLeg(undefined, "user-9", 2000, 2000), undefined, "a 100%-off session has no PI");
  assert.equal(receiptRowLeg("", "user-9", 2000, 2000), undefined);
  assert.equal(receiptRowLeg("pi_1", "user-9", 0, 2000), undefined, "nothing to reverse");
  assert.equal(receiptRowLeg("pi_1", "user-9", NaN, 2000), undefined);

  const leg = receiptRowLeg("pi_1", "user-9", 2000, 2000);
  const item = leg.Put.Item;
  assert.equal(leg.Put.TableName, TABLE);
  assert.equal(item.pk.S, "RECEIPT#pi_1");
  assert.equal(item.sub.S, "user-9");
  assert.equal(item.purchasedCredits.N, "2000");
  assert.equal(item.refundedCredits.N, "0");
  assert.equal(item.disputedCredits.N, "0");
  assert.equal(item.amountPaidCents.N, "2000");
  assert.ok(item.createdAt.N);
  assert.equal(item.expiresAt, undefined, "a receipt NEVER carries the TTL attribute: the dispute window outlives the EVENT# marker");
});

test("amountPaidCents is recorded only when finite and positive, and rounded to a whole cent", () => {
  const { receiptRowLeg } = mkStore(ledgerDdb());
  assert.equal(receiptRowLeg("pi_1", "user-9", 500).Put.Item.amountPaidCents, undefined, "absent: legacy shape");
  assert.equal(receiptRowLeg("pi_1", "user-9", 500, NaN).Put.Item.amountPaidCents, undefined);
  assert.equal(receiptRowLeg("pi_1", "user-9", 500, 0).Put.Item.amountPaidCents, undefined);
  assert.equal(receiptRowLeg("pi_1", "user-9", 500, 499.6).Put.Item.amountPaidCents.N, "500");
});

test("applyOnceRetrying retries the IDENTICAL write on contention and reports applied or replay", async () => {
  const ddb = queuedDdb([cancelledWith("TransactionConflict"), cancelledWith("TransactionConflict"), {}]);
  const { applyOnceRetrying } = mkStore(ddb);
  const res = await applyOnceRetrying("customer.subscription.updated", {
    eventId: "evt_1",
    sub: "user-9",
    setSubStatus: "past_due",
  });
  assert.deepEqual(res, { sub: "user-9", outcome: "applied" });
  assert.equal(txCount(ddb), 3, "two conflicts, then the commit");
  const [first, third] = [ddb.calls[0].input.TransactItems, ddb.calls[2].input.TransactItems];
  assert.equal(third[WALLET_LEG].Update.UpdateExpression, first[WALLET_LEG].Update.UpdateExpression, "nothing to recompute");

  const replay = queuedDdb([cancelledAt(EVENT_LEG)]);
  assert.deepEqual(
    await mkStore(replay).applyOnceRetrying("customer.subscription.deleted", { eventId: "evt_2", sub: "user-9", setTier: "free" }),
    { sub: "user-9", outcome: "replay" }
  );
  assert.equal(txCount(replay), 1, "a replay is an answer, not contention");
});

test("applyOnceRetrying gives up after four attempts with the label in the error", async () => {
  const conflict = () => cancelledWith("TransactionConflict");
  const ddb = queuedDdb([conflict(), conflict(), conflict(), conflict(), {}]);
  const { applyOnceRetrying } = mkStore(ddb);
  await assert.rejects(
    () => applyOnceRetrying("customer.subscription.deleted", { eventId: "evt_1", sub: "user-9", setTier: "free" }),
    /customer\.subscription\.deleted: wallet write contended past retry budget for user-9/
  );
  assert.equal(txCount(ddb), 4, "the budget is four attempts, not an unbounded spin");
});

test("the stateful stub honours the same conditions DynamoDB would", async () => {
  // The fixture is what every direct money test trusts, so its transaction
  // semantics are pinned here once: conditions are evaluated against the store
  // BEFORE anything is applied, and a failing leg is named by index.
  const ddb = recording(ledgerDdb({ "WALLET#user-9": { pk: { S: "WALLET#user-9" }, clawbackOwedCredits: { N: "800" } } }));
  const { applyOnce } = mkStore(ddb);
  const lost = await applyOnce({ eventId: "evt_1", sub: "user-9", owedCredits: -800, expectedOwed: 700 });
  assert.equal(lost, CLAWBACK_RETRY, "the wallet leg's OCC token did not match the row");
  assert.equal(ddb.store.has("EVENT#evt_1"), false, "the whole transaction was cancelled, not just one leg");
  assert.equal(ddb.wallet("user-9").clawbackOwedCredits.N, "800");
});
