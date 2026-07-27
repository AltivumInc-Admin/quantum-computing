# Billing cutover runbook

Turning on paid metering: subscriptions grant credits, the AI tutor and QPU runs
spend them, and the platform stops absorbing either cost.

**Authored 2026-07-26.** Every command below was grounded against live account
205930636302 on that date. Re-verify anything marked `CONFIRM` before running it.

---

## The one rule this runbook exists to enforce

**Buying must work before metering turns on.**

Both work streams independently produce the same dead end if this is violated:
a learner loses free access with no way to pay. Two ordering constraints follow,
and neither is negotiable:

1. `fix/billing-blockers` merges and the storefront re-opens **before** any
   metering reaches the web bundle.
2. The `quantum-tutor` stack deploys **strictly before** the web bundle. Its
   Function URL CORS `AllowHeaders` must carry `x-qc-authorization` first, or the
   browser preflight fails, the POST never happens, and the tutor renders
   *"Could not reach the tutor — check your connection."* to every learner while
   blaming their network.

---

## Preconditions

| Thing | Expected | Check |
|---|---|---|
| Storefront | CLOSED | `aws amplify get-app --app-id d1ao02to23x85y --query 'app.environmentVariables.NEXT_PUBLIC_BILLING_URL'` → `null` |
| Wallet table | empty (nobody harmed) | `aws dynamodb scan --table-name quantum-stripe-wallet --region us-east-2 --select COUNT` |
| Stripe live volume | `$0.00` | dashboard, acct `acct_1TuFow07hJdXv6GV` |
| GitHub Actions | billing-locked | jobs fail in <5s with `steps: []` |
| Merge gate | `CI (CodeBuild standby)`, `strict: true` | `infra/ci-standby/failover.sh status` |

**Value to restore when re-opening:**
`NEXT_PUBLIC_BILLING_URL=https://bfiloz43aa.execute-api.us-east-2.amazonaws.com`

### The CI ritual (GHA is locked; every PR needs this)

```bash
# 1. build
aws codebuild start-build --project-name quantum-ci-standby --region us-east-2 \
  --source-version pr/<N> --report-build-status-override --query 'build.id' --output text

# 2. wait, then CONFIRM the build ran the PR head
aws codebuild batch-get-builds --ids <BUILD_ID> --region us-east-2 \
  --query 'builds[0].{S:buildStatus,Sha:resolvedSourceVersion}' --output json
gh pr view <N> --json headRefOid --jq .headRefOid     # must match Sha exactly

# 3. relay the status (CodeBuild's auto-post fails silently on this repo)
gh api -X POST repos/AltivumInc-Admin/quantum-computing/statuses/<SHA> \
  -f state=success -f context="CI (CodeBuild standby)" \
  -f description="CodeBuild standby SUCCEEDED (build <ID>, manual relay)"
```

`strict: true` means a PR that falls behind `main` must be rebased, **rebuilt, and
re-relayed**. Expect this on every trailing PR.

---

## Phase 1 — Make buying work

### 1.1 Merge `fix/billing-blockers`

Carries the `invoice.paid` fix (subscription credits were never granted — the
handler read a field retired from the Stripe SDK) plus the pricing-copy honesty
work.

```bash
cd /Users/cperez/dev/altivum-dev/quantum
git checkout fix/billing-blockers
git status --short          # review; stage explicitly, never `git add -A`
cd web && npm test && npm run lint && npm run build
cd ../lambda/stripe && npm test
```

Commit, push, open PR, run the CI ritual, squash-merge.

### 1.1b Deploy `quantum-stripe` — the fix only exists in git until you do

**This is the step whose absence closed the storefront twice over.** PR #188
merged on 2026-07-27; the deployed function was last modified 2026-07-25 and is
**byte-identical to `fc4d20b^`** (verified by unzipping the live artifact and
hashing it — `sha256 e4951eb0…` on both). Merging is not shipping: there is no
deploy automation for any Lambda in this repo.

