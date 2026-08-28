# Phase 2 — the platform moves to QL-Prod, and quantumlearner.dev becomes canonical

**Date:** 2026-08-28 · **Status:** APPROVED IN CHAT, awaiting spec review ·
**Decision owner:** founder · **Supersedes:** the BODY of
`docs/account-migration-runbook.md` (see "Relationship to the old runbook" below) ·
**Parent:** `docs/superpowers/specs/2026-08-27-braket-account-split-design.md` §6, Phase 2

The Quantum Learner platform — Amplify, Cognito, six Lambdas and their edges, the
learner data — moves from the Altivum original account to **QL-Prod** in the Delta
Centric org, blue-green: everything is built and verified in QL-Prod before any
traffic moves. In the same cutover, **`quantumlearner.dev` becomes the canonical
domain** and `quantum.altivum.ai` becomes a redirect to it. Founder decisions
recorded 2026-08-28: canonical flip rides with the migration; native users get the
password-reset flow with no advance notice; build and flip run continuously with
founder gates at each flip point.

> **Account identifiers.** This repository is public. Accounts are named, never
> numbered; ids resolve from the org by name at run time. CLI: `ql-prod`,
> `ql-hq`, `ql-braket` chain through `org-admin`. The default profile is the
> Altivum SOURCE and is read-only for this migration except at teardown.

## Relationship to the old runbook

`docs/account-migration-runbook.md` (2026-07-18) was audited step-by-step against
live reality on 2026-08-28 — the audit is committed beside this spec as
`2026-08-28-phase2-runbook-audit.md`. Of its 116 steps, 47 remain correct, 47 are
stale, 3 are already done, and **19 would break production if executed** — among
them a still-working CLI profile that deploys into the retired destination org, a
DNS rollback aimed at a hosted zone that no longer exists, and a teardown that
deletes the distribution the live domain resolves to. The runbook's *mechanics*
(blue-green, per-stack verification, §11's surviving corrections) inform this
spec; its step list is retired. The runbook file itself is deleted at the end of
this migration, its header replaced by a pointer here — a document proven 41%
wrong in its most dangerous section must not remain executable-looking in a repo
agents read.

## 1. What exists, verified live 2026-08-28

**Source (Altivum original account):** 10 stacks in us-east-2
(`quantum-workspace-auth`, `quantum-workspace-sync`, `quantum-tutor`,
`quantum-qpu-submit`, `quantum-stripe`, `quantum-stripe-sandbox`,
`quantum-review-email`, `quantum-analytics`, `quantum-ci-drift-role`,
`quantum-ci-standby`), 3 in us-east-1 (`quantum-tutor-edge`, `quantum-qpu-edge`,
`quantumlearner-dev-redirect`), the Amplify app "Altivum Quantum Computing", and
the Google OAuth client (console-managed).

**Learner data (tiny, and this is load-bearing):** `quantum-stripe-wallet` **0
rows** — no wallets exist, so there is no Stripe-side identity to remap and no
money at risk in the data move. `quantum-qpu-ledger` 5, `quantum-qpu-tasks` 8,
`quantum-workspace-progress` 4, `quantum-review-email-prefs` 2 — **~19 rows keyed
by Cognito `sub`** (`WALLET#`/`USER#`/`CRED#` prefixes and sync's bare `userId`;
verified in every handler). `quantum-analytics-daily` 9 aggregate rows, not
per-user.

**Users:** pool `quantum-workspace` has **14** — 9 native email+password (all
CONFIRMED) and 5 Google-federated. Native users cross via password reset;
federated users re-link through the Google IdP and need no reset.

**Destination:** QL-Prod is greenfield — zero stacks, tables, buckets, pools
(verified via `ql-prod`). DNS already lives in HQ: the `quantumlearner.dev` zone
is authoritative there, apex/www currently ALIAS to the *source* redirect
distribution.

**Already migrated, must not regress:** QPU Braket execution runs cross-account
in Braket Workloads. The migrated `quantum-qpu-submit` MUST carry
`BraketRoleArn`, `BraketExternalId` (1Password: *Quantum Learner / Braket
ExternalId*), `BraketSpendTopicArn`, and `ResultsBucket=` the **Braket-account**
bucket — and the Braket-account role's trust policy must ADD the QL-Prod function
roles after they exist (their names carry CloudFormation-generated suffixes, so
this is deploy-then-trust, not pre-staged). The Altivum principals stay trusted
until teardown.

## 2. Identity: new pool, same learners

A Cognito user pool cannot move between accounts, and a new pool mints new `sub`
values. The design:

- **New pool in QL-Prod** from `infra/workspace/cognito.yaml`, same
  email-as-username shape, plus the Google IdP. The Google OAuth client gains the
  new Cognito domain's redirect URI — a **console step** (CLAUDE.md records OAuth
  client management as console-only), founder-gated.
