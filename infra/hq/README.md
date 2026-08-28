# HQ foundations — the `quantumlearner.dev` zone + OU budget

Phase 0 of the Braket account split (`docs/superpowers/specs/2026-08-27-braket-account-split-design.md`
§6). Stack `quantum-hq-foundations`, deployed to the **Quantum Learner - HQ**
account (us-east-1) — shared services for the whole Quantum Learner OU under
the Delta Centric org. Per that spec's account-identifier convention, this
account is referred to by name only; resolve its id from the organization at
run time, never write it down.

## What it holds

- **`QuantumLearnerZone`** — the `quantumlearner.dev` public hosted zone, and
  since 2026-08-28 the **authoritative** one: the domain's registration and its
  NS delegation both moved here from the personal account that had held them.
  Its records were replicated and verified answering identically BEFORE the
  delegation moved, so the cutover had no gap. Exported as `HostedZoneId`
  (`quantum-hq-zone-id`) for later stacks to consume.
- **`OuBudget`** — a consolidated `COST` budget across the OU (`MonthlyOuBudget`,
  default $200/mo), with EMAIL notifications at 80% and 100% of `ACTUAL` spend
  to `AlertEmail`.

## What it deliberately omits

- **The zone's records.** The nine live records (apex + www to CloudFront, the
  Google Workspace MX and verification pair, two ACM validation CNAMEs) were
  copied in operationally on 2026-08-28, not declared in this template. They are
  deliberately NOT managed as CloudFormation resources: a template that owns the
  MX record owns the mail path for four AWS accounts' root addresses, and a
  stack rollback would take it with it. Manage records directly, or in a
  separate stack that cannot take the zone down with it.
- **ACM certificates.** Now unblocked (DNS validation resolves through this zone
  since the flip), but still not issued here — they land with the workload that
  needs them.
- **The CI/OIDC deploy role.** HQ is where it will live (spec §5: "not
  duplicated per account"), but it lands with the Phase 2 drift-tooling work,
  mirroring `infra/github-oidc-drift-role.yaml` (same OIDC-provider-exists,
  role-only pattern, scoped to this account). This stack does not create it.

## Deploy

Deployed 2026-08-28: the stack is live in us-east-1 — the zone is authoritative
for `quantumlearner.dev` (see above) and the OU budget's alert email is
confirmed, from `hq@quantumlearner.dev`. The command that deployed it:

```bash
aws cloudformation deploy \
  --profile ql-hq \
  --region us-east-1 \
  --stack-name quantum-hq-foundations \
  --template-file infra/hq/template.yaml
```

`ql-hq` is a chained CLI profile: the `org-admin` SSO profile (Delta Centric
management) assumes `OrganizationAccountAccessRole` in the HQ account, the
same pattern `docs/account-migration-runbook.md` uses for `ql-prod`. It is
configured in `~/.aws/config`.

## After deploying: confirm the budget alerts

An SNS/Budgets email subscription delivers **nothing** until it is confirmed
from the inbox, once, per topic (`CLAUDE.md` § "Project email addresses").
`AWS::Budgets::Budget` EMAIL subscribers are no exception — AWS Budgets
creates the subscription under the hood the same way an explicit SNS topic
would, and it sits in `PendingConfirmation` until someone opens the inbox and
clicks the link. Deploying this stack creates exactly that subscription for
`AlertEmail` (default `hq@quantumlearner.dev`, the business/automated
address); until it's confirmed, the 80%/100% budget alarms are silently
unreachable. After deploying, check:

```bash
aws sns list-subscriptions --profile ql-hq --region us-east-1 \
  --query "Subscriptions[?contains(Endpoint, 'hq@quantumlearner.dev')].SubscriptionArn"
```

A returned value of literal `"PendingConfirmation"` (not an ARN) is the
symptom. It does not resolve itself — someone has to open the confirmation
email and click **Confirm subscription**. (The AWS console equivalent:
SNS → Subscriptions, filter `budget`.)

## Rollback

```bash
aws cloudformation delete-stack --profile ql-hq --region us-east-1 --stack-name quantum-hq-foundations
```

**No longer safe.** Deleting this stack now deletes the authoritative
`quantumlearner.dev` zone — taking the live site down and, worse, the MX that
carries four AWS accounts' root email (`hq@`, `braket@`, `aws-prod@`,
`aws-dev@`), which is also how those accounts recover. Treat this as live
infrastructure. To retire it, move the delegation somewhere else first and
verify that before deleting anything here.
