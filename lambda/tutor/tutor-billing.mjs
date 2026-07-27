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
// wallet and the Bedrock client.

/** 1 credit = $0.01 = 10,000 micro-dollars — the peg quantum-stripe sells at
 *  (mirrors qpu-core.mjs MICROS_PER_CREDIT and web/src/lib/pricing.ts). */
export const MICROS_PER_CREDIT = 10_000;

// ---- The model roster -------------------------------------------------------
// Every id below is an ACTIVE cross-region inference profile in us-east-2
// (verified via `aws bedrock list-inference-profiles`), so a tier can only ever
// name a model the account can actually invoke. `free` is the anonymous and
// signed-out tier: the tutor stays free to use, which is the whole funnel.
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
// !! PROVENANCE — READ BEFORE THE STOREFRONT REOPENS !!
// These are Anthropic's published FIRST-PARTY list rates. Amazon Bedrock is
// partner-operated and priced separately, and at the time of writing the AWS
// Price List API does not return entries for these model names, so they could
// not be read programmatically. They are therefore a DOCUMENTED PLACEHOLDER,
// not a verified cost basis: confirm each against
// https://aws.amazon.com/bedrock/pricing/ and correct this table before any
// real money is metered through it. `tutor-billing.test.mjs` asserts only that
// every roster model HAS a rate and that the ordering is sane — it cannot know
// whether the numbers are right. The storefront stays closed until they are.
//
// Charging at cost is deliberate: the platform's margin is the subscription and
// the bundled credit grant, not a markup on inference.
export const RATES = {
  "haiku-4-5": { in: 1_000_000, out: 5_000_000 },
  "sonnet-5": { in: 3_000_000, out: 15_000_000 },
  "opus-5": { in: 5_000_000, out: 25_000_000 },
  "fable-5": { in: 10_000_000, out: 50_000_000 },
};

/** Bedrock inference-profile ids, us-east-2. The handler passes these straight
 *  to ConverseStream, so a typo here is a runtime failure, not a silent
 *  downgrade — `tutor-billing.test.mjs` pins every roster model to one. */
export const PROFILE_IDS = {
  "haiku-4-5": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  "sonnet-5": "us.anthropic.claude-sonnet-5",
  "opus-5": "us.anthropic.claude-opus-5",
  "fable-5": "us.anthropic.claude-fable-5",
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
 * Credits owed for one completed generation, from the REAL token usage Bedrock
 * reports in its `metadata` event — never an estimate, and never the request's
 * `maxTokens`. Rounded UP to a whole credit so a fraction of a cent is never
 * dispensed free; a generation that somehow reports zero usage costs zero.
 *
 * The free tier is metered at zero regardless of usage: free learning is the
 * funnel, and the platform eats Haiku's cost as customer acquisition.
 */
export function creditsForUsage(model, usage, { free = false } = {}) {
  if (free) return 0;
  const rate = RATES[model];
  if (!rate) return 0; // unpriced model: never charge for what we can't price
  const inTok = Number(usage?.inputTokens ?? 0);
  const outTok = Number(usage?.outputTokens ?? 0);
  if (!Number.isFinite(inTok) || !Number.isFinite(outTok)) return 0;
  const micros = (inTok * rate.in + outTok * rate.out) / 1_000_000;
  return Math.ceil(micros / MICROS_PER_CREDIT);
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
 */
export function maxCreditsFor(model, { inputTokens, maxOutputTokens }) {
  return creditsForUsage(model, {
    inputTokens,
    outputTokens: maxOutputTokens,
  });
}
