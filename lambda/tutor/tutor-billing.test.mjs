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
  MODEL_IDS,
  MODEL_LABELS,
  MICROS_PER_CREDIT,
  MAX_OUTPUT_TOKENS,
  THINKING,
  isAllowed,
  resolveModel,
  modelRequestOptions,
  readUsage,
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

test("every roster model has a rate, a model id, and a label", () => {
  for (const model of ROSTER.pro) {
    assert.ok(RATES[model], `${model} has no rate — it would be served free`);
    assert.ok(MODEL_IDS[model], `${model} has no Anthropic model id`);
    assert.ok(MODEL_LABELS[model], `${model} has no display label`);
  }
});

test("rates are ordered cheapest-to-dearest across the tier ladder", () => {
  // Not a pricing assertion — an ORDERING one: a higher tier's flagship must
  // never be cheaper than the free tier's model, or the tiering is incoherent.
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
  assert.equal(creditsForUsage("haiku-4-5", { input_tokens: 10_000, output_tokens: 2_000 }), 2);
  // A tiny generation still costs 1 credit, never 0 — no free fractions.
  assert.equal(creditsForUsage("opus-5", { input_tokens: 1, output_tokens: 1 }), 1);
  // Zero usage costs zero.
  assert.equal(creditsForUsage("opus-5", { input_tokens: 0, output_tokens: 0 }), 0);
});

test("the free tier is metered at zero no matter how much it used", () => {
  assert.equal(
    creditsForUsage("haiku-4-5", { input_tokens: 500_000, output_tokens: 100_000 }, { free: true }),
    0,
  );
});

test("a malformed or missing usage report never invents a charge", () => {
  // The failure direction matters: if the provider's usage report is missing
  // or garbled we must under-charge, never guess a number onto a paid wallet.
  assert.equal(creditsForUsage("opus-5", undefined), 0);
  assert.equal(creditsForUsage("opus-5", { input_tokens: "lots", output_tokens: 5 }), 0);
  assert.equal(creditsForUsage("opus-5", { input_tokens: NaN, output_tokens: 5 }), 0);
});

test("an unpriced model is served free rather than charged a guessed rate", () => {
  assert.equal(creditsForUsage("some-unlisted-model", { input_tokens: 9_999, output_tokens: 9_999 }), 0);
});

test("maxCreditsFor bounds a generation by its worst case, for the pre-flight check", () => {
  const worst = maxCreditsFor("opus-5", { inputTokens: 6_000, maxOutputTokens: 800 });
  // Worst case is a cache WRITE, which bills at 1.25x input — dearer than an uncached
  // send, and exactly what the first question on a lesson does.
  // 6,000 in @ $5/Mtok x 1.25 = $0.0375; 800 out @ $25/Mtok = $0.02 -> $0.0575 -> 6 credits
  assert.equal(worst, 6);

  // It must not under-state ANY real outcome of the same generation: uncached, writing
  // the cache, or reading it. The settle path caps the charge at the reserve, so an
  // under-reserve is silently absorbed rather than billed.
  for (const [label, usage] of [
    ["uncached", { input_tokens: 6_000, output_tokens: 800 }],
    ["cache write", { input_tokens: 0, cache_creation_input_tokens: 6_000, output_tokens: 800 }],
    ["cache read", { input_tokens: 14, cache_read_input_tokens: 5_986, output_tokens: 800 }],
  ]) {
    assert.ok(
      worst >= creditsForUsage("opus-5", usage),
      `the pre-flight bound must not be below actual cost (${label})`,
    );
  }
});

test("cache reads and writes are priced, not free", () => {
  // `input_tokens` is the UNCACHED REMAINDER — verified against the live service.
  // Billing it alone would charge ~nothing for a cached prompt, so switching caching on
  // would quietly turn the tutor into a giveaway. These assertions guard against that.
  const uncached = creditsForUsage("opus-5", { input_tokens: 10_000, output_tokens: 0 });
  const read = creditsForUsage("opus-5", { input_tokens: 0, cache_read_input_tokens: 10_000, output_tokens: 0 });
  const write = creditsForUsage("opus-5", { input_tokens: 0, cache_creation_input_tokens: 10_000, output_tokens: 0 });

  assert.ok(read > 0, "a cache read must cost something");
  assert.ok(read < uncached, "a cache read must be cheaper than an uncached send");
  assert.ok(write > uncached, "a cache write must be dearer than an uncached send");

  // 10,000 @ $5/Mtok = $0.05 uncached -> read 0.1x = $0.005, write 1.25x = $0.0625
  assert.equal(uncached, 5);
  assert.equal(read, 1); // $0.005 rounds up to 1 credit
  assert.equal(write, 7); // $0.0625 -> 6.25 -> 7
});

