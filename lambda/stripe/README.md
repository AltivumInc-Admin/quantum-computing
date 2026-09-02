# quantum-stripe

Billing for the Quantum Learner **credit wallet** — the backend that turns a
Stripe payment into wallet credits and tier entitlements. One Lambda behind an
HTTP API v2, deployed in **us-east-2** (the Cognito pool's region).

## Layout

| File | What it holds |
| --- | --- |
| `index.mjs` | The four routes, Checkout construction, the webhook switch (which event reaches which module), and the production wiring. `createHandlerCore(deps)` is the one public entry. |
| `catalog.mjs` | What is sold, which events matter, the pinned API version. Imports nothing, so the operator scripts under `scripts/stripe/` can read it without the SDKs. |
| `wallet-store.mjs` | The three row kinds and `applyOnce`, the exactly-once transaction — the **only** place a balance is written. The repo-wide credit-writer and TTL guards pin this file. |
| `fulfillment.mjs` | Money in: Checkout Sessions, paid invoices, and the debt split every grant goes through. |
| `clawback.mjs` | Money out: `reclaim()`, the refund and dispute arithmetic. |

Every module the handler imports must be listed in `package.json`'s `files`:
`sam build` packages with `npm pack`, which ships only that allowlist, and a
module left off it is missing from the deployed bundle. `template.test.mjs`
asserts the list matches the import graph.

## Routes

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/checkout` | Cognito JWT | Create a Checkout Session for a tier subscription or a credit top-up; returns `{ url }`. |
| `POST` | `/portal` | Cognito JWT | Create a Billing Portal Session (self-serve manage/cancel); returns `{ url }`. |
| `GET` | `/wallet` | Cognito JWT | The caller's `{ tier, credits, subscriptionStatus, clawbackOwedCredits }`. |
| `POST` | `/webhook` | **public** | Stripe-signed events. The **only** writer of credits and tier. |

Identity on the authenticated routes is the verified Cognito `sub` from the API
Gateway JWT authorizer — never anything in the request body. The webhook is
excluded from that authorizer (Stripe can't present a JWT) and is authenticated
in-handler by the `Stripe-Signature` HMAC.

## Data model

One table, `quantum-stripe-wallet`, `pk`-prefixed rows (the `lambda/qpu` idiom).
Four prefixes are in use — the first three written by this Lambda (`wallet-store.mjs`),
the fourth by `scripts/founding-credit/`:

- `WALLET#<sub>` — `credits` (N), `tier` (S), `stripeCustomerId` (S),
  `subscriptionStatus` (S), and `clawbackOwedCredits` (N) — the residual debt
  left when a refund/dispute clawback exceeded the balance held, paid down by
  later money-in events; both metered backends refuse every spend while it is
  nonzero. Never expires.
- `EVENT#<stripeEventId>` — idempotency marker with `expiresAt` (TTL, 30 days).
- `RECEIPT#<paymentIntentId>` — purchase receipt ("this PaymentIntent bought N
  credits for user Y"), the only link a refund/dispute has back to what a
  payment bought. No TTL: Stripe's dispute window outlives the 30-day EVENT#
  marker. Gifts write no receipt, by design — that is what makes gifted credits
  structurally unreachable from every clawback path.
- `FOUNDING#<cohortId>#<hash>` / `FOUNDING#<cohortId>#COUNTER` — the founding-
  cohort gift's once-only marker per recipient and its cohort-size counter,
  written by `scripts/founding-credit/issue.mjs` in the same transaction as the
  wallet grant. Not read by this Lambda.

**TTL landmine:** the table has DynamoDB TTL **enabled on the attribute
`expiresAt`**. Only `EVENT#` rows may ever carry that attribute — put it on any
other row (a `WALLET#` row especially) and DynamoDB silently deletes the whole
row at that timestamp, wallet balance and all, with no application code involved.

**Money → credits is exactly once.** Every wallet mutation is a single
`TransactWriteItems` that conditionally records the Stripe event id
(`attribute_not_exists(pk)`) *and* applies the credit/tier change. A duplicate
delivery re-attempts the same conditional put, the transaction cancels, and the
balance is untouched. Credit counts are the server-side source of truth
(`CATALOG` in `catalog.mjs`, mirroring `web/src/lib/pricing.ts`) — never read from
the client.

Purchased balances are money the learner paid for, so the table is
`DeletionPolicy: Retain` with point-in-time recovery, like `lambda/sync`'s.

## Test

> **`SiteOrigin` must name the live canonical origin.** SAM resolves it into the
> generated OpenAPI CORS block at BUILD time, so it behaves as a build-time input:
> a `update-stack` that only changes the parameter no-ops, and a `sam deploy` that
> omits it silently bakes in the template default. Omitting it here is what broke
> CORS on 2026-08-31.

```bash
cd lambda/stripe && npm ci && npm test   # node --test: index.test.mjs (the routes, through createHandlerCore),
                                         # wallet-store / fulfillment / clawback .test.mjs (each module directly),
                                         # template.test.mjs (the stack)
```

Both suites are fully offline — Stripe and DynamoDB are stubbed and injected
into `createHandlerCore`. `sam validate --lint --region us-east-2` must also pass.

## The Stripe secret

The function reads one Secrets Manager secret at runtime with its own
least-privilege role (scoped to `secretsmanager:GetSecretValue` on that secret
alone). Shape:

```json
{ "secretKey": "sk_live_…", "webhookSecret": "whsec_…" }
```

There is a chicken-and-egg: the `webhookSecret` only exists *after* you register
the webhook endpoint, which needs the deployed URL. So provisioning is two
phases. The secret value never enters your shell history or any transcript — it
is piped from 1Password through `jq` into a Secrets Manager **write** (creating
a secret is allowed; only *reading* `get-secret-value` is forbidden).

**Phase 1 — create the secret with the Stripe key + a placeholder:**

```bash
# LIVE stack:
SK=$(op read "op://Quantum Learner/Stripe/add more/Secret Key")
aws secretsmanager create-secret --name quantum-stripe --region us-east-2 \
  --secret-string "$(jq -nc --arg sk "$SK" '{secretKey:$sk, webhookSecret:"whsec_PLACEHOLDER"}')"
unset SK
```

```bash
# SANDBOX stack — a different 1Password item AND a different secret name. Both
# halves have to change together: the live key under a sandbox secret name makes
# the sandbox function bill real customers.
SK=$(op read "op://Quantum Learner/Stripe Sandbox/Secret Key")
aws secretsmanager create-secret --name quantum-stripe-sandbox --region us-east-2 \
  --secret-string "$(jq -nc --arg sk "$SK" '{secretKey:$sk, webhookSecret:"whsec_PLACEHOLDER"}')"
unset SK
```

## Deploy

```bash
cd lambda/stripe && npm ci && sam build
sam deploy --stack-name quantum-stripe --region us-east-2 \
  --capabilities CAPABILITY_IAM --resolve-s3 \
  --parameter-overrides \
    StripeSecretName=quantum-stripe \
    SiteOrigin=https://learner.quantumenv.dev \
    AlertEmail=<operator email>
```

Note the stack outputs — `BillingUrl` and `WebhookUrl`.

**Phase 2 — wire the webhook and finish the secret, in ONE command:**

`scripts/stripe/rotate-webhook-endpoint.mjs` does the whole phase: it creates
the endpoint with a pinned API version and all nine events, pipes the signing
secret Stripe returns straight into Secrets Manager over stdin, recycles the
function, proves the deployed function verifies against the new secret with a
genuinely signed probe, and only then retires the old endpoint.

```bash
STRIPE_API_KEY=$(op read "op://Quantum Learner/Stripe/add more/Secret Key") \
  node ../../scripts/stripe/rotate-webhook-endpoint.mjs \
    --expect-account acct_1TuFow07hJdXv6GV \
    --url <the WebhookUrl output> \
    --secret-id quantum-stripe \
    --function quantum-stripe \
    --confirm-live
```

For a sandbox stack: read the sandbox key instead, pass that account's id to
`--expect-account`, point `--secret-id`/`--function` at the sandbox names, and
drop `--confirm-live` (it is mandatory only for an `sk_live_` key).

> **Never type, paste, echo or `--arg` a `whsec_`.** The signing secret is the
> credit-minting key of this system: `/webhook` is the only route with
> `Authorizer: NONE`, the HMAC is its entire authentication, and the handler
> then trusts `client_reference_id` and `metadata.credits` verbatim. Anyone
> holding it can grant themselves arbitrary credits in any learner's wallet.
> The script exists so it lives only inside one process and the `aws` child it
> is piped to — never in argv, shell history, the process table, or a
> transcript. This README told you to paste it into `--arg wh` until 2026-09-02.

> **A warm container keeps the OLD secret.** Rotating the Secrets Manager value
> alone changes nothing for a running function — it goes on verifying against
> the previous secret and rejecting every delivery with a 400 (rehearsed in the
> sandbox: 24 invocations, wallet untouched). The forced
> `update-function-configuration` and the signed probe are the reason this is a
> script rather than a runbook paragraph; do not substitute "the next cold
> invocation will pick it up."

The nine events themselves come from `REQUIRED_WEBHOOK_EVENTS` — the script
imports them, so there is no list to retype. To read them:

```bash
node -e "import('./index.mjs').then(m=>console.log(m.REQUIRED_WEBHOOK_EVENTS.join('\n')))"
```

Creating the endpoint through the API rather than the Dashboard is not a
preference: the Dashboard can only pin *your account version* or *latest*, and
`api_version` is creation-only, so a Dashboard endpoint's payload shape moves
under the deployed handler. That is exactly how `invoice.subscription` moved to
`parent.subscription_details` and broke every subscription grant.

> **This list was wrong here for months, and production inherited the mistake.**
> It named six events and omitted `charge.refunded`,
> `charge.dispute.funds_withdrawn` and `charge.dispute.funds_reinstated`. On
> 2026-08-17 the live endpoint was found subscribed to four of the nine, so the
> entire clawback path — fully implemented and fully tested — could never fire:
> a refund would have returned the customer's money and left the credits spent.
> `index.test.mjs` R9 could not catch it because it compares the code's list to
> the code's `switch`, never to the Dashboard. `scripts/stripe/check-webhook-parity.mjs`
> is the check that closes that loop; run it after any endpoint change.

Two groups are load-bearing and easy to skip:

- **the async pair** — delayed-notification methods (Klarna, Cash App, Amazon
  Pay, ACH) complete the session with `payment_status: "unpaid"`, and the
  handler fulfills nothing until `async_payment_succeeded` lands;
- **the three clawback events** — without them money can leave and credits stay.

Deliberately NOT subscribed: `charge.dispute.created`, which also fires for
inquiries where Stripe withdraws nothing; clawing back there would zero a
paying customer's wallet for free.

**Then:**

- Set the `BillingUrl` output as `NEXT_PUBLIC_BILLING_URL` in the Amplify app
  environment (the frontend `billing-client` stays inert until it is present).
- **Confirm the SNS email subscription** once from the inbox — every alarm in
  this stack notifies that one topic, and none of them deliver anything until
  the subscription is confirmed.

## Where the evidence lives

Two log groups, and the difference matters when the storefront is down:

- `/aws/lambda/<prefix>` — everything the handler itself logs. Every
  `console.error` in the handler's modules is pinned to a metric filter and an alarm
  (`template.test.mjs` asserts that in both directions), because the money
  paths return 200 and so trip neither the Lambda `Errors` alarm nor the 5xx one.
- `/aws/apigateway/<prefix>` — the gateway's access log. A JWT the Cognito
  authorizer refuses is answered **before any invocation**, so it leaves
  nothing at all in the function's group. `$.authorizerError` on those lines is
  what names the reason (audience, issuer, expiry); the `<prefix>-auth-rejected`
  alarm fires on a sustained run of 401s rather than a single one, because a
  lone expired token is a learner with a tab left open.

## Sandbox vs live

Sandbox and live are different Stripe accounts, so run two stacks pointed at two
secrets (e.g. `--stack-name quantum-stripe-sandbox --parameter-overrides
StripeSecretName=quantum-stripe-sandbox`), each with its own webhook endpoint and
signing secret. The catalog (`ql_plus_monthly`, `ql_pro_monthly`,
`ql_credits_*`) already exists in both accounts with identical lookup keys, so
the same handler code works against either — only the secret differs.

## Catalog coupling

`CATALOG` in `catalog.mjs`, the tier prices/credits in `web/src/lib/pricing.ts`,
and the Stripe products/prices must agree. If you change a credit grant, change
it in all three. The offline test that guards the first two is
`web/__tests__/infra/tier-catalog-parity.test.ts`, which reads BOTH files and
compares them (it also pins `CUSTOM_TOPUP_MIN_USD`/`MAX_USD` against the
published bounds); the local `CATALOG credit counts mirror the published
pricing` test pins literals only, so it cannot see a one-sided edit. The Stripe
metadata is set from `CATALOG` at checkout, so it follows automatically.
