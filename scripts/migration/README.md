# Phase 2 operator log — platform migration to QL-Prod

The running record of the migration executed from
`docs/superpowers/plans/2026-08-28-platform-migration-qlprod.md`. Accounts by
name only (public repo); ids resolve at run time:

```sh
aws organizations list-accounts --profile org-admin \
  --query "Accounts[?Name=='QL-Prod'].Id" --output text
```

Secrets are referenced by WHERE THEY LIVE, never by value: the review-email
`UnsubSecret` lives in the source sender Lambda's env (`UNSUB_SECRET`); the
Google OAuth client id+secret live in the source auth stack / founder's notes
(client id is public-by-protocol but not published here, per the migration
runbook's convention); Stripe keys live in 1Password (`op://Quantum Learner/...`).

## Task 1 — 2026-08-28

- `quantum-learner` CLI profile REMOVED from ~/.aws/config (runbook-audit danger #1).
- SES production-access request FILED in QL-Prod us-east-2 (put-account-details,
  TRANSACTIONAL, quantumlearner.dev). Status at filing: ProductionAccessEnabled=false
  (pending review), EnforcementStatus=HEALTHY. Bridge until granted: individual
  recipient verification (Task 5).

## Source snapshot — 2026-08-28 (Altivum account, read-only)

```
== quantum-workspace-auth (us-east-2)
GoogleClientId	<in source stack; not published>
GoogleClientSecret	****
DomainPrefix	quantum-altivum
SiteUrl	https://quantum.altivum.ai
== quantum-workspace-sync (us-east-2)
UserPoolClientId	2sg8nejrf2j8p28j6khjil99ir
AlertEmail	christian.perez@altivum.io
UserPoolId	us-east-2_aRydPmAjj
LogRetentionInDays	30
MaxConcurrency	10
SiteOrigin	https://quantum.altivum.ai
== quantum-tutor (us-east-2)
UserPoolClientId	
AlertEmail	christian.perez@altivum.io
UserPoolId	
FunctionUrlAuthType	AWS_IAM
LogRetentionInDays	30
RateCardSecret	
SecretId	quantum-tutor
MaxConcurrency	5
AllowedOrigin	https://quantum.altivum.ai
WalletTableName	
== quantum-qpu-submit (us-east-2)
LogRetentionInDays	30
RateCardSecret	
BraketSpendTopicArn	arn:aws:sns:us-east-2:<braket-acct>:quantum-braket-spend
MaxConcurrency	5
SiteOrigin	https://quantum.altivum.ai
EdgeSecretName	quantum-qpu-edge-secret
ResultsBucket	amazon-braket-ql-results-<braket-acct>
MonthlyBraketBudget	150
BraketRoleArn	arn:aws:iam::<braket-acct>:role/QuantumLearnerBraketExecution
UserPoolClientId	2sg8nejrf2j8p28j6khjil99ir
AlertEmail	hq@quantumlearner.dev
UserPoolId	us-east-2_aRydPmAjj
BraketExternalId	****
WalletTableName	
== quantum-stripe (us-east-2)
NamePrefix	quantum-stripe
UserPoolClientId	2sg8nejrf2j8p28j6khjil99ir
AlertEmail	christian.perez@altivum.io
UserPoolId	us-east-2_aRydPmAjj
LogRetentionInDays	30
MaxConcurrency	10
SiteOrigin	https://quantum.altivum.ai
MetricNamespace	QuantumStripe
StripeSecretName	quantum-stripe
== quantum-stripe-sandbox (us-east-2)
NamePrefix	quantum-stripe-sandbox
UserPoolClientId	2sg8nejrf2j8p28j6khjil99ir
AlertEmail	christian.perez@altivum.io
UserPoolId	us-east-2_aRydPmAjj
LogRetentionInDays	30
MaxConcurrency	10
SiteOrigin	https://quantum.altivum.ai
MetricNamespace	QuantumStripeSandbox
StripeSecretName	quantum-stripe-sandbox
== quantum-review-email (us-east-2)
ScheduleExpression	cron(0 15 * * ? *)
UserPoolClientId	2sg8nejrf2j8p28j6khjil99ir
AlertEmail	christian.perez@altivum.io
UserPoolId	us-east-2_aRydPmAjj
FromAddress	reviews@altivum.ai
ProgressTableName	quantum-workspace-progress
MaxConcurrency	1
SiteOrigin	https://quantum.altivum.ai
SiteUrl	https://quantum.altivum.ai
UnsubSecret	****
== quantum-analytics (us-east-2)
ScheduleExpression	cron(30 13 * * ? *)
AlertEmail	hq@quantumlearner.dev
LogRetentionInDays	30
MaxConcurrency	2
AmplifyAppId	d1ao02to23x85y
AmplifyDomain	altivum.ai
== quantum-tutor-edge (us-east-1)
PriceClass	PriceClass_100
RateLimitPerMinute	300
FunctionUrlDomain	hb6t3y3x7z66s5pkfd3n5lwucm0booak.lambda-url.us-east-2.on.aws
== quantum-qpu-edge (us-east-1)
PriceClass	PriceClass_100
ApiDomain	7zosw1794g.execute-api.us-east-2.amazonaws.com
RateLimitPerMinute	300
SiteOrigin	https://quantum.altivum.ai
EdgeSecretName	quantum-qpu-edge-secret
== quantumlearner-dev-redirect (us-east-1)
RedirectTarget	quantum.altivum.ai
PriceClass	PriceClass_100
HostedZoneId	Z0634247WVFEYFGO8EVF
AlarmEmail	christian.perez@altivum.io
```

Amplify (source app d1ao02to23x85y, repo AltivumInc-Admin/quantum-computing, branch main):
env vars NEXT_PUBLIC_{AWS_REGION, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID,
COGNITO_DOMAIN=quantum-altivum.auth.us-east-2.amazoncognito.com,
SYNC_URL, REVIEW_PREFS_URL, TUTOR_URL, QPU_URL} — values in the Amplify console /
`aws amplify get-app`; no NEXT_PUBLIC_BILLING_URL (rule 15, stays absent).

Table row counts at snapshot: wallet 0 · qpu-ledger 5 · qpu-tasks 8 ·
progress 4 · review-prefs 2 · analytics-daily 9. Pool: 14 users (9 native
CONFIRMED, 5 Google-federated).

## Task 5 — 2026-08-28 (wave 1 deployed)

Blocked ~3h on the QL-Prod Lambda concurrency quota (new-account limit 10 forbids
any reserved concurrency). Increase to 1000 requested 19:24, went to a support
case (CASE_OPENED), applied by ~21:00. All four stacks deployed after it cleared.

- Secrets created in QL-Prod us-east-2: `quantum-stripe` (live key, webhookSecret
  `PENDING-TASK-9`), `quantum-stripe-sandbox` (sandbox key, same placeholder).
- The first (quota-blocked) create left Retain-protected tables behind; recreates
  collided on names. Resolved WITHOUT deleting: `create-change-set
  --import-existing-resources` adopts the orphan into the new stack. Both
  `quantum-workspace-progress` and `quantum-review-email-prefs` were adopted
  (verified empty first).
- SAM CLI gotcha: a spaced value inside `--parameter-overrides` (the cron
  ScheduleExpression) gets split even when shell-quoted; the review-email stack
  rolled back once on "Parameter ScheduleExpression is not valid". Deploy via
  `create-change-set --parameters` for spaced values.
- New endpoints (QL-Prod):
  - Sync: `https://heve7895r3.execute-api.us-east-2.amazonaws.com` (NEXT_PUBLIC_SYNC_URL)
  - Prefs: `https://50meh0zjb4.execute-api.us-east-2.amazonaws.com` (NEXT_PUBLIC_REVIEW_PREFS_URL)
  - Unsubscribe: `https://3g6ldtexdxc4djj45cq7kkwzam0thyat.lambda-url.us-east-2.on.aws/`
  - Billing (live): `https://00tlxl2jte.execute-api.us-east-2.amazonaws.com` (webhook `/webhook`)
  - Billing (sandbox): `https://axikm3lao9.execute-api.us-east-2.amazonaws.com` (webhook `/webhook`)
- Verified: all four APIs return 401 (not 5xx) unauthenticated on their real
  routes (`/progress`, `/prefs`, `/checkout` x2).
- PENDING founder action: 4 SNS email confirmations at hq@ (sync-alerts,
  review-email-alerts, stripe-alerts, stripe-sandbox-alerts) — alarms are silent
  until clicked.
- Ruling: the sandbox stack takes the NEW pool/site overrides too (a sandbox
  verifying JWTs against the Altivum pool would be dead in QL-Prod); only
  NamePrefix/MetricNamespace/StripeSecretName stay sandbox-specific.