- **Native users (9):** recreated by email with `email_verified=true` in
  FORCE_CHANGE_PASSWORD-free form: `admin-create-user` (SUPPRESS) + no password →
  the learner lands in the normal **"Forgot password"** reset flow on first
  login. No advance notice (founder decision). MFA stays OFF, matching the source
  pool.
- **Federated users (5):** nothing to create — Cognito materializes them on first
  Google sign-in through the new IdP.
- **The `sub` remap:** after creating the 9 native users, build
  `old_sub → new_sub` by email (federated subs map on their first sign-in — see
  the deferred-remap note below). Rewrite the ~19 rows across the four sub-keyed
  tables in the DESTINATION copies. The founder's grandfathered `capMicros`
  ledger row is on this list and is the single row whose loss would be
  irreversible learner harm — it is verified item #1.
- **Deferred remap for federated users:** a federated user's new `sub` does not
  exist until they first sign in. Their old rows (if any) are staged under
  `PENDING#<email-hash>` in the destination and folded in by a small one-shot
  script run after each first sign-in; at 5 users this is operational, not
  automated. INTERNAL_DOMAIN stays `altivum.ai` (CLAUDE.md: decide when the
  signup alert actually deploys — it still has not).

## 3. The build (no user-visible change until §5)

Deploy order in QL-Prod, us-east-2 unless noted, each stack `sam build && sam
deploy` from main with parameters read from the SOURCE stack first (the
Braket-split lesson: every parameter re-passed explicitly, and the four
cross-account QPU parameters move together):

1. **Foundations:** the six DynamoDB tables (from each stack's template — they
   are stack-owned), Secrets Manager secrets re-created by hand
   (`quantum-qpu-edge-secret`; the tutor's `quantum-tutor` secret when/if it
   exists — it does not today), SSM/`samconfig` never committed.
2. **Auth** (`quantum-workspace-auth`): the new pool + Google IdP + hosted
   domain. Console step: Google OAuth redirect URIs.
3. **App stacks:** sync, tutor, review-email, stripe (+sandbox), analytics, qpu.
   QPU carries the Braket parameters; then the Braket-account trust policy gains
   the two new QL-Prod role ARNs (deploy-then-trust).
4. **Edges** (us-east-1): `quantum-tutor-edge`, `quantum-qpu-edge` — new
   CloudFront distributions and WAFs in QL-Prod.
5. **Amplify:** new app in QL-Prod connected to the same GitHub repo (console
   step for the GitHub authorization), env vars copied from the source app with
   these changes: pool/client ids → the new pool; `NEXT_PUBLIC_TUTOR_URL` → the
   new tutor edge; QPU URL → the new edge; site URL → `https://quantumlearner.dev`.
6. **Data:** export the six tables from source, transform through the `sub` map,
   import to destination. Wallet table imports empty (0 rows — verified, not
   assumed). Analytics-daily copies as-is.
7. **Stripe (live account, `--expect-account` guarded):** create the NEW live
   webhook endpoint via the API — all nine `REQUIRED_WEBHOOK_EVENTS`, pinned
   `api_version`, pointing at the new API URL — using
   `scripts/stripe/rotate-webhook-endpoint.mjs`'s creation path or the API
   directly; store the new signing secret in the QL-Prod secret. The OLD endpoint
   stays active until cutover verification, then is disabled (not deleted) for
   one day. `make stripe-parity ACCOUNT=<live>` must pass against the new
   endpoint before cutover.

## 4. The web code change (one PR, lands before the flip)

