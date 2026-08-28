# Braket Workloads — the dedicated QPU-execution account

Phase 1 of the Braket account split (`docs/superpowers/specs/2026-08-27-braket-account-split-design.md`
§2, §3). Two CloudFormation stacks, both deployed to the **Braket Workloads**
account (Delta Centric org, Quantum Learner OU), in two different regions —
see "Two stacks, two regions" below for why. Per the spec's
account-identifier convention, this account is referred to by name only in
this repo; resolve its id from the organization at run time, never write it
down.

## The cut, and the hard rule

The spec's option A keeps `quantum-qpu-submit` and its reconciler — all the
gating logic, the spend ledger, the tasks table, the credit wallet — in the
platform account. Only the Braket API calls themselves cross the account
boundary: the platform Lambdas assume a role here, call `CreateQuantumTask` /
`GetQuantumTask`, and Braket writes results under the caller's (assumed-role)
identity, so result data lands in this account and never in the platform's.

**Nothing else ever lives here.** This account holds exactly four things,
split across the two stacks below:

- `ExecutionRole` (`QuantumLearnerBraketExecution`) — trusts only the
  platform's QPU submit and reconcile function roles (`PlatformRoleArns`),
  gated by an `sts:ExternalId` condition. Scoped to `CreateQuantumTask` /
  `GetQuantumTask` on the IQM Garnet device (both ARN forms) and to
  read/write on the results bucket. Nothing broader.
- `ResultsBucket` — the `amazon-braket-*`-prefixed bucket Braket requires for
  writes, private, encrypted, 90-day result expiry.
- `BraketBudget` — a monthly USD ceiling on this account's Braket spend.
  `AWS::Budgets::Budget` only *alerts* — see below.
- `SpendTopic` — the SNS topic the budget publishes 80%/100% breaches to,
  and that the platform account is granted cross-account `Subscribe`/
  `Receive` on.