```bash
cd /Users/cperez/dev/altivum-dev/quantum/lambda/stripe
npm ci && npm test                 # 33/33
sam build
sam deploy --stack-name quantum-stripe --region us-east-2 \
  --capabilities CAPABILITY_IAM --resolve-s3 \
  --parameter-overrides \
    StripeSecretName=quantum-stripe \
    SiteOrigin=https://quantum.altivum.ai \
    AlertEmail=christian.perez@altivum.io
```

**Prove it landed** — compare the deployed bytes against HEAD, don't trust the
stack event:

```bash
url=$(aws lambda get-function --function-name quantum-stripe --region us-east-2 \
  --query 'Code.Location' --output text)
curl -s "$url" -o /tmp/fn.zip && unzip -o -q /tmp/fn.zip -d /tmp/fn
diff /tmp/fn/index.mjs lambda/stripe/index.mjs && echo "DEPLOYED == HEAD"
```

`grep -c invoiceSubscriptionId /tmp/fn/index.mjs` must be non-zero; if it is 0
the old code is still live regardless of what CloudFormation reported.

### 1.1c Recreate the webhook endpoint with a pinned `api_version`

A webhook endpoint's API version is **creation-only** — there is no update
path, which is why the live endpoint sits at `api_version: null` and therefore
renders events at whatever the *account default* happens to be. That default is
what moved `invoice.subscription` under `parent.subscription_details` and broke
credit granting in the first place. Pinning it stops the payload shape being a
moving target under a deployed handler.

Zero live traffic (0 charges, 0 invoices, 0 subscriptions as of 2026-07-27), so
there is no missed-event window — but do it in this order anyway:

1. Create the replacement endpoint (Dashboard → Developers → Webhooks → Add
   endpoint), URL `https://bfiloz43aa.execute-api.us-east-2.amazonaws.com/webhook`,
   **pin the API version**, and subscribe to **all nine** events. Do not retype
   them — print the list from the code so the Dashboard cannot drift:

   ```bash
   node -e "import('./lambda/stripe/index.mjs').then(m=>console.log(m.REQUIRED_WEBHOOK_EVENTS.join('\n')))"
   ```

   `index.test.mjs` asserts that list matches the handler's `switch` cases
   exactly, so a type handled but never delivered (dead code) or delivered but
   ignored (silent loss) reddens instead of shipping.

   Two groups are load-bearing and easy to skip:
   - **`async_payment_succeeded` / `async_payment_failed`** — Klarna / Cash App /
     Amazon Pay / ACH are all active on this account and complete the session
     with `payment_status: "unpaid"` before any money settles; nothing is
     fulfilled until the async success lands.
   - **`charge.refunded`, `charge.dispute.funds_withdrawn`,
     `charge.dispute.funds_reinstated`** — the clawback path. Deliberately NOT
     `charge.dispute.created`: that also fires for inquiries where Stripe
     withdraws no funds, so clawing back there would zero a paying customer's
     wallet for free.
2. Copy the new signing secret and rotate it into Secrets Manager. Re-read the
   key from 1Password in the same command so no plaintext reaches shell history:

   ```bash
   aws secretsmanager put-secret-value --secret-id quantum-stripe --region us-east-2 \
     --secret-string "$(jq -nc \
       --arg sk "$(op read 'op://Quantum Learner/Stripe/add more/Secret Key')" \
       --arg wh 'whsec_NEW_SIGNING_SECRET' \
       '{secretKey:$sk, webhookSecret:$wh}')"
   ```

   The running function reads the secret at cold start. `lazyCore` no longer
   memoizes a failed read, so a container that raced the rotation recovers on
   its next invocation instead of serving a permanent 500.
3. Only then disable (do not delete) the old endpoint, so a rollback is a
   single toggle.

### 1.1d Verify the tutor metering rate table

