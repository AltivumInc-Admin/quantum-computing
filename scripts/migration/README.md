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

## Task 6 — 2026-08-28 (wave 2 deployed; Braket trust widened)

- `quantum-tutor` secret replicated Altivum -> QL-Prod via asm-exec dynamic
  references (value never entered the session); apiKey hash parity verified
  value-blind. Source-of-truth note: no Anthropic item exists in the 1Password
  vault — the deployed source secret IS the source of truth.
- `quantum-qpu-edge-secret` replicated the same way — into BOTH us-east-2 and
  us-east-1 (CFN `{{resolve}}` is region-local; the edge stack rolled back once
  on ResourceNotFound before the us-east-1 copy existed).
- zsh gotcha: `$VAR:q...` inside a double-quoted parameter eats `:q` as a
  history modifier (produced `<acct>uantum-braket-spend`). Brace every
  expansion followed by a colon: `${VAR}:...`.
- Tutor: stack `quantum-tutor` (free unmetered posture verbatim — pool params
  empty, `SecretId=quantum-tutor`), function URL behind edge
  `quantum-tutor-edge` -> `https://ddbde0ibe8yux.cloudfront.net`
  (NEXT_PUBLIC_TUTOR_URL). Unlike the source account, the tutor secret EXISTS
  here from day one.
- QPU: stack `quantum-qpu-submit` with the four cross-account Braket values
  (role/topic/bucket by resolved account id, ExternalId from op), API
  `https://woeuhycu01.execute-api.us-east-2.amazonaws.com`, edge
  `quantum-qpu-edge` -> `https://d143hepl8nha1e.cloudfront.net`
  (NEXT_PUBLIC_QPU_URL).
- Deploy-then-trust: `quantum-braket-workloads` redeployed with
  `PlatformRoleArns` = all FOUR platform roles (two Altivum + two QL-Prod),
  ExternalId unchanged. Verified: org-admin `sts assume-role` still DENIED;
  the Braket spend topic now carries BOTH accounts' `quantum-qpu-killswitch`
  Lambda subscriptions.

## Task 8 (live half) — 2026-08-28

- 9 native users created in the QL-Prod pool (`admin-create-user
  --message-action SUPPRESS`, email_verified=true, no password) — status
  FORCE_CHANGE_PASSWORD; first sign-in goes through the reset flow. subMap
  (9 old->new pairs) and emailBySub (5 federated) built by email join; both
  live OUTSIDE the repo (scratchpad) — never committed.
- Remap executed by the founder (classifier-gated): wrote 12 rows, staged 1
  federated progress row as PENDING#<hash>, left 5 rows behind DELIBERATELY.
- Ruling: the 5 unmapped rows all belong to one sub with no pool user — the
  deleted Gate-D verification identity from the Braket split (idempotency keys
  `gate-d-verify-2026-08-2*`, capMicros 0, one ~$0.30 verification run). Test
  debris, not learner data; not migrated. The teardown plan may clean the
  source copies.
- Step 5 verification (`--verify` + get-item): the grandfathered ledger row
  arrived intact under its NEW pk — capMicros source=2500000 dest=2500000,
  spentMicros 1335000=1335000, completedRuns 3, completedShots 300. The two
  verify MISMATCH lines are the left-behind debris sub (no dest row), expected
  under the ruling above.
- `quantum-stripe-wallet`: emptiness imported (scan Count 0 at both ends).
- `quantum-analytics-daily`: NOT copied yet — the analytics stack (and its
  dest table) deploys at cutover with the new Amplify app id; the verbatim
  copy rides Task 12's re-run.
- Cutover reminder (standing): re-run remap FIRST with a fresh subMap, fold
  PENDING after, never interleaved.

## Task 10 — 2026-08-28

- OIDC drift role deployed to QL-Prod: `quantum-ci-drift-role` (params verbatim
  from source). Repo variable `AWS_DRIFT_ROLE_ARN` now points at the QL-Prod
  role — nightly drift watches the NEW account from tonight.
- Local drift vs git: 10/11 MATCH. The one `??` is `quantum-analytics`,
  which deploys at Task 11 Step 7 (needs the new Amplify app id) — expected,
  not drift.