The account boundary is deliberately the blast-radius boundary: no wallet, no
Cognito, no application Lambda, no learner data of any kind belongs here. If
a future change would add any of that, it belongs in the platform account
instead (spec §2's table draws the line).

## Two stacks, two regions

`AWS::Budgets::Budget` is not registered as a CloudFormation resource type in
eu-north-1 for this account — verified 2026-08-27:

```bash
aws cloudformation list-types --region eu-north-1 --profile org-admin \
  --type RESOURCE --visibility PUBLIC \
  --filters Category=AWS_TYPES,TypeNamePrefix=AWS::Budgets
# -> { "TypeSummaries": [] }

aws cloudformation list-types --region us-east-1 --profile org-admin \
  --type RESOURCE --visibility PUBLIC \
  --filters Category=AWS_TYPES,TypeNamePrefix=AWS::Budgets
# -> lists AWS::Budgets::Budget and AWS::Budgets::BudgetsAction
```

That isn't a contingency to route around — it's the settled design. This
directory holds two independent stacks:

- **`template.yaml`** → stack `quantum-braket-workloads`, region
  **eu-north-1** (IQM Garnet's region). `ExecutionRole` and `ResultsBucket`
  only. The bucket has to be co-regional with the device, and Braket writes
  results synchronously at task completion, so this half cannot move.
- **`budget.yaml`** → stack `quantum-braket-spend`, region **us-east-2**
  (same region as the platform stack that subscribes to `SpendTopic`).
  `SpendTopic`, `SpendTopicPolicy`, and `BraketBudget` only. A Budgets
  `COST` budget is account-scoped regardless of which region its stack
  deploys to — `budget.yaml`'s `BraketBudget` still fences **all** Braket
  spend in this account, including `template.yaml`'s eu-north-1 execution
  role's usage. Putting the topic in us-east-2 is a convenience for the
  platform-side subscriber, not a requirement of the budget itself.

Neither stack depends on the other's outputs; deploy them in either order.

## How the kill-switch subscription works

AWS Budgets can only *alert* — it never stops billing on its own. The real
hard stop is `lambda/qpu/killswitch.mjs`, running in the **platform**
account: it is subscribed to an SNS topic and, on any message, flips the
spend ledger's `KILL` row to `disabled=true`. `KILL` is the fourth condition
in the submit Lambda's atomic reservation (`qpu-core.mjs`), so once tripped,
every new submission returns `503` — already-queued tasks still bill, but
nothing new is admitted.

Before this split, that topic was `quantum-qpu-killswitch`, created and
subscribed to in the same stack as the Lambda (`lambda/qpu/template.yaml`'s
`KillSwitchTopic` / `KillSwitchFunction`, wired with a SAM `Events: SNS`
source). After this split, the budget breach originates in a **different**
account: `budget.yaml`'s `SpendTopic`, publishing from *this* account's
Braket budget. `SpendTopicPolicy` grants the platform account's root
principal `sns:Subscribe` and `sns:Receive` on `SpendTopic` for exactly this
reason — so the platform's kill-switch Lambda can hold a cross-account
subscription to it. Wiring that subscription onto the existing
`KillSwitchFunction` is Task 5's job, on the platform stack; this stack only
produces the topic (output `SpendTopicArn`) and the grant that makes the
cross-account subscribe possible.

**Re-enabling after a trip is a deliberate operator action**, documented in
`lambda/qpu/README.md`: delete (or clear) the `KILL` item in the platform
account's ledger table once the cause is resolved, e.g.

```bash
aws dynamodb delete-item --table-name quantum-qpu-ledger --key '{"pk":{"S":"KILL"}}'
```

Nothing in either stack here re-enables itself.

## Deploy (Task 7 — not run by this task)

```bash
aws cloudformation deploy \
  --profile ql-braket \
  --region eu-north-1 \
  --stack-name quantum-braket-workloads \
  --template-file infra/braket-workloads/template.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides PlatformRoleArns=... ExternalId=... PlatformAccountId=...
```

```bash
aws cloudformation deploy \
  --profile ql-braket \
  --region us-east-2 \
  --stack-name quantum-braket-spend \
  --template-file infra/braket-workloads/budget.yaml \
  --parameter-overrides PlatformAccountId=...
```

No `--capabilities CAPABILITY_NAMED_IAM` on the second command — `budget.yaml`
creates no IAM resources.

`ql-braket` is a chained CLI profile: the `org-admin` SSO profile (Delta
Centric management) assumes `OrganizationAccountAccessRole` in the Braket
Workloads account — the same pattern `docs/account-migration-runbook.md`
uses for `ql-prod` and `infra/hq/README.md` uses for `ql-hq`. `ExternalId` is
generated once and kept in 1Password, never committed. `PlatformRoleArns`
and `PlatformAccountId` are looked up from the platform stack (Task 7).

## Outputs

- `template.yaml` → `ExecutionRoleArn`, `ResultsBucketName`
- `budget.yaml` → `SpendTopicArn`

All three are consumed as parameters on the platform stack (Task 5): the QPU
submit and reconcile Lambdas' `BraketRoleArn`, the reconciler's expected
results-bucket location, and the kill-switch's cross-account SNS
subscription target, respectively.

## Rollback

```bash
aws cloudformation delete-stack --profile ql-braket --region eu-north-1 --stack-name quantum-braket-workloads
aws cloudformation delete-stack --profile ql-braket --region us-east-2 --stack-name quantum-braket-spend
```

Per spec §7, every phase of this split is a parameter flip back on the
platform side (unsetting `BraketRoleArn` reverts the platform stack to
same-account behaviour byte-for-byte) before either stack here is ever
deleted. Deleting `quantum-braket-workloads` while `BraketRoleArn` is still
set on the live platform stack breaks QPU execution; deleting
`quantum-braket-spend` while the platform's kill-switch still holds a
subscription on `SpendTopic` breaks the budget alert path silently — confirm
the flip first, either way.

## Verified (2026-08-28)

Phase 1 executed and confirmed live against real Braket hardware, per Task 9
of the account-split plan
(`.superpowers/sdd/2026-08-27-braket-account-split/progress.md`):

- **Cross-account execution is live.** `quantum-qpu-submit` and its
  reconciler both execute `CreateQuantumTask`/`GetQuantumTask` under the
  assumed role, with
  `BRAKET_ROLE_ARN=arn:aws:iam::<braket-acct>:role/QuantumLearnerBraketExecution`
  and the external id read from 1Password (`Quantum Learner / Braket
  ExternalId`). The wiring is env-gated: unset reproduces same-account
  execution byte-for-byte — that is the rollback.
- **`ResultsBucket` now must be the Braket-account bucket**
  (`amazon-braket-ql-results-<braket-acct>`). Passing the old platform bucket
  makes Braket return `ValidationException` ("caller can't access bucket") —
  this happened during the live cutover and was fixed by redeploying with the
  corrected value; it is not a hypothetical failure mode.
- **All three stacks are deployed:** `quantum-braket-workloads` (eu-north-1 —
  execution role + results bucket), `quantum-braket-spend` (us-east-2 —
  budget + spend topic; `AWS::Budgets::Budget` is not in eu-north-1's CFN
  registry for this account, which is why the budget lives in its own
  stack/region), and `quantum-hq-foundations` (us-east-1 — dormant
  `quantumlearner.dev` zone + OU budget). The NS delegation flip, ACM
  issuance, and the CI/OIDC deploy role all remain deferred to Phase 2.
- **The kill-switch spans the account boundary.** The Braket account's budget
  topic notifies the platform account's `quantum-qpu-killswitch` Lambda
  cross-account, proven by drill: a manual publish flipped the ledger's
  `KILL` row, and it was cleared afterward.
- **A real hardware run completed end to end.** A 1-shot task on IQM Garnet
  reached `COMPLETED`; `results.json` landed in the Braket-account bucket
  only. The reconciler settled the ledger at `spentMicros=301450`, matching
  the reservation exactly, and the compensating-release path was proven on
  two separate failed submit attempts. `AlertEmail` on the live stack is now
  `hq@quantumlearner.dev`, and both of its SNS email subscriptions are
  confirmed.

**Operational notes — one-time account enablements this cutover needed**
(neither is code; both are already done):

- The Braket third-party-device user agreement had to be accepted in the
  Braket Workloads account (console-only, no CLI/API path).
- Payer-level linked-account Cost Explorer/Budgets access had to be enabled in
  the Delta Centric management account before `AWS::Budgets::Budget` could be
  created in any linked account, including this one.
