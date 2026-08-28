# Platform Migration to QL-Prod Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Quantum Learner platform runs wholly in QL-Prod, serving at `https://quantumlearner.dev` as its canonical domain, with every learner and their data carried across and the Altivum source untouched until a separate teardown decision.

**Architecture:** Blue-green. Build the complete stack in QL-Prod (new Cognito pool, six app stacks + two edges, Amplify app, migrated data with old-sub → new-sub remap), verify everything DNS-independently, then a minutes-long founder-gated cutover: HQ-zone ALIASes flip to the new app, `quantum.altivum.ai` becomes a 301. Rollback before the redirect flip is one ALIAS repoint.

**Tech Stack:** AWS SAM + CloudFormation, Cognito (+Google IdP), Amplify, CloudFront/WAF, DynamoDB, SES, Stripe API, Node 22 operator scripts (`node --test`, DI, `--expect-account` guards on the `scripts/founding-credit` pattern).

**Spec:** `docs/superpowers/specs/2026-08-28-platform-migration-qlprod-design.md` (and its evidence file `2026-08-28-phase2-runbook-audit.md`)

## Global Constraints

- **No AWS account numbers in the repo, ever.** Names + run-time resolution. The repo is public.
- **Profiles:** `ql-prod` (destination, us-east-2), `ql-hq` (DNS), `ql-braket` (Braket account), `org-admin` (management). The DEFAULT profile is the Altivum SOURCE — read-only in this plan except where a step explicitly says otherwise. **Step zero removes the retired `quantum-learner` profile.**
- **Founder gates** (stop and ask, every time): any Google/Amplify console step, the Stripe live-account webhook creation, the ≤$0.35 QPU verification run, and the cutover itself.
- The four QPU cross-account parameters (`BraketRoleArn`, `BraketExternalId`, `BraketSpendTopicArn`, `ResultsBucket`) move TOGETHER on every deploy; `BraketExternalId` comes from 1Password (*Quantum Learner / Braket ExternalId*), never the repo.
- Every `sam deploy` re-passes the FULL parameter set read from the source stack first (the Braket-split lesson); source values are recorded in the workspace before any deploy.
- Copy honesty (rule 13): nothing may claim the migration before cutover makes it true; the canonical-flip PR carries its own changelog entry in both locales.
- All operator scripts follow `scripts/founding-credit/`: DI cores, `node --test` offline, `--expect-account`-style refusal guards, zero npm dependencies.
- Work on branch `feat/phase2-migration` (exists; spec committed at `2c134f0`).

---

### Task 1: Disarm the wrong-org footgun, file the async requests, snapshot the source

