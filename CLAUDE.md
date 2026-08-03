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
writing prices to one of those is silent and easy. Sandbox is `acct_1TuFpH0a2DloOdGu`.

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

- **Amazon Bedrock costs 1.10x Anthropic list**, and Claude bills as separate AWS
  Marketplace SKUs — so it appears in neither the Bedrock pricing page nor the Price List
  API. Re-derive from Cost Explorer, never from a published table.
- **Tutor cost is input-dominated**: `buildSystemPrompt` embeds the whole lesson text while
  output is capped at `MAX_TOKENS`. Prompt caching is therefore not optional, and any edit
  that makes the system prefix vary per request silently destroys it.

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

- Correct `RATES` to true Bedrock cost, and read the shared markup from **deployed
  configuration** (an env var, like `TUTOR_MODEL_ID`) in both metering paths — never a
  committed constant, per rule 6. One value, injected once, consumed by both.
- Enable prompt caching on the tutor system prompt (`cachePoint` in the Converse call).
- Move QPU debit rates onto the same markup.
- Gate `<AskTutor />` on tier; add the free-trial question counter; drop `free` from the
  tutor `ROSTER`.
- Add `expiresAt` to subscription WALLET# rows with expire-soonest-first spend ordering.
- Retire the shipped pricing strings in both locales that still say hardware runs are
  platform-sponsored (one is test-locked, so the test changes too).
- **Resolve the open product question in `docs/pricing-cost-basis.md`** — the tier is
  dominated by pay-as-you-go until model access is actually gated on it.
- Deploy the Lambdas — they lag `main`. The live QPU function has no wallet metering and
  the live tutor is free and unmetered. **Merging is not shipping.**

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
