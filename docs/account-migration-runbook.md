# Quantum Learner — Cross-Account Migration Runbook (Blue-Green)

> **Status: DRAFT FOR APPROVAL — nothing has been executed.** Built 2026-07-18 from a live inventory of account `$SRC_ACCOUNT` + the repo IaC, then audited by three adversarial reviewers (completeness / ordering / data-safety). **Section 11** holds their 16 corrections; the HIGH/MEDIUM items there OVERRIDE the inline steps where they conflict. The source account stays fully live and writable until an explicit, approved cutover.

**Source:** `$SRC_ACCOUNT` (Altivum Inc - Original Account, shared) — primary `us-east-2`, edge `us-east-1`, Braket devices `eu-north-1`
**Destination:** `$DST_ACCOUNT` (**QL-Prod**, `aws-prod@quantumlearner.dev`, Delta Centric org / Quantum Learner OU) — greenfield, created 2026-08-27. The 2026-07-18 destination (an *Altivum-org* account also named "Quantum Learner") is RETIRED as a destination; see `CLAUDE.md` § AWS.
**Access into destination:** SSO profile `org-admin` (Delta Centric management) → assumes `arn:aws:iam::$DST_ACCOUNT:role/OrganizationAccountAccessRole` → chained CLI profile **`ql-prod`**
**Canonical domain flips:** `quantum.altivum.ai` → **`quantumlearner.dev`** (today the relationship is the reverse).

### Identifiers — export these before running anything below

This repository is public, so account numbers and the OAuth client id are referenced
by shell variable rather than written out. Every command below is copy-pasteable once
these are exported. Resolve them from the org itself, not from memory:

```sh
# Names are the source of truth; ids are looked up. Run with management-account creds.
export ORG_MGMT_ACCOUNT=$(aws organizations describe-organization --profile org-admin \
  --query 'Organization.MasterAccountId' --output text)
export SRC_ACCOUNT=$(aws organizations list-accounts \
  --query "Accounts[?Name=='Altivum Inc - Original Account'].Id" --output text)  # Resolves from the Altivum org (default profile)
export DST_ACCOUNT=$(aws organizations list-accounts --profile org-admin \
  --query "Accounts[?Name=='QL-Prod'].Id" --output text)

# The source Bedrock application-inference-profile the tutor runs on today.
export SRC_PROFILE_ID=$(aws bedrock list-inference-profiles --region us-east-2 \
  --type-equals APPLICATION --profile "$SOURCE_PROFILE" \
  --query "inferenceProfileSummaries[?inferenceProfileName=='quantum-ask-tutor'].inferenceProfileId" \
  --output text)

# Google OAuth web client id — public by protocol, but not ours to publish here.
# It is in the founder's private notes beside the client SECRET, which never
# appears in this file in any form (see step 12's $GOOGLE_CLIENT_SECRET).
export GOOGLE_CLIENT_ID=...

# Sanity: all four must be non-empty before you continue.
: "${ORG_MGMT_ACCOUNT:?}" "${SRC_ACCOUNT:?}" "${DST_ACCOUNT:?}" "${SRC_PROFILE_ID:?}"
```

> Two literals are deliberately NOT parameterized elsewhere in the repo and must not be:
> `scripts/founding-credit/cohort-2026-08.json`'s `expectedAccountId` is a spend guard
> that aborts issuance when the caller is in the wrong account (`run.mjs:49`) — which is
> exactly the mistake this migration makes possible — and `lambda/tutor/policy.json` is a
> live IAM document for the raw-CLI fallback path. Update both at cutover (§11 item 12);
> do not blank them.

---

## 1. Executive Summary & the Blue-Green Principle

This runbook moves the entire Quantum Learner platform — 10 CloudFormation/SAM stacks, an Amplify web app, one DynamoDB-backed stateful core, and a domain — from a shared original account into a dedicated greenfield account, and simultaneously inverts the canonical domain from `quantum.altivum.ai` to `quantumlearner.dev`.

**Nothing here is a lift-and-shift.** Because the templates are account-agnostic (`AWS::AccountId` / `AWS::Region`), the *compute* redeploys cleanly under destination creds. The real work is the **out-of-template, account-specific seams**: Bedrock inference-profile ARN, SES sandbox + identities, Secrets Manager values, Braket enablement + device access + spend guardrail, Cognito pool/client ids (which cascade to every JWT authorizer and every `NEXT_PUBLIC_*` env var), GitHub App connections, and DNS/ACM validation that must go through Cloudflare (a shared external zone).

**The blue-green principle — the single governing rule of this migration:**

1. **BUILD** every destination stack and verify it on **AWS-assigned temporary hostnames** (`*.lambda-url.on.aws`, `*.execute-api.amazonaws.com`, `*.cloudfront.net`, `*.amplifyapp.com`) — never on the production domain.
2. **VERIFY** end-to-end with **real requests** (not just green unit tests): tutor streams, sync reads/writes, auth round-trips, QPU read-path, redirects, OG/canonical.
3. **MIGRATE DATA** into the verified-empty destination tables, re-keyed to the new Cognito subs, with a final delta sync immediately before the flip.
4. **FLIP DNS** — the only production-visible change, made last, with lowered TTLs.
5. **SOAK**, then **DECOMMISSION** the source only after the destination is proven and a soak period has elapsed.

**Rollback at every phase before the flip = do not flip DNS.** The source stays live, intact, and writable throughout. The copy is read-only against the source, so re-loading the destination is always safe. After DNS/registration moves, rollback becomes slow (transfer-back + NS revert), so the domain-registration move is deliberately the *last* irreversible action, done only after the fast record-level flip has proven stable.

**Cardinal ordering fact (shapes Phases 1–2):** the destination Cognito pool issues **brand-new subs** for the 2 users. Every stateful row in every table is keyed by sub. Therefore `quantum-workspace-auth` deploys first, users are recreated, and **every per-user row is re-keyed old-sub → new-sub during the copy.** Loading any table before the new subs are known orphans all of it silently.

---

## 2. Phase 0 — Access & Bootstrap (+ kick off all LONG-LEAD items FIRST)

> The long-lead, human-reviewed, or human-handshake items (SES production access, Bedrock model access, Braket enablement + device terms, GitHub connections) are the schedule-critical path. **Fire them at the very start of Phase 0** so their review/propagation windows overlap the build work.

### 2.1 Chained CLI profile & root hardening

1. Configure `~/.aws/config`:
   ```
   [profile quantum-learner]
   role_arn      = arn:aws:iam::$DST_ACCOUNT:role/OrganizationAccountAccessRole
   source_profile = altivum-mgmt
   region        = us-east-2
   ```
2. Sanity check: `aws sts get-caller-identity --profile quantum-learner` → **must** print `"Account": "$DST_ACCOUNT"` and an assumed-role of `OrganizationAccountAccessRole`.
3. Harden root (console / Org): reset the root password for `quantumlearner@altivum.ai`, enable root MFA, confirm **no** root access keys, set alternate/billing contacts, enable IAM access to Billing.
4. **Confirm the root inbox `quantumlearner@altivum.ai` is actively monitored** — SES approval, every SNS confirmation, and all budget alerts land there.

### 2.2 LONG-LEAD #1 — SES production access (the async long pole, ~24h+, can be rejected)

5. Decide the sending domain (see Open Questions §10): keep `altivum.ai` (DKIM CNAMEs → Cloudflare) **or** switch to `quantumlearner.dev` (DKIM → its Route53 zone, which must be migrated first).
6. Create the SES identity in `us-east-2`:
   ```
   aws sesv2 create-email-identity --email-identity <altivum.ai|quantumlearner.dev> \
     --region us-east-2 --profile quantum-learner
   ```
   Publish the 3 returned DKIM CNAMEs at the domain's DNS host.
7. Request sandbox exit (verify flags against SESv2 docs first):
   ```
   aws sesv2 put-account-details --production-access-enabled --mail-type TRANSACTIONAL \
     --website-url https://quantumlearner.dev \
     --use-case-description "Opt-in spaced-repetition review reminders; double opt-in + tokenized unsubscribe" \
     --contact-language EN --additional-contact-email-addresses christian.perez@altivum.io \
     --region us-east-2 --profile quantum-learner
   ```
   (`review-email` self-guards to no-send while in sandbox, so deploying it early is harmless.)

### 2.3 LONG-LEAD #2 — Bedrock model access + inference profile

8. Enable model access for `anthropic.claude-haiku-4-5-20251001-v1:0` in **`us-east-2` + `us-east-1` + `us-west-2`** (the cross-region system profile routes to all three; `policy.json` scopes to foundation-model ARNs in all three). Console/model-access.
   Verify: `aws bedrock get-foundation-model-availability --model-id anthropic.claude-haiku-4-5-20251001-v1:0 --region us-east-2 --profile quantum-learner`.