**Files:**
- Create: `scripts/migration/README.md` (the operator log for this migration — records source parameter snapshots, ids by name, and each gate's outcome)

**Interfaces:**
- Produces: `~/.aws/config` without the `quantum-learner` profile; an SES production-access request pending in QL-Prod; `scripts/migration/README.md` holding the source snapshot every later task reads.

- [ ] **Step 1: Remove the retired profile (the audit's #1 danger)**

```bash
python3 - <<'PY'
import re, pathlib
p = pathlib.Path.home()/'.aws'/'config'
s = p.read_text()
out = re.sub(r'\[profile quantum-learner\][^\[]*', '', s)
p.write_text(out)
print('quantum-learner profile removed' if out != s else 'was already absent')
PY
aws sts get-caller-identity --profile quantum-learner 2>&1 | grep -q "could not be found" && echo OK
```

Expected: `OK`. (`altivum-mgmt` stays — it is the legitimate Altivum-org profile.)

- [ ] **Step 2: Request SES production access in QL-Prod (async — do it FIRST)**

New accounts are SES-sandboxed: mail only to verified recipients. `quantum-review-email` needs real sending. This request takes up to 24h, so it front-runs everything:

```bash
aws sesv2 put-account-details --profile ql-prod --region us-east-2 \
  --production-access-enabled \
  --mail-type TRANSACTIONAL \
  --website-url https://quantumlearner.dev \
  --use-case-description "Transactional review-reminder emails to opted-in learners of Quantum Learner (quantumlearner.dev), a quantum-computing education platform. Low volume (single-digit daily sends today), explicit opt-in with one-click unsubscribe." \
  --additional-contact-email-addresses hq@quantumlearner.dev \
  --contact-language EN
```

If the API path is rejected in this region, note it in the README and file via the SES console (founder gate). Sandbox does NOT block the rest of the plan — Task 5 verifies the two current prefs recipients individually as a bridge.

- [ ] **Step 3: Snapshot every source stack's parameters and the NoEcho values**

```bash
mkdir -p scripts/migration
for S in quantum-workspace-auth quantum-workspace-sync quantum-tutor quantum-qpu-submit \
         quantum-stripe quantum-stripe-sandbox quantum-review-email quantum-analytics; do
  echo "== $S"; aws cloudformation describe-stacks --region us-east-2 --stack-name $S \
    --query 'Stacks[0].Parameters' --output json
done
# NoEcho params are unreadable from CFN but live in the Lambda env:
aws lambda list-functions --region us-east-2 \
  --query "Functions[?starts_with(FunctionName,'quantum-review')].FunctionName" --output text
# then get-function-configuration on the sender fn: Environment.Variables.UNSUB_SECRET
```

Record all of it (secrets referenced by *where they live*, never by value) in `scripts/migration/README.md`, plus: the two edge stacks' parameters (us-east-1), the Amplify env-var table from the spec facts, and the source table row counts as of today.

- [ ] **Step 4: Commit**

```bash
git add scripts/migration/README.md
git commit -m "docs(migration): operator log — source snapshot, gates, ids by name"
```

---

### Task 2: The canonical-flip web PR (code only; ships dark until cutover)

**Files:**
- Modify: `web/src/lib/site.ts:3` (SITE_URL)
- Modify: `web/src/app/sitemap.ts`, `web/src/app/robots.ts` (if URLs are literal — verify), every metadata/OG export that renders the origin, `web/src/app/privacy/*` rendered origin, any i18n string matching `quantum\.altivum\.ai`
- Modify: `web/src/lib/changelog.ts` + `web/src/lib/changelog-es.ts` (the announcement)
- Create: `infra/redirect/quantum-altivum-ai.yaml` (the INVERSE redirect: `quantum.altivum.ai` → `https://quantumlearner.dev`)
- Test: the existing metadata/site suites (they pin SITE_URL), `web/__tests__/` full run

**Interfaces:**
- Consumes: nothing.
- Produces: `SITE_URL = "https://quantumlearner.dev"`; the redirect template Task 11 deploys; a changelog entry id `2026-08-29-canonical-domain` (both locales).

- [ ] **Step 1: Find every rendered occurrence first**

```bash
grep -rn "quantum\.altivum\.ai" web/src lambda/*/template.yaml infra --include='*.ts' --include='*.tsx' --include='*.yaml' | grep -v node_modules
```

Every hit is either (a) flipped in this task (web/src), (b) a stack parameter handled at deploy time (templates — leave the defaults, the deploys pass explicit values), or (c) the old redirect stack (leave; retired at teardown). Record the triage in the commit message.

- [ ] **Step 2: Flip `site.ts` and fix its comment**

```ts
export const SITE_URL = "https://quantumlearner.dev";
```

The comment below it currently explains that `quantumlearner.dev` 301-redirects *here* — invert it: `quantum.altivum.ai` now 301-redirects to this canonical origin.

- [ ] **Step 3: Run the web suite; fix every test that pinned the old origin**

Run: `cd web && npx jest`
Expected: failures ONLY in suites that pin `SITE_URL`/metadata origins. Update those assertions to the new canonical URL — the tests are the guard, so they must assert the new truth, not be loosened.

- [ ] **Step 4: The changelog entry, both locales**

`web/src/lib/changelog.ts` (top of `CHANGELOG`):

```ts
{
  id: "2026-08-29-canonical-domain",
  shipped: "2026-08-29",
  kind: "improved",
  title: "Quantum Learner lives at quantumlearner.dev now",
  body: "The site's home address is now quantumlearner.dev. The old address, quantum.altivum.ai, forwards here automatically, and every bookmark and shared link keeps working. If you signed in with an email and password you will be asked to reset your password once; Google sign-in is unchanged.",
  href: "/",
},
```

`web/src/lib/changelog-es.ts`:

```ts
"2026-08-29-canonical-domain": {
  title: "Quantum Learner ahora vive en quantumlearner.dev",
  body: "La direccion del sitio ahora es quantumlearner.dev. La direccion anterior, quantum.altivum.ai, redirige aqui automaticamente, y todos los marcadores y enlaces compartidos siguen funcionando. Si iniciabas sesion con correo y contrasena, se te pedira restablecer la contrasena una vez; el inicio de sesion con Google no cambia.",
},
```

(`shipped: 2026-08-29` is the intended cutover date; Task 13 corrects it if cutover lands on a different day — the field means visible-in-production, and this PR merges before the flip.)

- [ ] **Step 5: The inverse-redirect template**

`infra/redirect/quantum-altivum-ai.yaml`: copy `infra/redirect/quantumlearner-dev.yaml`'s structure verbatim and invert it — `RedirectTarget` default `https://quantumlearner.dev/`, the served hostnames `quantum.altivum.ai` only (no `www` — none exists, verified in the runbook audit §10), cert DNS-validated, deployed us-east-1 in QL-Prod. Keep the fail-loud canary + alarms pattern. `AlertEmail` default `hq@quantumlearner.dev`.

- [ ] **Step 6: Validate, guard, commit**

```bash
aws cloudformation validate-template --profile ql-prod --region us-east-1 \
  --template-body file://infra/redirect/quantum-altivum-ai.yaml --query Description --output text
cd web && npx jest && cd ..
git -c core.quotePath=false diff --name-only main...HEAD | node scripts/changelog/check.mjs
git add web/src infra/redirect/quantum-altivum-ai.yaml web/__tests__
git commit -m "feat(web): quantumlearner.dev becomes the canonical origin, announced in both locales"
```

Expected: template validates; full Jest green; changelog guard PASS.

---

### Task 3: The Braket account admits a second platform

**Files:**
- Modify: `infra/braket-workloads/budget.yaml` (`PlatformAccountId: String` → `PlatformAccountIds: CommaDelimitedList`; the topic-policy `Principal.AWS` becomes the list mapped to root ARNs)
- Modify: `infra/braket-workloads/README.md` (parameter rename, why)

**Interfaces:**
- Consumes: nothing.
- Produces: `quantum-braket-spend` accepting BOTH the Altivum and QL-Prod accounts as subscribers; `quantum-braket-workloads`'s `PlatformRoleArns` ready to take four ARNs in Task 6.

- [ ] **Step 1: Edit the template**

In `infra/braket-workloads/budget.yaml`, replace the `PlatformAccountId` parameter and its use:

```yaml
  PlatformAccountIds:
    Type: CommaDelimitedList
    Description: >
      Account ids whose kill-switch Lambdas may subscribe to the spend topic.
      Two during the blue-green platform migration (Altivum source + QL-Prod);
      back to one after teardown. Passed at deploy; never committed.
```

and in `SpendTopicPolicy`'s subscribe statement:

```yaml
          - Sid: PlatformKillSwitchSubscribe
            Effect: Allow
            Principal:
              AWS: !Split
                - ","
                - !Sub
                  - "arn:aws:iam::${inner}:root"
                  - inner: !Join ["_:root,arn:aws:iam::_", !Ref PlatformAccountIds]
```

CloudFormation cannot map over a list cleanly — if the `!Join`/`!Split` contortion above fails validation, use the plainly-supported form instead: keep `Type: CommaDelimitedList` and set `Principal: { AWS: !Ref PlatformAccountIds }` with the caller passing FULL root ARNs (`arn:aws:iam::<id>:root,arn:aws:iam::<id>:root`) — rename the parameter `PlatformPrincipalArns` in that case, and record which form shipped. Whichever compiles, the README documents the passed shape.

- [ ] **Step 2: Validate against the real region**

Run: `aws cloudformation validate-template --profile org-admin --region us-east-2 --template-body file://infra/braket-workloads/budget.yaml --query Parameters[].ParameterKey --output text`
Expected: the new parameter name, no error.

- [ ] **Step 3: Redeploy the spend stack with both principals** *(founder gate — Braket account mutation)*

```bash
SRC=$(aws sts get-caller-identity --query Account --output text)                 # Altivum
DST=$(aws organizations list-accounts --profile org-admin \
      --query "Accounts[?Name=='QL-Prod'].Id" --output text)
aws cloudformation deploy --profile ql-braket --region us-east-2 \
  --stack-name quantum-braket-spend \
  --template-file infra/braket-workloads/budget.yaml \
  --parameter-overrides "PlatformPrincipalArns=arn:aws:iam::${SRC}:root,arn:aws:iam::${DST}:root"
```

(Adjust the parameter name to whichever form Step 1 shipped.) Verify: `aws sns get-topic-attributes --profile ql-braket --region us-east-2 --topic-arn <SpendTopicArn> --query 'Attributes.Policy'` shows both principals.

- [ ] **Step 4: Commit**

```bash
git add infra/braket-workloads/
git commit -m "feat(braket): the spend topic admits both platforms during the blue-green window"
```

---

### Task 4: The new identity — Cognito pool in QL-Prod

**Files:** none in the repo (deploy of `infra/workspace/cognito.yaml` as-is). Operator log updated.

**Interfaces:**
- Consumes: the Google client id (source snapshot, Task 1); the Google client SECRET (founder-provided at the prompt — it exists only in the founder's private notes).
- Produces: pool id, client id, and hosted domain `quantumlearner.auth.us-east-2.amazoncognito.com` — consumed by Tasks 5–8 and the Amplify env.

- [ ] **Step 1: Deploy** *(founder gate — the GoogleClientSecret is typed by the founder, never stored)*

```bash
aws cloudformation deploy --profile ql-prod --region us-east-2 \
  --stack-name quantum-workspace-auth \
  --template-file infra/workspace/cognito.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    "GoogleClientId=<from Task 1 snapshot>" \
    "GoogleClientSecret=<founder pastes>" \
    "DomainPrefix=quantumlearner" \
    "SiteUrl=https://quantumlearner.dev" \
    "AlertEmail=hq@quantumlearner.dev"
```

`DomainPrefix` MUST differ from the source's `quantum-altivum` (Cognito prefixes are region-unique and the source keeps its own until teardown). `AlertEmail` moves to `hq@` per CLAUDE.md's deploy-time rule; its SNS confirmation must be clicked once. `INTERNAL_DOMAIN` stays `altivum.ai` (CLAUDE.md: decide when the signup alert actually deploys).

- [ ] **Step 2: Google console** *(founder gate — console-only per CLAUDE.md)*

Add to the OAuth client's **Authorized redirect URIs**:
`https://quantumlearner.auth.us-east-2.amazoncognito.com/oauth2/idpresponse`
(The old pool's URI stays until teardown.)

- [ ] **Step 3: Temporary pre-flip callback**

Until DNS flips, login testing happens on the Amplify default domain. After Task 7 exists, append its callback (this step executes then; recorded here because it belongs to auth):

```bash
aws cognito-idp update-user-pool-client --profile ql-prod --region us-east-2 \
  --user-pool-id <NEW_POOL> --client-id <NEW_CLIENT> \
  --callback-urls "https://quantumlearner.dev/auth/callback" "https://main.<amplify-id>.amplifyapp.com/auth/callback" \
  --logout-urls "https://quantumlearner.dev/" "https://main.<amplify-id>.amplifyapp.com/" \
  --supported-identity-providers COGNITO Google \
  --allowed-o-auth-flows code --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client
```

(Read the client's full config first with `describe-user-pool-client` and re-pass every field — update-user-pool-client REPLACES unspecified settings with defaults, the same full-set trap as `sam deploy`.) The temporary URLs are REMOVED at cutover (Task 12).

- [ ] **Step 4: Record pool id, client id, domain in the operator log; commit the log.**

---

### Task 5: App stacks wave 1 — sync, review-email, stripe (+sandbox)

**Files:** none in the repo (deploys). Operator log updated.

**Interfaces:**
- Consumes: Task 4's pool/client ids; source parameter snapshot; secrets re-created here.
- Produces: new API URLs for `NEXT_PUBLIC_SYNC_URL` / `NEXT_PUBLIC_REVIEW_PREFS_URL`; the QL-Prod `quantum-stripe` secret (live key + placeholder webhook secret until Task 9).

- [ ] **Step 1: Secrets first** *(founder gate — live Stripe key handled via op, never echoed)*

```bash
# Stripe: same live secret key, webhook secret is a placeholder until Task 9 mints the real one.
aws secretsmanager create-secret --profile ql-prod --region us-east-2 \
  --name quantum-stripe \
  --secret-string "$(op read 'op://Quantum Learner/Stripe/add more/Secret Key' | python3 -c 'import json,sys;print(json.dumps({"secretKey":sys.stdin.read().strip(),"webhookSecret":"PENDING-TASK-9"}))')"
```

The command substitutes inside the shell so the key never appears in argv history beyond this invocation; do not add `--description` text naming the account.

- [ ] **Step 2: SES identity for the new sender**

The sender moves off `reviews@altivum.ai` (whose SES identity lives in the source account) to **`reviews@quantumlearner.dev`** — mail from the domain the product now owns, with DKIM in the HQ zone this org controls:

```bash
aws sesv2 create-email-identity --profile ql-prod --region us-east-2 --email-identity quantumlearner.dev
# Emits 3 DKIM CNAME tokens; add each to the HQ zone:
aws route53 change-resource-record-sets --profile ql-hq --hosted-zone-id Z1001194KW3SBPXAEUGV \
  --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{"Name":"<token>._domainkey.quantumlearner.dev.","Type":"CNAME","TTL":300,"ResourceRecords":[{"Value":"<token>.dkim.amazonses.com"}]}}]}'
# Repeat for all three tokens; then wait for VERIFIED:
aws sesv2 get-email-identity --profile ql-prod --region us-east-2 --email-identity quantumlearner.dev --query 'VerifiedForSendingStatus'
```

While SES production access (Task 1) is pending, also verify the two prefs-table recipient addresses individually (`create-email-identity` per address) so review mail keeps flowing in sandbox.

- [ ] **Step 3: Deploy the three stacks** — each `cd lambda/<name> && sam build && sam deploy --profile ql-prod` with the FULL source parameter set, changing only: `UserPoolId`/`UserPoolClientId` → Task 4's, `SiteOrigin`/`SiteUrl` → `https://quantumlearner.dev`, `AlertEmail` → `hq@quantumlearner.dev`, review-email `FromAddress=reviews@quantumlearner.dev`, review-email `UnsubSecret` → the value read from the source Lambda env in Task 1 (existing unsubscribe links keep working). Sandbox stripe stack deploys with its snapshot values unchanged.

- [ ] **Step 4: Verify each** — `curl` the sync and prefs APIs unauthenticated (expect 401, not 5xx); `node --test` already ran in CI; confirm the three SNS email confirmations at `hq@` are clicked (`list-subscriptions-by-topic` shows no `PendingConfirmation`). Record new API URLs in the operator log; commit the log.

---

### Task 6: App stacks wave 2 — tutor + edge, qpu + edge, Braket trust completion

**Files:** none in the repo (deploys). Operator log updated.

**Interfaces:**
- Consumes: Task 4 ids; 1Password ExternalId; the Braket stack outputs (role ARN, bucket, topic ARN — unchanged from the Braket split).
- Produces: new CloudFront URLs for `NEXT_PUBLIC_TUTOR_URL` / `NEXT_PUBLIC_QPU_URL`; QL-Prod function roles trusted by the Braket account.

- [ ] **Step 1: Tutor.** Deploy `lambda/tutor` with the source posture verbatim (UserPoolId/ClientId EMPTY = free unmetered, `SecretId=quantum-tutor`, `AllowedOrigin=https://quantumlearner.dev`). Check whether the source account HAS a `quantum-tutor` secret (`aws secretsmanager describe-secret --secret-id quantum-tutor` under the default profile): if yes, re-create it in QL-Prod from the same source-of-truth key (founder gate, op-read — never copy a secret value through the transcript); if no (CLAUDE.md records it as an open item), deploy without it and record that the tutor's runtime posture is unchanged-broken-equally in both accounts. Then deploy `lambda/tutor/edge.yaml` (us-east-1, `--profile ql-prod`) pointing at the new function URL; record the new CloudFront domain.

- [ ] **Step 2: QPU.** Deploy `lambda/qpu` with the source parameter set PLUS the four cross-account values exactly as live today: `BraketRoleArn=arn:aws:iam::<braket>:role/QuantumLearnerBraketExecution`, `BraketExternalId=$(op read 'op://Quantum Learner/Braket ExternalId/credential')`, `BraketSpendTopicArn=<from braket-spend outputs>`, `ResultsBucket=amazon-braket-ql-results-<braket-acct>`; `SiteOrigin=https://quantumlearner.dev`; `AlertEmail=hq@quantumlearner.dev`. Then `lambda/qpu/edge.yaml` (us-east-1). Verify the killswitch's cross-account SNS subscription materialized (Task 3 authorized it).

- [ ] **Step 3: Deploy-then-trust.** Read the two NEW function role ARNs (`aws lambda get-function-configuration --profile ql-prod ... --query Role` for submit + reconcile) and redeploy `quantum-braket-workloads` (`--profile ql-braket`, eu-north-1) with `PlatformRoleArns` = **all four** (two Altivum + two QL-Prod), `ExternalId` unchanged. Verify with a read-only `sts assume-role` denial test from `org-admin` (must still be denied) and by the Task 11 live run.

- [ ] **Step 4: Record all URLs/ARNs in the operator log; commit the log.**

---

### Task 7: Amplify in QL-Prod

**Files:** none in the repo. Operator log updated.

**Interfaces:**
- Consumes: every `NEXT_PUBLIC_*` value produced by Tasks 4–6.
- Produces: the app id, the `main.<id>.amplifyapp.com` domain (pre-flip test origin), and the custom-domain target for Task 12's ALIAS flip.

- [ ] **Step 1: Create the app** *(founder gate — the GitHub authorization is a console step)*: Amplify console in QL-Prod → new app → GitHub → `AltivumInc-Admin/quantum-computing`, branch `main`. The repo's `amplify.yml` drives the build.

- [ ] **Step 2: Environment variables** — the full table, new values:

```
NEXT_PUBLIC_AWS_REGION            us-east-2
NEXT_PUBLIC_COGNITO_USER_POOL_ID  <Task 4 pool>
NEXT_PUBLIC_COGNITO_CLIENT_ID     <Task 4 client>
NEXT_PUBLIC_COGNITO_DOMAIN        quantumlearner.auth.us-east-2.amazoncognito.com
NEXT_PUBLIC_SYNC_URL              <Task 5>
NEXT_PUBLIC_REVIEW_PREFS_URL      <Task 5>
NEXT_PUBLIC_TUTOR_URL             <Task 6 tutor CloudFront>
NEXT_PUBLIC_QPU_URL               <Task 6 qpu CloudFront>
```

No `NEXT_PUBLIC_BILLING_URL` — the storefront stays closed (rule 15).

- [ ] **Step 3: Build `main`; attach the custom domain.** Add `quantumlearner.dev` (+ `www`) as the app's custom domain. Amplify emits cert-validation CNAMEs — add them to the HQ zone (`ql-hq`, same UPSERT shape as Task 5's DKIM records). **Do NOT let Amplify manage the zone; records are added manually so nothing touches apex/www ALIASes yet.** Wait for the domain status AVAILABLE and the cert ISSUED — the HSTS-preload constraint from the spec means DNS never flips before this.

- [ ] **Step 4: Complete Task 4 Step 3** (the temporary amplifyapp callback URLs) now that the id exists. Record everything; commit the log.

---

### Task 8: The people and their data

**Files:**
- Create: `scripts/migration/remap-subs.mjs` (DI core + CLI, on the founding-credit pattern)
- Create: `scripts/migration/remap-subs.test.mjs`
- Modify: `.github/workflows/ci.yml` — add `node --test scripts/migration/*.test.mjs` beside the founding-credit step (same rationale comment: money-adjacent operator script, zero deps)

**Interfaces:**
- Consumes: source table exports; Task 4's pool.
- Produces: 9 native users in the new pool; the ~19 rows rewritten under new subs in the QL-Prod tables; `PENDING#<sha256(email)>` staging rows for any federated-owned data.

- [ ] **Step 1: Write the failing tests** — `scripts/migration/remap-subs.test.mjs`, `node --test`, stubbed DynamoDB per founding-credit's idiom. Cover at minimum:

```js
test("rewrites WALLET#/USER#/CRED# pks through the map and preserves every attribute", ...);
test("sync rows rewrite the bare userId key", ...);
test("a row whose sub is NOT in the map goes to PENDING#<emailHash> when email is known, else to the unmapped report", ...);
test("refuses to run when --expect-source-account or --expect-dest-account mismatches", ...);
test("DAY#/KILL/EVENT#/aggregate rows pass through unchanged", ...);
test("the founder's grandfathered capMicros row survives byte-identical apart from its pk", ...);
```

- [ ] **Step 2: Run to verify they fail; implement** `remap-subs.mjs`: pure core `remapItems(items, subMap, emailBySub)` returning `{writes, pending, unmapped}`; CLI reads two `--profile`s via env-injected clients, takes `--table-map old=new` pairs, `--dry-run` default ON, `--execute` to write. Tests green.

- [ ] **Step 3: Create the 9 native users** (script or loop): `admin-create-user --message-action SUPPRESS` with `email_verified=true`, NO password set — first sign-in routes through "Forgot password" (the founder-approved reset flow). Build `subMap` old→new by email from a `list-users` of each pool.

- [ ] **Step 4: Migrate.** Export each source table (`aws dynamodb scan`, default profile, read-only), run the remap `--dry-run`, review the report (expect: ~19 rewrites, 0 unmapped natives, federated rows → PENDING), then `--execute` against `ql-prod`. `quantum-stripe-wallet` imports its verified emptiness (assert scan Count 0 at both ends). `quantum-analytics-daily` copies verbatim.

- [ ] **Step 5: Verify the one irreplaceable row** — the founder's grandfathered ledger row in QL-Prod: `capMicros` equals the source value exactly, new pk, all attributes intact. Print both (redacting sub) into the operator log.

- [ ] **Step 6: Commit** scripts + tests + CI line: `git commit -m "feat(migration): sub-remap operator script, tested offline, wired into CI"`.

---

### Task 9: Stripe — the nine-event, pinned-version webhook *(founder gate — live account)*

**Files:** none in the repo. Operator log updated.

- [ ] **Step 1: Identity check first, per CLAUDE.md — never inferred:**

```bash
KEY=$(op read "op://Quantum Learner/Stripe/add more/Secret Key")
curl -s https://api.stripe.com/v1/account -u "$KEY:" | python3 -c "import json,sys;a=json.load(sys.stdin);print(a['id'],a['settings']['dashboard']['display_name'])"
```

Expected: the live account id recorded in CLAUDE.md with display name "Quantum Learner". STOP on anything else.

- [ ] **Step 2: Create the NEW endpoint** against the QL-Prod stripe API URL (Task 5), with ALL NINE `REQUIRED_WEBHOOK_EVENTS` (read the list from `lambda/stripe/index.mjs` at run time — never a hand copy) and `api_version` pinned to the SDK's own version, exactly as `scripts/stripe/provision-sandbox.mjs` does for sandbox. Use the API (`curl -u "$KEY:" -d ...`), not the Dashboard (cannot pin a version).

- [ ] **Step 3: Store the new signing secret** into the QL-Prod `quantum-stripe` secret (replacing `PENDING-TASK-9`) via `put-secret-value` with the same shell-substitution discipline as Task 5. Restart consideration: the stripe Lambda reads the secret per cold start — force new containers by a no-op env touch or wait out the warm ones.

- [ ] **Step 4: Parity gate:** `make stripe-parity ACCOUNT=<live-id>` must pass — it verifies the new endpoint's event list and pinned version against the code. The OLD endpoint stays enabled until Task 12 Step 5.

---

### Task 10: Drift and CI move their aim

**Files:**
- Modify: `scripts/check-lambda-drift.mjs` — only if it hardcodes region/profile assumptions (read it first; expected: it honors `AWS_PROFILE`, in which case no change)
- Create: none — `infra/github-oidc-drift-role.yaml` deploys as-is into QL-Prod
- Modify: `scripts/migration/README.md`

- [ ] **Step 1: Deploy the OIDC drift role** into QL-Prod (`aws cloudformation deploy --profile ql-prod --region us-east-2 --stack-name quantum-ci-drift-role --template-file infra/github-oidc-drift-role.yaml --capabilities CAPABILITY_NAMED_IAM` — check the template's parameters for the repo name first and pass them verbatim from the source stack's).
- [ ] **Step 2: Update the repo variable** `AWS_DRIFT_ROLE_ARN` to the new role's ARN: `gh variable set AWS_DRIFT_ROLE_ARN --body <new-arn>`.
- [ ] **Step 3: Local drift run against QL-Prod:** `AWS_PROFILE=ql-prod node scripts/check-lambda-drift.mjs` — expected: all functions MATCH git (they were just deployed from main + this branch's parameters). Any mismatch is a real finding; stop and resolve.
- [ ] **Step 4:** `quantum-ci-standby` is NOT migrated in this plan — the audit flagged its fork-PR webhook risk and it is deferred to the teardown pass for a keep/fix/kill decision. Record that.

---

### Task 11: Pre-flip verification battery *(founder gates: the QPU run spends ≤ $0.35)*

**Files:** `scripts/migration/README.md` (results table).

All of this happens with DNS untouched — the new stack is exercised via the Amplify default domain and direct API/CloudFront URLs:

- [ ] **Step 1: Site.** `curl -sI https://main.<id>.amplifyapp.com/` → 200; spot-check `/learn/01-foundations` renders (KaTeX classes present, same greps as CI's build-smoke).
- [ ] **Step 2: Native login.** Founder (or a designated test email from the 9) signs in on the Amplify domain → lands in the reset flow → sets a password → sees their migrated progress (Task 8's rows). This proves pool + client + callback + sync + remap in one pass.
- [ ] **Step 3: Google login.** Founder signs in with Google → new federated user materializes → any `PENDING#` rows for that email are folded in with the remap script's `--fold-pending` path.
- [ ] **Step 4: Tutor streams** on the new edge (one question, streaming visible).
- [ ] **Step 5: QPU.** `GET /qpu/budget` via the new edge answers; then ONE 1-shot Garnet run through the new stack (founder gate, ≤$0.35, same drill as the Braket split: stamp a small cap on the test row, run, verify the task ARN carries the Braket account, results land in the Braket bucket, ledger settles exactly, then zero the cap).
- [ ] **Step 6: Stripe sandbox.** One sandbox checkout round-trip against the QL-Prod sandbox stack (`scripts/stripe/e2e-sandbox.mjs` if wired, else the documented manual flow) — webhook delivery to the new endpoint observed.
- [ ] **Step 7: Analytics.** After Task 7's app exists: redeploy `quantum-analytics` (`--profile ql-prod`) with `AmplifyAppId=<new>` and `AmplifyDomain=quantumlearner.dev`, then confirm one counter increments after a page view on the Amplify domain.
- [ ] **Step 8:** All eight results recorded in the operator log. ANY failure stops the plan before cutover.

---

### Task 12: Cutover *(founder gate at Steps 2, 4, and 5)*

**Files:** `scripts/migration/README.md`.

- [ ] **Step 1: Fresh data delta.** Re-run Task 8 Step 4 (scan → remap → execute) to catch any rows changed since — at this table size a full re-run, idempotent by pk.
- [ ] **Step 2: The flip** *(gate)*: in the HQ zone, UPSERT apex + `www` ALIAS/A records → the Amplify custom-domain target (from Task 7; CloudFront hosted-zone id `Z2FDTNDATAQYW2`). TTL is already low. The zone's MX/TXT/DKIM records are untouched.
- [ ] **Step 3: Verify live:** `dig +short A quantumlearner.dev @8.8.8.8` resolves to the new distribution; `curl -sI https://quantumlearner.dev/` → 200 with the new build id; login + tutor spot-check on the real domain; `curl -sI https://www.quantumlearner.dev/` → 200 or canonical redirect.
- [ ] **Step 4: The old name becomes a pointer** *(gate)*: deploy `infra/redirect/quantum-altivum-ai.yaml` (`--profile ql-prod`, us-east-1); its cert validates via CNAMEs in the `altivum.ai` zone (default-profile Route 53, the one intentional source-account WRITE in this plan — record it); then repoint `quantum.altivum.ai`'s record in the `altivum.ai` zone at the new redirect distribution. Verify: `curl -sI https://quantum.altivum.ai/` → 301 → `https://quantumlearner.dev/`.
- [ ] **Step 5: Stripe endpoint swap** *(gate)*: confirm a live delivery reached the NEW endpoint (Dashboard delivery log or `stripe events resend` of a benign event), then DISABLE (not delete) the old endpoint. It stays disabled-not-deleted until teardown.
- [ ] **Step 6: Hygiene:** remove the temporary amplifyapp callback/logout URLs from the new pool client (re-pass the full config, minus those two).
- [ ] **Step 7: Rollback rehearsal note (do not execute):** before Step 4, rollback = re-UPSERT the two ALIASes back to the old redirect distribution's target. After Step 4, rollback additionally re-points `quantum.altivum.ai`. Auth does not roll back (new-pool sessions are new-pool sessions) — which is why Step 2 waits for Task 11's login proofs.

---

### Task 13: The record catches up

**Files:**
- Modify: `CLAUDE.md` (deployed-reality: platform now in QL-Prod; canonical domain; email table note that `AlertEmail` is now `hq@` everywhere migrated; the "About" line's `quantum.altivum.ai` reference)
- Modify: `docs/superpowers/specs/2026-08-28-platform-migration-qlprod-design.md` (Status → EXECUTED, date)
- Modify: `docs/superpowers/specs/2026-08-27-braket-account-split-design.md` (§3 trust note: QL-Prod principals added; Altivum principals pending teardown)
- Delete: `docs/account-migration-runbook.md` → replaced by a 10-line pointer file naming the spec, the audit, and the operator log
- Modify: `web/src/lib/changelog.ts` — correct `shipped:` if cutover landed on a different date
- Modify: `README.md` if it names `quantum.altivum.ai` anywhere learner-facing

- [ ] **Step 1: Make the edits above** — truthful present tense; the prose guard (`tests/test_pricing_prose.py`) and the full Jest suite must stay green.
- [ ] **Step 2: Run the guards:** `source .venv/bin/activate && python -m pytest tests/test_pricing_prose.py -q` and `cd web && npx jest` — all green.
- [ ] **Step 3: Commit; open the PR** for `feat/phase2-migration` (it now carries Tasks 2, 3, 8, 13's repo changes + the spec/audit/plan); CI green; merge on founder confirmation. Note: merging main triggers BOTH Amplify apps (old and new) to build — harmless; the old app serves a site nobody resolves to.

---

### NOT in this plan (deliberate)

- **Teardown** of the 13 source stacks, the old Amplify app, the old pool, the disabled Stripe endpoint, and the `quantum-learner`-named Altivum account contents — a separate plan after ≥1 week green, per the spec. `cohort-2026-08.json`'s `expectedAccountId` updates in THAT pass.
- The old personal-account hosted zone deletion (separate confidence window, already running).
- `quantum-ci-standby` keep/fix/kill.
- Phase 3 (storefront/metering/rate card).

## Self-Review (performed at write time)

- **Spec coverage:** §2 identity → Tasks 4, 8; §3 build order → Tasks 4–7 (secrets in 5–6, data in 8, Stripe in 9); §4 web PR → Task 2; §5 cutover → Task 12 (steps map 1:1, incl. rollback); §6 drift/teardown → Task 10 + the NOT-list; §8 risk table → Task 1 Step 1 (profile), Task 8 (remap), Task 9 (webhook), Task 6 (Braket), Tasks 7/12 (HSTS), Task 8 Step 3 (reset flow). Gap found and fixed in-draft: the spend-topic policy admitting only one account (now Task 3); the SES sandbox (now Task 1 Step 2 + Task 5 Step 2); the Cognito domain-prefix collision (Task 4).
- **Placeholders:** operator tasks carry `<from Task N>` value references by design — each names the exact task and log entry that produces the value at execution time; none is a TBD.
- **Type consistency:** `remapItems(items, subMap, emailBySub)` consistent between Task 8 steps; parameter names (`PlatformPrincipalArns` fallback noted in both Task 3 steps); the four QPU parameters named identically in Tasks 6 and the constraints.
- **Known uncertainties, stated:** the `!Split`/`!Join` principal-list contortion may not validate (fallback specified); `put-account-details` for SES may need the console (fallback specified); whether a source `quantum-tutor` secret exists (both branches specified).
