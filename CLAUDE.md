# Quantum Computing Workspace (Amazon Braket)

## About This Project

This is a quantum computing learning and experimentation workspace using Amazon Braket.
It follows a progressive learning path from circuit fundamentals (01-foundations) through
production hybrid quantum-classical workloads (06-hybrid-jobs), with focused tracks on
Quantum Machine Learning and Quantum Chemistry.

## Monetization — the settled model

Founder decisions, settled 2026-08-03 against a verified cost basis. `PRODUCT.md` carries
product truth; this is the operative short form. **Do not soften, re-derive, or "improve"
these** — re-litigating monetization has cost this project more time than any other topic.
This file holds the rules only. Published figures live in `web/src/lib/pricing.ts`; cost
drivers in `docs/pricing-cost-basis.md`; commercial terms in neither — see rule 6.

### Stripe account — verify before every write

Quantum Learner billing lives on **exactly one** Stripe account: **`acct_1TuFow07hJdXv6GV`**
(live, dashboard display name **"Quantum Learner"**, `charges_enabled: true`). The owner's
Stripe login also controls **Altivum Logic** (`acct_1Rm6Rr000wqzRfNl`) and **Tj-Scents** —
writing prices to one of those is silent and easy. Sandbox is **`acct_1U5IQr0txWLZHlL3`** ("Quantum Learner Sandbox", key at
`op://Quantum Learner/Stripe Sandbox/Secret Key`). An older `acct_1TuFpH0a2DloOdGu` is
recorded in some places and is NOT the one that is provisioned — another reason every
script takes `--expect-account` and refuses a mismatch rather than trusting a written-down id.

**Confirm identity before any mutation; never infer it from a CLI profile, an MCP session,
or a previous conversation:**

```sh
KEY=$(op read "op://Quantum Learner/Stripe/add more/Secret Key")
curl -s https://api.stripe.com/v1/account -u "$KEY:" \
  | jq -r '"\(.id)  \(.settings.dashboard.display_name)"'   # acct_1TuFow07hJdXv6GV  Quantum Learner
```

The Stripe MCP authenticates independently of that key — verifying one proves nothing about
the other. Re-check the MCP with `get_stripe_account_info` after every re-authorization.
**Never place a live key in a `stripe` CLI profile**: the CLI redacts `*_api_key` in place
and destroys the secret. Use `curl -u "$KEY:"`, `--api-key`, or `STRIPE_API_KEY`.

**Every `stripe` CLI profile on this machine currently points at the WRONG account.**
`default`, `ql-live-admin` and `quantum-learner` all resolve to `acct_1Rm6Rr000wqzRfNl`
(Altivum Logic, the agency account). A profile name is not evidence. Verify identity per
call, or use the scripts under `scripts/stripe/`, which take `--expect-account` and refuse
to act on a mismatch.

### Evaluate in the sandbox. Always. Then live.

**Anything Stripe gets exercised in the sandbox (`acct_1TuFpH0a2DloOdGu`) before it is
believed about live.** Sandbox runs real Checkout, real webhook deliveries, real refunds
and real disputes, so "tests pass but the path cannot be exercised end to end" is never a
true statement about this integration — it only ever meant the sandbox had not been built.
The closer sandbox is to live, the more a green sandbox predicts a green live.

- `scripts/stripe/provision-sandbox.mjs` builds it: products (including `ql_credits` by
  that literal id — `CUSTOM_TOPUP_PRODUCT` needs it or custom top-ups 500), one price per
  `CATALOG` lookup key, and a webhook endpoint carrying **all nine** `REQUIRED_WEBHOOK_EVENTS`
  pinned to the SDK's own `apiVersion`. Idempotent; refuses any `sk_live_` key outright.
- **The Dashboard cannot pin an arbitrary API version and `api_version` is creation-only.**
  Create endpoints through the API, or the payload shape follows the account default and
  moves under a deployed handler — which is exactly how `invoice.subscription` moved under
  `parent.subscription_details` and broke credit granting once already.
