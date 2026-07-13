# quantum-qpu-submit

The server-side, hard-capped path by which a learner spends **real money** on QPU
hardware (Phase 4 / R4). Submission runs under this stack's Braket execution role
— the browser never holds AWS creds, it presents a Cognito JWT from the existing
`quantum-workspace` pool. Every run is gated, capped, and accounted **before** the
Braket task is created. This is **PR-1: the core**; the WAF/CloudFront edge and the
Budgets-driven auto-kill land in PR-2, the frontend in PR-3, badge capture in PR-4.

## Launch posture (user-approved 2026-07-07)

| Control | Value |
|---|---|
| Device (v1) | **IQM Garnet only** (`$0.30 + $0.00145/shot`) |
| Shot ceiling | **1000** → $1.75 max per run |
| Per-user LIFETIME cap | **$5.00** |
| Per-day GLOBAL kill-switch | **$15.00/day** (resets 00:00 UTC) |
| Entitlement | verified email **+** a **server-minted cost-estimate credential** (`POST /qpu/credential`) |

## How it works

- **Reconcile** (`reconcile.mjs`, scheduled every 5 min): scans `SUBMITTED` tasks, calls
  `GetQuantumTask` on IQM Garnet, and marks each `COMPLETED` (keeps the charge — this is what
  lights the learner's **hardware credential** from real provenance) or refunds a
  `FAILED`/`CANCELLED` run. Every write is guarded on `status = SUBMITTED`, so the at-least-once,
  out-of-order nature of task state can never double-apply. It also sweeps `RESERVED` rows older
  than 5 minutes (well past the submit Lambda's 20s timeout, so it never races an in-flight
  submit): a stuck reservation with no `taskArn` — the mid-flight-death case — can't be resolved
  without the ARN, so it's counted `orphaned` and logged for manual review (its money stays
  reserved, never lost).
- **`POST /qpu/submit`** `{ device, shots, qasm, idempotencyKey }` — validates, checks
  the entitlement gate, then runs ONE atomic `TransactWriteItems` that reserves budget
  against the per-user cap, the per-day global cap, an idempotency guard, and a global
  `KILL` flag. **All four pass or nothing commits.** Only then does it call
  `CreateQuantumTask`; a failed submit runs a compensating release. Returns `202` with
  the task ARN, or `402`/`503` if a cap is hit.
