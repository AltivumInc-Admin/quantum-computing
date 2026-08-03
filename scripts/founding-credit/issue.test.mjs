import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildTransactItems,
  decodeCancellation,
  validateCohort,
  ALREADY_ISSUED,
  COHORT_FULL,
  MARKER_LEG,
  COUNTER_LEG,
  WALLET_LEG,
} from "./issue.mjs";
import { emailHash, normalizeEmail } from "../lib/email-hash.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const COHORT = JSON.parse(readFileSync(join(HERE, "cohort-2026-08.json"), "utf8"));
const HASH = "a".repeat(64);
const build = (over = {}) =>
  buildTransactItems({ cohort: COHORT, tableName: "T", emailHash: HASH, sub: "sub-1", now: 1000, ...over });

/** The CLI's error text for a cancellation with the given positional reasons. */
const cancelMessage = (reasons) =>
  "An error occurred (TransactionCanceledException) when calling the " +
  `TransactWriteItems operation: Transaction cancelled, please refer cancellation reasons for specific reasons [${reasons.join(", ")}]`;

test("the shipped roster is valid and carries no plaintext address", () => {
  assert.deepEqual(validateCohort(COHORT), []);
  // Same privacy rule the Founding Ten badges follow: hashes in git, never
  // addresses. A roster is reviewed in a PR; a PR is forever.
  assert.ok(!JSON.stringify(COHORT).includes("@"));
});

test("the roster cannot silently exceed its own ceiling", () => {
  assert.ok(
    validateCohort({ ...COHORT, maxRecipients: 3 }).some((p) => p.includes("maxRecipients is 3")),
  );
});

test("a duplicate hash in the roster is rejected", () => {
  const dup = { ...COHORT, recipients: [{ slot: 1, emailHash: HASH }, { slot: 2, emailHash: HASH }] };
  assert.ok(validateCohort(dup).some((p) => p.includes("duplicate emailHash")));
});

test("issuing builds three legs in the fixed order and credits the wallet", () => {
  const items = build();
  assert.equal(items.length, 3);
  assert.equal(items[MARKER_LEG].Put.Item.pk.S, `FOUNDING#2026-08#${HASH}`);
  assert.equal(items[COUNTER_LEG].Update.Key.pk.S, "FOUNDING#2026-08#COUNTER");
  assert.equal(items[WALLET_LEG].Update.Key.pk.S, "WALLET#sub-1");
  assert.equal(items[WALLET_LEG].Update.ExpressionAttributeValues[":amt"].N, "1000");
});

test("the marker row carries NO expiresAt — a TTL would re-arm the whole grant", () => {
  // The wallet table has TTL enabled table-wide. A marker that expired would
  // let a clean re-run gift a second $200 weeks later with nothing failing.
  // Asserted on the CONSTRUCTED item, not on source text, because a spread
  // would fool a source scan.
  const item = build()[MARKER_LEG].Put.Item;
  assert.equal(item.expiresAt, undefined);
  assert.ok(!Object.keys(item).some((k) => /ttl|expire/i.test(k)));
});

test("tier is NEVER written — that is what keeps the gift hardware-scoped", () => {
  // The tutor gates paid models on `tier`, never on balance. Writing a tier
  // would let gift credits reach inference, open the Billing Portal to a
  // non-subscriber, and be silently resettable by a subscription webhook.
  assert.ok(!/\btier\b/.test(JSON.stringify(build())));
});

test("both ceiling guards are armed, from the roster's own numbers", () => {
  const upd = build()[COUNTER_LEG].Update;
  assert.equal(upd.ExpressionAttributeValues[":maxIssued"].N, "19"); // maxRecipients - 1
  assert.equal(upd.ExpressionAttributeValues[":maxCredits"].N, "19000"); // 20*1000 - 1000
  assert.match(upd.ConditionExpression, /issued <= :maxIssued/);
  assert.match(upd.ConditionExpression, /creditsIssued <= :maxCredits/);
});

test("the marker leg is conditional, so the same human is never paid twice", () => {
  assert.equal(build()[MARKER_LEG].Put.ConditionExpression, "attribute_not_exists(pk)");
});

test("no ClientRequestToken — its 10-minute window breaks legitimate retries", () => {
  assert.ok(!JSON.stringify(build()).includes("ClientRequestToken"));
});

test("a bad emailHash or a missing sub is refused before any write", () => {
  assert.throws(() => build({ emailHash: "not-a-hash" }), /sha256/);
  assert.throws(() => build({ sub: "" }), /sub is required/);
});

test("a refused marker leg reads as ALREADY_ISSUED", () => {
  assert.equal(
    decodeCancellation(cancelMessage(["ConditionalCheckFailed", "None", "None"])),
    ALREADY_ISSUED,
  );
});

test("a refused counter leg reads as COHORT_FULL — the 21st recipient", () => {
  assert.equal(
    decodeCancellation(cancelMessage(["None", "ConditionalCheckFailed", "None"])),
    COHORT_FULL,
  );
});

test("both refused reads as ALREADY_ISSUED, the benign reading", () => {
  assert.equal(
    decodeCancellation(cancelMessage(["ConditionalCheckFailed", "ConditionalCheckFailed", "None"])),
    ALREADY_ISSUED,
  );
});

test("an unrecognised failure decodes to null so the caller rethrows", () => {
  // Treating an unknown error as a skip would silently drop a recipient.
  assert.equal(decodeCancellation("ProvisionedThroughputExceededException"), null);
  assert.equal(decodeCancellation(cancelMessage(["None", "None", "None"])), null);
  assert.equal(decodeCancellation(undefined), null);
});

test("a person holding two accounts collides on the marker, not on sub", () => {
  // The live pool already contains one human with a native AND a Google
  // record. Keyed by sub they would be two recipients ($20, two slots); keyed
  // by email hash the second attempt hits the same marker row.
  const a = emailHash(" Gadiel.DeAraujo@Gmail.com ");
  const b = emailHash("gadiel.dearaujo@gmail.com");
  assert.equal(a, b);
  assert.equal(build({ emailHash: a, sub: "native-sub" })[MARKER_LEG].Put.Item.pk.S,
    build({ emailHash: b, sub: "google-sub" })[MARKER_LEG].Put.Item.pk.S);
});

test("email normalization matches the Founding Ten badge hash exactly", () => {
  // Divergence would mint a SECOND marker row for the same person.
  assert.equal(normalizeEmail("  Foo@Bar.COM "), "foo@bar.com");
  assert.equal(emailHash("Foo@Bar.com"), emailHash("foo@bar.com"));
});

test("the total gift is bounded at exactly $200", () => {
  assert.equal(COHORT.maxRecipients * COHORT.creditsEach, 20000); // credits
  // 1 credit = $0.01, so 20,000 credits is $200.00 and not a cent more.
  assert.equal((COHORT.maxRecipients * COHORT.creditsEach) / 100, 200);
});