- `stripe trigger` is near-useless here: its fixtures carry no `client_reference_id` and no
  `metadata`, so `checkout.session.completed`, `invoice.paid` and both subscription events
  no-op silently against this handler, and there are no dispute fixtures at all. Drive the
  real `/checkout` route. Force renewals with test clocks (advance twice — the renewal
  invoice sits in `draft` for ~1h of simulated time). Win a dispute with
  `evidence[uncategorized_text]=winning_evidence` + `submit=true`.
- Sandbox retries deliveries **3 times over a few hours**, not 3 days. Use
  `stripe events resend` as the forcing function, and to prove idempotency for real.

### Two guards for what the repo cannot see

The Stripe Dashboard is not in the repo, so no test in the repo can see it, and both halves
had drifted when first checked on 2026-08-17. Run these against **both** accounts:

- `scripts/stripe/check-webhook-parity.mjs` — subscribed events vs `REQUIRED_WEBHOOK_EVENTS`,
  plus a pinned `api_version`. Live was subscribed to **4 of 9**: `charge.refunded` and both
  dispute events were absent, so the whole clawback path was dark in production. `index.test.mjs`
  R9 compares the code's list to the code's `switch` and can never catch this.
- `scripts/stripe/check-catalog-parity.mjs` — products and prices vs `CATALOG` + `TIERS`,
  including product **descriptions**, which are customer-facing at Checkout and therefore a
  rule 13 surface sitting outside every rule 13 guard.

### The shape of the business

1. **Free to learn, forever.** Curriculum, browser simulator, playground, glossary, review
   queue and cross-device sync are free with a free account, permanently. Learning never
   moves behind the wallet.
2. **Free accounts get no credits**, and therefore no metered AI and no QPU runs. The one
   exception is a **hard-capped tutor trial: 10 lifetime Haiku questions**, implemented as
   its own counter, **not** a wallet grant — so the "every credit was paid for" invariant
   and the credit-writer allowlist stay intact. A few cents of cost per signup, once, with
   no recurring exposure.
3. **Money is charged only for what costs real money**: AI inference and paid cloud compute
   (QPU runs, managed simulators). Name those surfaces plainly; never hide a metered
   surface behind the word "free."
4. **One wallet, dollar-pegged: 1 credit = $0.01, always.** The peg is what the buyer pays
   and never moves; prices move in credit terms. Money is integer micro-dollars
   (`MICROS_PER_CREDIT = 10_000`), and credit conversion rounds **up** so a fraction of a
   cent is never dispensed free.

### The margin rule — load-bearing, do not vary

5. **Every metered surface debits at the same markup over true cost.** One wallet means the
   *lowest* markup sets the effective margin: if the tutor and the QPU carry different
   markups, every rational learner spends their credits exclusively on whichever is cheaper,
   and real cost per subscriber rises accordingly. Never introduce a metered surface at a
   markup that differs from the others.
6. **This repo is PUBLIC. No markup constant, cost basis, or margin math belongs in it** —
   not in code, not in comments, not in docs. Published prices in `web/src/lib/pricing.ts`
   are pre-marked-up literals; the spread lives in the founder's private notes and in
   deployed configuration, never in version control. `web/__tests__/lib/pricing.test.ts`
   asserts only that published rates cover provider list rates, which is the strongest
   claim that can be made here without disclosing the spread.
7. **Fail toward undercharging.** Where metering is uncertain, the learner is charged less,
   never more.

### Verified cost basis

**Cost drivers are documented in `docs/pricing-cost-basis.md`, not here**, and commercial
terms are in neither (see rule 6). Duplicating figures into an instruction file is what the
prose-drift guard (`tests/test_pricing_prose.py`) exists to prevent — it derives the valid
set from `lib.utils.cost.PRICING` and fails on any prose figure that is not derivable from
the live table, so an instruction file must never become a second source of truth.

Two facts from it that change how you write code, and are worth carrying in your head:

- **The tutor is no longer on Amazon Bedrock** (2026-08-17). Bedrock never entitled this
  account to the paid roster — `converse` returned "not available for this account …
  contact AWS Sales" for sonnet-5, opus-5 and fable-5, so every tier above free was
  unreachable there. It now calls Anthropic's first-party API. Note the trap, because it
  generalizes: `list-foundation-models`, `list-inference-profiles` **and**
  `get-foundation-model-availability` all reported those models present and `AUTHORIZED`.
  Availability describes the model in the region, not the account's entitlement to invoke
  it. Only an actual call is evidence.
  - Consequence for cost: the old Bedrock note here said Claude billed as separate AWS
    Marketplace SKUs invisible to the Price List API, so cost had to be re-derived from
    Cost Explorer. That is no longer the tutor's problem — Anthropic publishes the rate
    and returns exact per-response usage, so `RATES` in `tutor-billing.mjs` is a verified
    cost basis rather than a placeholder. The Bedrock caveat still applies to anything
    else in this account that uses Bedrock.
- **Tutor cost is input-dominated**: `buildSystemPrompt` embeds the whole lesson text while
  output is capped per model (`MAX_OUTPUT_TOKENS`). Prompt caching is therefore not
  optional, and any edit that makes the system prefix vary per request silently destroys
  it. The minimum cacheable prefix is **per model and not monotonic** — 4,096 tokens on
  haiku-4-5 but 512 on opus-5 — and under the minimum the request is accepted and simply
  does not cache, with no error. Measure with `lambda/tutor/probe-tokens.mjs`.

### Prices

8. **Tiers, grants and published rates are defined in `web/src/lib/pricing.ts` (`TIERS`,
   `HARDWARE_RATES`, `TUTOR_RATES`) and mirrored server-side by `CATALOG` in
   `lambda/stripe/index.mjs`.** Those two must stay in lockstep — a test asserts it. Do not
   restate the numbers anywhere else, including here.
9. **QPU debits at the same markup as the tutor.** This supersedes the 2026-08-02 "published
   sheet stands" decision and closes the two-rate-table divergence — the Lambda debits raw
   cost today, capturing no margin at all.
10. **Credit expiry.** Subscription credits roll over, capped at 3x the monthly grant.
    **Purchased top-ups never expire** — that promise is kept. Spend order is
    expire-soonest-first. Not yet implemented; needs `expiresAt` on WALLET# rows.
11. **No free credits. Ever.** Every credit in a wallet was paid for — no starter grants, no
    promos, no sponsored hardware. A new learner's lifetime QPU allowance is `0`
    (`LIFETIME_CAP_MICROS`), and a zero cap alone is not sufficient: the `effectiveCap > 0`
    guard is load-bearing. Sole exception: the Founding Ten gift (1,000 credits x 20).

### Guardrails

12. **A subscriber's total cost to serve is bounded by their granted plus purchased
    credits, and purchases are prepaid.** That bound is what makes it structurally
    impossible to lose money on a subscriber. Any proposal that breaks the bound — an
    unmetered surface, an unbounded grant, credit issued without payment — is wrong
    regardless of how good the growth argument sounds.
13. **Never advertise what the deployed system cannot do.** The pricing page is test-guarded
    on rendered text in both locales. Before shipping a tier bullet, grep for the
    implementation. Credit counts and prices belong in `TIERS`, never hardcoded into i18n
    copy — that shipped once and rendered a new price beside a stale grant.
14. **Ordering rule: buying must work before metering turns on.**
15. **The storefront stays closed** (no `NEXT_PUBLIC_BILLING_URL` in the live Amplify env)
    until the open work below is done. Closed is a decision, not an oversight.
16. **Hard spend fences are a design commitment**: one device (IQM Garnet, eu-north-1), a
    per-run shot ceiling, a global daily kill switch, and a pedagogical entitlement gate —
    the learner prices the run and the server re-computes the true cost before any spend.
    All four are constants in `lambda/qpu/qpu-core.mjs`; read them there.

### Open work to reopen the storefront

- **FIRST — the shipped copy is now false.** Both locales still say curriculum hardware runs
  are platform-sponsored (14 strings in `en.ts`, 12 in `es.ts`; one is test-locked, so the
  test changes too). Since the 2026-08-05 QPU deploy that is no longer merely stale, it is
  **wrong**: `LIFETIME_CAP_MICROS` is `0` and no wallet table is wired, so every submit
  returns 402. Rule 13 says never advertise what the deployed system cannot do — this is
  that, live on the pricing page today. Fix the copy or wire the funding; do not leave both.