9. Recreate the application-inference-profile (must exist **before** the tutor stack deploys):
   ```
   aws bedrock create-inference-profile --region us-east-2 --profile quantum-learner \
     --inference-profile-name quantum-ask-tutor \
     --description "Cost attribution for the quantum portal gen-AI lesson tutor" \
     --model-source copyFrom=arn:aws:bedrock:us-east-2:$DST_ACCOUNT:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0 \
     --tags '[{"key":"Project","value":"quantum"},{"key":"Feature","value":"ask-tutor"},{"key":"CostCategory","value":"genai"}]'
   ```
   **Capture the returned application-inference-profile ARN as `$NEW_MODEL_ID`** (`arn:aws:bedrock:us-east-2:$DST_ACCOUNT:application-inference-profile/<new-id>`). Do **not** reuse the source `$SRC_PROFILE_ID`.

### 2.4 LONG-LEAD #3 — Braket enablement, device access, spend guardrail

10. Accept the Amazon Braket terms once (console) → auto-creates `AWSServiceRoleForAmazonBraket` **and** the managed results bucket `amazon-braket-eu-north-1-$DST_ACCOUNT`.
11. Accept each third-party device provider's terms (console): **IQM Garnet (`eu-north-1`)**, IonQ Forte, QuEra. **Do NOT accept device terms until the QPU budget + kill-switch are deployed and verified (Phase 1.4)** — device access is irreversible real-money exposure.
12. Set an **account-level Braket spend guardrail** (Billing console — no CLI). This is the real-money hard stop, separate from the in-stack `QpuBudget`.
13. Pre-create the results bucket deterministically (or let Braket auto-create on first task):
    ```
    aws s3 mb s3://amazon-braket-eu-north-1-$DST_ACCOUNT --region eu-north-1 --profile quantum-learner
    ```
    Verify: `aws braket search-devices --filters '[]' --region eu-north-1 --profile quantum-learner` returns the device list.

### 2.5 LONG-LEAD #4 — GitHub connections (two SEPARATE human handshakes)

14. **CodeConnections** (for CI standby CodeBuild):
    ```
    aws codeconnections create-connection --provider-type GitHub --connection-name quantum-github \
      --region us-east-2 --profile quantum-learner       # lands PENDING; capture ConnectionArn
    ```
    Then a **human, signed into `$DST_ACCOUNT`**, opens the console → Developer Tools → Settings → Connections → `quantum-github` → *Update pending connection* → install/authorize the "AWS Connector for GitHub" app on `AltivumInc-Admin/quantum-computing`.
    Gate: `aws codeconnections get-connection --connection-arn <arn> --region us-east-2 --profile quantum-learner --query 'Connection.ConnectionStatus'` → must read **`AVAILABLE`** before the ci-standby deploy. Reuse this ARN for any other dest item needing GitHub source.
