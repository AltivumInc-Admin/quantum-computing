// Credit metering + model tiering for the "Ask the margin" tutor.
//
// This is the OTHER half of the credit wallet. Quantum Learner's paid value is
// the platform — the AI tutor above all — not QPU time (AWS already sells that).
// So credits buy inference here exactly as they buy hardware runs in lambda/qpu,
// against the same wallet at the same $0.01 peg.
//
// Two things live here, both pure and offline-testable:
//   1. WHICH model a caller may use  (ROSTER, by wallet tier)
//   2. WHAT a completed generation costs in credits  (RATES x real token usage)
//
// Pure by construction: no AWS clients, no env reads. index.mjs injects the
// wallet and the Anthropic client.

/** 1 credit = $0.01 = 10,000 micro-dollars — the peg quantum-stripe sells at
 *  (mirrors qpu-core.mjs MICROS_PER_CREDIT and web/src/lib/pricing.ts). */
export const MICROS_PER_CREDIT = 10_000;

// ---- The model roster -------------------------------------------------------
// `free` is the anonymous and signed-out tier: the tutor stays free to use,
// which is the whole funnel.
//
// PROVIDER, 2026-08-17: these are invoked on Anthropic's FIRST-PARTY API, not
// Amazon Bedrock. Bedrock never entitled this account to the paid models —
// `converse` returned "anthropic.claude-sonnet-5 is not available for this
// account ... contact AWS Sales" for sonnet-5, opus-5 and fable-5, and only
// haiku-4-5 was ever invocable. Note the trap that hid it: `list-foundation-
// models`, `list-inference-profiles` and `get-foundation-model-availability`
// ALL reported the paid models present and AUTHORIZED. Availability describes
// the model in the region, not the account's entitlement to invoke it, so the
// only honest check is an actual call.
//
// The tiers are what the storefront sells, so this table IS the product claim.
// Anything a tier does not list, a caller in that tier cannot select.
export const ROSTER = {
  free: ["haiku-4-5"],
  plus: ["haiku-4-5", "sonnet-5"],
  pro: ["haiku-4-5", "sonnet-5", "opus-5", "fable-5"],
};

/** The default model per tier — what a caller gets when they name none. Free
 *  stays on Haiku (fast, cheap, and the tutor's job is short grounded answers);
 *  paid tiers default to their mid model rather than their most expensive one,
 *  so an idle "ask a question" never silently spends at the top rate. */
export const TIER_DEFAULT = {
  free: "haiku-4-5",
  plus: "sonnet-5",
  pro: "opus-5",
};

// ---- Rates ------------------------------------------------------------------
// Micro-dollars per 1,000,000 tokens, input and output.
//
// PROVENANCE. These are Anthropic's published first-party list rates, which on
// this provider ARE the cost basis rather than a stand-in for one. That is the
// whole reason the move off Bedrock simplifies metering: Bedrock resells Claude
// as AWS Marketplace SKUs that appear in neither the Bedrock pricing page nor
// the Price List API, so its true cost could only ever be re-derived after the
// fact from Cost Explorer. Here the provider publishes the rate and returns
// exact per-response usage, so this table is verifiable rather than asserted.
//
// This table is COST, not price. The markup that turns it into what a learner
// is charged is read from deployed configuration and never committed (rule 6),
// so nothing here discloses the spread.
//
// One live caveat: sonnet-5 carries introductory pricing of $2/$10 per MTok
// through 2026-08-31, below the $3/$15 stated here. Until that date this table
// OVER-states sonnet-5's cost, which means sonnet-5 briefly carries a higher
// effective markup than its neighbours — a transient rule 5 divergence in the
// safe direction. The figures below are the post-2026-08-31 steady state and
// need no edit when the introductory period lapses.
export const RATES = {
  "haiku-4-5": { in: 1_000_000, out: 5_000_000 },
  "sonnet-5": { in: 3_000_000, out: 15_000_000 },
  "opus-5": { in: 5_000_000, out: 25_000_000 },
  "fable-5": { in: 10_000_000, out: 50_000_000 },
};