- ~~Correct `RATES` to true Bedrock cost~~ — **done 2026-08-17**, by moving the tutor off
  Bedrock entirely. Anthropic's published rates are the cost basis on that provider, so
  `RATES` is now verified rather than a documented placeholder. Still outstanding: read
  the shared markup from **deployed configuration** (an env var, like `SECRET_ID`) in both
  metering paths — never a committed constant, per rule 6. One value, injected once,
  consumed by both.
- Move QPU debit rates onto the same markup. Until this lands, both stacks' `WalletTableName`
  stays `""` on purpose — enabling the wallet at raw cost would introduce a metered surface at
  a markup that differs from the others, which rule 5 forbids.
- Gate `<AskTutor />` on tier; add the free-trial question counter; drop `free` from the
  tutor `ROSTER` (`lambda/tutor/tutor-billing.mjs`).
- **Create the `quantum-tutor` secret and deploy the tutor.** The handler now reads its
  Anthropic API key from Secrets Manager (`SECRET_ID`, default `quantum-tutor`) as
  `{"apiKey": "..."}`. Until that secret exists AND the stack is redeployed, git and the
  deployed function disagree and `make drift` reports it — correctly. The old Bedrock IAM
  grant and the `ModelId`/`FoundationModelId` parameters are gone from the template.
- Credit expiry with expire-soonest-first spend ordering. **DO NOT implement this by
  writing `expiresAt` onto WALLET# rows, which is how this item read until 2026-08-17.**
  The wallet table has DynamoDB **TTL ENABLED on the attribute `expiresAt`** (verified:
  `aws dynamodb describe-time-to-live --table-name quantum-stripe-wallet` returns
  `ENABLED`/`expiresAt`). Today only EVENT# idempotency rows carry it, which is exactly
  why it is safe. Putting it on a WALLET# row makes DynamoDB **delete the learner's whole
  wallet** at that timestamp — balance, tier, subscriptionStatus, clawbackOwedCredits —
  silently, with no application code involved and nothing to alarm on. Purchased credits
  must never expire (rule 10), so this would also break the one promise the wallet makes.
  Use a differently-named attribute (per-lot rows, or `creditLotsExpireAt`), or move the
  TTL specification onto an attribute only EVENT# rows can ever have.
- **Resolve the open product question in `docs/pricing-cost-basis.md`** — the tier is
  dominated by pay-as-you-go until model access is actually gated on it.

**Merging is not shipping — now guarded, not remembered.** The deploy lag closed 2026-08-05:
all 9 Lambdas match git, `make drift` reports it locally, and `.github/workflows/drift.yml`
runs daily at 13:00 UTC via the read-only OIDC role `quantum-ci-drift-check` (repo variable
`AWS_DRIFT_ROLE_ARN`; the job skips cleanly if unset). Still true, and deliberate: the live
tutor is **free and unmetered** (`UserPoolId`/`WalletTableName` both `""`) and the live QPU
function has **no wallet metering**.

## Development Guidelines

- Always use the local simulator (`LocalSimulator()`) for development and testing
- Only suggest running on real QPU hardware if the user explicitly requests it
- When QPU usage is requested, always include a cost estimate before execution
- Use PennyLane for variational and hybrid quantum-classical algorithms
- Follow the numbered directory progression when suggesting learning next steps
- Reference AWS Braket documentation for device-specific constraints

## Structure

- `00-prereqs/` through `06-hybrid-jobs/` — Progressive learning sections
- `lib/` — Shared Python library (circuits, utils, hardware abstraction). `lib/grading.py` is the browser-safe exercise self-check runtime (`with check("Exercise N"):`).
- `infra/` — CloudFormation templates and setup scripts
- `tests/` — Pytest suite for lib/ (runs on local simulator only). `tests/solutions/` holds one canonical-answer file per notebook; `tests/test_exercise_checks.py` executes every notebook with those answers injected (checks must pass) and unsolved (checks must not pass).

