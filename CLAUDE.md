# Quantum Computing Workspace (Amazon Braket)

## About This Project

This is a quantum computing learning and experimentation workspace using Amazon Braket.
It follows a progressive learning path from circuit fundamentals (01-foundations) through
production hybrid quantum-classical workloads (06-hybrid-jobs), with focused tracks on
Quantum Machine Learning and Quantum Chemistry.

## Project email addresses

This project has **two** addresses on its own domain, and they are not
interchangeable. Neither is the founder's Altivum address.

| Address | Use |
|---|---|
| `hq@quantumlearner.dev` | **Business / operational.** Automated mail: SNS alarm notifications, signup alerts, anything a system sends. Prefer this for `AlertEmail` parameters — it survives a person being unavailable. |
| `christian.perez@quantumlearner.dev` | **Project-specific personal.** Correspondence addressed to a human about this project. |

- **`christian.perez@altivum.io` is the ALTIVUM address, not this project's.** It is
  still the default of the `AlertEmail` parameter in five Lambda templates
  (`tutor`, `sync`, `qpu`, `review-email`, `stripe`) and in
  `infra/workspace/cognito.yaml`, and it is the contact address rendered on the
  public privacy page. Those are deliberate leftovers, not decisions — migrate one
  when you are already deploying that stack, never as a drive-by.
  `lambda/analytics` was moved to `hq@` on 2026-08-23 and is the pattern to follow.
- **An SNS email subscription delivers NOTHING until it is confirmed** from the
  inbox, once, per topic. Changing `AlertEmail` and redeploying replaces the
  subscription, which means the new address starts unconfirmed and the alarms go
  silent until someone clicks the link. Check with
  `aws sns list-subscriptions-by-topic` after any such change; a
  `PendingConfirmation` subscription ARN is the symptom.
- **`INTERNAL_DOMAIN` in `infra/workspace/cognito.yaml` is still `altivum.ai`.** It
  is what the signup alert uses to say "internal account, does not occupy a
  founding-cohort slot". A future `@quantumlearner.dev` team account would be
  reported as an external signup. Decide that when the signup alert actually
  deploys — it never has (see below).
- This repo is PUBLIC. These addresses are already published (the privacy page
  renders one), so naming them here discloses nothing new — but do not add a
  personal address that is not already public.

## AWS — this project runs under Delta Centric, not Altivum

**Changed 2026-08-27.** Quantum Learner belongs to the **Delta Centric** AWS
organization. Anything describing this project as an Altivum workload is history.

**Account numbers never appear in this repo** — it is public, and
`docs/account-migration-runbook.md` already sets the convention: resolve ids from the
org by account *name* at run time, and reference them as shell variables. Keep the
numbers in deployed configuration and the founder's private notes. Structure by name:

```
Delta Centric Org (management)
└── Ventures
    └── Quantum Learner OU
        ├── QL-Prod               aws-prod@quantumlearner.dev   (created 2026-08-27)
        ├── QL-Dev                aws-dev@quantumlearner.dev    (created 2026-08-27)
        ├── Braket Workloads      braket@quantumlearner.dev     (created 2026-08-27)
        └── Quantum Learner - HQ  hq@quantumlearner.dev         (created 2026-08-25)
```

**The intended split** (founder, 2026-08-27):

- **`QL-Prod` runs all production EXCEPT Braket jobs** — Amplify, Cognito, the six
  Lambdas, the credit wallet. This is the platform migration's destination.
- **`Braket Workloads` runs the QPU jobs and nothing else.** Isolating hardware
  execution puts real-money spend and its blast radius in one account with its own
  Budgets fence, separate from auth, billing and the web app.
- **`QL-Dev`** is the non-production twin.
- **`Quantum Learner - HQ`** is the **shared-services / org-level home**: the
  `quantumlearner.dev` Route 53 zone, ACM certificates, shared artifact and log
  buckets, CI/OIDC deploy roles, and consolidated Budgets. Prod, Dev and Braket
  consume from it; it runs no application workload of its own.

Name the account, never "Quantum Learner" — four accounts in this OU answer to that.

- **Deployed reality still disagrees with all of this.** Every stack — all six Lambdas,
  Cognito, Amplify, the wallet, and `quantum-qpu-submit` — is still live in the
  **Altivum** account (`Altivum Inc - Original Account`), verified 2026-08-27. Do not
  assume a resource is in Delta Centric because this section exists.

**Use the `org-admin` profile for any Delta Centric work — never `personal-dev`.**

| Profile | Account | Reaches other Delta Centric accounts |
|---|---|---|
| `org-admin` | Delta Centric Org (management) | **Yes**, via `OrganizationAccountAccessRole` |
| `personal-dev` | Christian Perez - Personal | **No** — AccessDenied |
| *(default, no `--profile`)* | **Altivum** production | Different org entirely |

`personal-dev` is a **delegated administrator for the Organizations service**, so it can
`ListAccounts` and `DescribeOrganization` and therefore *looks* org-wide. It is not:
service delegation grants org reads, not `sts:AssumeRole` into sibling accounts. Prove
access with an actual `assume-role`, never from a successful `ListAccounts` — the same
"a profile name is not evidence" rule the Stripe section states below.

**The default profile is Altivum.** Any AWS command intended for Delta Centric that
omits `--profile` runs against Altivum production instead, silently.