`lambda/tutor/tutor-billing.mjs` `RATES` currently holds **Anthropic
first-party list prices as a documented placeholder**. Bedrock is
partner-priced and the AWS Price List API returns no entries for these model
names, so they could not be read programmatically. The tests assert presence
and ordering only — they cannot know the numbers are right.

Confirm each against <https://aws.amazon.com/bedrock/pricing/> and correct the
table before any real money meters through it. Charging at cost is deliberate
(margin is the subscription, not a markup on inference), which is exactly what
makes the basis load-bearing.

### 1.2 Re-open the storefront

`update-app --environment-variables` **REPLACES the whole map.** Round-trip every
other var or you wipe Cognito, tutor, QPU, and sync.

```bash
aws amplify get-app --app-id d1ao02to23x85y --query 'app.environmentVariables' \
  --output json > /tmp/env-backup.json
python3 - <<'PY'
import json
d = json.load(open('/tmp/env-backup.json'))
d['NEXT_PUBLIC_BILLING_URL'] = 'https://bfiloz43aa.execute-api.us-east-2.amazonaws.com'
json.dump({'appId': 'd1ao02to23x85y', 'environmentVariables': d},
          open('/tmp/env-new.json', 'w'), indent=1)
print(sorted(d))            # CONFIRM all 9 keys present
PY
aws amplify update-app --cli-input-json file:///tmp/env-new.json --query 'app.appId'
HONE_DEPLOY_APPROVED=1 aws amplify start-job --app-id d1ao02to23x85y \
  --branch-name main --job-type RELEASE
```

Verify on the live page: `Get Plus`, `Get Pro` present; `Launching soon` absent.

### 1.3 GATE — prove a real purchase grants credits

**Do not skip. This is the only step that proves the `invoice.paid` fix works.**
Everything upstream is offline tests against a stubbed SDK; nothing has ever
exercised a real Stripe webhook against this handler.

1. Buy a **$5 top-up** with a real card on quantum.altivum.ai.
2. Confirm the wallet row appears:
   ```bash
   aws dynamodb get-item --table-name quantum-stripe-wallet --region us-east-2 \
     --key '{"pk":{"S":"WALLET#<your-cognito-sub>"}}' --output json
   ```
   Expect `credits` = 500.
3. Buy a **Plus subscription** ($18). This is the path that was broken.
   Expect `credits` += 1890 and `tier` = `plus`.
4. Check the endpoint returned 2xx: Stripe Dashboard → Developers → Webhooks →
   recent deliveries. A 2xx with **no** matching wallet row means the fix did not
   land — **STOP and roll back**.
5. Refund both in Stripe when done. Note: **there is no clawback** — refunding
   does not remove the credits. Zero them by hand if it matters.

**Rollback:** unset `NEXT_PUBLIC_BILLING_URL`, redeploy. Storefront closes; no
code change needed.

---

## Phase 2 — Land the backends (before any web deploy)

### 2.1 `quantum-tutor` (us-east-2) — MUST BE FIRST

Lands the `x-qc-authorization` CORS header **and** the `MaxAge: 3600` that PR #176
never deployed (without it browsers use a 5s preflight cache and OPTIONS runs ~1:1
with POST).

Current live CORS is `["content-type","x-amz-content-sha256"]` — the header is
absent, which is the break.

```bash
cd <tutor-worktree>/lambda/tutor
sam build && HONE_DEPLOY_APPROVED=1 sam deploy \
  --stack-name quantum-tutor --region us-east-2 --no-execute-changeset   # review first
```

Current parameters to preserve: `AlertEmail=christian.perez@altivum.io`,
`FunctionUrlAuthType=AWS_IAM`, `LogRetentionInDays=30`, `MaxConcurrency=5`,
`AllowedOrigin=https://quantum.altivum.ai`,
`FoundationModelId=anthropic.claude-haiku-4-5-20251001-v1:0`,
`ModelId=arn:aws:bedrock:us-east-2:205930636302:application-inference-profile/q050egz0q4mb`.

