# Runbook Audit — `docs/account-migration-runbook.md` vs live reality

**Audited:** 2026-08-28, read-only. No AWS writes, no file edits, no commits.
**Target:** all 666 lines / 116 numbered steps + 12 open questions + 16 §11 corrections.
**Accounts are named, never numbered** (repo is public).

Account name key used throughout:

| Name | Org | Role here |
|---|---|---|
| **Altivum Inc - Original Account** | Altivum | SOURCE (default CLI profile, read-only for this audit) |
| **Quantum Learner** | **Altivum** | the RETIRED 2026-07-18 destination — still ACTIVE, still reachable |
| **QL-Prod** | Delta Centric | the real destination (greenfield, verified empty) |
| **Quantum Learner - HQ** | Delta Centric | holds `quantumlearner.dev` registration + hosted zone |
| **Braket Workloads** | Delta Centric | holds Braket execution role, results bucket, spend topic |

---

## 0. Classification counts

### Numbered steps (116 total)

| Class | Count | Where |
|---|---:|---|
| STILL-CORRECT | **47** | mostly §3 (Phase 1 deploy mechanics) and §7 (Phase 5 verification) |
| STALE-BUT-MECHANICAL | **17** | profile / alert-address / id-list swaps only |
| STALE-SUBSTANTIVE | **30** | Braket split, tutor-off-Bedrock, 14-users-not-2, analytics, SES premise |
| **WRONG (breaks if executed)** | **19** | §2 ×5, §3 ×5, §5 ×1, §6 ×7, §8 ×1 |
| ALREADY-DONE | **3** | Braket device terms; domain registration transfer; source-zone deletion |

Per phase:

| Phase | Steps | Correct | Mechanical | Substantive | **Wrong** | Done |
|---|---:|---:|---:|---:|---:|---:|
| §2 Phase 0 — access/bootstrap | 22 | 2 | 5 | 10 | **5** | 0 |
| §3 Phase 1 — stateless rebuild | 39 | 21 | 5 | 7 | **5** | 1 |
| §4 Phase 2 — data migration | 10 | 2 | 1 | 7 | 0 | 0 |
| §5 Phase 3 — Amplify | 10 | 8 | 1 | 0 | **1** | 0 |
| §6 Phase 4 — DNS cutover | 17 | 7 | 1 | 1 | **7** | 1 |
| §7 Phase 5 — verification | 12 | 6 | 3 | 3 | 0 | 0 |
| §8 Phase 6 — decommission | 6 | 1 | 1 | 2 | **1** | 1 |

**§6 (DNS cutover) is 41% WRONG** — it is the single most decayed section, because the domain flip it plans already happened into a different account than it names.

### Open questions (§10, 12 items)

| Class | Count | Items |
|---|---:|---|
| Still open / correct | 3 | Q2 (Google client), Q8 (redirect mechanism), Q10 (build image) |
| Answered by this audit (ALREADY-DONE) | 4 | Q3, Q4, Q7, Q9 |
| Stale-substantive (premise changed) | 4 | Q1, Q5, Q11, Q12 |
| Stale-mechanical | 1 | Q6 |

### §11 corrections (16 items)

| Class | Count | Items |
|---|---:|---|
| Still coherent | 12 | H1, H2, M1, M2, M5, L1, L2, L4, L5, L6, L7, L8 |
| **Incoherent — must be re-decided** | 1 | **M3** (SES domain; its whole justification is gone) |
| Moot — the step it corrects no longer exists | 2 | M4, M6 (DNSSEC gate, NS-repoint gate) |
| Partly incoherent | 1 | L3 ("TEST mode" is the wrong target; billing is live) |

---

## 1. Global finding that colours everything: the profile-name collision

The runbook body carries **51** occurrences of `--profile quantum-learner` and **3** of `altivum-mgmt`. The header re-points the destination and says the chained profile is **`ql-prod`** — which appears exactly **once**, in the header.

Verified live:

```sh
grep -c 'profile quantum-learner' docs/account-migration-runbook.md      # 51
grep -c 'ql-prod' docs/account-migration-runbook.md                       # 1
awk '/^\[profile quantum-learner\]/,/^$/' ~/.aws/config
#   sso_session = altivum-sso ; sso_role_name = AltivumAdmin ; region = us-east-2
QLID=$(aws configure get sso_account_id --profile quantum-learner)
aws organizations list-accounts --query "Accounts[?Id=='$QLID'].Name" --output text
#   Quantum Learner            <-- the RETIRED Altivum-org destination, still ACTIVE
aws configure get role_arn --profile ql-prod                              # exists, OrganizationAccountAccessRole
aws sts get-caller-identity --profile ql-prod --query Arn --output text   # assumed-role/OrganizationAccountAccessRole
```

**`quantum-learner` is not an unresolvable name — it is a live, working profile pointing at the wrong account in the wrong organization.** Every one of the 51 commands would succeed and land in the Altivum-org "Quantum Learner" account. This is not a search-and-replace nicety; it is the failure mode the spec §6 warned about, still armed in 51 places.

`ql-prod` **already exists** in `~/.aws/config` (the task briefing said it did not — it does, chained off `org-admin` with region `us-east-2`).

---

## 2. Pass 1 — step-by-step classification

Verified-live evidence is cited inline. Every command below was run read-only.

### §2 Phase 0 — Access & Bootstrap (22 steps)