/** First-party Anthropic model ids. The handler passes these straight to
 *  `POST /v1/messages`, so a typo is a 404 rather than a silent downgrade.
 *  These are complete as written — never append a date suffix, and never
 *  re-add a Bedrock `us.` / `anthropic.` prefix (the test pins both). */
export const MODEL_IDS = {
  "haiku-4-5": "claude-haiku-4-5",
  "sonnet-5": "claude-sonnet-5",
  "opus-5": "claude-opus-5",
  "fable-5": "claude-fable-5",
};

/**
 * Thinking mode per model — load-bearing for both correctness and cost.
 *
 * `max_tokens` caps thinking AND answer text together, and thinking tokens bill
 * at the OUTPUT rate. A tutor answer is short and grounded in one lesson, so
 * thinking buys little here and costs at the dearest rate on the sheet.
 *
 *   haiku-4-5  predates adaptive thinking — nothing to configure, send nothing.
 *   sonnet-5   accepts {type:"disabled"}.
 *   opus-5     thinks BY DEFAULT (unlike Opus 4.8 — omitting the parameter is
 *              not the same as disabling it). {type:"disabled"} is accepted
 *              only at effort <= high, which is what the handler sends.
 *   fable-5    REJECTS {type:"disabled"} with a 400. Thinking is always on.
 *
 * That last row is why MAX_OUTPUT_TOKENS is not one number.
 */
export const THINKING = {
  "haiku-4-5": "unsupported",
  "sonnet-5": "disabled",
  "opus-5": "disabled",
  "fable-5": "adaptive",
};

/**
 * `output_config.effort` per model, or null to omit it.
 *
 * Haiku 4.5 predates the effort parameter and REJECTS it — so the paid models'
 * effort hint must never leak onto the free tier's model, which is every
 * anonymous question the tutor answers. Low effort suits the job everywhere it
 * is accepted: one short answer grounded in one lesson.
 *
 * It is also what keeps disabled thinking legal on opus-5, which accepts
 * {type:"disabled"} only at effort <= high.
 */
export const EFFORT = {
  "haiku-4-5": null,
  "sonnet-5": "low",
  "opus-5": "low",
  "fable-5": "low",
};

/**
 * The model-specific half of the request body.
 *
 * Every knob here is a 400 on at least one roster model, which is why it is a
 * lookup rather than a branch. Note what is absent and must stay absent:
 * `temperature`, `top_p`, `top_k` and `budget_tokens` are all rejected on the
 * 4.7-and-later models. The Bedrock-era handler sent `temperature: 0.2`, which
 * would have failed every paid model on the first request.
 */
export function modelRequestOptions(model) {
  const options = {};
  if (THINKING[model] === "disabled") options.thinking = { type: "disabled" };
  if (EFFORT[model]) options.output_config = { effort: EFFORT[model] };
  return options;
}

/**
 * The output ceiling per model, and therefore what the pre-flight reserve is
 * sized against.
 *
 * 800 is the answer-length budget the tutor was built around and is plenty for
 * every model that answers without thinking. fable-5 cannot be told not to
 * think, so 800 would be consumed reasoning and return a truncated answer — or
 * an empty one. It gets room for the reasoning it is going to do regardless.
 *
 * This ceiling is a money control, not just a length control: the settle path
 * caps the charge at the reserve, so any output beyond what the reserve assumed
 * is absorbed by the platform rather than billed. Raising a ceiling here without
 * the reserve following it re-opens exactly that hole.
 */
export const MAX_OUTPUT_TOKENS = {
  "haiku-4-5": 800,
  "sonnet-5": 800,
  "opus-5": 800,
  "fable-5": 4_000,
};

/** Human labels for the UI — single-sourced so the picker and the pricing page
 *  cannot drift from what the server will actually invoke. */
export const MODEL_LABELS = {
  "haiku-4-5": "Claude Haiku 4.5",
  "sonnet-5": "Claude Sonnet 5",
  "opus-5": "Claude Opus 5",
  "fable-5": "Claude Fable 5",
};