## Notebook exercises

Every curriculum notebook carries exercises in one convention (`docs/exercise-convention.md`): a prompt markdown cell (`### Exercise N` + two `<details>` hint tiers that steer without solving), a scaffold code cell (`# Exercise N:`), and a check code cell (`# Check Exercise N`) whose property-based asserts run through `lib.grading.check`. Each exercise has a canonical solution in `tests/solutions/<section>/<notebook>.py`; `make test` verifies the checks pass with the correct answer and fail unsolved. Edit notebooks with `nbformat`, never raw JSON.

## Key Commands

- `make setup` — Install all dependencies and validate AWS credentials
- `make lab` — Launch JupyterLab
- `make test` — Run test suite
- `make devices` — Show available Braket devices and their status
- `make cost` — Check current month's Braket spend

## Cost Awareness

These are **our** AWS costs for development work, not customer-facing prices. Published
customer rates live in `web/src/lib/pricing.ts` — see Monetization above.

Amazon Braket charges per-task and per-shot on real hardware. Always:
1. Prototype on local simulator first
2. Test on managed simulator (SV1) for larger circuits
3. Only move to QPU when the algorithm is validated
4. Check `make cost` regularly

Approximate costs (as of 2025):
- Local simulator: Free
- SV1/DM1/TN1: $0.075-$0.275 per minute
- IonQ: $0.08 per shot + $0.30 per task (Forte; Aria retired)
- IQM: $0.00145 per shot + $0.30 per task
- QuEra: $0.01 per shot + $0.30 per task

## Dependencies

Managed via pyproject.toml. Key packages:
- `amazon-braket-sdk` — Core SDK
- `pennylane` + `pennylane-braket` — Variational algorithms
- `openfermion` + `openfermionpyscf` — Quantum chemistry

## Web App (`web/`)

### Stack
- Next.js 16 + React 19, static export via `output: "export"`
- Tailwind CSS v4 (PostCSS plugin) — uses `@theme inline` for compile-time tokens
- Fonts: Sora (display) + Geist (body) + Geist Mono (code/data) via `next/font/google` — the Instrument type system, exposed as `--font-sora`/`--font-geist`/`--font-geist-mono`
- Dark mode: `next-themes` with `@variant dark (&:where(.dark, .dark *));` in globals.css
- Deployment: AWS Amplify (auto-deploys from git push, `amplify.yml` at repo root)
- Optional lesson tutor ("Ask the margin"): a streaming Bedrock Lambda in `lambda/tutor/` (deploy separately; see its README). The `<AskTutor />` affordance stays hidden until `NEXT_PUBLIC_TUTOR_URL` is set in Amplify env, so the static site is unaffected when it is absent.

### Key Patterns
- `@theme inline` values compile statically — they cannot be overridden at runtime via CSS classes. Use standard Tailwind `dark:` utilities for theme-dependent values.
- Custom animation keyframes live in `globals.css`; utility classes (`.animate-*`) reference them. All animations must have `prefers-reduced-motion` coverage.
- CSS utilities `.bg-atmosphere`, `.bg-grid-dots` provide layered background depth — theme-resolved through the `--atmosphere`/`--grid-dot` runtime vars (one class serves both themes; no `-light` variants).
- `FogField` component is the purely decorative fixed fog canvas behind every page (`aria-hidden="true"`, sprite-cached, live `prefers-reduced-motion` listener).

### Commands
- `npm run dev` — Start dev server (port 3000)
- `npm test` — Run Jest unit suite (170+ suites)
- `npm run test:e2e` — Playwright in-browser smoke (separate runner; needs `npm run build` first). Boots real Pyodide in the JupyterLite lab and runs a browser-runnable notebook end-to-end. See `web/e2e/README.md`.
- `npm run build` — Static export (110+ pages)
- `npm run lint` — ESLint check

Each serverless backend in `lambda/` (tutor, sync, qpu, review-email) has its own offline handler test: `cd lambda/<name> && npm ci && npm test` (`node --test`; AWS clients stubbed).
