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

- **No refund clawback.** A Stripe refund does not remove granted credits. Manual.
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