/** Is `model` selectable by a caller on `tier`? Unknown tiers fall back to free
 *  — a wallet row with an unrecognized tier string must never unlock a paid
 *  model, so the failure direction is deliberate. */
export function isAllowed(tier, model) {
  const allowed = ROSTER[tier] ?? ROSTER.free;
  return allowed.includes(model);
}

/** The model to actually invoke: the caller's choice when their tier allows it,
 *  otherwise the tier default. Never throws — an unknown or disallowed request
 *  quietly serves the tier default rather than failing a learner's question,
 *  and the response reports which model actually answered. */
export function resolveModel(tier, requested) {
  const t = ROSTER[tier] ? tier : "free";
  if (requested && isAllowed(t, requested)) return requested;
  return TIER_DEFAULT[t];
}

/**
 * Prompt-cache price multipliers, applied to the model's INPUT rate.
 *
 * Measured against real Cost Explorer billing on Bedrock, and carried over
 * unchanged because Anthropic's first-party sheet prices caching identically:
 * a read at 0.1x the input rate, a 5-minute-TTL write at 1.25x. (A 1-hour TTL
 * write is 2x. This handler does not set `ttl`, so it gets the 5-minute
 * default; adding an hour TTL means changing the write multiplier with it.)
 *
 * Note a cache WRITE costs MORE than sending the same tokens uncached. Caching is a net
 * win across a lesson's questions, but the first one is dearer than it used to be.
 */
export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_MULTIPLIER = 1.25;

/** Logged by the handler when `readUsage` cannot read a usage report, so the
 *  condition alarms instead of quietly metering nothing. Pinned string: a
 *  CloudWatch metric filter matches it, exactly as the billing Lambda's
 *  SIGNATURE_REJECTED does. */
export const USAGE_SHAPE_UNRECOGNIZED = "tutor-billing: usage report shape unrecognized; charged 0";

/**
 * Normalize one provider usage report, or return `null` if it cannot be read.
 *
 * Anthropic reports `input_tokens` / `output_tokens` / `cache_read_input_tokens` /
 * `cache_creation_input_tokens` — note the last is "creation", not "write".
 *
 * Returning null rather than zeroes is the point. Amazon Bedrock spelled all
 * four in camelCase, so an un-migrated caller would miss every field, price the
 * generation at 0 credits, and report success — metering that bills nothing,
 * forever, with no error anywhere. Charging 0 is still the fallback (rule 7,
 * fail toward undercharging), but the handler logs USAGE_SHAPE_UNRECOGNIZED so
 * it is an alarm rather than a silence.
 *
 * `input_tokens` is the UNCACHED REMAINDER, not the full prompt — verified
 * against the live service: a 5,545-token system prompt reported 14 uncached
 * input tokens with 5,529 read from cache. Billing only that field would stop
 * charging for ~99.7% of the prompt the moment caching was switched on, so the
 * cache legs are priced explicitly below or caching becomes a giveaway.
 */
export function readUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  // Both are always present on a real report; requiring them is what rejects a
  // Bedrock-shaped object instead of silently reading it as all-zeroes.
  if (!("input_tokens" in usage) || !("output_tokens" in usage)) return null;
  const out = {
    input: Number(usage.input_tokens ?? 0),
    output: Number(usage.output_tokens ?? 0),
    cacheRead: Number(usage.cache_read_input_tokens ?? 0),
    cacheWrite: Number(usage.cache_creation_input_tokens ?? 0),
  };
  // A garbled field voids the whole report rather than part of a charge.
  return Object.values(out).every(Number.isFinite) ? out : null;
}

/** Pinned throw message: a metered pricing call without a usable factor is a
 *  bug in the CALLER (the composition root gates on the deployed config), and
 *  it must fail loudly — raw provider cost is a rate that differs from every
 *  other surface (rule 5), and defaulting to it would be invisible. */
export const RATE_FACTOR_REQUIRED =
  "tutor-billing: rate factor missing or invalid; metered pricing refused";