15. **Amplify GitHub App** (a *different* GitHub App than #14): authorize the AWS Amplify GitHub App on the same repo from the destination account (done in Phase 3 at app-create time; provision the authorization now to avoid blocking).

### 2.6 Secrets, staging buckets, cost tags

16. Recreate the QPU edge shared secret **once**, with a `us-east-1` replica (per `aws-secrets-manager` skill; value never printed):
    ```
    V=$(openssl rand -hex 32)
    aws secretsmanager create-secret --name quantum-qpu-edge-secret --secret-string "$V" \
      --region us-east-2 --add-replica-regions Region=us-east-1 --profile quantum-learner
    unset V
    ```
    (Both `quantum-qpu-submit` (us-east-2 primary) and `quantum-qpu-edge` (us-east-1 replica) resolve it by name at deploy — **one** secret, never two.)
17. Recreate the Stripe secret (LIVE keys from 1Password; webhookSecret placeholder until the endpoint is registered in Phase 1.5):
    ```
    SK=$(op read "op://Quantum Learner/Stripe/add more/Secret Key")
    aws secretsmanager create-secret --name quantum-stripe --region us-east-2 --profile quantum-learner \
      --secret-string "$(jq -nc --arg sk "$SK" '{secretKey:$sk, webhookSecret:"whsec_PLACEHOLDER"}')"
    unset SK
    ```
18. SAM staging buckets auto-create via `--resolve-s3`. For the Braket nested-stack `package` step (only if deploying `braket-base`), pre-create `braket-cfn-staging-$DST_ACCOUNT-us-east-2`.
19. **Cost-allocation tags — run in the PAYER/management account (`$ORG_MGMT_ACCOUNT`), NOT the member** (not retroactive, ~24h to appear):
    ```
    aws ce update-cost-allocation-tags-status --region us-east-1 --profile altivum-mgmt \
      --cost-allocation-tags-status TagKey=Project,Status=Active TagKey=Feature,Status=Active TagKey=CostCategory,Status=Active
    ```
20. **Verify account Lambda concurrency headroom before any reserved-concurrency deploy** (a fresh account may ship with a reduced quota; the fleet reserves tutor 5 + sync 10 + qpu 5+1+2 + stripe 10 + review-email 11 ≈ 44, and each deploy must leave ≥100 unreserved):
    ```
    aws lambda get-account-settings --region us-east-2 --profile quantum-learner
    ```
    Request a limit increase if `UnreservedConcurrentExecutions` would drop below 100.

### 2.7 Repo prep (one branch)

21. `git checkout -b migrate/crosscut-$DST_ACCOUNT`. Land the account-specific repo edits here (details in §3 per-stack and consolidated below), but **sequence the `SITE_URL` flip to coincide with cutover** — `main` is shared with the still-live source Amplify app, so any push to `main` rebuilds *both* apps.
22. Edits: `lambda/tutor/policy.json` line 9 → `$NEW_MODEL_ID`; `lambda/tutor/README.md` + `docs/eval-implementation-plans.md` ARN references; origin-param **defaults** (`quantum.altivum.ai` → `quantumlearner.dev`) in the 6 templates; `infra/workspace/cognito.yaml` `DomainPrefix` default `quantum-altivum` → `quantumlearner`; `web/src/lib/site.ts` `SITE_URL` + `web/src/lib/auth-config.ts` line 36 fallback origin. **Do NOT touch** Braket device ARNs (`web/public/lab/**` are build artifacts), ECR account (CI/CD registry, hosted externally), or the GitHub repo string `AltivumInc-Admin/quantum-computing`.

---

## 3. Phase 1 — Stateless Infra Rebuild (strict dependency order)

Deploy order is a hard chain: **auth → sync → tutor(+edge) → qpu(+edge) → stripe → review-email → ci-standby → braket-base**. `auth` is the keystone (every downstream JWT authorizer + every `NEXT_PUBLIC_COGNITO_*` derives from it). All deploys use `--profile quantum-learner`. No `samconfig.toml` is committed — **pass every parameter explicitly** on the command line.

Throughout Phase 1, set `SiteOrigin`/`AllowedOrigin`/`SiteUrl` to a **placeholder that will be re-set at cutover**. During blue-green browser verification, pass the **temp Amplify hostname**; consider allowing **both** the temp host and `https://quantumlearner.dev` during the overlap. The final value at cutover is `https://quantumlearner.dev`.

### 3.1 `quantum-workspace-auth` (raw CFN, `us-east-2`) — KEYSTONE, deploy FIRST

Prereqs: Google OAuth client secret retrieved from Google Cloud Console (NoEcho, not in dumps); the Google OAuth client must add `https://quantumlearner.auth.us-east-2.amazoncognito.com/oauth2/idpresponse` (new prefix) to its Authorized redirect URIs (console-only).

1. Deploy (no IAM capability needed — no IAM resources):
   ```
   aws cloudformation deploy --template-file infra/workspace/cognito.yaml \
     --stack-name quantum-workspace-auth --region us-east-2 --profile quantum-learner \
     --parameter-overrides \
       GoogleClientId=$GOOGLE_CLIENT_ID \
       GoogleClientSecret="$GOOGLE_CLIENT_SECRET" \
       DomainPrefix=quantumlearner \
       SiteUrl=https://quantumlearner.dev \
     --tags Project=quantum Feature=workspace-auth CostCategory=auth
   ```
   **New param notes:** `DomainPrefix` MUST change from `quantum-altivum` — that hosted-UI prefix is region-globally unique and still held by the live source pool (`CreateUserPoolDomain` fails on reuse). Source pool is Retain + DeletionProtection ACTIVE, so it keeps holding `quantum-altivum` even after teardown; do not plan to reclaim it.
2. Capture outputs — **`NEW_POOL_ID`, `NEW_CLIENT_ID`, HostedDomain (`quantumlearner.auth.us-east-2.amazoncognito.com`), Region**:
   ```
   aws cloudformation describe-stacks --stack-name quantum-workspace-auth --region us-east-2 \
     --profile quantum-learner --query 'Stacks[0].Outputs'
   ```
   (User-record recreation happens in Phase 2, since it must precede all data copies.)

### 3.2 `quantum-workspace-sync` (SAM, `us-east-2`) — depends on auth

3. Confirm no leftover table blocks the fixed name (expect `ResourceNotFoundException`):
   `aws dynamodb describe-table --table-name quantum-workspace-progress --region us-east-2 --profile quantum-learner`
4. Build + deploy (temp-origin verification phase):
   ```
   cd lambda/sync && sam build
   sam deploy --stack-name quantum-workspace-sync --region us-east-2 --profile quantum-learner \
     --resolve-s3 --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
     --parameter-overrides \
       UserPoolId=$NEW_POOL_ID UserPoolClientId=$NEW_CLIENT_ID \
       SiteOrigin=https://<TEMP_AMPLIFY_HOST> \
       AlertEmail=christian.perez@altivum.io LogRetentionInDays=30 MaxConcurrency=10
   ```
   The table `quantum-workspace-progress` is created **empty** here; data lands in Phase 2.
5. Confirm the SNS email subscription for `quantum-workspace-sync-alerts` from the inbox.
6. Capture the new **`SyncUrl`** output (feeds Amplify `NEXT_PUBLIC_SYNC_URL`).

### 3.3 `quantum-tutor` (SAM, `us-east-2`) — self-contained; needs `$NEW_MODEL_ID`

7. Build corpus + preflight gate (corpus.json is gitignored — skip this and the fn silently answers OUT_OF_SCOPE):
   ```
   npm --prefix lambda/tutor run build:corpus
   TUTOR_MODEL_ID=$NEW_MODEL_ID node lambda/tutor/deploy-check.mjs        # must print OK
   ```
8. Build + deploy with `FunctionUrlAuthType=NONE` transiently (for blue-green curl verification):
   ```
   cd lambda/tutor && npm install && sam build
   sam deploy --stack-name quantum-tutor --region us-east-2 --profile quantum-learner \
     --capabilities CAPABILITY_IAM --resolve-s3 \
     --parameter-overrides ModelId=$NEW_MODEL_ID \
       FoundationModelId=anthropic.claude-haiku-4-5-20251001-v1:0 \
       AllowedOrigin=https://<TEMP_AMPLIFY_HOST> MaxConcurrency=5 LogRetentionInDays=30 \
       FunctionUrlAuthType=NONE AlertEmail=christian.perez@altivum.io
   ```
   **Greenfield simplifies the source runbook:** no log-group import change-set, no console-alarm deletion, no hand-created topic to retire — none pre-exist. Do **not** attempt the import dance.
9. Note the `TutorUrl` output; verify it streams a grounded answer while NONE:
   ```
   curl -N -X POST "<TutorUrl>" -H 'content-type: application/json' \
     -d '{"slug":"05-quantum-chemistry","question":"why does the Z-string only act on the lower modes?"}'
   ```

### 3.4 `quantum-tutor-edge` (CFN, `us-east-1`) — depends on quantum-tutor

10. Read the origin Function URL host (strip `https://` and trailing slash):
    ```
    HOST=$(aws cloudformation describe-stacks --stack-name quantum-tutor --region us-east-2 --profile quantum-learner \
      --query "Stacks[0].Outputs[?OutputKey=='TutorUrl'].OutputValue" --output text | sed 's#https://##; s#/##')
    ```
11. Deploy the edge (must be `us-east-1` — CLOUDFRONT-scope WAF):
    ```
    aws cloudformation deploy --profile quantum-learner --region us-east-1 \
      --stack-name quantum-tutor-edge --template-file lambda/tutor/edge.yaml --capabilities CAPABILITY_IAM \
      --parameter-overrides FunctionUrlDomain=$HOST PriceClass=PriceClass_100 RateLimitPerMinute=300
    ```
12. Capture the new **DistributionId** + **DistributionDomainName**; wait for `Status=Deployed`:
    `aws cloudfront get-distribution --profile quantum-learner --id <DistId> --query 'Distribution.Status' --output text`
13. Grant CloudFront OAC → Lambda (out-of-template glue; run with dest creds so `sts get-caller-identity` resolves to `$DST_ACCOUNT`):
    ```
    AWS_PROFILE=quantum-learner DISTRIBUTION_ID=<DistId> AWS_REGION=us-east-2 FUNCTION_NAME=quantum-tutor \
      ./lambda/tutor/scripts/grant-oac.sh
    ```
14. Verify a **signed** POST (with `x-amz-content-sha256` body hash) through `https://<DistributionDomainName>/` streams a grounded answer.
15. **Flip the origin closed** — redeploy `quantum-tutor` with `FunctionUrlAuthType=AWS_IAM` (all other params identical to step 8). Confirm the raw unsigned Function URL now returns **403** while CloudFront still streams.

### 3.5 `quantum-qpu-submit` (SAM, `us-east-2`; Braket in `eu-north-1`) — depends on auth; needs edge secret + results bucket + Braket

Prereqs already satisfied in Phase 0: edge secret exists (2.6 #16), results bucket exists (2.4 #13), Braket enabled but **device terms NOT yet accepted** (accept only after this stack's kill-switch is verified).

16. Freeze source submissions before the eventual cutover to prevent split-brain double-spend (do at cutover, not now): trip the SOURCE `quantum-qpu-ledger` KILL row and let all in-flight SUBMITTED tasks reconcile in source (their task ARNs are account-scoped and un-reconcilable from dest).
17. Build + deploy:
    ```
    cd lambda/qpu && sam build
    sam deploy --stack-name quantum-qpu-submit --region us-east-2 --profile quantum-learner \
      --capabilities CAPABILITY_IAM --resolve-s3 \
      --parameter-overrides \
        UserPoolId=$NEW_POOL_ID UserPoolClientId=$NEW_CLIENT_ID \
        ResultsBucket=amazon-braket-eu-north-1-$DST_ACCOUNT \
        SiteOrigin=https://<TEMP_AMPLIFY_HOST> EdgeSecretName=quantum-qpu-edge-secret \
        AlertEmail=christian.perez@altivum.io MonthlyBraketBudget=150 MaxConcurrency=5 LogRetentionInDays=30
    ```
    31 resources. `LedgerTable`/`TasksTable` created empty (data → Phase 2). Watch the log-group import hazard (all four groups have explicit names + Retain) — greenfield should be clean.
18. Confirm the **3** SNS email subscriptions from the inbox: `quantum-qpu-alerts`, `quantum-qpu-killswitch`, **and** the `QpuBudget` EMAIL subscriber. Until confirmed the guardrail and alarms are silent.
19. **Verify the kill-switch end-to-end BEFORE accepting device terms / opening real traffic:** publish a test message to `KillSwitchTopic` (or simulate a budget breach) → a `KILL` row appears in `quantum-qpu-ledger` and a subsequent `POST /qpu/submit` returns **503**. Remove the `KILL` row to re-arm.
20. Capture the new **`QpuUrl`** output (feeds the edge origin + Amplify `NEXT_PUBLIC_QPU_URL`).
21. **Now** accept the Braket device terms (Phase 0 #11) — the hard stop is proven.

### 3.6 `quantum-qpu-edge` (CFN, `us-east-1`) — depends on qpu-submit + shared secret replica

22. Read the destination API host:
    ```
    QHOST=$(aws cloudformation describe-stacks --stack-name quantum-qpu-submit --region us-east-2 --profile quantum-learner \
      --query "Stacks[0].Outputs[?OutputKey=='QpuUrl'].OutputValue" --output text | sed 's#https://##; s#/##')
    ```
23. Deploy (`us-east-1`; no IAM resources so no `--capabilities` needed):
    ```
    aws cloudformation deploy --template-file lambda/qpu/edge.yaml --stack-name quantum-qpu-edge \
      --region us-east-1 --profile quantum-learner \
      --parameter-overrides ApiDomain=$QHOST EdgeSecretName=quantum-qpu-edge-secret \
        RateLimitPerMinute=300 PriceClass=PriceClass_100
    ```
    **Leaving `ApiDomain` at the source host `7zosw1794g...` = cross-account traffic leak.** The CloudFront `x-qpu-edge` header is injected from the **us-east-1 secret replica**; the us-east-2 submit Lambda validates against the primary — a value mismatch 403s every request. Prove parity functionally (a 200 through the distribution), never by fetching the value.
24. Capture the new DistributionId + DistributionDomainName; wait `Status=Deployed`.
25. Verify a signed JWT request (dest pool) through `https://<qpu edge domain>/qpu/budget` → 200; a direct hit to the API host without the `x-qpu-edge` header → rejected (proves non-bypassability).

### 3.7 `quantum-stripe` (SAM, `us-east-2`) — depends on auth; SNS-email alerts (NOT SES-gated)

26. Build + deploy (secret already created with placeholder in 2.6 #17):
    ```
    cd lambda/stripe && npm ci && sam build
    sam deploy --profile quantum-learner --region us-east-2 --stack-name quantum-stripe \
      --capabilities CAPABILITY_IAM --resolve-s3 \
      --parameter-overrides UserPoolId=$NEW_POOL_ID UserPoolClientId=$NEW_CLIENT_ID \
        SiteOrigin=https://<TEMP_AMPLIFY_HOST> StripeSecretName=quantum-stripe \
        AlertEmail=christian.perez@altivum.io
    ```
27. Capture `BillingUrl` + `WebhookUrl`. Register a **NEW** Stripe webhook endpoint at `WebhookUrl` in the Quantum Learner Stripe account (**test mode** while monetization is draft): subscribe `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`; copy its signing secret.
28. Write the real signing secret (values never printed — order must be deploy → register → put-secret-value):
    ```
    aws secretsmanager put-secret-value --profile quantum-learner --region us-east-2 --secret-id quantum-stripe \
      --secret-string "$(jq -nc --arg sk "$(op read 'op://Quantum Learner/Stripe/add more/Secret Key')" \
        --arg wh 'whsec_REAL_SIGNING_SECRET' '{secretKey:$sk, webhookSecret:$wh}')"
    ```
29. Confirm the `quantum-stripe-alerts` SNS email subscription. (Wallet balances → Phase 2, only if any nonzero exist.)

### 3.8 `quantum-review-email` (SAM, `us-east-2`) — depends on auth + sync; SES-gated

Prereq: SES identity verified + production access (Phase 0 #6–7) — but the stack deploys fine while SES is still in sandbox (sender fail-safes to no-send).

30. Generate a fresh `UnsubSecret` without echoing it (a plain NoEcho CFN param, not Secrets-Manager-backed): `UNSUB_SECRET=$(openssl rand -hex 32)` in an unprinted subshell.
31. Build + deploy:
    ```
    cd lambda/review-email && npm ci && sam build
    sam deploy --stack-name quantum-review-email --region us-east-2 --profile quantum-learner \
      --capabilities CAPABILITY_IAM --resolve-s3 --no-fail-on-empty-changeset \
      --parameter-overrides UserPoolId=$NEW_POOL_ID UserPoolClientId=$NEW_CLIENT_ID \
        FromAddress=<reviews@altivum.ai|reviews@quantumlearner.dev> \
        SiteUrl=https://quantumlearner.dev SiteOrigin=https://<TEMP_AMPLIFY_HOST> \
        ProgressTableName=quantum-workspace-progress UnsubSecret=$UNSUB_SECRET
    ```
32. Confirm the `quantum-review-email-alerts` SNS subscription. Capture `PrefsUrl` (feeds `NEXT_PUBLIC_REVIEW_PREFS_URL`). `EmailPrefsTable` created empty (consent data → Phase 2).

### 3.9 `quantum-ci-standby` (CFN, `us-east-2`) — needs the AVAILABLE CodeConnections ARN

33. Confirm `/aws/codebuild/quantum-ci-standby` does **not** pre-exist (log-group collision fails CREATE):
    `aws logs describe-log-groups --log-group-name-prefix /aws/codebuild/quantum-ci-standby --region us-east-2 --profile quantum-learner`
34. Deploy (named IAM role → `CAPABILITY_NAMED_IAM`):
    ```
    aws cloudformation deploy --stack-name quantum-ci-standby --template-file infra/ci-standby/template.yaml \
      --parameter-overrides ConnectionArn=<new-codeconnections-arn> \
        RepoUrl=https://github.com/AltivumInc-Admin/quantum-computing.git \
      --capabilities CAPABILITY_NAMED_IAM --region us-east-2 --profile quantum-learner
    ```
35. Prove it green end-to-end (the authoritative "it works" — exercises the connection auth + full matrix). `failover.sh` has no `--profile` flag and hardcodes `REGION=us-east-2`, so **export `AWS_PROFILE`**:
    ```
    AWS_PROFILE=quantum-learner ./infra/ci-standby/failover.sh drill
    aws codebuild batch-get-builds --ids <id> --region us-east-2 --profile quantum-learner \
      --query 'builds[0].buildStatus' --output text        # poll to SUCCEEDED (~30-45 min)
    ```
36. **Leave it idle.** Do NOT run `failover.sh engage` during migration — it mutates the SHARED GitHub branch-protection gate. Only one account's standby may ever be engaged.

### 3.10 `braket-base` (`braket-quantum-workspace`, nested CFN, `us-east-2`) — OPTIONAL

> **Not deployed in source** — its S3/IAM/Budget pieces are superseded by `quantum-qpu-submit`. The account-level Braket prerequisites (Phase 0 #10–13) are what actually matter. Deploy this only if you want the extra budget/role/bucket hygiene, and if so **do not run its `BraketQuantumWorkspaceBudget` alongside qpu-submit's `QpuBudget`** (duplicate Braket cost alerts).

37. (Optional) `aws s3api head-bucket --bucket braket-cfn-staging-$DST_ACCOUNT-us-east-2 --profile quantum-learner || aws s3 mb s3://braket-cfn-staging-$DST_ACCOUNT-us-east-2 --region us-east-2 --profile quantum-learner`
38. (Optional) `aws cloudformation package --template-file infra/cloudformation/main.yaml --s3-bucket braket-cfn-staging-$DST_ACCOUNT-us-east-2 --region us-east-2 --profile quantum-learner --output-template-file /tmp/braket-packaged.yaml`
39. (Optional) `aws cloudformation deploy --template-file /tmp/braket-packaged.yaml --stack-name braket-quantum-workspace --region us-east-2 --profile quantum-learner --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND --parameter-overrides MonthlyBudget=50 NotificationEmail=quantumlearner@altivum.ai ResultsRetentionDays=90 DeployNotebook=false` (keep `DeployNotebook=false` — it carries a billed 20GB stateful EBS volume).

---

## 4. Phase 2 — Data Migration (Cognito users + DynamoDB), timed for minimal loss

**Precondition:** `quantum-workspace-auth` is deployed (Phase 1.1) and all 5 destination tables exist empty (Phases 1.2/1.5/1.7/1.8). This concern only READS source and WRITES destination → rollback is clean.

**Method:** a `scan → transform(remap sub) → PutItem` script (only ~2 items/table; PITR export-to-S3 can't remap subs inline, so it's overkill here). Two boto3 sessions: `SOURCE_PROFILE` (reads `$SRC_ACCOUNT`) + `quantum-learner` (writes dest). Pass explicit `--profile` on every call; dry-run first to avoid a credential slip.

### 4.1 Recreate the 2 Cognito users → build `SUB_REMAP`

1. Capture dest pool/client (already have `$NEW_POOL_ID`/`$NEW_CLIENT_ID` from Phase 1).
2. Enumerate source users to pick each migration path (non-null `identities` ⇒ Google-federated, no password):
   ```
   aws cognito-idp list-users --user-pool-id us-east-2_aRydPmAjj --profile <SOURCE_PROFILE> --region us-east-2 \
     --query 'Users[].[Username,UserStatus,Attributes[?Name==`email`].Value|[0],Attributes[?Name==`identities`].Value|[0]]'
   ```
3. Native (email/password) user — admin-create with `email_verified=true` (critical: the QPU hardware-spend gate checks it) + EMAIL delivery so the user self-resets:
   ```
   aws cognito-idp admin-create-user --user-pool-id $NEW_POOL_ID --username ai-dev@altivum.ai \
     --user-attributes Name=email,Value=ai-dev@altivum.ai Name=email_verified,Value=true \
     --desired-delivery-mediums EMAIL --profile quantum-learner --region us-east-2
   ```
4. Google-federated user — no password; preferred = JIT-provision on first Google sign-in (after the Google OAuth client lists the dest callback), or pre-provision via `admin-create-user --message-action SUPPRESS` + `admin-link-provider-for-user`.
5. Capture the **NEW subs** and build `SUB_REMAP = {"<old-sub-A>":"<new-sub-A>", "<old-sub-B>":"<new-sub-B>"}`:
   ```
   aws cognito-idp admin-get-user --user-pool-id $NEW_POOL_ID --username ai-dev@altivum.ai \
     --query 'UserAttributes[?Name==`sub`].Value' --output text --profile quantum-learner --region us-east-2
   ```
   Passwords are non-exportable by design — native user resets via forgot-password; Google user needs none.

### 4.2 Verify source counts, then copy with re-keying

6. **`verify-live` source row counts BEFORE copying** (decide migrate vs already-empty; several tables are almost certainly empty):
   ```
   for T in quantum-workspace-progress quantum-qpu-ledger quantum-qpu-tasks quantum-review-email-prefs quantum-stripe-wallet; do
     echo $T; aws dynamodb scan --table-name $T --select COUNT --profile <SOURCE_PROFILE> --region us-east-2 --query 'Count'; done
   ```
7. Initial bulk copy via the scan→transform→PutItem script (idempotent; re-runnable), per-table rules:
   - **`quantum-workspace-progress`** (crown jewels, 2 users): copy all rows; replace `userId` (S) with `SUB_REMAP[userId]`.
   - **`quantum-qpu-ledger`**: copy **only** `pk begins_with 'USER#'` (lifetime spend + cap) and `CRED#` (earned hardware badges); rewrite the sub segment. **SKIP** `DAY#` (TTL counters) and any `KILL` row (copying a tripped KILL would 503 the dest QPU path; establish KILL fresh = not killed).
   - **`quantum-qpu-tasks`**: copy COMPLETED rows (badge provenance) if count>0; remap the `userId` **attribute** (PK `idempotencyKey` unchanged; GSI `userId-index` rebuilds automatically). **Do NOT** migrate in-flight SUBMITTED/RESERVED rows (drained in source at cutover — un-reconcilable cross-account). Caveat: `taskArn`/`resultS3Uri` point at source-account Braket + S3 (display-only history).
   - **`quantum-review-email-prefs`**: copy all rows; remap `userId`. Preserves opt-in + the `lastSentEpochDay` cadence guard (else a duplicate reminder risks on first run).
   - **`quantum-stripe-wallet`**: copy **only** `pk begins_with 'WALLET#'` (purchased credits = real money); rewrite sub. **SKIP** `EVENT#` idempotency rows (per-account, TTL). Migrate only if any nonzero balance exists.
   Use `PutItem` or `BatchWriteItem` (≤25/batch) — ~2 items/table, no throttling.

### 4.3 Verify parity, then FINAL delta (last action before flip)

8. Row-count parity per table (source COUNT == dest copied-subset COUNT); per-item value equality for `progress` (`data`+`version`+`email` byte-identical except `userId`). Subset checks: dest ledger has **only** `USER#`/`CRED#` (no `DAY#`/`KILL`); dest wallet has **only** `WALLET#` (no `EVENT#`).
9. End-to-end on temp hostnames: both users sign in; progress dashboard shows expected mastery; QPU remaining-cap correct; wallet balance correct; a re-keyed learner's `GET /progress` returns their real snapshot (NOT the empty `{version:0,data:{}}` default).
10. **FINAL DELTA SYNC of `quantum-workspace-progress`, immediately before the DNS flip** — re-scan source, overwrite each dest row only where source `version`/`updatedAt` advanced past what was copied. Optionally ask the 2 users to pause writes for the minutes-long window (writes landing on source after this delta but before propagation are lost; last-write-wins with a version guard makes the re-copy safe).

---

## 5. Phase 3 — Frontend: new Amplify app + env vars + build; verify on a temp hostname

Amplify holds **no persistent state** — the site regenerates from GitHub on every build, so this is a plain CLI create, not a data migration. It is **not** a CloudFormation resource; discover live source config first (no facts file exists for the app).

1. **Discover** (source creds, `$SRC_ACCOUNT`, no `--profile quantum-learner`):
   ```
   aws amplify get-app    --app-id d1ao02to23x85y --region us-east-2   # name, platform, repo, iamServiceRoleArn, buildSpec(null?), customRules, env vars
   aws amplify get-branch --app-id d1ao02to23x85y --branch-name main --region us-east-2   # BRANCH-level env vars, framework
   aws amplify list-domain-associations --app-id d1ao02to23x85y --region us-east-2
   ```
2. **PREP:** authorize the AWS Amplify GitHub App on `AltivumInc-Admin/quantum-computing` from the destination account (Phase 0 #15). Confirm all Phase-1 stacks are up and capture their outputs for the env values.
3. **Create the app** connected to the SAME repo (do NOT pass `--build-spec`; the repo `amplify.yml` at root is auto-consumed). Re-source EVERY `NEXT_PUBLIC_*` from **destination** outputs — never copy source values:
   ```
   aws amplify create-app --name "Quantum Learner" \
     --repository https://github.com/AltivumInc-Admin/quantum-computing --platform WEB \
     --environment-variables \
       NEXT_PUBLIC_TUTOR_URL=https://<dest tutor-edge domain>/,\
       NEXT_PUBLIC_QPU_URL=https://<dest qpu-edge domain>/,\
       NEXT_PUBLIC_SYNC_URL=<dest SyncUrl>,\
       NEXT_PUBLIC_BILLING_URL=<dest BillingUrl>,\
       NEXT_PUBLIC_REVIEW_PREFS_URL=<dest PrefsUrl>,\
       NEXT_PUBLIC_COGNITO_USER_POOL_ID=$NEW_POOL_ID,\
       NEXT_PUBLIC_COGNITO_CLIENT_ID=$NEW_CLIENT_ID,\
       NEXT_PUBLIC_COGNITO_DOMAIN=quantumlearner.auth.us-east-2.amazoncognito.com,\
       NEXT_PUBLIC_AWS_REGION=us-east-2 \
     --custom-rules file://custom-rules.json \
     [--iam-service-role-arn <new-role-arn-if-source-had-one>] \
     --profile quantum-learner --region us-east-2
   ```
   `NEXT_PUBLIC_SIGNUP_URL` is **retired** (gate = `isAuthConfigured()`); `NEXT_PUBLIC_GITHUB_REPO` is optional (code falls back to manifest). Replicate discovered `customRules` (e.g. SPA rewrite/404 fallback) — a missed rule 404s client routes.
4. Create the branch:
   ```
   aws amplify create-branch --app-id <NEW> --branch-name main --stage PRODUCTION --enable-auto-build \
     [--environment-variables <branch-level vars if any>] --profile quantum-learner --region us-east-2
   ```
5. If not auto-detected, set the monorepo root (merge with existing vars): `AMPLIFY_MONOREPO_APP_ROOT=web` via `amplify update-app`. `customHttp.yml` + `amplify.yml` MUST stay at repo root for the monorepo.
6. **Confirm the build image / Node version** matches source (no `.nvmrc`/`engines` pin in the repo) so `npm ci` + the JupyterLite `build.sh` venv build stay green; pin the image if the default drifted.
7. Build + poll to `SUCCEED`:
   ```
   aws amplify start-job --app-id <NEW> --branch-name main --job-type RELEASE --profile quantum-learner --region us-east-2
   aws amplify get-job   --app-id <NEW> --branch-name main --job-id <id> --profile quantum-learner --region us-east-2
   ```
8. **Verify on `https://main.<NEW>.amplifyapp.com` BEFORE any DNS change** (details in Phase 5). **Zero source-account leakage:** grep the built `out/` for every source id — expect **ZERO** hits: `d1iiu6blp8cumd`, `d2m7qwngri5wk3`, `0w2buslijb`, `bfiloz43aa`, `8vdy0chz57`, `us-east-2_aRydPmAjj`, `2sg8nejrf2j8p28j6khjil99ir`.
9. **Pre-authorize the temp origin for auth:** add the temp `*.amplifyapp.com` origin's `/auth/callback` and `/` to the dest Cognito app-client Callback/Logout URLs (auth-config derives `redirectSignIn` from `window.location.origin`), and add the temp host to each backend's `SiteOrigin`/CORS allowlist during the overlap — otherwise login and credentialed fetches fail on the temp host.
10. **Do NOT attach `quantumlearner.dev` yet** — that is Phase 4 (blocked on the alias-collision release + zone move).

---

## 6. Phase 4 — DNS Cutover (exact flip order + rollback)

**The role INVERTS:** today `quantumlearner.dev` 301s → `quantum.altivum.ai`; after cutover `quantumlearner.dev` is canonical (Amplify) and `quantum.altivum.ai` 301s → `quantumlearner.dev`. `altivum.ai` DNS is at **Cloudflare** (shared external zone); `quantumlearner.dev` is a Route53 zone (`Z0634247WVFEYFGO8EVF`) currently in the **source** account.

**Two hard interlocks up front:**
- **HSTS preload (.dev):** `quantumlearner.dev` is on the HSTS preload list — HTTPS is mandatory; any window without a valid matching cert is a hard, un-clickthrough browser failure. The Amplify-managed cert MUST be ISSUED before FLIP #1.
- **Alias collision (the single biggest blue-green blocker):** the source redirect distribution `E365VD5CYQX9FM` still holds the `quantumlearner.dev` CNAME. CloudFront refuses the same alias on two distributions, so it must be released from source (or moved via `aws cloudfront associate-alias` with a domain-ownership TXT) before Amplify can serve it.

### 6.1 T-2 days — lower TTLs + build the dest app with the canonical SITE_URL

1. Lower TTL to 60s on the source-zone `quantumlearner.dev` + `www` records:
   `aws route53 change-resource-record-sets --hosted-zone-id Z0634247WVFEYFGO8EVF --change-batch <UPSERT TTL=60> --profile <SOURCE_PROFILE>`
2. Lower the Cloudflare `quantum.altivum.ai` record TTL to 60s (Cloudflare API/dashboard).
3. **Merge the `SITE_URL` → `https://quantumlearner.dev` change** (`web/src/lib/site.ts` + `auth-config.ts` fallback) to `main` so the dest build emits correct canonical/OG/sitemap/robots. This rebuilds **both** apps (shared `main`) — intentional SEO handoff; sequence to the cutover window. Confirm on the temp host: `curl -s https://main.<NEW>.amplifyapp.com/sitemap.xml | grep quantumlearner.dev`.

### 6.2 Reverse-redirect stack (dest, us-east-1) for `quantum.altivum.ai` → `quantumlearner.dev`

> Redeploying `infra/redirect/quantumlearner-dev.yaml` unchanged is a **TRAP** — it reproduces the obsolete direction and 301s the new canonical domain away from itself. Author an inverted copy (`infra/redirect/quantum-altivum.yaml`): `RedirectTarget=quantumlearner.dev`, `Aliases=[quantum.altivum.ai]`, canary `HOSTS=['quantum.altivum.ai']` + `TARGET_PREFIX='https://quantumlearner.dev'`, **remove** the Route53 `DnsRecords` group + `DomainValidationOptions/HostedZoneId` (quantum.altivum.ai validates via Cloudflare), add a `CertificateArn` param.

4. Pre-issue the cert (DNS-validated via Cloudflare):
   ```
   aws acm request-certificate --region us-east-1 --profile quantum-learner \
     --domain-name quantum.altivum.ai --validation-method DNS --query CertificateArn --output text
   ```
5. Read the validation CNAME and add it to the Cloudflare `altivum.ai` zone (manual), then wait:
   ```
   aws acm describe-certificate --region us-east-1 --profile quantum-learner --certificate-arn <arn> \
     --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
   aws acm wait certificate-validated --region us-east-1 --profile quantum-learner --certificate-arn <arn>
   ```
6. Deploy the inverted stack:
   ```
   aws cloudformation deploy --region us-east-1 --profile quantum-learner \
     --stack-name quantum-altivum-redirect --template-file infra/redirect/quantum-altivum.yaml \
     --parameter-overrides RedirectTarget=quantumlearner.dev CertificateArn=<arn> \
       AlarmEmail=christian.perez@altivum.io \
     --capabilities CAPABILITY_IAM --tags project=quantum purpose=domain-redirect
   ```
7. Confirm the reverse-redirect SNS email subscription. Verify pre-flip on the raw CloudFront domain: `curl -sI https://<dist>.cloudfront.net/x?y=1` → `301` + `location: https://quantumlearner.dev/x?y=1` (path+query preserved).

### 6.3 Pre-stage the destination zone + attach the custom domain

8. Create the dest hosted zone; capture its 4 NS: `aws route53 create-hosted-zone --name quantumlearner.dev --caller-reference $(date +%s) --profile quantum-learner`.
9. Release the `quantumlearner.dev` alias from the source redirect distribution (or `associate-alias` with a domain-ownership TXT) so Amplify can claim it.
10. Attach the custom domain to the dest Amplify app; read the required validation + app CNAME/ALIAS records:
    ```
    aws amplify create-domain-association --app-id <NEW> --domain-name quantumlearner.dev \
      --sub-domain-settings prefix="",branchName=main prefix=www,branchName=main --profile quantum-learner --region us-east-2
    aws amplify get-domain-association --app-id <NEW> --domain-name quantumlearner.dev --profile quantum-learner --region us-east-2
    ```
    Add the returned records into whichever zone is authoritative now (the **source** zone during FLIP #1). Poll until `domainStatus=AVAILABLE` (Amplify auto-provisions its own ACM cert — 20–40+ min).

### 6.4 THE FLIP (exact order)

11. **FLIP #1 (fast, reversible — records inside the still-source-delegated zone):** with SOURCE creds, UPSERT the source-zone `quantumlearner.dev` + `www` records from the old redirect-distribution alias → the dest Amplify custom-domain target. Propagates ~60s. Verify: `curl -sI https://quantumlearner.dev` → **HTTP/2 200** from Amplify, valid cert.
12. **FLIP #2:** repoint the Cloudflare `quantum.altivum.ai` record from source Amplify → the dest reverse-redirect CloudFront domain. Verify: `curl -sI https://quantum.altivum.ai` → **301** `location: https://quantumlearner.dev/`.
13. **Stop source false-pages:** with SOURCE creds, disable the source redirect stack's 15-min canary + alarms — the instant `quantumlearner.dev` returns 200 they flip `Healthy=0` and page every 15 min: `aws events disable-rule --name quantumlearner-redirect-canary-15min --region us-east-1 --profile <SOURCE_PROFILE>`.

### 6.5 Delegation + registration move (clean account boundary, zero-downtime)

> Do this **only after FLIP #1/#2 are proven stable** — it is the slow, awkward-to-reverse step. Keep source + dest zones populated identically during the ~48h overlap.

14. Populate the dest zone with the SAME `quantumlearner.dev` + `www` records (Amplify target).
15. Transfer the registration intra-AWS (no auth code, no 60-day lock, expiry/auto-renew/WHOIS preserved):
    ```
    aws route53domains transfer-domain-to-another-aws-account --region us-east-1 --domain-name quantumlearner.dev \
      --account-id $DST_ACCOUNT --profile <SOURCE_PROFILE>
    aws route53domains accept-domain-transfer-from-another-aws-account --region us-east-1 \
      --domain-name quantumlearner.dev --password <from-transfer> --profile quantum-learner
    ```
16. **Repoint NS** (the transfer does NOT move the zone or update NS — forgetting this strands delegation in the old account):
    ```
    aws route53domains update-domain-nameservers --region us-east-1 --domain-name quantumlearner.dev \
      --nameservers Name=<dest-ns1> Name=<dest-ns2> Name=<dest-ns3> Name=<dest-ns4> --profile quantum-learner
    ```
    Both zones answer identically → the ~48h registry NS-TTL propagation causes no downtime.

### 6.6 Rollback

17. **Any point before the delegation move (step 14):** revert FLIP #1 by UPSERTing the source-zone records back to the old redirect distribution, and revert the Cloudflare `quantum.altivum.ai` record — a fast low-TTL change, because delegation still lives in the source zone. **Never** roll back by re-pointing after delegation has moved. Do not begin the delegation move until FLIP #1/#2 are stable.

---

## 7. Phase 5 — Verification (end-to-end, real requests — not just green tests)

Run these on temp hostnames pre-flip, then re-run on the production domain post-flip.

1. **Identity:** `aws sts get-caller-identity --profile quantum-learner` → `$DST_ACCOUNT`.
2. **Site:** `https://main.<NEW>.amplifyapp.com` (then `https://quantumlearner.dev`) smoke — `/`, `/learn`, a lesson, `/lab` (real Pyodide boots + runs a browser notebook cell), `/glossary`, `/playground`, `/pricing`, `/login`.
3. **Zero source-account leakage:** grep built pages for `d1iiu6blp8cumd`, `d2m7qwngri5wk3`, `0w2buslijb`, `bfiloz43aa`, `8vdy0chz57`, `us-east-2_aRydPmAjj`, `2sg8nejrf2j8p28j6khjil99ir` → **zero hits**; also `grep -rn $SRC_ACCOUNT .` (excluding node_modules/.git/out/.next) returns only intentional historical docs.
4. **Auth round-trip (real path):** on the site, complete a native email/password SRP login AND a Google federated sign-in via the dest Cognito pool (callback origin allowlisted); decode the id token → `iss = https://cognito-idp.us-east-2.amazonaws.com/$NEW_POOL_ID`, validates against that pool's JWKS. A downstream Lambda (sync/qpu) accepts a dest-pool token.
5. **Tutor stream:** with `Origin: https://quantumlearner.dev`, a signed POST through the tutor edge streams grounded tokens; the raw Function URL returns 403 (AWS_IAM lock holds).
6. **Sync:** unauth `GET /progress` → 401; signed `GET` → 200 `{version,data}`; `PUT {baseVersion:0,...}` → 200; stale `PUT` → 409; two-tab cross-device sync works.
7. **QPU dry-run (no cost):** mint a dest-pool JWT; `GET /qpu/budget` + `GET /qpu/credential` through the edge (with `x-qpu-edge`) → 200; a request lacking the edge header → rejected. Kill-switch: publish to `KillSwitchTopic` → `KILL` row appears, `POST /qpu/submit` → 503; remove to re-arm. (A real submit only if explicitly authorized — present a cost estimate first per CLAUDE.md.)
8. **Stripe:** `POST {BillingUrl}/webhook` bad signature → 400; a real test event to the new endpoint → 200, `WALLET#` credited + `EVENT#` idempotency row; re-send → 200 balance unchanged. Authenticated `GET /wallet` → 200.
9. **Review-email:** sender manual-invoke logs "sandbox → refuse to send" (until production access lands); post-production, one test send arrives with correct `SiteUrl` links + a working unsubscribe.
10. **Redirects + OG/canonical (post-flip):** `curl -sI https://quantum.altivum.ai/` → 301 → `https://quantumlearner.dev/` (path+query preserved on a sub-path); `curl -sI https://quantumlearner.dev/` → **200** (NOT a 301); page source `<link rel=canonical>`/`og:url` = `quantumlearner.dev`; `/sitemap.xml` + `/robots.txt` reference `quantumlearner.dev`.
11. **SNS all confirmed (none `PendingConfirmation`):** enumerate every topic — qpu alerts+killswitch+budget, stripe, sync, tutor, review-email, reverse-redirect.
12. **Offline handler tests still green:** `cd lambda/<name> && npm ci && npm test` for tutor/qpu/sync/stripe/review-email; `cd web && npm test` after the SITE_URL flip.

---

## 8. Phase 6 — Decommission Source (ONLY after a soak period)

**Do not begin teardown until:** the destination is fully verified (Phase 5), the domain registration + NS have propagated (~48–72h), and a soak period has passed with the destination serving production traffic cleanly. Rollback holds only while teardown has NOT begun.

**Teardown order (drop consumers/DNS before the substrate they depend on):**

1. Delete the SOURCE reverse dependency first — the old vanity redirect: `aws cloudformation delete-stack --region us-east-1 --stack-name quantumlearner-dev-redirect --profile <SOURCE_PROFILE>` (removes old-direction dist `E365VD5CYQX9FM` + cert `86bb4eda` + Route53 `DnsRecords` + canary/alarms/SNS; ~15 min for CloudFront disable+delete).
2. Delete the source Route53 zone `Z0634247WVFEYFGO8EVF` **only after** the registrar NS points at the dest zone (deleting it earlier removes the `quantumlearner.dev` alias records mid-flight): `aws route53 delete-hosted-zone --id Z0634247WVFEYFGO8EVF --profile <SOURCE_PROFILE>`.
3. Decommission the source backend stacks (tutor/tutor-edge, qpu/qpu-edge, sync, stripe, review-email, ci-standby, workspace-auth). **The DynamoDB tables are `DeletionPolicy: Retain`** — stack deletion leaves them behind (intended safety); a *manual* table delete is the IRREVERSIBLE step, do it last and only after confirming data parity in the destination.
4. Disable the OLD Stripe webhook endpoint in the (shared) Stripe account at/after cutover to stop the source stack crediting a now-dead table.
5. Restore TTLs to normal on the dest zone + the Cloudflare `quantum.altivum.ai` record.
6. Leave the source Cognito pool (`Retain` + DeletionProtection ACTIVE) — it keeps holding the `quantum-altivum` domain prefix regardless; do not attempt to reclaim that prefix.

**IRREVERSIBLE deletes to call out explicitly:** manual DynamoDB table deletion (`quantum-workspace-progress`, `quantum-qpu-ledger`, `quantum-qpu-tasks`, `quantum-stripe-wallet`, `quantum-review-email-prefs` — real money + progress + consent); Route53 zone deletion; CloudFront distribution deletion (disable + wait-for-Deployed + delete, ~15 min, not quickly reversible); S3 results-bucket contents (`teardown-infra.sh` empties recursively before delete). Source S3 result objects referenced by migrated badge rows stay in source — treat as display-only history or copy first.

---

## 9. Consolidated Table — IRREVERSIBLE / HUMAN-ONLY / LONG-LEAD Steps

| Step | Type | Why it matters / gate |
|---|---|---|
| SES production-access request (Phase 0 #7) | **LONG-LEAD** (~24h+, can be rejected) | Human-reviewed; gates real review-email sends. Request FIRST. |
| Bedrock model access grant, 3 regions (Phase 0 #8) | LONG-LEAD (console) | Must precede `create-inference-profile`. |
| Braket service + device terms IonQ/IQM/QuEra (Phase 0 #10–11) | **HUMAN-ONLY** (console) + **IRREVERSIBLE money exposure** | Accept device terms ONLY after QPU kill-switch verified (Phase 1.5 #19). |
| Account Braket spend guardrail (Phase 0 #12) | HUMAN-ONLY (Billing console, no CLI) | The real hard-stop; set before real traffic. |
| CodeConnections GitHub handshake (Phase 0 #14) | **HUMAN-ONLY** (console, cannot script) | Must read AVAILABLE before ci-standby deploy. |
| Amplify GitHub App authorization (Phase 0 #15 / Phase 3) | **HUMAN-ONLY** (console OAuth) | Blocks Amplify app creation. |
| Google OAuth redirect URIs (Phase 1.1 / Phase 4) | HUMAN-ONLY (Google console, per global rules — FLAG) | New Cognito prefix + `quantumlearner.dev/auth/callback`; else Google sign-in 400s. |
| Cognito `DomainPrefix` change to `quantumlearner` | **IRREVERSIBLE-in-effect** (source holds `quantum-altivum` forever) | Region-global prefix collision; new prefix cascades to `NEXT_PUBLIC_COGNITO_DOMAIN`. |
| Cognito password migration | **IRREVERSIBLE** (hashes non-exportable) | Native user resets; Google user needs none. |
| SES/SNS email confirmations (all topics) | HUMAN-ONLY (inbox click) | Every alarm/guardrail silent until confirmed. |
| ACM cert issuance via Cloudflare (Phase 4 #4–5) | LONG-LEAD + manual DNS | Route53 auto-validation can't reach Cloudflare; stack blocks on cert. |
| Amplify-managed cert for `quantumlearner.dev` | LONG-LEAD (20–40 min) + **HSTS-critical** | Must be ISSUED before FLIP #1 or hard browser failure. |
| `quantumlearner.dev` alias release from source dist | **ORDERING BLOCKER** (cross-account) | CloudFront rejects same alias on two dists. |
| Domain registration transfer + NS repoint (Phase 4 #15–16) | **IRREVERSIBLE-in-a-hurry** (~48h, rollback = transfer back) | Do LAST, only after FLIP proven; NS not auto-updated. |
| Cost-allocation tag activation (Phase 0 #19) | **PAYER-ACCOUNT-ONLY**, not retroactive (~24h) | Run with `--profile altivum-mgmt`, not the member. |
| Manual DynamoDB table deletion (Phase 6) | **IRREVERSIBLE** — real money/progress/consent | Only after parity confirmed + soak. |
| Route53 zone / CloudFront distribution deletion (Phase 6) | **IRREVERSIBLE / slow** | Sequence after NS propagation. |

---

## 10. Open Questions / `verify-live` Items — RESOLVE BEFORE EXECUTING

1. **SES sending domain decision** — keep `reviews@altivum.ai` (DKIM → Cloudflare, works today) or switch to `reviews@quantumlearner.dev` (DKIM → Route53, requires the zone migrated first)? Determines which zone gets the DKIM CNAMEs and which `FromAddress`/`SiteUrl` the review-email stack ships with.
2. **Google OAuth client — reuse vs new** — reusing the source client couples both accounts (rotating its secret breaks the source pool's Google sign-in); minting a new client decouples but needs its own consent/config. Also the Google client secret is NoEcho/unrecoverable from the stack — confirm it can be retrieved from Google Console, else the only path is rotation.
3. **Actual source user count** — the whole `SUB_REMAP` assumes exactly 2 users. `verify-live`: `aws cognito-idp list-users --user-pool-id us-east-2_aRydPmAjj --profile <SOURCE_PROFILE>` at cutover; if it grew, extend the map before copying. Also confirm per-user native vs Google-federated.
4. **Source DynamoDB row counts** (`verify-live`, Phase 2 #6) — decides migrate vs recreate-empty for ledger/tasks/wallet/prefs. Progress expects 2; the money tables are likely empty (no real QPU run, no committed pricing).
5. **`ResultsBucket` existence timing** — `amazon-braket-eu-north-1-$DST_ACCOUNT` only exists after Braket enablement + first task (or pre-create). Deploying qpu-submit against a missing bucket makes the S3-write IAM inert. `verify-live` with `head-bucket`.
6. **Account Lambda concurrency ceiling** (`verify-live`, Phase 0 #20) — a fresh account may reject the fleet's reserved-concurrency total; request an increase before the reserved-concurrency deploys.
7. **`www.quantum.altivum.ai`** — does it exist as a separate alias needing the reverse redirect too? `verify-live` before authoring the inverted template's `Aliases`.
8. **Reverse-redirect mechanism for `quantum.altivum.ai`** — a Cloudflare Redirect Rule (no AWS resources, simplest) vs the adapted CloudFront stack (§6.2). Confirm with the user; do NOT blindly redeploy `quantumlearner-dev.yaml` inverted (its Route53 assumptions break for a Cloudflare apex).
9. **Amplify service role + custom rules** — no facts file; `verify-live` via `get-app` for `iamServiceRoleArn` (recreate in dest if present) and `customRules` (replicate a missed SPA rewrite or client routes 404).
10. **Amplify build image / Node version drift** — no repo pin; `verify-live` the dest default matches source before trusting a green build.
11. **`braket-base` deploy — yes or no?** Source never had it; deploying diverges from baseline and duplicates the Braket budget. Decide whether the budget/role/bucket hygiene is worth the drift (§3.10).
12. **`policy.json` / README stale ARNs** — used only by the raw-CLI fallback (SAM builds the policy from the template `ModelId`), but update them to avoid a stale `$SRC_ACCOUNT` reference if that path is ever used.


---

## 11. Adversarial Review — Corrections to Apply Before Execution

**Destination Re-point Notice:** All corrections in this section remain in effect and their context (`$DST_ACCOUNT` references, etc.) now resolves to **QL-Prod** in the Delta Centric org, not the 2026-07-18 Altivum-org destination. QPU execution is not migrated by this runbook — Braket workloads are split separately per the account-split spec (see `docs/superpowers/specs/2026-08-27-braket-account-split-design.md`).

Three independent reviewers (completeness, ordering, data-safety) audited the runbook above: **16 findings (2 HIGH, 6 MEDIUM, 8 LOW).** The HIGH and MEDIUM items **override the inline steps where they conflict** — apply them before executing the affected phase.

### CRITICAL (HIGH) — money / data loss

- **H1 — Financial tables need the same final-delta + write-freeze as progress** (Phases 2 & 6.4). The runbook only final-delta-syncs `quantum-workspace-progress`. `quantum-stripe-wallet` (`WALLET#`) and `quantum-qpu-ledger` (`USER#`/`CRED#`) also mutate on source until cutover, so any post-Phase-2 credit or spend is silently lost in the destination. **Fix:** before the final-delta window, hard-freeze source financial writes — disable the OLD Stripe webhook (move it to BEFORE the final delta, not after cutover) and confirm the source QPU `KILL` row is tripped and all in-flight tasks reconciled; then final-delta wallet (`WALLET#` only) + ledger (`USER#`/`CRED#` only) with the same version/parity logic, and re-verify per-item balance/spend equality.
- **H2 — Make the source write-freeze mandatory, not optional** (Phase 4.3 #10). The sync spec mandates freezing source writes at cutover; the runbook downgraded it to "optionally ask users to pause." Because DNS propagation isn't instant, a progress `PUT` landing on source after the delta but before propagation is permanently lost. **Fix:** immediately before the final delta, disable the source sync API stage (or set source `SyncFunction` `ReservedConcurrentExecutions=0`), then delta, then flip.

### HIGH-PRIORITY (MEDIUM) — correctness / timing

- **M1 — Move the final progress delta-sync from Phase 4 into Phase 6.4** (immediately before FLIP #1, after Amplify domain `AVAILABLE` + cert `ISSUED`). As written it runs before ~30–40 min of Phase 5/6 work during which source stays writable, violating the "immediately before the flip" guarantee. Keep the bulk copy + parity in Phase 4; run the ACTUAL delta in 6.4.
- **M2 — Move the `SITE_URL` → quantumlearner.dev merge from T-2 days to the cutover window** (Phase 6.1 #3). Merging at T-2 rebuilds the still-canonical source app to emit canonical/OG pointing at quantumlearner.dev while that domain still 301s back — a 2-day "canonical points at a URL that redirects back to me" state. Keep only TTL-lowering at T-2; merge `SITE_URL` right before FLIP #1.
- **M3 — Resolve the SES sending domain to `reviews@altivum.ai` before day 0** (Phase 0.2 / Open Q §10.1). Choosing quantumlearner.dev makes its DKIM CNAMEs depend on the zone that isn't authoritative in the destination until the LAST step (Phase 6.5) — a circular dependency that blocks the day-0 sandbox-exit request. altivum.ai DKIM goes to the already-authoritative Cloudflare zone, so SES can be requested on day 0 as intended.
- **M4 — Check DNSSEC before the delegation / NS move** (Phase 6.5). quantumlearner.dev is `.dev` / HSTS-preload; if DNSSEC is active at the registry, a fresh dest zone + NS repoint without first disabling DNSSEC (remove DS, wait DS TTL) yields SERVFAIL at validating resolvers with no HTTPS fallback. **Fix:** `route53domains get-domain-detail … DnssecKeys`; if active, disable DS before the NS repoint, optionally re-enable on the dest zone after.
- **M5 — Pre-provision the Google-federated user, don't JIT** (Phase 4.1 #4). A JIT user's sub only exists after first login, but the Phase-2 copy (pre-cutover) must re-key that user's rows to the new sub. **Fix:** mandate `admin-create-user --message-action SUPPRESS` + `admin-link-provider-for-user` so the dest sub is known via `admin-get-user` BEFORE the copy. Reserve JIT for users with no data.
- **M6 — Gate the NS repoint on transfer-acceptance completion** (Phase 6.5 #15–16). The registration transfer is async; `update-domain-nameservers` (dest profile) requires the dest to already OWN the registration. **Fix:** between #15 and #16, poll `route53domains get-domain-detail` (dest) + `get-operation-detail` until owned / `SUCCESSFUL`. Zero downtime since both zones answer identically.

### POLISH (LOW) — apply during the relevant phase

- **L1** Add "confirm `quantum-tutor-stack-alerts` SNS sub" to Phase 3.3 (parity with the other stacks).
- **L2** Pre-deploy `wafv2 list-available-managed-rule-groups --scope CLOUDFRONT` + resolve the two managed CloudFront policy ids before Phase 3.6.
- **L3** Verify the Stripe lookup keys (`ql_plus_monthly`, `ql_pro_monthly`, `ql_credits_500/2000/5000/10000`) resolve to active TEST-mode prices before relying on `/checkout` (Phase 3.7).
- **L4** State the Cognito temp-host callback mechanism explicitly — either `update-user-pool-client` to append temp callback URLs (re-apply after any cognito redeploy) OR a two-phase `SiteUrl` deploy (Phase 3.9).
- **L5** Add a general account-level monthly cost budget + billing alarm (not just the Braket guardrail) in Phase 0.
- **L6** Add HSTS / X-Content-Type-Options / CSP / X-Frame-Options + immutable-cache header curl checks to Phase 5 (confirms `customHttp.yml` applied under the monorepo appRoot; quantumlearner.dev is HSTS-preload).
- **L7** Prefer `cloudfront associate-alias` (with the domain-ownership TXT) over release-then-wait for the quantumlearner.dev alias, or release only inside the FLIP #1 window once Amplify is `AVAILABLE` (Phase 6.3).
- **L8** Cross-ref fixes: the Braket device-terms gate should cite Phase 1.5 / §3.5 #19 (kill-switch verify), not Phase 1.4; the Amplify domain-attach deferral should cite Phase 6 / §6.3, not Phase 4.