| # | Step | Class | Why |
|---|---|---|---|
| 1 | Configure `[profile quantum-learner]` with `source_profile = altivum-mgmt` | **WRONG** | Profile already exists as an Altivum SSO profile (§1). `altivum-mgmt` = **Altivum Inc. OrgMaster**, which cannot assume `OrganizationAccountAccessRole` in a Delta Centric member account. Correct profile is `ql-prod`, already configured. |
| 2 | `sts get-caller-identity --profile quantum-learner` must print `$DST_ACCOUNT` | **WRONG** | The only guard against #1, and it fails open: an operator who skips step 1 (because "the profile already exists") gets a clean, successful identity print from the wrong account. |
| 3 | Harden root for `quantumlearner@altivum.ai` | STALE-SUBSTANTIVE | QL-Prod's root email is `aws-prod@quantumlearner.dev` (`aws organizations list-accounts --profile org-admin`). |
| 4 | Confirm inbox `quantumlearner@altivum.ai` monitored | STALE-SUBSTANTIVE | Same; and CLAUDE.md designates `hq@quantumlearner.dev` for automated mail. |
| 5 | Decide SES sending domain | STALE-SUBSTANTIVE | Premise inverted — see M3 in §4 below. |
| 6 | `sesv2 create-email-identity` + publish DKIM CNAMEs | STALE-SUBSTANTIVE | The DKIM publication target is now the **HQ** zone (`--profile ql-hq`), a third account the runbook never uses. |
| 7 | SES sandbox-exit request | STALE-BUT-MECHANICAL | Profile; `--additional-contact-email-addresses` → `hq@quantumlearner.dev`. |
| 8 | Enable Bedrock model access in 3 regions | STALE-SUBSTANTIVE | **The tutor left Bedrock 2026-08-17.** `lambda/tutor/template.yaml` has no Bedrock anything; its only model-side env is `SECRET_ID: !Ref SecretId`. |
| 9 | `bedrock create-inference-profile`, capture `$NEW_MODEL_ID` | **WRONG** | Obsolete, and it produces a value fed to a template parameter that no longer exists (#8 of §3). The header's `SRC_PROFILE_ID` export block is dead for the same reason — and it is one of four values a `: "${…:?}"` sanity gate refuses to continue without, so **the runbook cannot get past its own preamble.** |
| 10 | Accept Braket terms in dest; auto-creates `amazon-braket-eu-north-1-$DST_ACCOUNT` | STALE-SUBSTANTIVE | Braket execution left the platform account. Live: `quantum-qpu-submit` runs with `BraketRoleArn = …:role/QuantumLearnerBraketExecution` in **Braket Workloads**. QL-Prod needs no Braket enablement at all. |
| 11 | Accept IQM/IonQ/QuEra device terms in dest | STALE-SUBSTANTIVE | Belongs to Braket Workloads; already accepted there. |
| 12 | Account-level Braket spend guardrail in dest | STALE-SUBSTANTIVE | Belongs in Braket Workloads, alongside `BraketSpendTopicArn` (verified to resolve to that account). |
| 13 | Pre-create `s3://amazon-braket-eu-north-1-$DST_ACCOUNT` | **WRONG** | The live `ResultsBucket` parameter is `amazon-braket-ql-results-<Braket Workloads>` — different name, different account. Creating this bucket in QL-Prod is dead weight and encodes a false expectation into §3.5. |
| 14 | CodeConnections + human handshake | STALE-BUT-MECHANICAL | Profile only. |
| 15 | Amplify GitHub App authorization | STILL-CORRECT | No CLI; human handshake unchanged. |
| 16 | Recreate `quantum-qpu-edge-secret` w/ us-east-1 replica | STALE-BUT-MECHANICAL | Profile only. Verified the source shape it mirrors: secret present in **both** us-east-2 and us-east-1. |
| 17 | Recreate `quantum-stripe` secret | STALE-BUT-MECHANICAL | Profile only — but see GAP G8: a second live secret `quantum-stripe-sandbox` exists and is uncovered. |
| 18 | SAM staging buckets / braket-cfn-staging | STALE-BUT-MECHANICAL | Profile; braket half moot with §3.10. |
| 19 | Cost-allocation tags `--profile altivum-mgmt` in the PAYER account | **WRONG** | After the destination re-point the payer is the **Delta Centric** management account (`org-admin`). As written it activates tags in the Altivum org and leaves every QL-Prod cost untagged — silently, and **not retroactively fixable**. |
| 20 | Verify Lambda concurrency headroom (fleet ≈ 44) | STALE-SUBSTANTIVE | The arithmetic is stale: `quantum-analytics` (reserved 2) landed after drafting, and `quantum-stripe-sandbox` (10) is unaccounted. A wrong headroom number here surfaces as a mid-chain deploy failure. |
| 21 | Branch `migrate/crosscut-…`; sequence `SITE_URL` to cutover | STILL-CORRECT | `web/src/lib/site.ts` still reads `https://quantum.altivum.ai`. |
| 22 | Repo edit list (`policy.json`, 6 origin templates, `DomainPrefix`, `site.ts`) | STALE-SUBSTANTIVE | `policy.json` is now a **dead Bedrock artifact** (see §5); the template count is stale (`lambda/analytics/template.yaml` pins `AmplifyAppId`/`AmplifyDomain`, not an origin, and is not on the list). |

### §3 Phase 1 — Stateless Infra Rebuild (39 steps)

| # | Step | Class | Why |
|---|---|---|---|
| 1 | Deploy `infra/workspace/cognito.yaml` (4 overrides) | STALE-SUBSTANTIVE | Four independent problems: (a) `AlertEmail` is **not passed**, so it defaults to the Altivum address; (b) the template's `SignupAlert*` resources have **never deployed anywhere** — verified `describe-user-pool … LambdaConfig` on the source pool returns empty — so QL-Prod is where a PostConfirmation trigger runs for the first time, with `INTERNAL_DOMAIN: altivum.ai` **hardcoded at line 94, not a parameter**; (c) it passes `SiteUrl=https://quantumlearner.dev` in direct contradiction of this phase's own "use a temp-host placeholder" rule; (d) it is sized for a 2-user pool. |
| 2 | Capture `NEW_POOL_ID`/`NEW_CLIENT_ID`/HostedDomain | STILL-CORRECT | |
| 3 | Confirm no leftover `quantum-workspace-progress` | STILL-CORRECT | Verified QL-Prod is greenfield: `list-stacks --profile ql-prod` empty, `list-user-pools --profile ql-prod` empty. |
| 4 | `sam deploy` sync | STALE-BUT-MECHANICAL | Profile + `AlertEmail` → `hq@`. |
| 5–6 | Confirm SNS sub; capture `SyncUrl` | STILL-CORRECT | |
| 7 | `TUTOR_MODEL_ID=$NEW_MODEL_ID node deploy-check.mjs` | **WRONG** | `deploy-check.mjs` no longer reads `TUTOR_MODEL_ID`; it imports `{ ROSTER, MODEL_IDS }` from `tutor-billing.mjs` and validates the roster. The env var is inert — the gate does not gate what the step claims it gates. |
| 8 | `sam deploy` tutor with `ModelId=` + `FoundationModelId=` | **WRONG** | **Neither parameter exists.** `lambda/tutor/template.yaml` parameters are exactly: `SecretId`, `AllowedOrigin`, `MaxConcurrency`, `FunctionUrlAuthType`, `LogRetentionInDays`, `AlertEmail`, `WalletTableName`, `UserPoolId`, `RateCardSecret`, `UserPoolClientId`. `sam deploy` rejects the invocation. And nothing anywhere in Phase 0 creates the `quantum-tutor` secret the template now requires (GAP G9). |
| 9 | Note `TutorUrl`; curl a grounded stream | STILL-CORRECT | |
| 10–12 | tutor-edge host / deploy / wait | STILL-CORRECT | |
| 13 | `grant-oac.sh` via `AWS_PROFILE=quantum-learner` | STALE-BUT-MECHANICAL | Profile — but note the script takes **only** the env var, so the collision is unguarded here. `lambda/tutor/scripts/grant-oac.sh` verified present. |
| 14 | Verify signed POST through the distribution | STILL-CORRECT | |
| 15 | Flip origin closed, "all other params identical to step 8" | STALE-SUBSTANTIVE | Inherits #8: "identical to step 8" is now undefined. |
| 16 | Freeze source submissions by tripping the SOURCE `KILL` row | STALE-SUBSTANTIVE | The stated reason — "their task ARNs are account-scoped and un-reconcilable from dest" — **is now false**. Task ARNs live in Braket Workloads and `quantum-qpu-reconcile` reaches them by assuming a role there. Once QL-Prod is trusted, QL-Prod *can* reconcile the same tasks. The drain strategy needs re-deciding, not re-typing (8 task rows in flight-eligible states). |
| 17 | `sam deploy` qpu-submit (9 params) | **WRONG** | Omits **`BraketRoleArn`, `BraketExternalId`, `BraketSpendTopicArn`** — all three set on the live stack and all three present in `lambda/qpu/template.yaml` — and names the wrong `ResultsBucket`. Deployed as written, QL-Prod's QPU path has no Braket at all and no spend topic. Also silently omits `WalletTableName`/`RateCardSecret` (correctly `""` today, but undocumented, and they are the rate-card cutover's control surface). |
| 18 | Confirm 3 SNS subs | STILL-CORRECT | |
| 19 | Verify kill-switch **before** accepting device terms | STALE-SUBSTANTIVE | The kill-switch verification stands; the "before device terms" gate is moot (terms are in Braket Workloads, already accepted). |
| 20 | Capture `QpuUrl` | STILL-CORRECT | |
| 21 | "Now accept the Braket device terms" | **ALREADY-DONE** | In Braket Workloads. The live source stack's cross-account parameters prove real device access exists there. |
| 22–25 | qpu-edge deploy + verify | STILL-CORRECT | `lambda/qpu/edge.yaml` present; steps unchanged. |
| 26 | `sam deploy` stripe | STALE-BUT-MECHANICAL | Profile + `AlertEmail`. |
| 27 | Register a NEW Stripe webhook, **TEST mode**, **4 events** | **WRONG** | Four ways: (a) `REQUIRED_WEBHOOK_EVENTS` in `lambda/stripe/index.mjs:119` is **nine** events — the five missing are `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`, i.e. **the entire clawback path**, which is exactly the production gap CLAUDE.md records was found dark on 2026-08-17; (b) `api_version` is **creation-only and the Dashboard cannot pin it** — this endpoint must be made through the API or the payload shape drifts under the handler; (c) billing on the Quantum Learner Stripe account is **live**, so a test-mode endpoint leaves production uncovered; (d) no `--expect-account` guard, on a machine where every `stripe` CLI profile resolves to the wrong account. |
| 28–29 | put-secret-value; confirm SNS | STILL-CORRECT | |
| 30–32 | review-email secret / deploy / SNS | 30,32 STILL-CORRECT; 31 STALE-BUT-MECHANICAL | |
| 33–34 | ci-standby log-group check; deploy | 33 STILL-CORRECT; 34 STALE-BUT-MECHANICAL | |
| 35 | `AWS_PROFILE=quantum-learner ./infra/ci-standby/failover.sh drill` | **WRONG** | `failover.sh` has no `--profile` flag, so the env var is the *only* control — and it names the live Altivum-org account. This is the profile collision at its most dangerous: a CodeBuild drill fired into a production account by a step whose whole purpose is "prove it green". |
| 36 | Leave ci-standby idle | STILL-CORRECT | |
| 37–39 | `braket-base` (optional) | STALE-SUBSTANTIVE ×3 | Superseded outright by the Braket account split. The answer to Open Q11 is now "no". |