/**
 * Credits owed for one completed generation, from the REAL token usage the
 * provider reports — never an estimate, and never the request's `max_tokens`.
 * Rounded UP to a whole credit so a fraction of a cent is never dispensed free;
 * a generation that reports zero usage costs zero.
 *
 * The free tier is metered at zero regardless of usage: free learning is the
 * funnel, and the platform eats Haiku's cost as customer acquisition.
 *
 * `factor` converts provider cost into what the learner is charged. It is
 * REQUIRED for any non-free call, and its value lives in DEPLOYED CONFIGURATION
 * only (rule 6): index.mjs reads it from the environment and injects it here.
 * This module stays pure — no env reads, no imports — because it is copied
 * verbatim into the public web bundle (see the kernel-purity guard).
 * The factor multiplies the micro-dollar cost BEFORE the ceil: ceiling first
 * and scaling second would multiply the up-to-one-credit round-up by the
 * factor — an overcharge (rule 7). Scale first, so the single round-up stays
 * at most one credit regardless of the factor.
 */
export function creditsForUsage(model, usage, { free = false, factor } = {}) {
  if (free) return 0;
  if (!Number.isFinite(factor) || factor <= 0) throw new TypeError(RATE_FACTOR_REQUIRED);
  const rate = RATES[model];
  if (!rate) return 0; // unpriced model: never charge for what we can't price
  const u = readUsage(usage);
  if (!u) return 0; // unreadable report: charge nothing, and let the caller alarm
  const micros =
    (u.input * rate.in +
      u.output * rate.out +
      u.cacheRead * rate.in * CACHE_READ_MULTIPLIER +
      u.cacheWrite * rate.in * CACHE_WRITE_MULTIPLIER) /
    1_000_000;
  return Math.ceil((micros * factor) / MICROS_PER_CREDIT);
}

/** Conservative char→token estimate for the pre-flight reserve. English prose
 *  runs ~4 chars/token; dividing by 3 over-estimates by ~25%, which is the
 *  right direction — the reserve is refunded down to real usage after the
 *  stream, so an over-estimate costs nothing, while an under-estimate would
 *  let a generation start that the wallet cannot cover. */
export function estimateTokens(chars) {
  return Math.ceil(chars / 3) + 64; // +64 for message/role framing overhead
}

/**
 * The most a single generation can cost, used as the PRE-FLIGHT balance check:
 * we cannot know real usage until after the stream, so we refuse to start a
 * generation the wallet could not cover in the worst case. Worst case is the
 * full system prompt in and `maxTokens` out.
 *
 * This is deliberately conservative — it can refuse a request whose actual cost
 * would have fit. The alternative (start, then discover the wallet is short)
 * means either eating the cost or clawing back credits after delivering an
 * answer, and silently delivering something the learner cannot pay for is the
 * dishonesty this whole subsystem exists to avoid.
 *
 * Pass MAX_OUTPUT_TOKENS[model] as `maxOutputTokens`, not a shared constant.
 * Thinking bills as output, so on fable-5 — which cannot be told not to think —
 * the ceiling and therefore the reserve are several times the others'.
 */
export function maxCreditsFor(model, { inputTokens, maxOutputTokens, factor }) {
  // The worst case is a cache WRITE, not an uncached send: writing the prefix bills at
  // CACHE_WRITE_MULTIPLIER x the input rate. Reserving the uncached figure would
  // under-reserve on precisely the first question of every lesson — the one that writes
  // the cache — and the settle path caps the charge at the reserve, so the shortfall
  // would be silently absorbed rather than billed.
  //
  // The factor rides the same delegation: reserve and settle scale through ONE
  // expression (creditsForUsage), so they can never drift apart — a factor
  // applied to one leg but not the other silently under-bills or mints credits.
  return creditsForUsage(
    model,
    {
      input_tokens: 0,
      output_tokens: maxOutputTokens,
      cache_creation_input_tokens: inputTokens,
    },
    { factor },
  );
}
