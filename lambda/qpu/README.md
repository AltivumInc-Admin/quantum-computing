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

**Prerequisites**

1. **Braket results bucket** in **eu-north-1** (IQM Garnet's region), named
   `amazon-braket-eu-north-1-<account>` so the Braket service can write results.
   *(Verify the exact bucket-policy / Braket service-linked-role requirements against the
   current Braket docs before first submit.)*
2. The existing Cognito pool `us-east-2_aRydPmAjj` / client `2sg8nejrf2j8p28j6khjil99ir`
   (reused as-is, no change).

**Ship it** (us-east-2):

```
cd lambda/qpu
npm ci
sam build
sam deploy --guided --region us-east-2 \
  --parameter-overrides ResultsBucket=amazon-braket-eu-north-1-<account>
```

The stack creates the HTTP API (Cognito JWT authorizer), the submit/budget Lambda with a
least-privilege role (`braket:CreateQuantumTask` scoped to the IQM Garnet device ARN,
`dynamodb` item actions on the two tables, read-only `GetItem` on the sync table, `s3` on
the results bucket), and the two ledger/tasks tables (Retain + PITR).

**Edge (WAF) — `edge.yaml`, a SEPARATE `us-east-1` stack.** WAFv2 can't attach to an HTTP
API directly, so `edge.yaml` fronts it with CloudFront + a CLOUDFRONT-scope WAF (per-IP rate
limit + the AWS managed common rule set) and injects a secret `x-qpu-edge` header the Lambda
requires — so the public HTTP API URL can't be hit directly to bypass the WAF. Deploy order:

1. `sam deploy` the main stack (us-east-2) with `EdgeSecret=<a random secret>`.
2. Deploy `edge.yaml` in `us-east-1` with `ApiDomain=<host of QpuUrl>` and the **same**
   `EdgeSecret`.
3. Point `NEXT_PUBLIC_QPU_URL` at the CloudFront `DistributionDomainName` (not the API URL).

**Feature stays dark** until the frontend ships AND `NEXT_PUBLIC_QPU_URL` is set in Amplify.
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
  new submission then returns `503`. **Re-enabling is a deliberate operator action:** delete
  the `KILL` item (or set `disabled=false`) in `quantum-qpu-ledger` after resolving the cause,
  e.g. `aws dynamodb delete-item --table-name quantum-qpu-ledger --key '{"pk":{"S":"KILL"}}'`.
- The refund path fires **only** when `CreateQuantumTask` itself fails (a real, billable task
  is never refunded by a later bookkeeping failure). Refunds are idempotent (guarded on
  `status = RESERVED`). A mid-flight Lambda death can still leave a charged `RESERVED` row with
  no `taskArn`; the durable reconciler that recovers those lands in **PR-4** (it also reconciles
  a failed/cancelled task's actual cost down — v1 conservatively over-charges, never over-spends).
