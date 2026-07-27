/**
 * Offline tests for tutor credit metering + model tiering. Pure functions, no
 * AWS. Run: `cd lambda/tutor && npm ci && npm test` (node --test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROSTER,
  TIER_DEFAULT,
  RATES,
  PROFILE_IDS,
  MODEL_LABELS,
  MICROS_PER_CREDIT,
  isAllowed,
  resolveModel,
  creditsForUsage,
  maxCreditsFor,
} from "./tutor-billing.mjs";

// ---- the roster IS the product claim ---------------------------------------
// The live Stripe descriptions promise Sonnet+Opus on Plus and "the full roster
// including Fable" on Pro. These assertions are what make that copy true; if a
// tier is edited so the copy no longer holds, this reddens.

test("the tiers deliver exactly what the storefront advertises", () => {
  // Free: the funnel. Usable without paying, one fast model.
  assert.deepEqual(ROSTER.free, ["haiku-4-5"]);
  // Plus: "Claude Sonnet and Opus in the tutor" -> Sonnet at minimum.
  assert.ok(ROSTER.plus.includes("sonnet-5"), "Plus must include Sonnet");
  // Pro: "the full tutor model roster including Claude Fable".
  assert.ok(ROSTER.pro.includes("fable-5"), "Pro must include Fable");
  assert.ok(ROSTER.pro.includes("opus-5"), "Pro must include Opus");
  // "full roster" means FULL — every priced model.
  assert.deepEqual([...ROSTER.pro].sort(), Object.keys(RATES).sort());
});

test("tiers are strictly nested — paying can never REMOVE a model", () => {
  for (const m of ROSTER.free) assert.ok(ROSTER.plus.includes(m), `plus lost ${m}`);
  for (const m of ROSTER.plus) assert.ok(ROSTER.pro.includes(m), `pro lost ${m}`);
});

test("every roster model has a rate, a profile id, and a label", () => {
  for (const model of ROSTER.pro) {
    assert.ok(RATES[model], `${model} has no rate — it would be served free`);
    assert.ok(PROFILE_IDS[model], `${model} has no Bedrock profile id`);
    assert.ok(MODEL_LABELS[model], `${model} has no display label`);
    assert.match(PROFILE_IDS[model], /^(us|global)\.anthropic\./, `${model} profile id looks wrong`);
  }
});

test("rates are ordered cheapest-to-dearest across the tier ladder", () => {
  // Not a pricing assertion (these are placeholders pending Bedrock
  // verification) — an ORDERING one: a higher tier's flagship must never be
  // cheaper than the free tier's model, or the tiering is incoherent.
  const order = ["haiku-4-5", "sonnet-5", "opus-5", "fable-5"];
  for (let i = 1; i < order.length; i++) {
    assert.ok(RATES[order[i]].in > RATES[order[i - 1]].in, `${order[i]} input rate not > ${order[i - 1]}`);
    assert.ok(RATES[order[i]].out > RATES[order[i - 1]].out, `${order[i]} output rate not > ${order[i - 1]}`);
  }
  // And output always costs more than input, on every model.
  for (const [m, r] of Object.entries(RATES)) {
    assert.ok(r.out > r.in, `${m}: output rate must exceed input rate`);
  }
});

// ---- entitlement -----------------------------------------------------------

test("a tier cannot select a model above it", () => {
  assert.equal(isAllowed("free", "haiku-4-5"), true);
  assert.equal(isAllowed("free", "opus-5"), false);
  assert.equal(isAllowed("plus", "sonnet-5"), true);
  assert.equal(isAllowed("plus", "fable-5"), false, "Fable is Pro-only");
  assert.equal(isAllowed("pro", "fable-5"), true);
});

test("an unknown tier is treated as free — never as paid", () => {
  // A wallet row with a garbage/legacy tier string must fail CLOSED.
  assert.equal(isAllowed("enterprise", "opus-5"), false);
  assert.equal(isAllowed(undefined, "sonnet-5"), false);
  assert.equal(resolveModel("enterprise", "fable-5"), "haiku-4-5");
});

test("resolveModel serves the tier default rather than failing the question", () => {
  assert.equal(resolveModel("free", undefined), "haiku-4-5");
  assert.equal(resolveModel("pro", undefined), TIER_DEFAULT.pro);
  // A free user asking for Opus gets an answer on Haiku, not an error.
  assert.equal(resolveModel("free", "opus-5"), "haiku-4-5");
  // A nonsense model name likewise degrades to the default.
  assert.equal(resolveModel("pro", "gpt-9"), TIER_DEFAULT.pro);
});

// ---- metering --------------------------------------------------------------

test("credits are computed from REAL usage at the $0.01 peg, rounded up", () => {
  assert.equal(MICROS_PER_CREDIT, 10_000);
  // Haiku: 10,000 in @ $1/Mtok = $0.01; 2,000 out @ $5/Mtok = $0.01 -> $0.02 = 2 credits
  assert.equal(creditsForUsage("haiku-4-5", { inputTokens: 10_000, outputTokens: 2_000 }), 2);
  // A tiny generation still costs 1 credit, never 0 — no free fractions.
  assert.equal(creditsForUsage("opus-5", { inputTokens: 1, outputTokens: 1 }), 1);
  // Zero usage costs zero.
  assert.equal(creditsForUsage("opus-5", { inputTokens: 0, outputTokens: 0 }), 0);
});

test("the free tier is metered at zero no matter how much it used", () => {
  assert.equal(
    creditsForUsage("haiku-4-5", { inputTokens: 500_000, outputTokens: 100_000 }, { free: true }),
    0,
  );
});

test("a malformed or missing usage report never invents a charge", () => {
  // The failure direction matters: if Bedrock's metadata event is missing or
  // garbled we must under-charge, never guess a number onto a paid wallet.
  assert.equal(creditsForUsage("opus-5", undefined), 0);
  assert.equal(creditsForUsage("opus-5", { inputTokens: "lots", outputTokens: 5 }), 0);
  assert.equal(creditsForUsage("opus-5", { inputTokens: NaN, outputTokens: 5 }), 0);
});

test("an unpriced model is served free rather than charged a guessed rate", () => {
  assert.equal(creditsForUsage("some-unlisted-model", { inputTokens: 9_999, outputTokens: 9_999 }), 0);
});

test("maxCreditsFor bounds a generation by its worst case, for the pre-flight check", () => {
  const worst = maxCreditsFor("opus-5", { inputTokens: 6_000, maxOutputTokens: 800 });
  // 6,000 in @ $5/Mtok = $0.03; 800 out @ $25/Mtok = $0.02 -> $0.05 = 5 credits
  assert.equal(worst, 5);
  // It must never under-state the real cost of the same generation.
  const actual = creditsForUsage("opus-5", { inputTokens: 6_000, outputTokens: 800 });
  assert.ok(worst >= actual, "the pre-flight bound must not be below actual cost");
});