**New in this deploy — tutor credit metering.** Three parameters turn it on;
leaving them empty keeps the free Haiku tutor exactly as it is today and makes
every paid-model request refuse in-band, so the deploy is safe to land before
the storefront reopens:

```
WalletTableName=quantum-stripe-wallet
UserPoolId=us-east-2_aRydPmAjj
UserPoolClientId=2sg8nejrf2j8p28j6khjil99ir
```

Deploy with them **empty first** if you want the CORS/MaxAge fix without
metering; add them in a second deploy once §1.1d's rate verification is done.
The `x-tutor-auth` CORS header and the roster's Bedrock grants land either way.

**Verify metering specifically** (a wallet-less deploy is indistinguishable
from a broken one without this):

```bash
aws lambda get-function-configuration --function-name quantum-tutor \
  --region us-east-2 --query 'Environment.Variables' --output json
# WALLET_TABLE / USER_POOL_ID / USER_POOL_CLIENT_ID present == metering on
```

**Verify before proceeding:**
```bash
aws lambda get-function-url-config --function-name quantum-tutor \
  --region us-east-2 --query 'Cors' --output json
# AllowHeaders MUST now contain x-qc-authorization; MaxAge should be 3600
```

### 2.2 `quantum-tutor-edge` (us-east-1)

Merged in PR #186, never deployed. Adds the CORS'd 429 and the OPTIONS scope-down
(a 429 preflight is fatal — a preflight must answer 2xx, and no header rescues it).

```bash
HONE_DEPLOY_APPROVED=1 aws cloudformation deploy \
  --template-file lambda/tutor/edge.yaml --stack-name quantum-tutor-edge \
  --region us-east-1 --no-execute-changeset \
  --parameter-overrides \
    FunctionUrlDomain=hb6t3y3x7z66s5pkfd3n5lwucm0booak.lambda-url.us-east-2.on.aws \
    PriceClass=PriceClass_100 RateLimitPerMinute=300 \
    AllowedOrigin=https://quantum.altivum.ai
```

`AllowedOrigin` is NEW — it has no previous value, so omitting it silently takes
the template default. Pass all four explicitly. Expect `Modify` on `TutorWebAcl`
only, no replacement.

**Verify:** `OPTIONS https://d1iiu6blp8cumd.cloudfront.net/` still returns **204**
with `apigw-requestid` (proves the exemption did not break preflights).

### 2.3 `quantum-qpu-submit` (us-east-2)

Removes `LIFETIME_CAP_MICROS` (the $2.50 sponsorship), adds wallet billing at the
retail credit rate, grants the QPU lambda scoped access to `quantum-stripe-wallet`,
and adds `braket:SearchQuantumTasks` for orphan recovery.

Preserve: `UserPoolClientId=2sg8nejrf2j8p28j6khjil99ir`,
`UserPoolId=us-east-2_aRydPmAjj`, `SiteOrigin=https://quantum.altivum.ai`,
`EdgeSecretName=quantum-qpu-edge-secret`,
`ResultsBucket=amazon-braket-eu-north-1-205930636302`, `MonthlyBraketBudget=150`,
`AlertEmail`, `LogRetentionInDays=30`, `MaxConcurrency=5`. Plus the new
`WalletTableName`.

**Verify:** the reconciler runs a clean pass —
`aws logs tail /aws/lambda/quantum-qpu-reconcile --region us-east-2 --since 10m`.
If `braket:SearchQuantumTasks` was denied, the reconciler **fails safe**: it raises
the orphan alarm with the money in it rather than refunding or skipping.

---

## Phase 3 — Ship the web bundle

Only after 2.1 has landed and been verified.

Merge the tutor and QPU web changes (CI ritual each), then let Amplify build, or
force one:

```bash
HONE_DEPLOY_APPROVED=1 aws amplify start-job --app-id d1ao02to23x85y \
  --branch-name main --job-type RELEASE
```

---

## Phase 4 — Post-cutover verification

Exercise the real paths. Green tests are not proof.