test("a garbled cache field voids the charge rather than guessing", () => {
  // Fail toward undercharging: usage we cannot read is usage we do not bill.
  assert.equal(creditsForUsage("opus-5", { input_tokens: 100, cache_read_input_tokens: "some", output_tokens: 5 }), 0);
  assert.equal(creditsForUsage("opus-5", { input_tokens: 100, cache_creation_input_tokens: NaN, output_tokens: 5 }), 0);
  // Absent cache fields are simply zero — the pre-caching wire shape still prices correctly.
  assert.equal(creditsForUsage("haiku-4-5", { input_tokens: 10_000, output_tokens: 2_000 }), 2);
});

// ===========================================================================
// Anthropic first-party API (migrated off Amazon Bedrock, 2026-08-17)
// ===========================================================================
// Bedrock never granted this account the paid models — `converse` returned
// "not available for this account ... contact AWS Sales" for sonnet-5, opus-5
// and fable-5, while `get-foundation-model-availability` reported AUTHORIZED.
// Only haiku-4-5 was ever invocable. The tutor therefore calls api.anthropic.com
// directly, which changes three things that money depends on.

test("model ids are bare first-party Anthropic ids, not Bedrock profiles", () => {
  for (const model of ROSTER.pro) {
    const id = MODEL_IDS[model];
    assert.ok(id, `${model} has no Anthropic model id`);
    // A Bedrock inference-profile id sent to api.anthropic.com is a 404, and a
    // bare id sent to Bedrock is a ValidationException. Neither is ambiguous,
    // but only one of them is what this handler now speaks.
    assert.doesNotMatch(id, /^(us|global|eu|apac)\./, `${model}: regional profile prefix survived`);
    assert.doesNotMatch(id, /^anthropic\./, `${model}: Bedrock provider prefix survived`);
    assert.match(id, /^claude-/, `${model}: not a first-party model id`);
  }
});

test("usage is read from Anthropic's field names", () => {
  // Anthropic returns input_tokens / output_tokens / cache_read_input_tokens /
  // cache_creation_input_tokens. Note the last one is NOT named "cache_write".
  const credits = creditsForUsage("opus-5", {
    input_tokens: 10_000,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  });
  assert.equal(credits, 5); // 10,000 @ $5/Mtok = $0.05

  assert.equal(
    creditsForUsage("opus-5", { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 10_000 }),
    1, // $0.005 -> rounds up
  );
  assert.equal(
    creditsForUsage("opus-5", { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 10_000 }),
    7, // $0.0625 -> 7
  );
});

test("a Bedrock-shaped usage report is REFUSED, not silently charged zero", () => {
  // The migration's sharpest edge. Every Bedrock field name (inputTokens,
  // cacheWriteInputTokens, ...) misses the snake_case reads above, so an
  // un-migrated caller would price every generation at 0 credits, forever,
  // with no error — metering that reports success and bills nothing.
  //
  // `readUsage` returns null on a shape it does not recognise so the handler
  // can log USAGE_SHAPE_UNRECOGNIZED and alarm on it, exactly as the billing
  // Lambda alarms on SIGNATURE_REJECTED. Charging 0 is still the fallback
  // (rule 7 — fail toward undercharging), but it is no longer silent.
  const bedrockShaped = { inputTokens: 10_000, outputTokens: 2_000, cacheReadInputTokens: 500 };
  assert.equal(readUsage(bedrockShaped), null, "a Bedrock usage report must not be readable");
  assert.equal(creditsForUsage("opus-5", bedrockShaped), 0, "and must not invent a charge");

  // A well-formed Anthropic report reads cleanly.
  assert.deepEqual(readUsage({ input_tokens: 3, output_tokens: 4, cache_read_input_tokens: 5, cache_creation_input_tokens: 6 }), {
    input: 3,
    output: 4,
    cacheRead: 5,
    cacheWrite: 6,
  });
  // Absent cache fields are zero, not unreadable — the uncached wire shape is valid.
  assert.deepEqual(readUsage({ input_tokens: 3, output_tokens: 4 }), {
    input: 3,
    output: 4,
    cacheRead: 0,
    cacheWrite: 0,
  });
});