### §4 Phase 2 — Data Migration (10 steps)

The whole section is written for **2 users and ~2 rows per table**. Verified today:

```sh
aws cognito-idp describe-user-pool --user-pool-id us-east-2_aRydPmAjj --region us-east-2 \
  --query 'UserPool.{Est:EstimatedNumberOfUsers,DelProt:DeletionProtection,Domain:Domain}'
#   14 users, DeletionProtection ACTIVE, domain quantum-altivum
aws cognito-idp list-users --user-pool-id us-east-2_aRydPmAjj --region us-east-2 …
#   total 14 | native 9 (all CONFIRMED) | federated 5 (EXTERNAL_PROVIDER)
for T in …; do aws dynamodb scan --table-name $T --select COUNT --region us-east-2 --query Count; done
#   progress 4 | qpu-ledger 5 | qpu-tasks 8 | review-email-prefs 2 | stripe-wallet 0
#   analytics-daily 9 | stripe-sandbox-wallet 50
```

| # | Step | Class | Why |
|---|---|---|---|
| 1–2 | Capture dest pool/client; enumerate source users | STILL-CORRECT | The enumeration command works as written and returns 14. |
| 3 | `admin-create-user` for one named native user | STALE-SUBSTANTIVE | **9** native users, not 1. Also `--desired-delivery-mediums EMAIL` yields `FORCE_CHANGE_PASSWORD` + a temp password, which is *not* the founder's decided "password-reset prompt" — that is `admin-create-user --message-action SUPPRESS` followed by a forgot-password flow, or an explicit reset. Getting this wrong sends 9 people a credential they did not ask for. |
| 4 | Google user: JIT preferred | STALE-SUBSTANTIVE | **5** federated users, and §11 M5 already overrides "JIT" → pre-provision + `admin-link-provider-for-user`. |
| 5 | Build a 2-entry `SUB_REMAP` | STALE-SUBSTANTIVE | **14** entries, joined on email (the only stable key across pools). ~19 sub-keyed rows depend on it. |
| 6 | `verify-live` counts over 5 tables | STALE-SUBSTANTIVE | Six tables matter now (`quantum-analytics-daily`), seven counting the sandbox wallet. Counts above. |
| 7 | Per-table copy rules | STALE-SUBSTANTIVE | Directionally right, but: `quantum-stripe-wallet` is **0 rows** (nothing to copy — the "real money" branch is currently a no-op); the qpu-tasks caveat "`taskArn`/`resultS3Uri` point at **source-account** Braket + S3 … display-only history" is **false** — they point at Braket Workloads and its bucket, which QL-Prod will also be able to reach, making them live references rather than dead ones; and `quantum-analytics-daily` has no rule at all (GAP G5). |
| 8 | Row-count + per-item parity | STALE-BUT-MECHANICAL | Method sound; counts stale. |
| 9 | End-to-end "both users" sign in | STALE-SUBSTANTIVE | 14 users, 5 of them requiring a Google IdP re-link. |
| 10 | Final delta of progress; "optionally ask the 2 users to pause" | STALE-SUBSTANTIVE | Already overridden by §11 H2/M1; and "ask the users to pause" does not scale to 14. |

### §5 Phase 3 — Amplify (10 steps)

