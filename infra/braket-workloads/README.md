# Braket Workloads — the dedicated QPU-execution account

Phase 1 of the Braket account split (`docs/superpowers/specs/2026-08-27-braket-account-split-design.md`
§2, §3). Stack `quantum-braket-workloads`, deployed to the **Braket Workloads**
account (Delta Centric org, Quantum Learner OU), region **eu-north-1** — the
same region as the IQM Garnet device, so the results bucket is co-regional
with it. Per the spec's account-identifier convention, this account is
referred to by name only in this repo; resolve its id from the organization
at run time, never write it down.

## The cut, and the hard rule

The spec's option A keeps `quantum-qpu-submit` and its reconciler — all the
gating logic, the spend ledger, the tasks table, the credit wallet — in the
platform account. Only the Braket API calls themselves cross the account
boundary: the platform Lambdas assume a role here, call `CreateQuantumTask` /
`GetQuantumTask`, and Braket writes results under the caller's (assumed-role)
identity, so result data lands in this account and never in the platform's.

**Nothing else ever lives here.** This account holds exactly four things:

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

## eu-north-1 / Budgets fallback

`AWS::Budgets::Budget` is a global-ish resource with spotty regional
CloudFormation support. If it rejects creation in eu-north-1, move **only**
`BraketBudget` and `SpendTopic` to a sibling stack in us-east-2 — `ExecutionRole`
and `ResultsBucket` must stay in eu-north-1, since the bucket has to be
co-regional with the device and Braket writes results synchronously at task
completion.

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
account: this stack's `SpendTopic`, publishing from *this* account's Braket
budget. `SpendTopicPolicy` grants the platform account's root principal
`sns:Subscribe` and `sns:Receive` on `SpendTopic` for exactly this reason —
so the platform's kill-switch Lambda can hold a cross-account subscription to
it. Wiring that subscription onto the existing `KillSwitchFunction` is Task
5's job, on the platform stack; this stack only produces the topic (output
`SpendTopicArn`) and the grant that makes the cross-account subscribe
possible.

**Re-enabling after a trip is a deliberate operator action**, documented in
`lambda/qpu/README.md`: delete (or clear) the `KILL` item in the platform
account's ledger table once the cause is resolved, e.g.

```bash
aws dynamodb delete-item --table-name quantum-qpu-ledger --key '{"pk":{"S":"KILL"}}'
```

Nothing in this stack re-enables itself.

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

`ql-braket` is a chained CLI profile: the `org-admin` SSO profile (Delta
Centric management) assumes `OrganizationAccountAccessRole` in the Braket
Workloads account — the same pattern `docs/account-migration-runbook.md`
uses for `ql-prod` and `infra/hq/README.md` uses for `ql-hq`. `ExternalId` is
generated once and kept in 1Password, never committed. `PlatformRoleArns`
and `PlatformAccountId` are looked up from the platform stack (Task 7).

## Outputs

`ExecutionRoleArn`, `ResultsBucketName`, `SpendTopicArn` — consumed as
parameters on the platform stack (Task 5): the QPU submit and reconcile
Lambdas' `BraketRoleArn`, the reconciler's expected results-bucket location,
and the kill-switch's cross-account SNS subscription target, respectively.

## Rollback

```bash
aws cloudformation delete-stack --profile ql-braket --region eu-north-1 --stack-name quantum-braket-workloads
```

Per spec §7, every phase of this split is a parameter flip back on the
platform side (unsetting `BraketRoleArn` reverts the platform stack to
same-account behaviour byte-for-byte) before this stack is ever deleted.
Deleting this stack while `BraketRoleArn` is still set on the live platform
stack breaks QPU execution — confirm the flip first.
