# Founding-cohort credit issuance — runbook

**1,000 credits ($10) to the first 20 learners. Hard ceiling $200.**

Founder-approved 2026-07-28, scoped and designed 2026-08-03. This is **one
bounded gift**, not a free tier and not a licence for a second cohort. The
platform's standing rule is that no learner receives credits they did not pay
for; this is the single documented exception, and `lambda/stripe/index.mjs`
points here so nobody "fixes" the apparent contradiction by deleting it.

## What exists

| File | Role |
|---|---|
| `cohort-2026-08.json` | the roster — **hashes only, never addresses** |
| `issue.mjs` | pure logic: builds the three transaction legs, decodes cancellations |
| `run.mjs` | resolves recipients against Cognito and executes |
| `issue.test.mjs` | 17 tests; runs in CI inside the "Web tests + lint" job |
| `../lib/email-hash.mjs` | the one email normalization + hash for the repo |

## Why identity is an email hash, not a Cognito sub

One human can hold **two accounts** — a native one and a Google one, with
different `sub` values. That is already true of someone in the pool. Keyed by
sub, that person would receive $20 and consume two of twenty slots, and nothing
would fail. Keyed by the hash of their normalized email, the second attempt
collides with the existing marker row and is refused.

Hashing also keeps addresses out of git, matching the Founding Ten precedent.

To find the hash for an address (locally, never committed):

```
node scripts/badge-email-hash.mjs someone@example.com
```

## Adding a recipient

The roster is open (`"closed": false`) until 20 slots are filled. To add
someone:

1. Get their hash with `badge-email-hash.mjs`.
2. Append a `{ slot, emailHash, firstSeenAt }` entry in a **pull request**. The
   reviewed diff is the audit record — that is the point of a checked-in roster.
3. Never add a plaintext address. `validateCohort` fails the build if the file
   contains an `@`.

Internal `@altivum.ai` accounts do **not** occupy slots (founder decision).

## Issuing

Always plan first. `--plan` is the default and writes nothing.

```
node scripts/founding-credit/run.mjs --plan
```

Read the output. Every line should name a slot and a resolved sub. Investigate
any `NO LIVE ACCOUNT` before proceeding — it means the roster and the pool
disagree.

Then, and only then:

```
node scripts/founding-credit/run.mjs --issue
```

The runner refuses to write if the caller's AWS account is not the roster's
`expectedAccountId`. An account migration is in flight, the wallet table is
`Retain` with PITR, and a mistaken write would survive stack deletion.

## After issuing

Verify against the counter, not against the script's own output:

```
aws dynamodb get-item --table-name quantum-stripe-wallet --region us-east-2 \
  --key '{"pk":{"S":"FOUNDING#2026-08#COUNTER"}}'
```

`issued` must equal the number of marker rows, and `creditsIssued` must equal
`issued × 1000`. Reserve the words "it worked" for after one consenting
recipient completes a real hardware run that debits their wallet.

## What can go wrong, and what it means

| Symptom | Meaning |
|---|---|
| `already issued — no change` | The marker row exists. This is idempotent and safe; re-running the script is harmless. |
| `REFUSING: the cohort ceiling is reached` | DynamoDB refused the 21st issuance. Nothing was overspent. The roster and the counter disagree — investigate before touching anything. |
| `NO LIVE ACCOUNT` | The roster hash matches no enabled Cognito user. Someone deleted their account, or the roster entry is wrong. |
| `REFUSING: caller is account X` | You are pointed at the wrong AWS account. Do not override this. |

**Deleting a marker row is never a sanctioned action, and there is no
`--reissue` flag.** If a recipient genuinely needs re-crediting, that is a new
decision, and it should leave a new record.

## Sequencing — do not issue before these are true

Gift credits are currently **inert but not harmless**: nothing in production
reads the wallet, so recipients would be told they hold $10 and see nothing,
while $200 of spendable liability sits in the database waiting to become real
spend on a later deploy with no second review.

Before issuing:

1. **Deploy `quantum-stripe` from `main`.** The live artifact predates PR #191
   and still writes `GRANT#` rows without `RECEIPT#` or the debt rule.
2. **Deploy `lambda/qpu` from `main` with `WalletTableName` set.** Ship this as
   its own change with its own note — it also withdraws the $2.50 allowance the
   deployed function is *still handing out today*, and a recipient should
   experience a gift arriving, never an allowance vanishing. Redeploying
   without the parameter turns the QPU into a hard 402 for everyone.
3. **Leave `WALLET_TABLE` unset on `quantum-tutor`** until the Bedrock rate
   table's provenance is settled. The gift does not need it, and the tutor's
   tier gate keeps gift credits off inference regardless.
4. **Set `NEXT_PUBLIC_BILLING_URL`** on Amplify so a balance renders at all.
5. **Raise the daily QPU cap for the cohort window.** `DAILY_CAP_MICROS` is
   $15/day *global across every user*; twenty recipients doing one 1,000-shot
   run each is $35, so a launch day starts returning 503 after roughly the
   eighth run — which reads as an outage, not a queue.
6. **Email the recipients.** Whatever figure the email names becomes
   irrevocable under this codebase's own grandfathering doctrine.

For copy: because credit conversion rounds up per run, 1,000 credits buys about
five full 1,000-shot runs, or twenty-two 100-shot runs. Do not quote a bare
"1000 ÷ 175".
