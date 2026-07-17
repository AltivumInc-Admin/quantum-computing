# quantum-stripe

Billing for the Quantum Learner **credit wallet** — the backend that turns a
Stripe payment into wallet credits and tier entitlements. One Lambda behind an
HTTP API v2, deployed in **us-east-2** (the Cognito pool's region).

## Routes

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/checkout` | Cognito JWT | Create a Checkout Session for a tier subscription or a credit top-up; returns `{ url }`. |
| `POST` | `/portal` | Cognito JWT | Create a Billing Portal Session (self-serve manage/cancel); returns `{ url }`. |
| `GET` | `/wallet` | Cognito JWT | The caller's `{ tier, credits, subscriptionStatus }`. |
| `POST` | `/webhook` | **public** | Stripe-signed events. The **only** writer of credits and tier. |

Identity on the authenticated routes is the verified Cognito `sub` from the API
Gateway JWT authorizer — never anything in the request body. The webhook is
excluded from that authorizer (Stripe can't present a JWT) and is authenticated
in-handler by the `Stripe-Signature` HMAC.

## Data model

One table, `quantum-stripe-wallet`, `pk`-prefixed rows (the `lambda/qpu` idiom):

- `WALLET#<sub>` — `credits` (N), `tier` (S), `stripeCustomerId` (S),
  `subscriptionStatus` (S). Never expires.
- `EVENT#<stripeEventId>` — idempotency marker with `expiresAt` (TTL, 30 days).

**Money → credits is exactly once.** Every wallet mutation is a single
`TransactWriteItems` that conditionally records the Stripe event id
(`attribute_not_exists(pk)`) *and* applies the credit/tier change. A duplicate
delivery re-attempts the same conditional put, the transaction cancels, and the
balance is untouched. Credit counts are the server-side source of truth
(`CATALOG` in `index.mjs`, mirroring `web/src/lib/pricing.ts`) — never read from
the client.

Purchased balances are money the learner paid for, so the table is
`DeletionPolicy: Retain` with point-in-time recovery, like `lambda/sync`'s.

## Test

```bash
cd lambda/stripe && npm ci && npm test   # node --test: index.test.mjs + template.test.mjs
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
# Live uses the 1Password entry; for a sandbox stack, read the sandbox sk_test_ instead.
SK=$(op read "op://Quantum Learner/Stripe/add more/Secret Key")
aws secretsmanager create-secret --name quantum-stripe --region us-east-2 \
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
    SiteOrigin=https://quantum.altivum.ai \
    AlertEmail=<operator email>
```

Note the stack outputs — `BillingUrl` and `WebhookUrl`.

**Phase 2 — wire the webhook and finish the secret:**

1. In the Stripe Dashboard (**Developers → Webhooks → Add endpoint**), register
   the `WebhookUrl` output. Subscribe to exactly these events:
   `checkout.session.completed`, `invoice.paid`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
2. Copy the endpoint's **Signing secret** (`whsec_…`).
3. Replace the placeholder with the real signing secret (re-reading the key from
   1Password so the plaintext still never lands in the shell history):

   ```bash
   aws secretsmanager put-secret-value --secret-id quantum-stripe --region us-east-2 \
     --secret-string "$(jq -nc \
       --arg sk "$(op read 'op://Quantum Learner/Stripe/add more/Secret Key')" \
       --arg wh 'whsec_REAL_SIGNING_SECRET' \
       '{secretKey:$sk, webhookSecret:$wh}')"
   ```

   The running function reads the secret at cold start; a fresh container (a new
   deploy, or simply the next cold invocation) picks up the updated value.

**Then:**

- Set the `BillingUrl` output as `NEXT_PUBLIC_BILLING_URL` in the Amplify app
  environment (the frontend `billing-client` stays inert until it is present).
- **Confirm the SNS email subscription** once from the inbox — alarms
  (`quantum-stripe-errors` / `-throttles` / `-5xx`) deliver nothing until then.

## Sandbox vs live

Sandbox and live are different Stripe accounts, so run two stacks pointed at two
secrets (e.g. `--stack-name quantum-stripe-sandbox --parameter-overrides
StripeSecretName=quantum-stripe-sandbox`), each with its own webhook endpoint and
signing secret. The catalog (`ql_plus_monthly`, `ql_pro_monthly`,
`ql_credits_*`) already exists in both accounts with identical lookup keys, so
the same handler code works against either — only the secret differs.

## Catalog coupling

`CATALOG` in `index.mjs`, the tier prices/credits in `web/src/lib/pricing.ts`,
and the Stripe products/prices must agree. If you change a credit grant, change
it in all three (the offline test `CATALOG credit counts mirror the published
pricing` guards the first two; the Stripe metadata is set from `CATALOG` at
checkout, so it follows automatically).