test("the output ceiling leaves room for thinking on models that cannot disable it", () => {
  // On the first-party API, thinking tokens bill as OUTPUT and `max_tokens`
  // caps thinking + answer text together.
  //   - haiku-4-5 has no adaptive thinking.
  //   - sonnet-5 and opus-5 accept thinking:{type:"disabled"} (opus-5 only at
  //     effort <= high, which is what this handler sends).
  //   - fable-5 REJECTS thinking:{type:"disabled"} with a 400. Thinking is
  //     always on, so an 800-token ceiling would be spent reasoning and return
  //     a truncated answer — or none at all.
  assert.equal(THINKING["haiku-4-5"], "unsupported", "Haiku 4.5 predates adaptive thinking");
  for (const model of ["sonnet-5", "opus-5"]) {
    assert.equal(THINKING[model], "disabled", `${model} should answer without thinking`);
  }
  assert.equal(THINKING["fable-5"], "adaptive", "fable-5 cannot disable thinking");

  for (const model of ROSTER.pro) {
    assert.ok(Number.isInteger(MAX_OUTPUT_TOKENS[model]), `${model} has no output ceiling`);
  }
  assert.ok(
    MAX_OUTPUT_TOKENS["fable-5"] > MAX_OUTPUT_TOKENS["opus-5"],
    "fable-5 must be given room for always-on thinking",
  );
});

test("the reserve covers thinking, so an overrun is never absorbed silently", () => {
  // The settle path caps the charge at the reserve. If thinking pushes real
  // output past what maxCreditsFor assumed, the excess is eaten by us — the
  // same failure the cache-write comment above exists to prevent, arriving by
  // a different route.
  const inputTokens = 6_000;
  for (const model of ROSTER.pro) {
    const reserve = maxCreditsFor(model, { inputTokens, maxOutputTokens: MAX_OUTPUT_TOKENS[model] });
    const worstReal = creditsForUsage(model, {
      input_tokens: 0,
      cache_creation_input_tokens: inputTokens,
      output_tokens: MAX_OUTPUT_TOKENS[model], // thinking + text, to the cap
    });
    assert.ok(reserve >= worstReal, `${model}: reserve ${reserve} < worst real cost ${worstReal}`);
  }
});

test("each model gets a request shape it will actually accept", () => {
  // Every field below is a 400 on some model in this roster, which is why the
  // shape is per-model rather than one branch:
  //   - Haiku 4.5 predates `output_config.effort` and REJECTS it, so the paid
  //     models' effort hint must not leak onto the free tier's model.
  //   - Fable 5 rejects `thinking:{type:"disabled"}` outright.
  //   - Opus 5 accepts `thinking:{type:"disabled"}` only at effort <= high.
  //   - temperature / top_p / top_k are rejected on every 4.7+ model, so the
  //     old `temperature: 0.2` must not survive anywhere.
  const haiku = modelRequestOptions("haiku-4-5");
  assert.deepEqual(haiku, {}, "Haiku 4.5 takes neither thinking nor effort");

  for (const model of ["sonnet-5", "opus-5"]) {
    const o = modelRequestOptions(model);
    assert.deepEqual(o.thinking, { type: "disabled" }, `${model} should not think`);
    assert.ok(["low", "medium", "high"].includes(o.output_config?.effort),
      `${model}: disabled thinking is only accepted at effort <= high`);
  }

  const fable = modelRequestOptions("fable-5");
  assert.equal(fable.thinking, undefined, "fable-5 must not be sent any thinking config");

  for (const model of ROSTER.pro) {
    const o = modelRequestOptions(model);
    for (const banned of ["temperature", "top_p", "top_k", "budget_tokens"]) {
      assert.equal(o[banned], undefined, `${model}: ${banned} is a 400 on this API`);
    }
  }
});