1. **Tutor, funded** — ask a question, get an answer, confirm `credits` dropped by
   the metered amount.
2. **Tutor, empty wallet** — zero a test wallet, ask; expect the honest refusal
   with a working Top up link (not a generic error, not `tutor.unreachable`).
3. **QPU, funded** — submit 100 shots on IQM Garnet. The pre-flight quote and the
   wallet debit must be the **same number** (50.3 credits). A divergence here is
   the defect this whole change exists to remove.
4. **QPU, refund path** — submit a circuit Braket will reject. Confirm credits
   return and the panel does **not** claim a refund it cannot confirm.
5. **Run history** — a FAILED or RELEASED row must not read as charged.
6. **Both locales.** Every surface above ships in en and es.

---

## Rollback

| Phase | Rollback | Reversible? |
|---|---|---|
| 1.2/1.3 | unset `NEXT_PUBLIC_BILLING_URL`, redeploy | yes, ~5 min |
| 2.1/2.2/2.3 | `aws cloudformation deploy` the prior template revision | yes, but see below |
| 3 | revert the merge, redeploy Amplify | yes |

**Sponsorship removal is not cleanly reversible.** `LIFETIME_CAP_MICROS` is stamped
onto `USER#<sub>.capMicros` via `if_not_exists` on first submit and never
rewritten — deliberate grandfathering. Re-adding the sponsorship does not restore
prior balances. Decide before 2.3, not after.

---

## Known-open at time of writing

- **The Bedrock rate table is unverified.** `tutor-billing.mjs` `RATES` holds
  first-party list prices as a placeholder (see §1.1d). Metering is arithmetically
  correct against whatever numbers are in that table; whether those numbers match
  what AWS actually bills is the open question. **Blocks re-opening the storefront.**
- **The tutor's pre-flight reserve is conservative by design.** It bounds a
  generation at the full system prompt in + `maxTokens` out, so a wallet can be
  told "not enough credits" for a generation that would in fact have fit. The
  alternative — start, then discover the wallet is short — means either eating
  the cost or clawing back after delivering an answer. Revisit only with a real
  usage distribution to size it against.
- **Clawback covers refunds and disputes, but only for grants written AFTER it
  ships.** A refund reclaims credits by looking up a `GRANT#<payment_intent>`
  row written at grant time — `Charge.invoice` was removed in Basil, so there is
  no way to re-derive the link for a historical charge. Any grant predating this
  deploy is unreclaimable and logs `credits NOT reclaimed` for manual handling.
  (Live volume is zero, so today this set is empty.)
- **A clawback can leave a learner "owing".** The wallet floors at 0 and the
  shortfall lands in `clawbackOwedCredits` — deliberately NOT a negative
  `credits`, which the client's `counter()` would read as "metering
  unconfigured" and use to hide the top-up path. Nothing yet spends or displays
  that field: deciding whether to write it off or require clearing it is an open
  product decision, not a bug.
- **A permanently-failing reconciler row** holds a learner's charge with no
  automatic recovery. It throws and logs every tick with `sub` and
  `chargeMilliCredits`, but the errors alarm pins in ALARM and CloudWatch only
  notifies on transition — so it pages once, then masks later reconciler faults.
- **The `invoice.paid` log line is greppable, not alertable.** No metric filter
  exists on the stripe stack; `AWS/Lambda Errors` cannot see a `console.error`
  inside a successful 200.
- **Copy guards are denylists.** Both the pricing guard and the curriculum guard
  are regression nets for known phrasings; reworded claims pass. A green suite is
  not clearance — read the rendered page, both locales.
- **Stripe CLI footgun.** Profiles `quantum-learner` and `ql-live-admin` both point
  at `acct_1Rm6Rr000wqzRfNl` (Altivum Logic, the **agency** account, ~$450 real
  revenue). Quantum Learner is `acct_1TuFow07hJdXv6GV`. Check the account before
  any mutating Stripe command.