| # | Step | Class | Why |
|---|---|---|---|
| 1 | Discover source app config | STILL-CORRECT | Ran it; it answers three open questions outright (see §3). |
| 2 | Authorize Amplify GitHub App | STILL-CORRECT | |
| 3 | `create-app` with the `NEXT_PUBLIC_*` set **including `NEXT_PUBLIC_BILLING_URL`** | **WRONG** | Setting `NEXT_PUBLIC_BILLING_URL` **opens the storefront**, which CLAUDE.md rule 15 holds closed as a deliberate decision. Verified the live source app carries exactly 8 variables and no `BILLING_URL`. Executing this step ships a buy button on day one of the new account, ahead of rule 14's ordering (buying must work before metering). |
| 4–7 | create-branch, monorepo root, build image, start-job | STILL-CORRECT | Confirmed the app-level `buildSpec` is byte-identical to repo `amplify.yml` but for a trailing newline, so "don't pass `--build-spec`" is safe. |
| 8 | Verify on temp host; grep `out/` for 7 source ids | STALE-BUT-MECHANICAL | The id list omits `d1fvrui7pmjz4z` (the redirect distribution, and the thing `quantumlearner.dev` points at *today*). |
| 9–10 | Pre-authorize temp origin; don't attach the domain yet | STILL-CORRECT | |

### §6 Phase 4 — DNS Cutover (17 steps) — the most decayed section

The section's own framing is false. It says `quantumlearner.dev` "is a Route53 zone (`Z0634247WVFEYFGO8EVF`) currently in the **source** account." Verified:

```sh
aws route53 get-hosted-zone --id Z0634247WVFEYFGO8EVF
#   NoSuchHostedZone: No hosted zone found with ID: Z0634247WVFEYFGO8EVF
aws route53domains list-domains --region us-east-1 --query 'Domains[].DomainName' --output text
#   (15 domains; quantumlearner.dev is NOT among them)
aws route53 list-hosted-zones --profile ql-hq
#   /hostedzone/Z1001194KW3SBPXAEUGV   quantumlearner.dev.   11 records
aws route53domains list-domains --profile ql-hq --region us-east-1
#   quantumlearner.dev
dig +short quantumlearner.dev NS
#   ns-1246.awsdns-27.org. …   (matches the HQ zone)
```

And the alias collision the section calls "the single biggest blue-green blocker" is **still real**, now cross-organization:

```sh
aws cloudfront list-distributions …
#   E365VD5CYQX9FM  d1fvrui7pmjz4z.cloudfront.net
#     aliases: ['www.quantumlearner.dev', 'quantumlearner.dev']   enabled=True   (SOURCE account)
aws route53 list-resource-record-sets --hosted-zone-id Z1001194KW3SBPXAEUGV --profile ql-hq
#   quantumlearner.dev.      A/AAAA  ALIAS -> d1fvrui7pmjz4z.cloudfront.net.   (TTL: none)
#   www.quantumlearner.dev.  A/AAAA  ALIAS -> d1fvrui7pmjz4z.cloudfront.net.
#   plus TWO acm-validations CNAMEs for the source account's certificate
```

So: **the HQ zone points at a CloudFront distribution owned by the source account, in a different AWS organization.** That is the actual cutover geometry, and the runbook describes none of it.

| # | Step | Class | Why |
|---|---|---|---|
| 1 | Lower TTL on source-zone apex+www via `Z0634247…` with SOURCE creds | **WRONG** | `NoSuchHostedZone`. And even against the right zone it is a no-op: apex and www are **ALIAS** records with no TTL to lower. |
| 2 | Lower Cloudflare `quantum.altivum.ai` TTL | STILL-CORRECT | |
| 3 | Merge `SITE_URL` (overridden to cutover by M2) | STILL-CORRECT | |
| 4–5 | ACM cert for `quantum.altivum.ai` + Cloudflare validation | STILL-CORRECT | |
| 6 | Deploy the inverted redirect stack | STALE-BUT-MECHANICAL | Profile + `AlarmEmail` → `hq@`. `infra/redirect/` contains only `quantumlearner-dev.yaml`; the inverted copy still has to be authored, as the preamble says. |
| 7 | Verify 301 on the raw CF domain pre-flip | STILL-CORRECT | |
| 8 | `create-hosted-zone quantumlearner.dev` in the dest | **WRONG** | Creates a **second** authoritative zone for a domain whose registration and delegation already live in HQ. Per spec §6 what remains is "a record edit in a zone HQ already controls, not a domain move." Executing this and then repointing NS moves delegation *out* of HQ, against the org design, with a split-brain window. |
| 9 | Release the `quantumlearner.dev` alias from the source distribution | STALE-SUBSTANTIVE | Still required (verified above) — but it is now a **cross-organization** operation, and `associate-alias` (L7) needs its domain-ownership TXT published in the **HQ** zone. |
| 10 | Attach custom domain; add records "into whichever zone is authoritative now (**the source zone** during FLIP #1)" | **WRONG** | The named zone does not exist. Records go into HQ (`--profile ql-hq`, `Z1001194KW3SBPXAEUGV`) — and that zone already carries two `acm-validations` CNAMEs for the **source** certificate that must be preserved while the source distribution is still serving. |
| 11 | FLIP #1: "with **SOURCE creds**, UPSERT the source-zone records" | **WRONG** | Source credentials cannot write that zone. FLIP #1 is a `ql-hq` UPSERT. As written, the single production-visible moment of the entire migration is an unexecutable command. |
| 12 | FLIP #2: Cloudflare `quantum.altivum.ai` → dest redirect distribution | STILL-CORRECT | With a caveat, see GAP G11: `quantum.altivum.ai` is an **Amplify domain-association subdomain** of the source app (`dig` → `d47zhgcam9txj.cloudfront.net`), not a hand-made CNAME. |
| 13 | Disable the source canary rule | STILL-CORRECT | Name verified exactly: `describe-stack-resource … CanarySchedule` → `quantumlearner-redirect-canary-15min`. |
| 14 | Populate the dest zone identically | **WRONG** | Follows from #8 — there should be no dest zone. |
| 15 | `transfer-domain-to-another-aws-account` from source to dest | **ALREADY-DONE / WRONG** | Registration already moved (to HQ). Run from source it fails; re-aimed HQ→QL-Prod it undoes a deliberate design decision. |
| 16 | `update-domain-nameservers` to the dest zone | **WRONG** | NS already delegate to HQ; this would strand or split delegation. |
| 17 | **Rollback**: "revert FLIP #1 by UPSERTing the source-zone records back" | **WRONG** | The rollback plan targets a hosted zone that no longer exists. **The migration's only stated rollback for its only irreversible-ish moment is unexecutable.** |

### §7 Phase 5 — Verification (12 steps)

