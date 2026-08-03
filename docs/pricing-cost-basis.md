# Pricing — technical cost drivers

Engineering notes behind the monetization rules in `CLAUDE.md`. This file covers **what
drives cost and how to measure it**. Commercial terms — markup, per-credit cost, margin,
breakeven — are deliberately **not** in this repository, which is public. They live in the
founder's private notes.

## Where the numbers live

| Fact | Source of truth |
|---|---|
| Tier prices, monthly grants, published hardware/tutor rates | `web/src/lib/pricing.ts` |
| Credits granted per purchase (server-side) | `CATALOG` in `lambda/stripe/index.mjs` |
| Braket provider list rates | `lib/utils/cost.py` → `PRICING` (parity-locked to `cost.json` / `cost.ts`) |
| QPU debit rates, day cap, shot ceiling | `lambda/qpu/qpu-core.mjs` |
| Tutor model roster and rates | `lambda/tutor/tutor-billing.mjs` |

Published prices in `pricing.ts` are **pre-marked-up literals**. Never add a markup constant,
cost basis, or margin calculation to this repo — `web/__tests__/lib/pricing.test.ts` asserts
only that published rates cover provider list rates, which is the strongest claim that can
be made publicly without disclosing the spread.

## Reading Claude's real cost on Bedrock

**Claude bills as separate AWS Marketplace SKUs** — e.g. "Claude Haiku 4.5 (Amazon Bedrock
Edition)" — so it appears in neither the Bedrock pricing page nor the AWS Price List API. A
query of `AmazonBedrock` for us-east-2 returns hundreds of SKUs and zero Claude entries.
That is a taxonomy artifact, not an absence: don't go looking there again.

Read it from your own billing instead, dividing cost by usage (units are per-1M-tokens):

```sh
aws ce get-cost-and-usage --time-period Start=YYYY-MM-DD,End=YYYY-MM-DD \
  --granularity MONTHLY --metrics UnblendedCost UsageQuantity \
  --filter '{"Dimensions":{"Key":"SERVICE","Values":["Claude Haiku 4.5 (Amazon Bedrock Edition)"]}}' \
  --group-by Type=DIMENSION,Key=USAGE_TYPE
```

Use a month in which only one model was active — a mixed month yields a blended rate that
looks precise and means nothing. Bedrock's rate is a constant multiple of Anthropic's
published list price, so one clean measurement extrapolates to models you have never run.
Cache reads bill at 0.1x input; cache writes at 1.25x.

## Tutor cost is input-dominated

`buildSystemPrompt` embeds the **entire lesson text** — median ~4,300 tokens, max ~6,100 —
while output is capped at `MAX_TOKENS` (800). Input therefore dominates every exchange, and
the cheapest model on the roster is not cheap. This is the single most important fact about
tutor economics, and it is easy to miss because intuition says the answer is the expensive
part.

Two consequences for anyone touching that path:

- **Prompt caching is not optional.** The lesson text is byte-identical for every question
  on a given lesson, so a `cachePoint` on the system block cuts cost dramatically. Not yet
  shipped; it is the highest-leverage unshipped change in the repo.
- **Never make the system prefix vary per request.** Interpolating a timestamp, a user id,
  or anything per-question ahead of the lesson text silently destroys the cache and
  restores full input cost with no visible symptom. See `shared/prompt-caching.md` in the
  `claude-api` skill for the full invalidation model.

## Open product question

The monthly grant must be attractive relative to simply topping up the same dollar amount,
or the subscription tier is dominated by pay-as-you-go and there is no reason to subscribe.
A tier can be justified by a better credit rate, by unlocking model access the free tier
lacks, or by both — but model gating is **not implemented today**, so it must not be
claimed in shipped copy. Resolve before the storefront reopens.
