# Braket account split — dedicated QPU execution under Delta Centric

**Date:** 2026-08-27 · **Status:** Phases 0-1 EXECUTED 2026-08-28 (OIDC role + ACM + NS flip deferred to Phase 2) ·
**Decision owner:** founder · **Supersedes:** the *destination* named in
`docs/account-migration-runbook.md` (its mechanics stand; see Phase 0)

Paid subscribers should be able to run their circuits on real QPUs, with execution
going through a dedicated AWS account that runs Amazon Braket on the learner's
behalf. This spec fixes the account topology, the exact seam where QPU execution
leaves the platform account, the code and IaC changes, and the sequencing relative
to the platform migration and the (separately specified) funding path.

> **Account identifiers.** This repository is public. Per the convention set by
> `docs/account-migration-runbook.md`, AWS account numbers never appear in this
> repo — accounts are named, and ids are resolved from the organization by name at
> run time (`aws organizations list-accounts --query "Accounts[?Name=='...'].Id"`).

## 1. Target topology

The project runs under the **Delta Centric** AWS organization (not Altivum — the
org changed 2026-08-27; `CLAUDE.md` § "AWS" is the operative record):

```
Delta Centric Org (management)
└── Ventures
    └── Quantum Learner OU
        ├── QL-Prod               all production EXCEPT Braket jobs
        ├── QL-Dev                non-production twin
        ├── Braket Workloads      QPU execution only
        └── Quantum Learner - HQ  shared services (no application workload)
```

- **QL-Prod** — Amplify, Cognito, all six Lambdas, the credit wallet, the QPU
  spend ledger. The platform migration's destination.
- **Braket Workloads** — `CreateQuantumTask`/`GetQuantumTask` execution, the
  results bucket, a Braket-scoped IAM role, its own Budgets fence and spend
  alarms. Nothing else, ever: the account boundary is the blast-radius boundary.
- **HQ** — the `quantumlearner.dev` Route 53 zone, ACM certificates, shared
  artifact/log buckets, the CI/OIDC deploy role, consolidated Budgets. Prod, Dev
  and Braket consume from it.
- **Deployed reality today:** everything still runs in the Altivum original
  account. Nothing in this spec is live until its phase executes.

Name the account in every plan and command — four accounts in this OU answer to
"Quantum Learner".

## 2. The cut: option A — Lambda stays with the money, only Braket calls cross

Considered and rejected: **B** (move the whole `quantum-qpu-submit` stack into
Braket Workloads — puts an account boundary through the per-user cap, global
kill-switch and wallet debit, which today evaluate in **one** DynamoDB conditional
write) and **C** (queue between accounts — a large rewrite that complicates the
existing `qpu-release-failed` compensating-refund path for no isolation gain).

**A:** `quantum-qpu-submit` and its reconciler stay in the platform account with
the ledger, tasks table and wallet. They assume a role in Braket Workloads only to
call the Braket API. The seam is client construction: `qpu-core.mjs` is pure
DI-logic that only ever calls `braket.send(...)`; `index.mjs:10` and
`reconcile.mjs:239` construct the real client.

| Stays in QL-Prod (platform) | Moves to Braket Workloads |
|---|---|
| Lambda + reconciler, all gating logic | `CreateQuantumTask` / `GetQuantumTask` execution |
| Spend ledger, tasks table, credit wallet | Results S3 bucket (`amazon-braket-*`, eu-north-1) |
| Cap + kill-switch + debit, atomic in one conditional write | Braket-scoped execution role |
| Cognito JWT verification, edge secret | Monthly Braket Budget + SNS spend alarms |

**Ordering safety:** the spend decision (allowance, kill-switch, debit) completes
in the platform account *before* any cross-account call. A credential failure
therefore cannot create a charged-but-unsubmitted state outside the existing
compensating-refund path — it lands in `qpu-release-failed`, which already covers
"learner paid, Braket rejected".

## 3. Credential flow

- Role `QuantumLearnerBraketExecution` in Braket Workloads. Permissions, exactly:
  `braket:CreateQuantumTask` + `braket:GetQuantumTask` on the IQM Garnet device
  ARN (both documented ARN forms) and that account's quantum-task ARNs, plus
  `s3:PutObject`/`s3:GetObject`/`s3:ListBucket` on the results bucket.
- Trust policy names the QPU Lambda's execution role as principal, with an
  `sts:ExternalId` condition. The external id is deploy-time configuration
  (parameter → env), not a repo literal.