Canonical-domain flip in the repo: `web/src/lib/site.ts` base URL, sitemap,
robots, OG/metadata, the privacy page's rendered contact origin, any i18n string
naming `quantum.altivum.ai`, and the pricing/copy-honesty guards re-run. Plus a
**changelog entry in both locales** (the guard will demand it — this is
learner-visible). The redirect direction inverts: `quantum.altivum.ai` →
`https://quantumlearner.dev` (301), served by a small CloudFormation stack in
QL-Prod (CloudFront + certificate) with DNS staying wherever `altivum.ai`'s zone
lives today. HSTS-preload caution from the audit: `.dev` is preloaded, so the
apex must always answer HTTPS with a valid cert — the Amplify custom-domain cert
must be ISSUED and attached before any DNS moves.

## 5. Cutover (founder gate; minutes, reversible at each step)

1. Freeze: announce nothing, change nothing in source. Take fresh table exports
   (the delta since §3.6 is re-applied — at ~19 rows this is a re-run, not a
   diff).
2. HQ zone: apex + `www` ALIAS → the new Amplify/CloudFront domain. (The HQ zone
   already serves MX/TXT — untouched.)
3. Verify live: site loads at `https://quantumlearner.dev` (fresh resolver +
   `dig @hq-ns`), login works for a native user (password reset flow) and a
   Google user, tutor streams, QPU budget endpoint answers, one sandbox Stripe
   checkout round-trips, analytics counter increments.
4. Flip the redirect: `quantum.altivum.ai` → 301 → `quantumlearner.dev`.
5. Stripe: confirm webhook deliveries arrive at the NEW endpoint (a
   `stripe events resend` against a sandbox event, then live delivery logs);
   disable the old endpoint.
6. Rollback at any point before step 4: repoint the HQ apex/www ALIASes back to
   the source distribution — the source stack is untouched until teardown, and
   both answer identically for everything but auth (which only moves forward).

## 6. After: verification, drift, teardown

- **Drift tooling gains its account dimension** (deferred from the Braket split):
  the OIDC deploy/drift role moves to its spec-designated home, deployed from
  `infra/github-oidc-drift-role.yaml`'s pattern into QL-Prod (application drift)
  with the repo variable `AWS_DRIFT_ROLE_ARN` updated;
  `scripts/check-lambda-drift.mjs` reads the same functions in the new account.
  `make drift` must pass green against QL-Prod before teardown begins.
- **Teardown is a SEPARATE, later decision** — nothing in the Altivum account is
  deleted at cutover. A follow-up pass (≥1 week of green) deletes the 13 source
  stacks in reverse dependency order, with the redirect stack LAST and only after
  confirming nothing resolves to it (the audit's finding #3). The old Stripe
  webhook endpoint, the source tables, and the Amplify app go in that pass.
  `scripts/founding-credit/cohort-2026-08.json`'s `expectedAccountId` spend guard
  is updated to QL-Prod in the same PR that begins teardown, never before.
- **CLAUDE.md** updates in the cutover PR: deployed-reality section, the email
  table (unchanged addresses, new account), the canonical domain.

## 7. Out of scope

Phase 3 (storefront, metering, rate card) — unchanged, still behind rule 14.
Deleting the old personal-account hosted zone — separate, after its one-day
confidence window. The `hq@` Google-Workspace delivery policy question — open,
does not block (SNS→email to hq@ is proven working; only external senders are
affected). Altivum-org-wide inventory of other products — the founder's broader
deprecation strategy, tracked separately.

## 8. Risks the design already carries answers for

| Risk | Answer |
|---|---|
| Deploy lands in the wrong account | Every command carries an explicit profile; the retired `quantum-learner` profile is REMOVED from `~/.aws/config` as step zero |
| `sub` orphaning | The remap in §2, verified row-by-row; wallet table is empty so no money moves |
| Stripe webhook regression to 4-of-9 events | Created via API with all nine + pinned version; parity script gates cutover |
| Braket split regression | The four parameters move together; deploy-then-trust sequencing; the live 1-shot verification re-run in QL-Prod before cutover |
| HSTS lockout on a `.dev` apex | Cert issued and attached before DNS moves; rollback is an ALIAS repoint |
| Password-reset confusion | 9 users, reset flow only, founder accepted; Google users unaffected |