| # | Step | Class | Why |
|---|---|---|---|
| 1 | Identity check | STALE-BUT-MECHANICAL | Profile. |
| 2 | Site smoke | STILL-CORRECT | |
| 3 | Zero source-account leakage grep | STALE-BUT-MECHANICAL | Id list stale (add `d1fvrui7pmjz4z`). |
| 4–6 | Auth round-trip; tutor stream; sync | STILL-CORRECT | |
| 7 | QPU dry-run "no cost" | STALE-SUBSTANTIVE | A green `GET /qpu/budget` proves **nothing** about cross-account trust now. Verification must include the QL-Prod function role successfully assuming `QuantumLearnerBraketExecution` with the external id — otherwise the first real submit after cutover is the first test of the seam. |
| 8 | Stripe: bad-sig 400, real test event credits `WALLET#` | STALE-SUBSTANTIVE | Must run in the **sandbox** account first per CLAUDE.md, then live; and a 4-event endpoint (step 27) cannot produce a refund or dispute at all, so the clawback path stays unverified end to end. |
| 9–10 | Review-email; redirects/OG/canonical | STILL-CORRECT | |
| 11 | "SNS all confirmed — enumerate every topic" | STALE-SUBSTANTIVE | The enumerated list omits `quantum-analytics`'s alerts topic and the never-before-deployed Cognito `SignupAlertTopic`; the Braket spend topic now lives in another account. |
| 12 | Offline handler tests green | STALE-BUT-MECHANICAL | List omits `lambda/analytics`. |

### §8 Phase 6 — Decommission (6 steps)

| # | Step | Class | Why |
|---|---|---|---|
| 1 | `delete-stack quantumlearner-dev-redirect` (source, us-east-1) | **WRONG** | Two independent hazards. (a) That stack's distribution `E365VD5CYQX9FM` is **what `quantumlearner.dev` and `www` resolve to right now** via the HQ zone — deleting it before FLIP #1 blackholes the production domain on an HSTS-preloaded `.dev`, with no clickthrough. (b) `describe-stack-resources` shows the stack still owns `DnsRecords` (`AWS::Route53::RecordSetGroup`) with `HostedZoneId=Z0634247WVFEYFGO8EVF` — a **zone that no longer exists** — so the delete itself will try to remove records from a missing zone and can land `DELETE_FAILED`, needing `--retain-resources DnsRecords`. The runbook budgets "~15 min" for a step that may not complete at all. |
| 2 | `delete-hosted-zone Z0634247WVFEYFGO8EVF` | **ALREADY-DONE** | Errors `NoSuchHostedZone`. |
| 3 | Decommission the source backend stacks (8 named) | STALE-SUBSTANTIVE | Verified live in source and **absent from the list**: `quantum-analytics`, `quantum-stripe-sandbox`, `quantum-ci-drift-role`. A surviving `quantum-analytics` keeps calling `amplify:GenerateAccessLogs` against a decommissioned app id and alarms on the silence; a surviving `quantum-ci-drift-role` keeps the daily GitHub drift job pointed at the dead account. |
| 4 | Disable the OLD Stripe webhook (H1 moves it earlier) | STALE-SUBSTANTIVE | **Two** Stripe accounts have endpoints on source URLs (live + sandbox). The live one must be re-created against the new URL with a pinned `api_version` **before** it is disabled, or credit granting is dark in the gap. |
| 5 | Restore TTLs | STALE-BUT-MECHANICAL | Zone identity changed. |
| 6 | Leave the source Cognito pool retained | STILL-CORRECT | Verified `DeletionProtection: ACTIVE`, domain `quantum-altivum` held. |

---

## 3. Pass 2 — GAPS: what Phase 2 needs that the runbook never covers

Reference counts, run against the runbook:

```sh
grep -ci 'analytics'  docs/account-migration-runbook.md   # 0
grep -ci 'BraketRoleArn\|BraketExternalId\|BraketSpendTopicArn'  # 0
grep -c  'RateCardSecret'                                 # 0
grep -c  'WalletTableName'                                # 0
grep -c  'SecretId\|quantum-tutor secret'                 # 0
grep -c  'quantum-stripe-sandbox'                         # 0
grep -ci 'drift'                                          # 3 (all about *build-image* drift; none about make drift / the OIDC role)
grep -c  'ql-hq'                                          # 0
```

**G1 — the sub-remap is sized for 2 users; it is 14.** ~19 sub-keyed rows across five tables (`progress` 4, `qpu-ledger` 5 under `USER#`/`CRED#`, `qpu-tasks` 8 by `userId` attribute, `review-email-prefs` 2, `wallet` 0). The join key must be **email**, since subs differ by construction. Nine native users get a password-reset prompt; five federated users must be pre-provisioned + `admin-link-provider-for-user` **before** the copy (§11 M5), because a JIT sub does not exist until first login and the copy needs it. The runbook has the *mechanism* but none of the *scale* — and the 5-federated-user path is the one that silently orphans data.

**G2 — the Braket cross-account parameters are never carried.** `lambda/qpu/template.yaml` declares `BraketRoleArn`, `BraketExternalId`, `BraketSpendTopicArn` (plus `HasBraketRole`/`HasBraketSpendTopic` conditions). All three are set on the live source stack; **zero** appear in the runbook. `ResultsBucket` must become the Braket-account bucket, not `amazon-braket-eu-north-1-<dest>`. Without this, QL-Prod's QPU stack deploys "successfully" and cannot submit anything.

**G3 — the Braket trust-policy update has no step, and it has a hard ordering constraint.** Live trust policy on `QuantumLearnerBraketExecution` (read via `aws iam get-role --profile ql-braket`) names exactly two principals: `quantum-qpu-submit-ReconcileFunctionRole-<suffix>` and `quantum-qpu-submit-QpuFunctionRole-<suffix>` in the **source** account, gated on an `sts:ExternalId`. Those suffixes are CloudFormation-generated, so **the QL-Prod role ARNs cannot be known until the QL-Prod QPU stack has deployed.** The sequence is: deploy QPU in QL-Prod → read the two generated role ARNs → *add* them to the Braket trust policy (spec §3: add at cutover, drop the Altivum principals only after verification) → then verify with a real assume. The external id must be carried across too. None of this is written down anywhere.

**G4 — the Stripe LIVE webhook endpoint re-creation.** Covered above as §3 #27 (WRONG), but it is also a gap in its own right: nothing in the runbook says the endpoint must be created **through the API** with a pinned `api_version` (creation-only; the Dashboard cannot), nothing runs `scripts/stripe/check-webhook-parity.mjs` against the new endpoint, nothing exercises the sandbox first, and nothing covers the sandbox account's own endpoint. The overlap window also needs a decision: two endpoints live at once (old + new) means double-crediting unless `EVENT#` idempotency rows are shared — they are not, because they live in the destination table.