- Trust evolves with the migration: today's principal is the Altivum stack's
  role; at Phase 2 cutover the QL-Prod role is **added**, and the Altivum
  principal is **removed only after** cutover verification.
- The SDK's `fromTemporaryCredentials` caches and auto-refreshes: one STS call
  per cold container, not per submit.
- Braket writes results under the caller's identity (`qpu-core.mjs:593`), so with
  the assumed role as caller, result data lands in Braket Workloads and never in
  the platform account.

## 4. Code changes

Three files; the money logic is not one of them.

- `lambda/qpu/index.mjs` and `lambda/qpu/reconcile.mjs` — construct the
  `BraketClient` with `fromTemporaryCredentials({ RoleArn, ExternalId })` **iff**
  `BRAKET_ROLE_ARN` is set; unset reproduces today's same-account behaviour
  byte-for-byte. Same env-gated pattern as `WALLET_TABLE` and `RATE_CARD`.
- `lambda/qpu/qpu-core.mjs` — **no change.**
- Tests: existing suites inject a fake `braket` into `createHandlerCore` and are
  unaffected. New `template.test.mjs` assertions: the role/external-id parameters
  are wired to the env, the inline `braket:*` grants are gone, and the S3 result
  grants are gone from the platform template.

## 5. IaC changes

- `lambda/qpu/template.yaml` — add `BraketRoleArn` / `BraketExternalId`
  parameters (default `""` = split off, exactly like `WalletTableName`); replace
  the inline Braket grants (~:231–242) and S3 result grants (~:243–249) with a
  single `sts:AssumeRole` on that one role, conditional on the parameter.
- `infra/braket-workloads/template.yaml` — **new**, deployed to Braket Workloads,
  eu-north-1: the execution role + trust, the `amazon-braket-*` results bucket
  with lifecycle cleanup, the monthly Braket Budget, and the SNS topic whose
  notifications the existing kill-switch consumes.
- Drift tooling grows an account dimension: `make drift` /
  `.github/workflows/drift.yml` must check QL-Prod *and* Braket Workloads, or the
  daily job silently checks the wrong account — the exact failure class it exists
  to catch.
- The CI/OIDC deploy role lives in **HQ** (shared services), not duplicated per
  account.

## 6. Sequencing

- **Phase 0 — Foundations.** HQ: hosted zone, ACM, OIDC deploy role, Budgets.
  Re-point `docs/account-migration-runbook.md` at **QL-Prod** — its current
  destination is a similarly-named account in the *Altivum* org; executing it as
  written migrates to the wrong organization. Its §11 corrections carry over.
- **Phase 1 — Braket split, from Altivum.** Deploy the Braket Workloads template;
  trust the Altivum stack role; flip `BraketRoleArn` on the live stack; verify
  with **one real submit** (cheapest Garnet run) — a mock proves nothing about
  cross-account trust, bucket ACLs, or eu-north-1. Deliverable: QPU execution and
  spend isolated while the platform is still in Altivum. Independent of Phase 2.
- **Phase 2 — Platform migration, Altivum → QL-Prod.** The re-pointed blue-green
  runbook: Cognito, DynamoDB, Lambdas, Amplify, Stripe webhooks, domain flip.
  Add the QL-Prod principal to the Braket trust; drop the Altivum principal after
  verification. Drift tooling gains its account dimension here.
- **Phase 3 — Funding path** (rule 14 order; separate spec): storefront opens and
  buying is verified sandbox-then-live → server-published QPU quote replaces the
  client-derived confirm figure → rate-card cutover (`RateCardSecret` +
  `WalletTableName` on both stacks in one deploy, parity re-run) → copy flips in
  the same commits that make it true, deleting the corresponding
  `test_pricing_prose.py` ban patterns alongside — never before.

## 7. Rollback

Every phase is a parameter flip back: unset `BraketRoleArn` and the stack is
same-account again (Phase 1); blue stays live until explicit cutover (Phase 2);
metering parameters return to `""` (Phase 3). No phase deletes the thing it
replaces until the replacement is verified.

## 8. Non-goals and open questions

- Funding-path details (tier gating, credit expiry, quote API shape) are Phase 3's
  own spec, not this one.
- QL-Dev's contents — a full platform twin vs. per-stack dev deploys — is decided
  when Phase 2 planning starts.
- Whether Braket Workloads also serves managed simulators (SV1/DM1/TN1) later:
  the role is device-scoped today; widening it is a deliberate future edit, not a
  default.