- **`GET /qpu/budget`** — the user's `{ capMicros, spentMicros, remainingMicros, credentialed, tasks }`.
- **`GET /qpu/credential`** — the per-user challenge (`{ requiredShots, device, credentialed }`).
- **`POST /qpu/credential`** `{ answerCents }` — the learner prices the required IQM Garnet run; the server **re-computes the true cost** (replicating the app's cent-settlement) and mints a credential in the server-only ledger row `CRED#<sub>` only if it matches. Unlike a client-authored `qc:*` flag, this credential cannot be forged by a `localStorage` set or a sync `PUT`.
- Money is tracked in integer **micro-dollars** (no float drift). Two DynamoDB tables:
  `quantum-qpu-ledger` (caps/spend + the KILL row) and `quantum-qpu-tasks` (idempotency +
  the R9 hardware-badge provenance: task ARN, result S3 URI, circuit hash).

All logic is in `qpu-core.mjs`, dependency-injected so it unit-tests offline with zero
AWS: `cd lambda/qpu && npm ci && npm test` (`node --test`).

## Deploy (operator-run — prod AWS; not runnable by the assistant)

**Prerequisites** (all already present on the Altivum prod account):

1. **Braket results bucket** in **eu-north-1**, named `amazon-braket-eu-north-1-<account>`, so
   the Braket service-linked role can write results.
2. The existing Cognito pool `us-east-2_aRydPmAjj` / client `2sg8nejrf2j8p28j6khjil99ir`.

**0. The edge secret (Secrets Manager, multi-region).** The `x-qpu-edge` shared secret is
resolved from Secrets Manager at deploy time via `{{resolve:secretsmanager:...}}` — it is
never passed on the command line. Create it once with a replica in the edge region so both
stacks resolve it by name (the value from `openssl` is never printed):

```
V=$(openssl rand -hex 32); aws secretsmanager create-secret \
  --name quantum-qpu-edge-secret --secret-string "$V" \
  --region us-east-2 --add-replica-regions Region=us-east-1
```

**1. Main stack** (us-east-2):

```
cd lambda/qpu && npm ci && sam build
sam deploy --stack-name quantum-qpu-submit --region us-east-2 \
  --capabilities CAPABILITY_IAM --resolve-s3 \
  --parameter-overrides ResultsBucket=amazon-braket-eu-north-1-<account>
```

Creates the HTTP API (Cognito JWT authorizer), the submit/budget + reconcile + kill-switch
Lambdas (least-privilege), the ledger/tasks tables (Retain + PITR), the SNS/Budget, and
resolves `EDGE_SECRET` from the secret above.

It also wires the **human notification path** (parameter `AlertEmail`, default
christian.perez@altivum.io): a `quantum-qpu-alerts` SNS topic receives an Errors alarm per
Lambda, a dead-reconciler alarm (zero invocations in an hour, breaching on missing data so a
deleted schedule rule also alerts), and a `QuantumQpu/OrphanedMoneyRow` alarm fed by a metric
filter on the reconcile log group's exact `qpu-reconcile: orphaned row` line. The same email
is subscribed directly to the kill-switch topic and to both budget thresholds, so a budget
crossing or a kill event reaches a human even if a Lambda is broken. **After the first deploy,
confirm the two SNS email subscriptions from the inbox** (Budgets emails need no confirmation).
`template.test.mjs` locks all of this in place offline.

**2. Edge stack** (us-east-1 — CLOUDFRONT-scope WAF must live there). Pass the host of the
main stack's `QpuUrl` output as `ApiDomain`:

```
sam deploy --template-file edge.yaml --stack-name quantum-qpu-edge --region us-east-1 \
  --resolve-s3 --parameter-overrides ApiDomain=<host of QpuUrl>
```

**3. Point the frontend at CloudFront.** Set `NEXT_PUBLIC_QPU_URL` to `https://<edge stack's
DistributionDomainName>/` (NOT the API URL) in Amplify — merge it into the existing env map
(`aws amplify update-app --environment-variables` REPLACES the whole map, so read + merge).

**Feature stays dark** until `NEXT_PUBLIC_QPU_URL` is set in Amplify.
Nothing spends a cent before then. `EdgeSecret` empty = the edge check is off (the API works
without CloudFront), so PR-1..PR-3 deploy and pass tests before the edge exists.

## Safety notes

- **The hard caps are the real spend boundary.** The per-user `$5` lifetime cap and the
  `$15/day` global kill-switch, enforced atomically before every submit, bound abuse even
  if the entitlement gate is scripted past. The credential gate is **server-verified
  competency** (the server re-computes the true cost before minting, and the credential lives
  in a server-only row no client can write) — genuine, but not cryptographic sybil-proofing.
  Sizing the caps assumes a determined attacker can still mint the credential per account.
- The DynamoDB reservation is the true spend ceiling — request-rate limits (reserved
  concurrency, and the WAF in `edge.yaml`) only slow abuse, they don't cap spend. The WAF is
  defense-in-depth; the `x-qpu-edge` secret makes it non-bypassable, but the caps hold even
  if it were bypassed.
- **AWS Budgets only *alert* — the kill-switch is the hard stop.** A monthly `$150` Braket
  budget publishes to an SNS topic at 80%/100%; the `quantum-qpu-killswitch` Lambda flips the
  ledger `KILL` row to `disabled=true` — the 4th condition in the submit reservation, so every
  new submission then returns `503`. The operator hears each threshold directly (Budgets EMAIL
  subscriber and the kill-switch topic's email subscription), and a kill-switch Lambda failure
  trips the `quantum-qpu-killswitch-errors` alarm, so neither the crossing nor a disarmed hard
  stop is ever silent. **Re-enabling is a deliberate operator action:** delete
  the `KILL` item (or set `disabled=false`) in `quantum-qpu-ledger` after resolving the cause,
  e.g. `aws dynamodb delete-item --table-name quantum-qpu-ledger --key '{"pk":{"S":"KILL"}}'`.
- The refund path fires **only** when `CreateQuantumTask` itself fails (a real, billable task
  is never refunded by a later bookkeeping failure). Refunds are idempotent (guarded on
  `status = RESERVED`). A mid-flight Lambda death can still leave a charged `RESERVED` row with
  no `taskArn`; the durable reconciler that recovers those lands in **PR-4** (it also reconciles
  a failed/cancelled task's actual cost down — v1 conservatively over-charges, never over-spends).