- `quantum-ci-standby` NOT migrated (audit's fork-PR webhook risk); deferred to
  the teardown pass for keep/fix/kill.

## Task 11 (in progress) — 2026-08-28

- Step 1 SITE: PASS. `main.d2o7mzaq4cktxf.amplifyapp.com` 200; the foundations
  lesson page is BYTE-IDENTICAL to live production (91,165 bytes both). CI's
  katex greps are artifact-level (web/out) and do not reproduce over HTTP
  against EITHER deployment — control-checked against quantum.altivum.ai.
- Step 4 TUTOR: PASS. One real question through the new edge
  (`ddbde0ibe8yux.cloudfront.net`) streamed a correct Hadamard answer.
  FOUND+FIXED: the tutor function's CloudFront-OAC resource policy
  (AllowCloudFrontOACInvokeUrl/Invoke, pinned to the distribution ARN) is
  added OUT-OF-BAND in the source account — no template carries it. Replicated
  onto the new function via `lambda add-permission`; until then the edge
  returned the Function URL's Forbidden.
- Step 5 (probe half): PASS. `GET /qpu/budget` via the new edge answers 401
  Unauthorized (the authorizer, not a 5xx/edge error) — wiring proven; the
  authenticated 1-shot run remains founder-gated.
- Step 7 ANALYTICS: PASS. `quantum-analytics` deployed (AmplifyAppId=new app,
  AmplifyDomain=quantumlearner.dev), invoked once: clean run, wrote the
  2026-08-28 row (zero counts — access-log delivery lag, mechanism proven).
  Drift is now 11/11.
- Step 6 prep: SANDBOX webhook rotated onto the QL-Prod endpoint with
  `rotate-webhook-endpoint.mjs` (9 events, pinned 2026-06-24.dahlia, signing
  secret stored, function recycled, signed probe HTTP 200). Parity: 9/9 on
  every enabled endpoint + catalog matches. NOTE: the OLD sandbox endpoint
  (Altivum-stack URL) remains enabled — retire at cutover with its live twin.
  `op` gotcha: two 1Password accounts on this machine now — every `op read`
  needs OP_ACCOUNT or --account, and an account-less `op read` can exit 0 with
  EMPTY stdout inside command substitution.
- Step 6 STRIPE SANDBOX: PASS 6/6 (grant, renewal+garnish, absolute-target
  refund, dispute withdraw/win, proration, replay-idempotency) — real webhook
  deliveries to the QL-Prod endpoint, rows asserted in
  quantum-stripe-sandbox-wallet, sandbox objects cleaned up.

## Task 9 — 2026-08-28 (founder-approved)

- LIVE webhook endpoint created on the QL-Prod stack URL via
  `rotate-webhook-endpoint.mjs --confirm-live`: 9/9 events, api_version pinned
  2026-06-24.dahlia, signing secret stored into QL-Prod `quantum-stripe`
  (replacing PENDING-TASK-9, never printed), function recycled, signed probe
  HTTP 200 against the deployed handler.
- The OLD live endpoint (Altivum-stack URL) is UNTOUCHED and enabled, per plan
  — retire at Task 12 Step 5.
- Parity gate PASS: both enabled live endpoints 9/9 + pinned; catalog matches
  CATALOG and pricing.ts.

## Pool hygiene — 2026-08-30 (founder-directed)

- The three internal `@altivum.ai` accounts DELETED from BOTH pools
  (`admin-delete-user` x6, verified by re-listing). None had wallet rows.
- Ruling (founder, "delete anyway", offered explicitly): the grandfathered QPU
  allowance ledger rows — capMicros 2500000, spentMicros 1335000, 3 runs /
  300 shots, plus the CRED# row — are now ORPHANED in both accounts; their
  owning sub no longer exists in either pool. Remap to a new sub if that
  allowance is ever wanted again. Two of the three accounts' progress rows are
  likewise orphaned. Pools after: QL-Prod 7 users; source 11 identities.

## Cutover (Task 12 Steps 2–4) — 2026-08-30 (founder-ordered)

- Trigger: a NEW Google-federated signup landed in the SOURCE pool at
  2026-08-30 17:27 CDT — the site still resolved to the old host, and every
  uncut hour widened the Task 8 delta. Founder ordered the flip ahead of
  Task 11 completion (Steps 2, 3, and the Step 5 paid run remain outstanding
  as post-flip verification on the real domain).
- Root cause of Task 7's FAILED domain association, finally identified: the
  `quantumlearner-dev-redirect` CloudFront distribution (Altivum, us-east-1,
  `E365VD5CYQX9FM`) still HELD the `quantumlearner.dev` + `www` aliases.
  CloudFront aliases are globally exclusive across ALL accounts, so Amplify's
  distribution could never claim them — and the HQ-zone apex/www ALIASes still
  pointed at that redirect distribution. Amplify's own statusReason only ever
  says "couldn't find the correct CNAME records," which is why this hid.
- Alias release (founder-run, classifier-gated): the redirect distribution
  updated to zero aliases + default viewer cert. It remains deployed and
  alias-free, still 301ing its bare cloudfront.net name to quantum.altivum.ai
  (harmless chain) — teardown candidate, stack `quantumlearner-dev-redirect`.
- Step 2 executed: FAILED association deleted, recreated (apex + www → main) —
  new target `d1knpu13p4obxn.cloudfront.net`; the ACM validation CNAME already
  in the HQ zone matched verbatim and re-verified. Apex + www A/AAAA ALIASes
  UPSERTed in the HQ zone (CloudFront hosted-zone id `Z2FDTNDATAQYW2`).
  Association AVAILABLE ~10 min later. MX/TXT/DKIM untouched.
- Step 3 verified: apex and www answer 200 over HTTPS with the new build
  (title check); Cognito client callbacks (`https://quantumlearner.dev/auth/callback`)
  and the Google IdP were already in place from Task 4 — confirmed, not added.
- Step 4 executed by a SIMPLER mechanism than planned: instead of deploying
  `infra/redirect/quantum-altivum-ai.yaml`, the OLD Amplify app's custom rules
  were REPLACED with the single rule `/<*> → https://quantumlearner.dev/<*>`
  301 (path-preserving; the app's only custom domain is `quantum.altivum.ai` —
  the `altivum.ai` apex is a different property and untouched). Ruling: the
  planned redirect stack is unnecessary; its template ships dark. Gotcha:
  Amplify's edge caches pin `index.html` via long s-maxage, so the rule alone
  left `/` serving 200 while deep paths 301'd — a RELEASE job (226, founder-run)
  was required to invalidate. After it: root, deep paths, and the amplifyapp
  default domain all 301. Rollback record — the rules this replaced (they lived
  only in Amplify): six `/learn/0N-*` → `/learn/0(N+1)-*` 301s (foundations,
  hardware, algorithms, quantum-ml, quantum-chemistry, hybrid-jobs) plus the
  SPA rewrite `/<*> → /index.html` 404-200.
- New-signup migration (runbook finding M5's pre-provision path, first use):
  the 2026-08-30 signup was created in the QL-Prod pool (`admin-create-user
  --message-action SUPPRESS`, email_verified=true) and the Google identity
  linked via `admin-link-provider-for-user` (Cognito_Subject from the source
  identities blob) BEFORE any first sign-in against the new pool; their single
  progress row (a locale pref — no wallet/ledger/task rows) copied under the
  new sub and verified by get-item. The remaining 4 federated users stay JIT +
  PENDING-fold per Task 8. As with Task 8, no emails or subs in this log.
- Sequencing deviation, on the record: the flip PRECEDED Task 12 Step 1's
  fresh-delta remap re-run. Acceptable because the source site is now
  unreachable so the tables can no longer accrue learner writes — modulo an
  already-open legacy tab with an unexpired session token, which the Step 1
  re-run (still owed, BEFORE any PENDING fold) will sweep.
- Still OUTSTANDING from Task 12: Step 1 (fresh remap re-run + the
  analytics-daily verbatim copy), Step 5 (confirm a live delivery on the new
  Stripe endpoint, then DISABLE the old one), Step 6 (drop the amplifyapp
  callback/logout URLs from the new pool client). Task 13 not started.

## Platform-subdomain migration: learner.quantumenv.dev — 2026-08-31 (founder-ordered)

Executed jointly with the quantum-env session (runbook:
`docs/platform-subdomain-migration.md` in the quantum-env repo). Founder
green-lit the spike, then the full sequence, in this session.

- **Spike proved the cross-account association pattern**: a throwaway
  `test.quantumenv.dev` association on the QL-Prod Amplify app, ACM validation
  + CNAME written into the quantumenv.dev zone (ql-hq account) by the env
  session, AVAILABLE with valid TLS in ~11 min, torn down after joint verify.
- **The flip**: `learner.quantumenv.dev` associated and verified; Cognito app
  client gained the new callback/logout URLs BEFORE the content flip
  (allowlists-first); PR #255 moved SITE_URL/auth fallback/og card/changelog;
  `quantumlearner.dev` + www now 301 (302 during a >1h soak, then hardened,
  RELEASE jobs 8/9 flushing the edge pin each time). Full legacy chain
  `quantum.altivum.ai` → `quantumlearner.dev` → `learner.quantumenv.dev`
  terminates 200 in 2 hops. The quantumlearner.dev ZONE keeps its email/MX
  role untouched (four AWS account root addresses ride on it).
- **Google sign-in was found broken and fixed — a LATENT pool-cutover gap,
  not a subdomain issue**: the Google OAuth client had never been given the
  NEW pool's hosted domain (`quantumlearner` vs legacy `quantum-altivum`), so
  every federated sign-in on QL-Prod failed with redirect_uri_mismatch since
  the 2026-08-30 cutover — first exercised today (Task 11 Step 3, now DONE:
  real founder sign-in succeeded). Fix also completed a divestment: a NEW
  OAuth client under a Delta Centric-owned Google project (secret in the
  Delta Centric 1Password vault, item "Google OAuth") replaced the
  Altivum-project client; the Cognito IdP flip preserves all links (Google's
  sub is account-scoped, not client-scoped). The Altivum "Logic" project is
  out of the auth path.
- **Backend CORS was a missed origin-flip surface**: SIX deployed stacks
  allowlisted the old origin — sync, qpu, review-email, both stripe (checkout
  return URLs ride the same parameter), tutor (still on quantum.altivum.ai —
  two domains behind, tutor browser path dead since the FIRST cutover).
  **CORRECTED 2026-08-31 (an earlier revision of this entry blamed
  source drift; that was wrong):** the repo templates are correct and always
  were — all three say `AllowOrigins: [!Ref SiteOrigin, http://localhost:3000]`.
  The real mechanism is that **SAM resolves that `Ref` into the generated
  OpenAPI `x-amazon-apigateway-cors` body at BUILD time**, so the literal is
  baked into the template CloudFormation stores. `SiteOrigin` is therefore a
  BUILD-time input, not a live stack parameter: an `update-stack` that changes
  only the parameter reports "No updates are to be performed" and changes
  nothing. There is no repo-vs-source drift and nothing to reconcile.
  - The correct fix is `sam deploy --parameter-overrides SiteOrigin=<origin>`
    from source. What was actually done in the moment — swapping the literal
    in the stored template body and re-deploying it (qpu via S3, >51KB) — is
    equivalent in effect but is NOT the recommended procedure.
  - The durable landmine this exposed, now fixed: the deploy READMEs for
    sync/qpu **omitted `SiteOrigin` entirely**, and every template's default
    was still `https://quantum.altivum.ai`. A by-the-book `sam deploy` would
    have silently restored a two-domains-dead origin and re-broken the site.
    All six templates' defaults now name the canonical origin and each deploy
    doc states the build-time caveat.
  - All endpoints verified answering
    `access-control-allow-origin: https://learner.quantumenv.dev`.
- **Analytics was reporting a flat zero, and had been since the QL-Prod
  cutover** (found 2026-08-31 while checking the hostname-move impact; the
  table shows `humans: 0` for every day). Cause: `SITE_HOST` was a hardcoded
  source constant reading `quantum.altivum.ai` — a hostname the QL-Prod app
  has never served — and the row filter drops every non-matching host, so the
  run recorded 0 and SUCCEEDED. The stack's alarms only fire on errors, so
  nothing ever flagged it. Now a `SiteHost` parameter wired to a `SITE_HOST`
  env var (defaulted to the canonical host, asserted by template.test.mjs),
  `AmplifyDomain` moved to the `quantumenv.dev` association and `AmplifyAppId`
  off the legacy app id. Deployed and invoked: the association resolves (no
  NotFoundException). Historical zeros stay zero — those days' traffic lived
  on associations this job no longer reads; real counts resume with the
  2026-08-31 run.
- Outstanding from this wave: founder console work — GSC/Bing property for
  the new domain; analytics host filtering may undercount the new hostname
  (accuracy, not breakage); reconcile the hardcoded-CORS template drift.