**`docs/account-migration-runbook.md` is now stale.** It was written 2026-07-18 to
blue-green from the Altivum original account into an *Altivum* account also named
"Quantum Learner" — a different account from Quantum Learner - HQ, in a different org.
Re-point its destination before executing any of it. Two orgs each containing a
"Quantum Learner" account is exactly the name-collision trap the design-system and
Stripe sections warn about elsewhere in this file.

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

- ~~FIRST — the shipped copy is now false~~ — **copy corrected 2026-08-17** (live once the
  next Amplify deploy from main ships). The sponsorship family was **14 keys in `en.ts` and
  14 in `es.ts`** — the "12 in es" previously recorded here was stale; parity was already
  full. 12 of the 14 now state the present truth ("hardware runs are not currently
  available"; the credentials wall states the ladder plan without claiming an allowance
  funds it), and the privacy page names **Anthropic**, not AWS Bedrock, as the tutor's
  processor in both locales. Deliberately kept, because they are true for their only
  audience: `credentialsUi.outOfReachDetail` ("remaining sponsored budget") renders only
  for grandfathered allowance-holders (`capMicros > 0` stamped on the ledger row), and
  `workspaceUi.outOfAllowance` is a refusal chip, not an advertisement (the submit panel's
  sponsor note is likewise conditional and stays). The pricing page's copy-honesty guard
  now **bars** `/sponsor|patrocinad/` across both locales and the metadata export — the old
  tests locked the promise's PRESENCE, which is exactly how it outlived the withdrawal.
  Still open: wire the funding path (wallet metering) before advertising hardware again.
- ~~Correct `RATES` to true Bedrock cost~~ — **done 2026-08-17**, by moving the tutor off
  Bedrock entirely. Anthropic's published rates are the cost basis on that provider, so
  `RATES` is now verified rather than a documented placeholder.
- ~~Read the shared markup from deployed configuration in both metering paths~~ — **done
  2026-08-17 (mechanism), metering still OFF.** Both stacks read the SAME Secrets Manager
  secret through the SAME env key (`RATE_CARD`, parameter `RateCardSecret`, default `""`),
  resolved by CloudFormation at deploy time; both kernels REQUIRE the injected factor and
  throw rather than default to raw cost (raw cost is itself a divergent rate — rule 5).
  Absent/garbled config = refusal, alarmed by `quantum-*-rate-card-invalid`. This also
  closes the "QPU debits raw cost" item: the QPU converts through the same factor when it
  converts at all. Lockstep is guarded three ways: `web/__tests__/infra/rate-card-parity`
  (templates + handlers), `scripts/check-rate-parity.mjs` in `make drift` (deployed env,
  value-blind — prints hashes, never the value), and the reconciler deliberately carries
  no `RATE_CARD` (it refunds the `creditsCharged` recorded on the task row, never a
  re-derivation). **The cutover itself remains** (create the secret, set
  `RateCardSecret` + `WalletTableName` on both stacks in one deploy, re-run parity) and
  it is blocked behind rule 14 (buying must work first), the tier gate below, and two
  things the mechanism exposed:
  - **The QPU confirm step quotes a client-derived figure** (`web/src/lib/qpu-budget.ts`
    re-derives credits from raw cost, and rule 6 means the client can never hold the
    factor). Under any deployed factor the confirm screen would understate the debit —
    the server must publish the priced quote and the panel must render it BEFORE the
    flip. Its own comment claims quote-must-equal-debit; that claim is only true today
    because both are off.
  - **The published hardware sheet and a single scalar factor need reconciling.** The
    published per-task and per-shot credit figures do not stand in one common ratio to
    the provider's two list rates (both sets are public; the arithmetic stays out of
    this file), so no single factor reproduces the sheet exactly, and integer-credit
    debits can exceed a fractional advertised figure. Decide once at cutover: derive
    the published display figures from the same factored formula the server debits
    with, or pick the factor so every debit stays at or under the sheet (rule 7/13
    direction) and update the sheet's figures — including `TUTOR_RATES`'
    `typicalCreditsPerQuestion`, which today matches RAW-cost typical charges and goes
    stale under any factor above 1.
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

## Design system — two projects share one name

The product's design system lives in **two** claude.ai projects, both named
"Quantum Learner Design System". They are not interchangeable:

| Project | What it is | May a sync write to it? |
|---|---|---|
| `eefe2a41-…` | **Generated.** The flat 17-component bundle `.ds-sync/resync.mjs` produces from `web/src`. | Yes — that is its purpose. |
| `ed6de090-…` | **Commissioned.** Hand-authored tokens, guidelines, `ui_kits/`, brand components, imagery. The system the product was themed from. | **Never.** A driver run replaces hand work with generated output and deletes what it cannot regenerate. |

Because the names are identical in every listing, the id is the only thing
telling them apart. Before any design-sync work:

```sh
node scripts/design-sync/preflight.mjs     # refuses a config that drifted
node scripts/design-sync/restage.mjs       # rebuilds gitignored .ds-sync/ state
```

Hand-maintained assets (imagery, guideline cards) go to the commissioned
project by targeted `finalize_plan` + `write_files` — never by the driver.
Details and the re-sync procedure: `.design-sync/NOTES.md`.

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
- Optional lesson tutor ("Ask the margin"): a streaming Lambda in `lambda/tutor/` calling Anthropic's first-party API (deploy separately; see its README). The `<AskTutor />` affordance stays hidden until `NEXT_PUBLIC_TUTOR_URL` is set in Amplify env, so the static site is unaffected when it is absent.

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
