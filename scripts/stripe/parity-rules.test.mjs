// The Stripe guards' decision logic, exercised offline.
//
// These functions decide whether the live account has drifted from the repo, and
// until now the only way to run them was to point a real key at a real Stripe
// account. A parse failure inside them does not look like a parse failure: it
// looks like DRIFT, reported against Stripe, caused by a formatting change in a
// TypeScript file.
//
// Zero dependencies — pure functions over strings and sets, so `node --test`
// needs no node_modules and there is nothing to install. Same shape as
// scripts/changelog/rules.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  tierPrices,
  diffEvents,
  auditDescription,
  priceNeedsReplacing,
} from "./lib/parity-rules.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PRICING = readFileSync(join(REPO, "web", "src", "lib", "pricing.ts"), "utf8");

const tiersFile = (blocks) => `export const TIERS: Tier[] = [\n${blocks}\n];\n`;

test("the real pricing.ts parses, and every paid tier carries a price and a grant", () => {
  const tiers = tierPrices(PRICING);
  const keys = Object.keys(tiers);
  assert.ok(keys.length >= 2, `expected the paid tiers, got ${keys.join(", ") || "nothing"}`);
  for (const [lookup, t] of Object.entries(tiers)) {
    assert.ok(Number.isFinite(t.usd) && t.usd > 0, `${lookup} has no price`);
    assert.ok(Number.isInteger(t.credits) && t.credits > 0, `${lookup} has no credit grant`);
  }
});

test("the free tier's zeros are never paired with the next tier's lookup key", () => {
  // The failure this guards: one spanning regex reads 0/0 from the free tier and
  // the lookup key from the tier after it, and the script reports a $0 price on a
  // paid tier — a false drift verdict on exactly the surface it exists to police.
  const tiers = tierPrices(PRICING);
  for (const [lookup, t] of Object.entries(tiers)) {
    assert.notEqual(t.usd, 0, `${lookup} read as $0`);
    assert.notEqual(t.credits, 0, `${lookup} read as a 0-credit grant`);
  }
});

test("a reformatted closing brace does not silently merge tiers", () => {
  // The old splitter was `\n  \},?\n?` — it encoded the file's indentation, so a
  // prettier run with different settings changed what the guard believed.
  const src = tiersFile(
    `  { id: "free", priceUsdPerMonth: 0, monthlyCredits: 0 },
      {
            id: "plus",
            priceUsdPerMonth: 19,
            monthlyCredits: 1900,
            checkoutLookupKey: "ql_plus_monthly",
      }`
  );
  assert.deepEqual(tierPrices(src), { ql_plus_monthly: { usd: 19, credits: 1900 } });
});

test("a decimal price is read exactly, not truncated", () => {
  const src = tiersFile(
    `  {
    id: "plus",
    priceUsdPerMonth: 19.5,
    monthlyCredits: 1900,
    checkoutLookupKey: "ql_plus_monthly",
  }`
  );
  // `(\d+)` alone read this as 19 and then compared 1900c against Stripe's 1950c.
  assert.equal(tierPrices(src).ql_plus_monthly.usd, 19.5);
});

test("a number inside a comment is not mistaken for a field", () => {
  const src = tiersFile(
    `  {
    id: "plus",
    // was priceUsdPerMonth: 12 and monthlyCredits: 1200 before the 2026-08 change
    priceUsdPerMonth: 19,
    monthlyCredits: 1900,
    checkoutLookupKey: "ql_plus_monthly",
  }`
  );
  assert.deepEqual(tierPrices(src).ql_plus_monthly, { usd: 19, credits: 1900 });
});

test("a tier the parser cannot read THROWS instead of reading as Stripe drift", () => {
  const src = tiersFile(
    `  {
    id: "plus",
    priceUsdPerMonth: PLUS_PRICE,
    monthlyCredits: 1900,
    checkoutLookupKey: "ql_plus_monthly",
  }`
  );
  assert.throws(() => tierPrices(src), /ql_plus_monthly.*priceUsdPerMonth/s);
});

test("a missing TIERS array is a parser failure, not an empty catalog", () => {
  assert.throws(() => tierPrices("export const NOTHING = [];"), /could not locate the TIERS array/);
});

test("diffEvents reports what is missing and what the handler ignores", () => {
  const required = ["invoice.paid", "charge.refunded", "charge.dispute.funds_withdrawn"];
  const d = diffEvents(["invoice.paid", "customer.created"], required);
  assert.equal(d.wildcard, false);
  assert.deepEqual(d.missing, ["charge.dispute.funds_withdrawn", "charge.refunded"]);
  assert.deepEqual(d.extra, ["customer.created"]);
});

test("a complete subscription has nothing missing", () => {
  const required = ["invoice.paid", "charge.refunded"];
  const d = diffEvents(["charge.refunded", "invoice.paid"], required);
  assert.deepEqual(d.missing, []);
  assert.deepEqual(d.extra, []);
});

test("a wildcard satisfies every required event and is reported as a wildcard", () => {
  const d = diffEvents(["*"], ["invoice.paid", "charge.refunded"]);
  assert.equal(d.wildcard, true);
  assert.deepEqual(d.missing, []);
  assert.deepEqual(d.extra, []);
});

test("a description whose credit count disagrees with the grant is an issue", () => {
  const issues = auditDescription("1,200 credits every month for the AI tutor.", 1900);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /advertises 1,200 credits; CATALOG grants 1900/);
});

test("a description that agrees with the grant is clean", () => {
  assert.deepEqual(auditDescription("1,900 credits every month.", 1900), []);
});

test("the retired margin framing is caught wherever it appears", () => {
  // Rules 5/9 retired these claims; rule 6 keeps the spread out of the repo. A
  // Stripe product description is customer-facing and outside every repo guard.
  for (const desc of ["Billed at cost.", "No markup, ever.", "We add nothing on top."]) {
    const issues = auditDescription(desc, 1900);
    assert.equal(issues.length, 1, `${desc} was not caught`);
    assert.match(issues[0], /retired claim/);
  }
});

test("a missing description is not an issue", () => {
  assert.deepEqual(auditDescription(undefined, 1900), []);
  assert.deepEqual(auditDescription(null, 500), []);
});

test("a price is replaced only when amount, recurrence or product moved", () => {
  const want = { amount: 1900, recurring: true, product: "ql_plus" };
  assert.equal(priceNeedsReplacing(undefined, want), true);
  assert.equal(
    priceNeedsReplacing({ unit_amount: 1900, recurring: { interval: "month" }, product: "ql_plus" }, want),
    false
  );
  assert.equal(
    priceNeedsReplacing({ unit_amount: 2900, recurring: { interval: "month" }, product: "ql_plus" }, want),
    true
  );
  assert.equal(priceNeedsReplacing({ unit_amount: 1900, recurring: null, product: "ql_plus" }, want), true);
  assert.equal(
    priceNeedsReplacing({ unit_amount: 1900, recurring: { interval: "month" }, product: "ql_pro" }, want),
    true
  );
});