**G5 — `quantum-analytics` is not in the runbook at all** (0 mentions). It is a live stack, a live Lambda, and a live table with **9 aggregate rows**. It is also the one stack whose parameters are *bound to the Amplify app being replaced*: `AmplifyAppId=d1ao02to23x85y`, `AmplifyDomain=altivum.ai`, injected as `AMPLIFY_APP_ID`/`AMPLIFY_DOMAIN` and used to scope an `amplify:GenerateAccessLogs` IAM resource ARN. Needs: re-deploy in QL-Prod with the new app id and `quantumlearner.dev`; copy the 9 rows (no `userId`, so no remap — but Amplify access logs age out, so un-copied history is **permanently unrecoverable**); confirm its alerts SNS subscription; add `lambda/analytics` to the Phase 5 handler-test list; and tear the source stack down (see §8 #3).

**G6 — the drift-check OIDC role and `AWS_DRIFT_ROLE_ARN`.** `quantum-ci-drift-role` is a live source stack whose output is described as "Set as the `AWS_DRIFT_ROLE_ARN` repository variable in GitHub." `.github/workflows/drift.yml` reads `vars.AWS_DRIFT_ROLE_ARN` and hardcodes `aws-region: us-east-2`. `infra/github-oidc-drift-role.yaml` trusts `arn:aws:iam::${AWS::AccountId}:oidc-provider/token.actions.githubusercontent.com` — **which must already exist in the account**; it does in the source (`list-open-id-connect-providers` confirms), and does not in greenfield QL-Prod. So Phase 2 needs: create the GitHub OIDC provider in QL-Prod → deploy the drift role there → flip the repo variable **at cutover** (flipping early blinds drift on the still-live source; flipping late leaves the daily job auditing a dead account). Note `scripts/check-lambda-drift.mjs` watches **11** functions including `quantum-analytics` and `quantum-stripe-sandbox`, so the drift role's `quantum-*` resource scope has to cover both accounts during the overlap. Spec §6 calls this "drift tooling gains its account dimension here" — the runbook has nothing.

**G7 — Amplify env vars are under-specified and one of them is a rule violation.** The live source app carries 8 variables (verified). Of those, `NEXT_PUBLIC_TUTOR_URL=https://d1iiu6blp8cumd.cloudfront.net/` and `NEXT_PUBLIC_QPU_URL=https://d2m7qwngri5wk3.cloudfront.net/` point at **CloudFront distributions that get recreated** in QL-Prod with new domains — the runbook says to re-source them, which is right, but it never says the tutor edge is a *new distribution with a new domain and a new OAC grant*, so `NEXT_PUBLIC_TUTOR_URL` cannot be filled in until §3.4 #12 completes. And `NEXT_PUBLIC_BILLING_URL` must be **omitted** (rule 15), not set as step 3 instructs.

**G8 — `quantum-stripe-sandbox` has no plan.** A live source stack, a live `quantum-stripe-sandbox` secret, and a `quantum-stripe-sandbox-wallet` table with **50 rows**. CLAUDE.md makes the sandbox load-bearing ("evaluate in the sandbox, always, then live") and `check-lambda-drift.mjs` watches it precisely so a green sandbox run is not a false green. Decide explicitly: migrate it, rebuild it, or retire it — and if it moves, its own webhook endpoint moves with it.

**G9 — nothing creates the `quantum-tutor` secret.** Phase 0 §2.6 creates `quantum-qpu-edge-secret` and `quantum-stripe`. The tutor now reads its Anthropic API key from Secrets Manager via `SECRET_ID` (default `quantum-tutor`); the secret exists in source (`list-secrets` confirms) and the live stack runs with `SecretId=quantum-tutor`. In QL-Prod it must be created before §3.3 or the tutor deploys and fails on first invocation.

**G10 — Quantum Learner - HQ is a third account in the blast radius and appears zero times.** Every DNS action in Phase 4 is really a `ql-hq` action. The HQ zone also already holds two `acm-validations` CNAMEs for the source certificate and a Google Workspace MX + site-verification TXT — none of which may be collaterally removed.

**G11 — `quantum.altivum.ai` is an Amplify domain-association subdomain, not a plain CNAME.** `get-domain-association --domain-name altivum.ai` shows exactly one subdomain, `prefix=quantum`, `branchName=main`, status `AVAILABLE`; `dig quantum.altivum.ai` → `d47zhgcam9txj.cloudfront.net`. FLIP #2 therefore requires **detaching or deleting that association on the source app** before (or as) the Cloudflare record is repointed, or Amplify's managed record and the new redirect target fight. No step covers it. (Silver lining: this same query answers Open Q7 — there is no `www.quantum.altivum.ai`.)

**G12 — the rate-card / wallet-metering parameters are invisible.** `RateCardSecret` and `WalletTableName` exist on both the tutor and QPU templates and are `""` on both live stacks. They are the control surface for the rate-card cutover (spec Phase 3), and `make drift` runs `scripts/check-rate-parity.mjs` against *deployed* env. Post-migration that check has to know which account to look in. Phase 2 should at minimum carry both parameters explicitly as `""` so the cutover is a one-line change later, and note that `make drift` becomes account-parameterised.

**G13 — the Cognito signup-alert trigger deploys for the first time in QL-Prod.** Verified the source pool has **no** `LambdaConfig`, so `SignupAlertFunction`/`SignupAlertTopic`/`SignupAlertPermission` in `infra/workspace/cognito.yaml` have never run. In QL-Prod they will. Consequences the runbook does not mention: `INTERNAL_DOMAIN` is **hardcoded `altivum.ai` at line 94** (not a parameter, so it cannot be overridden at deploy) — every `@quantumlearner.dev` team signup will be reported as an external signup occupying a founding-cohort slot; and the new SNS subscription lands `PendingConfirmation`, silently, unless `AlertEmail` is passed and the link is clicked.

**G14 — the founding-cohort spend guard has no scheduled flip.** `scripts/founding-credit/cohort-2026-08.json` carries `expectedAccountId` **equal to the source account** (verified by comparison against `sts get-caller-identity`, not printed), with `"closed": false` and **7 of 20 slots issued**. `run.mjs` aborts when the caller is in the wrong account — which is the guard working. §11 item 12 says update it at cutover; **no numbered step schedules it**, and it must not move early (that would disarm the guard while issuance is still live against the source wallet).

**G15 — Google OAuth redirect URIs are console-only and gate 5 real users.** The new hosted-UI prefix means `https://quantumlearner.auth.us-east-2.amazoncognito.com/oauth2/idpresponse` must be added to the OAuth client before any federated user can sign in. It is in §9's table but has no numbered step and no owner, and Open Q2 (reuse vs new client) is still unresolved — reuse couples the two accounts' Google sign-in permanently.

**G16 — no account-level guardrails in QL-Prod.** §11 L5 asks for a monthly budget/billing alarm; spec Phase 0 puts foundations (Budgets, OIDC deploy role) in HQ. Nothing reconciles the two, and nothing covers SCPs or the Delta Centric OU.

**G17 — deleting or renaming the `quantum-learner` AWS profile should be step 0.** It is the only durable fix for §1; a doc-level find-and-replace still leaves a loaded gun in `~/.aws/config` for anyone reading an older copy of the runbook.

**G18 — `lambda/qpu/template.yaml` defaults point at the SOURCE pool.** `UserPoolId` defaults to `us-east-2_aRydPmAjj` and `UserPoolClientId` to `2sg8nejrf2j8p28j6khjil99ir`. The runbook passes both explicitly (good), but any deploy that forgets one silently authorises the destination stack against the **source** pool — accepting source-pool JWTs in the new account. Changing the defaults belongs on the §2 #22 repo-edit list.

---

## 4. Pass 3 — §11 corrections, re-checked after the destination change

§11's own "Destination Re-point Notice" claims all 16 corrections "remain in effect." Twelve do. Four do not survive unexamined.

| Item | Verdict | Detail |
|---|---|---|
| **H1** — financial final-delta + write-freeze | **Coherent**, one amendment | Sound. Note `quantum-stripe-wallet` is **0 rows**, so the wallet half is currently a no-op and the ledger half (5 rows) carries the weight. Its clause "confirm the source QPU `KILL` row is tripped and all in-flight tasks reconciled" needs the §3 #16 correction: reconciliation is now cross-account, so "reconciled in source" is one option, not the only one. |
| **H2** — mandatory source write-freeze | **Coherent** | Mechanism (disable the source sync API stage, or `ReservedConcurrentExecutions=0`) is unchanged and still correct. |
| **M1** — move the final delta into 6.4, before FLIP #1 | **Coherent, needs re-anchoring** | The decision holds; its anchor moved. "After Amplify domain `AVAILABLE` + cert `ISSUED`" now means records in the **HQ** zone, and FLIP #1 is a `ql-hq` UPSERT. Re-anchor, don't re-decide. |
| **M2** — move the `SITE_URL` merge to the cutover window | **Coherent** | Unchanged. |
| **M3** — resolve SES to `reviews@altivum.ai` before day 0 | **INCOHERENT — must be re-decided** | Its entire justification was: choosing `quantumlearner.dev` "makes its DKIM CNAMEs depend on the zone that isn't authoritative in the destination until the LAST step (Phase 6.5) — a circular dependency that blocks the day-0 sandbox-exit request." **That circularity no longer exists.** The zone is authoritative in HQ today; DKIM CNAMEs can be published on day 0 with `--profile ql-hq`. M3 now argues for the *harder* option — DKIM in a Cloudflare zone belonging to a different organization, on a domain being decommissioned — on grounds that have evaporated. This is the one §11 item that actively points the wrong way. |
| **M4** — check DNSSEC before the delegation / NS move | **Largely moot** | The NS move already happened. Keep it as a one-time post-hoc verification that DNSSEC is not active or inconsistent on `quantumlearner.dev`; it is no longer a gate on any step Phase 2 performs, and it disappears entirely along with §6.5. |
| **M5** — pre-provision the federated user, don't JIT | **Coherent, and 5× more load-bearing** | Written for one federated user; there are **five**, and all five have sub-keyed rows. This is now the highest-value LOW-effort correction in the document. |
| **M6** — gate the NS repoint on transfer acceptance | **Moot** | Transfer and NS repoint are done. Delete with §6.5. |
| **L1** — confirm the tutor SNS sub | **Coherent, extend** | Add `quantum-analytics`'s alerts topic and the first-ever Cognito `SignupAlertTopic` to the same sweep. |
| **L2** — resolve WAF managed rule groups / CF policy ids | **Coherent** | Unchanged. |
| **L3** — verify the six Stripe lookup keys resolve to active **TEST-mode** prices | **Partly incoherent** | The six keys are right (verified against `CATALOG` in `lambda/stripe/index.mjs`: `ql_plus_monthly`, `ql_pro_monthly`, `ql_credits_500/2000/5000/10000`). But "TEST mode" is the wrong target — billing is **live** on the Quantum Learner account. Re-state as: run `scripts/stripe/check-catalog-parity.mjs` with `--expect-account` against the **sandbox** account, then against **live**. Both scripts postdate §11 and should be named in it. |
| **L4** — state the Cognito temp-host callback mechanism | **Coherent, more urgent** | 14 users and 5 IdP re-links make the two-phase-`SiteUrl`-vs-`update-user-pool-client` choice consequential rather than cosmetic. |
| **L5** — add an account-level budget + billing alarm | **Coherent, extend** | Now needed per-account across QL-Prod, HQ and Braket Workloads, and reconciled with spec Phase 0 which puts Budgets in HQ. |
| **L6** — security-header curl checks | **Coherent** | Unchanged; still HSTS-preload-critical. |
| **L7** — prefer `associate-alias` over release-then-wait | **Coherent, and now more important** | Verified the alias is still held by `E365VD5CYQX9FM` in the source account. The operation is now **cross-organization**, and the domain-ownership TXT must be published in the **HQ** zone. Release-then-wait is now strictly worse: the release window is a real outage on an HSTS-preloaded domain, and the rollback that would have covered it (§6.6 #17) is itself broken. |
| **L8** — cross-reference fixes | **Coherent** | Still applies to the inline text. |

---

## 5. §11-referenced hard identifiers — verified

**`scripts/founding-credit/cohort-2026-08.json`**

- `expectedAccountId` names the **Altivum Inc - Original Account** (the SOURCE). Confirmed by equality against `aws sts get-caller-identity --query Account` without printing either value.
- Live state: `"closed": false`, `maxRecipients: 20`, `creditsEach: 1000`, **7 recipients issued** (slots 1–7, `firstSeenAt` 2026-07-20 → 2026-07-29), `walletTable: quantum-stripe-wallet`, `region: us-east-2`.
- **It is doing its job right now**, and it must be flipped **at** cutover, not before: `run.mjs:49` aborts when the caller is in the wrong account, so changing it early disarms the guard while issuance is still live against the source wallet, and changing it late means the first post-cutover issuance aborts (safe, but confusing). §11 item 12 says "update at cutover"; **no numbered step schedules it.** Add one, in the FLIP window, alongside the Amplify env cutover.
- Note the wallet table it guards currently has **0 rows** — the seven issued slots are recorded in this file, not in the wallet, which is itself worth confirming before anyone assumes the wallet copy carries the founding gift.

**`lambda/tutor/policy.json`**

- **Still exists** (778 bytes, last modified 18 Jun), and **still carries the source account id** — in `arn:aws:bedrock:us-east-2:<source>:application-inference-profile/q050egz0q4mb`, plus three regional foundation-model ARNs for `anthropic.claude-haiku-4-5`.
- It is now a **dead artifact**. The tutor left Bedrock on 2026-08-17; `lambda/tutor/template.yaml` has no `ModelId`, no `FoundationModelId`, no `bedrock:` action, and its only model-side configuration is `SECRET_ID: !Ref SecretId`. The "raw-CLI fallback path" this document served invoked Bedrock streaming, which the handler no longer does.
- So §2 #22 ("`policy.json` line 9 → `$NEW_MODEL_ID`") and Open Q12 ("update them to avoid a stale source reference") both prescribe **maintaining a file that should be deleted**. The correct Phase 2 action is: delete `lambda/tutor/policy.json` (and scrub the same ARNs from `lambda/tutor/README.md` and `docs/eval-implementation-plans.md`), and drop the header's "do not blank them" instruction to cover only the cohort file.

---

## 6. Live-verification command log

Every command below was run read-only during this audit.

```sh
# Identity, org shape, profile resolution
aws sts get-caller-identity
aws organizations list-accounts --query 'Accounts[].{Name:Name,Status:Status}' --output table
aws organizations list-accounts --profile org-admin --query 'Accounts[].{Name:Name,Email:Email}' --output table
aws organizations describe-organization --query 'Organization.MasterAccountEmail' --output text
aws configure get sso_account_id --profile quantum-learner
aws configure get role_arn --profile ql-prod
aws configure get role_arn --profile ql-braket
aws sts get-caller-identity --profile ql-prod --query Arn --output text

# Source inventory
aws cloudformation list-stacks --region us-east-2 --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE
aws cloudformation list-stacks --region us-east-1 --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE UPDATE_ROLLBACK_COMPLETE
aws lambda list-functions --region us-east-2 --query 'Functions[?starts_with(FunctionName,`quantum`)].FunctionName'
aws dynamodb list-tables --region us-east-2
aws secretsmanager list-secrets --region us-east-2 --query 'SecretList[?starts_with(Name,`quantum`)].Name'
aws secretsmanager list-secrets --region us-east-1 --query 'SecretList[?starts_with(Name,`quantum`)].Name'
aws iam list-open-id-connect-providers

# Stack parameters / outputs
aws cloudformation describe-stacks --stack-name quantum-qpu-submit --region us-east-2 --query 'Stacks[0].Parameters'
aws cloudformation describe-stacks --stack-name quantum-tutor      --region us-east-2 --query 'Stacks[0].Parameters'
aws cloudformation describe-stacks --stack-name quantum-analytics  --region us-east-2 --query 'Stacks[0].{P:Parameters,O:Outputs}'
aws cloudformation describe-stacks --stack-name quantum-ci-drift-role --region us-east-2 --query 'Stacks[0].Outputs'
aws cloudformation describe-stacks --stack-name quantumlearner-dev-redirect --region us-east-1 --query 'Stacks[0].Parameters'
aws cloudformation describe-stack-resources --stack-name quantumlearner-dev-redirect --region us-east-1
aws cloudformation describe-stack-resource --stack-name quantumlearner-dev-redirect \
  --logical-resource-id CanarySchedule --region us-east-1 --query 'StackResourceDetail.PhysicalResourceId'

# Data inventory (COUNT only)
aws dynamodb scan --table-name <T> --select COUNT --region us-east-2 --query Count   # x7 tables
aws cognito-idp describe-user-pool --user-pool-id us-east-2_aRydPmAjj --region us-east-2
aws cognito-idp list-users        --user-pool-id us-east-2_aRydPmAjj --region us-east-2

# Amplify
aws amplify list-apps --region us-east-2
aws amplify get-app    --app-id d1ao02to23x85y --region us-east-2
aws amplify get-branch --app-id d1ao02to23x85y --branch-name main --region us-east-2
aws amplify list-domain-associations --app-id d1ao02to23x85y --region us-east-2
aws amplify get-domain-association --app-id d1ao02to23x85y --domain-name altivum.ai --region us-east-2

# DNS / CDN
aws route53 get-hosted-zone --id Z0634247WVFEYFGO8EVF                       # NoSuchHostedZone
aws route53domains list-domains --region us-east-1
aws route53 list-hosted-zones --profile ql-hq
aws route53 list-resource-record-sets --hosted-zone-id Z1001194KW3SBPXAEUGV --profile ql-hq
aws route53domains list-domains --profile ql-hq --region us-east-1
aws cloudfront list-distributions
dig +short quantumlearner.dev A ; dig +short quantumlearner.dev NS ; dig +short quantum.altivum.ai

# Cross-account Braket
aws iam get-role --role-name QuantumLearnerBraketExecution --profile ql-braket \
  --query 'Role.AssumeRolePolicyDocument'

# Destination greenfield check
aws cloudformation list-stacks --profile ql-prod --region us-east-2 --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE
aws cognito-idp list-user-pools --max-results 10 --profile ql-prod --region us-east-2
```

Repo-side reads: `docs/account-migration-runbook.md`, `docs/superpowers/specs/2026-08-27-braket-account-split-design.md` §6, `lambda/tutor/{template.yaml,policy.json,deploy-check.mjs}`, `lambda/qpu/template.yaml`, `lambda/stripe/index.mjs`, `lambda/analytics/{template.yaml,index.mjs}`, `infra/workspace/cognito.yaml`, `infra/redirect/quantumlearner-dev.yaml`, `infra/github-oidc-drift-role.yaml`, `scripts/check-lambda-drift.mjs`, `scripts/founding-credit/cohort-2026-08.json`, `.github/workflows/drift.yml`, `amplify.yml`, `Makefile`, `web/src/lib/{site.ts,auth-config.ts}`.

*(One secret value — the Braket `sts:ExternalId` — was returned by the trust-policy read and is deliberately not reproduced here.)*

---

## 7. Recommended order of repair before Phase 2 planning

1. **Delete or rename the `quantum-learner` AWS profile**, then global-replace `--profile quantum-learner` → `--profile ql-prod` (51 sites) and re-aim `altivum-mgmt` → `org-admin` for the payer step. Nothing else is safe until this is done.
2. **Rewrite §6 entirely.** It is 41% wrong. The new shape: no zone creation, no registration transfer, no NS repoint; FLIP #1 is a `ql-hq` UPSERT of four ALIAS records; the alias release from the source distribution is cross-org and should use `associate-alias` with a TXT in the HQ zone; the rollback is a `ql-hq` UPSERT back.
3. **Rewrite §2.3 and §3.3** for Anthropic-first-party: delete the Bedrock long-lead entirely, add "create the `quantum-tutor` secret", fix the `sam deploy` parameter list, and drop the dead `deploy-check.mjs` env var.
4. **Rewrite §2.4 / §3.5 / §3.10** for the Braket split: no Braket enablement in QL-Prod, carry the three cross-account parameters plus the right `ResultsBucket`, and add the trust-policy update as an explicit post-deploy step with its ordering constraint spelled out.
5. **Re-open §11 M3** (SES domain) and mark M4/M6 moot; amend L3 to sandbox-then-live with `--expect-account`.
6. **Add the missing stacks and steps**: `quantum-analytics`, `quantum-stripe-sandbox`, the drift OIDC provider + role + repo variable, the Stripe nine-event API-created endpoint, the cohort-guard flip in the FLIP window, and the `quantum.altivum.ai` Amplify domain-association detach.
7. **Re-scale §4** from 2 users to 14, email-joined, with M5 pre-provisioning mandatory for all five federated users.
