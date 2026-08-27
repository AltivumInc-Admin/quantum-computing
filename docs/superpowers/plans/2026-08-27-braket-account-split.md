# Braket Account Split Implementation Plan (Phases 0–1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** QPU execution and hardware spend isolated in the dedicated Braket Workloads account, while the platform (and the atomic money path) stays where it runs today.

**Architecture:** Option A from the spec — `quantum-qpu-submit` and its reconciler keep all gating/ledger/wallet logic in the platform account and assume a scoped role in Braket Workloads only for `CreateQuantumTask`/`GetQuantumTask`; the results bucket, Braket budget and spend SNS live in Braket Workloads; the budget's notification crosses back to the platform's existing kill-switch Lambda.

**Tech Stack:** Node 20/22 Lambdas (`node --test`, DI cores), AWS SAM + raw CloudFormation, `@aws-sdk/client-braket`, `@aws-sdk/credential-providers`, AWS CLI with the `org-admin` SSO profile.

**Spec:** `docs/superpowers/specs/2026-08-27-braket-account-split-design.md`

## Global Constraints

- **No AWS account numbers in the repo, ever.** Resolve ids by account *name* at run time: `aws organizations list-accounts --profile org-admin --query "Accounts[?Name=='Braket Workloads'].Id" --output text`. This applies to templates, tests, docs and commit messages.
- **Delta Centric work uses `--profile org-admin`** (management account; can assume `OrganizationAccountAccessRole` in members). `personal-dev` cannot reach member accounts. **The default profile is Altivum production** — any command that omits `--profile` runs there.
- Live-stack mutations (Task 8 onward) and the real QPU run (Task 9, real money ≤ $1.75) each **require explicit founder go-ahead at execution time**.
- The external id is deploy-time configuration (generated once, stored in the founder's 1Password) — never a repo literal.
- Device scope is unchanged: IQM Garnet only, eu-north-1 (`qpu-core.mjs` constants are untouched).
- `qpu-core.mjs` is not modified by any task in this plan.
- All qpu Lambda tests run offline: `cd lambda/qpu && npm ci && npm test`.
- Work on branch `feat/braket-account-split` (already exists; spec committed at `77b7838`).

---

### Task 1: Re-point the account-migration runbook at QL-Prod

**Files:**
- Modify: `docs/account-migration-runbook.md` (header block, lines ~1–30)

**Interfaces:**
- Consumes: nothing.
- Produces: a runbook whose destination resolution can no longer land in the Altivum org.

- [ ] **Step 1: Fix the destination header and the id-resolution block**

In the header (lines ~5–8), change the Destination line and access line to name the Delta Centric org and QL-Prod. Replace:

```markdown
**Destination:** `$DST_ACCOUNT` (Quantum Learner, `quantumlearner@altivum.ai`) — greenfield, created 2026-07-18
**Access into destination:** SSO profile `altivum-mgmt` (Org mgmt `$ORG_MGMT_ACCOUNT`) → assumes `arn:aws:iam::$DST_ACCOUNT:role/OrganizationAccountAccessRole` → chained CLI profile **`quantum-learner`**
```

with:

```markdown
**Destination:** `$DST_ACCOUNT` (**QL-Prod**, `aws-prod@quantumlearner.dev`, Delta Centric org / Quantum Learner OU) — greenfield, created 2026-08-27. The 2026-07-18 destination (an *Altivum-org* account also named "Quantum Learner") is RETIRED as a destination; see `CLAUDE.md` § AWS.
**Access into destination:** SSO profile `org-admin` (Delta Centric management) → assumes `arn:aws:iam::$DST_ACCOUNT:role/OrganizationAccountAccessRole` → chained CLI profile **`ql-prod`**
```

In the id-resolution shell block, replace the two `export` lines that resolve `ORG_MGMT_ACCOUNT` and `DST_ACCOUNT`:

```sh
export ORG_MGMT_ACCOUNT=$(aws organizations describe-organization --profile org-admin \
  --query 'Organization.MasterAccountId' --output text)
export DST_ACCOUNT=$(aws organizations list-accounts --profile org-admin \
  --query "Accounts[?Name=='QL-Prod'].Id" --output text)
```

and update `SRC_ACCOUNT`'s comment to note it resolves from the **Altivum** org (default profile), not Delta Centric.

- [ ] **Step 2: Add a stale-destination warning at the top of Section 11 (corrections)**

One paragraph: the §11 corrections still apply; every `$DST_ACCOUNT` reference now means QL-Prod; Braket execution is NOT migrated by this runbook (it is split separately — link the spec).

- [ ] **Step 3: Verify no account number leaked**

Run: `grep -cE '\b[0-9]{12}\b' docs/account-migration-runbook.md`
Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add docs/account-migration-runbook.md
git commit -m "docs(runbook): re-point the migration destination at QL-Prod (Delta Centric)"
```

---

### Task 2: HQ foundations template

**Files:**
- Create: `infra/hq/template.yaml`
- Create: `infra/hq/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: stack `quantum-hq-foundations` (deployed in Task 7) exporting `HostedZoneId`; the consolidated OU budget.

- [ ] **Step 1: Write the template**

`infra/hq/template.yaml`:

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: >
  quantum-hq-foundations: shared services for the Quantum Learner OU, deployed
  to the Quantum Learner - HQ account (us-east-1). Holds the quantumlearner.dev
  hosted zone (NS delegation is NOT flipped here — that is the Phase 2 domain
  cutover; until then this zone is dormant) and the OU-level consolidated
  budget. ACM certificates are deliberately absent: DNS validation cannot
  succeed until the NS flip, so they issue in Phase 2.

Parameters:
  AlertEmail:
    Type: String
    Default: hq@quantumlearner.dev
    Description: Budget notifications. hq@ is the business/automated address.
  MonthlyOuBudget:
    Type: Number
    Default: 200
    Description: Consolidated monthly USD ceiling across the Quantum Learner OU.

Resources:
  QuantumLearnerZone:
    Type: AWS::Route53::HostedZone
    Properties:
      Name: quantumlearner.dev
      HostedZoneConfig:
        Comment: Dormant until the Phase 2 NS flip. Do not add records before then.

  OuBudget:
    Type: AWS::Budgets::Budget
    Properties:
      Budget:
        BudgetType: COST
        TimeUnit: MONTHLY
        BudgetLimit:
          Amount: !Ref MonthlyOuBudget
          Unit: USD
      NotificationsWithSubscribers:
        - Notification:
            NotificationType: ACTUAL
            ComparisonOperator: GREATER_THAN
            Threshold: 80
          Subscribers:
            - { SubscriptionType: EMAIL, Address: !Ref AlertEmail }
        - Notification:
            NotificationType: ACTUAL
            ComparisonOperator: GREATER_THAN
            Threshold: 100
          Subscribers:
            - { SubscriptionType: EMAIL, Address: !Ref AlertEmail }

Outputs:
  HostedZoneId:
    Value: !Ref QuantumLearnerZone
    Export: { Name: quantum-hq-zone-id }
```

- [ ] **Step 2: Write `infra/hq/README.md`**

Cover: what the stack holds and deliberately omits (NS flip and ACM → Phase 2; the CI/OIDC deploy role lands with the Phase 2 drift-tooling work, mirroring `infra/github-oidc-drift-role.yaml`); the deploy command (shown in Task 7); the budget-email confirmation caveat from `CLAUDE.md` (an email subscription delivers nothing until confirmed from the inbox).

- [ ] **Step 3: Validate and commit**

Run: `aws cloudformation validate-template --template-body file://infra/hq/template.yaml --profile org-admin --region us-east-1 --query Description --output text | head -2`
Expected: the Description text, no error.

```bash
git add infra/hq/
git commit -m "feat(infra): HQ foundations — dormant quantumlearner.dev zone + OU budget"
```

---

### Task 3: Braket Workloads account template

**Files:**
- Create: `infra/braket-workloads/template.yaml`
- Create: `infra/braket-workloads/README.md`

**Interfaces:**
- Consumes: platform Lambda role ARNs (looked up in Task 7) and the external id, as parameters.
- Produces: stack `quantum-braket-workloads` outputs `ExecutionRoleArn`, `ResultsBucketName`, `SpendTopicArn` — consumed by Task 5's parameters on the platform stack.

- [ ] **Step 1: Write the template**

`infra/braket-workloads/template.yaml`:

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: >
  quantum-braket-workloads: the dedicated QPU-execution account's entire
  contents. A Braket-scoped role the platform's QPU Lambdas assume, the
  amazon-braket-* results bucket (Braket writes under the caller's identity,
  so results land HERE, never in the platform account), the monthly Braket
  budget, and the spend SNS topic whose notifications the PLATFORM account's
  kill-switch Lambda subscribes to cross-account. Deploy region: eu-north-1
  (IQM Garnet's region; the bucket must be co-regional with the device).
  NOTE: if AWS::Budgets::Budget rejects creation in eu-north-1, move ONLY the
  BraketBudget + SpendTopic resources to a sibling stack in us-east-2 — the
  role and bucket must stay in eu-north-1.

Parameters:
  PlatformRoleArns:
    Type: CommaDelimitedList
    Description: >
      IAM role ARNs of the platform's QPU submit AND reconcile function roles
      (two ARNs today). These are the only principals that may assume the
      execution role. Passed at deploy; never committed.
  ExternalId:
    Type: String
    NoEcho: true
    MinLength: 24
    Description: sts:ExternalId condition value. Generated once; 1Password.
  PlatformAccountId:
    Type: String
    AllowedPattern: "[0-9]{12}"
    Description: The platform account id, for the SNS cross-account subscribe grant.
  MonthlyBraketBudget:
    Type: Number
    Default: 50
    Description: Monthly USD ceiling for Braket spend in this account.
  AlertEmail:
    Type: String
    Default: hq@quantumlearner.dev

Resources:
  ExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: QuantumLearnerBraketExecution
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal: { AWS: !Ref PlatformRoleArns }
            Action: sts:AssumeRole
            Condition:
              StringEquals: { sts:ExternalId: !Ref ExternalId }
      Policies:
        - PolicyName: braket-garnet-only
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              # Both device ARN forms — IAM evaluates CreateQuantumTask against
              # the ACCOUNT-QUALIFIED device ARN (see lambda/qpu/template.yaml's
              # comment recording the live denial that proved it).
              - Effect: Allow
                Action: [braket:CreateQuantumTask, braket:GetQuantumTask]
                Resource:
                  - arn:aws:braket:eu-north-1::device/qpu/iqm/Garnet
                  - !Sub arn:aws:braket:eu-north-1:${AWS::AccountId}:device/qpu/iqm/Garnet
                  - !Sub arn:aws:braket:eu-north-1:${AWS::AccountId}:quantum-task/*
              - Effect: Allow
                Action: [s3:PutObject, s3:GetObject, s3:GetBucketLocation, s3:ListBucket]
                Resource:
                  - !GetAtt ResultsBucket.Arn
                  - !Sub "${ResultsBucket.Arn}/*"

  ResultsBucket:
    Type: AWS::S3::Bucket
    Properties:
      # amazon-braket-* prefix is REQUIRED for the Braket service to write.
      BucketName: !Sub amazon-braket-ql-results-${AWS::AccountId}
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault: { SSEAlgorithm: AES256 }
      LifecycleConfiguration:
        Rules:
          - Id: expire-results
            Status: Enabled
            ExpirationInDays: 90

  SpendTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: quantum-braket-spend

  SpendTopicPolicy:
    Type: AWS::SNS::TopicPolicy
    Properties:
      Topics: [!Ref SpendTopic]
      PolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Sid: AWSBudgetsSNSPublishingPermissions
            Effect: Allow
            Principal: { Service: budgets.amazonaws.com }
            Action: sns:Publish
            Resource: !Ref SpendTopic
          - Sid: PlatformKillSwitchSubscribe
            Effect: Allow
            Principal: { AWS: !Sub "arn:aws:iam::${PlatformAccountId}:root" }
            Action: [sns:Subscribe, sns:Receive]
            Resource: !Ref SpendTopic

  BraketBudget:
    Type: AWS::Budgets::Budget
    Properties:
      Budget:
        BudgetType: COST
        TimeUnit: MONTHLY
        BudgetLimit: { Amount: !Ref MonthlyBraketBudget, Unit: USD }
      NotificationsWithSubscribers:
        - Notification:
            NotificationType: ACTUAL
            ComparisonOperator: GREATER_THAN
            Threshold: 80
          Subscribers:
            - { SubscriptionType: SNS, Address: !Ref SpendTopic }
            - { SubscriptionType: EMAIL, Address: !Ref AlertEmail }
        - Notification:
            NotificationType: ACTUAL
            ComparisonOperator: GREATER_THAN
            Threshold: 100
          Subscribers:
            - { SubscriptionType: SNS, Address: !Ref SpendTopic }
            - { SubscriptionType: EMAIL, Address: !Ref AlertEmail }

Outputs:
  ExecutionRoleArn:
    Value: !GetAtt ExecutionRole.Arn
  ResultsBucketName:
    Value: !Ref ResultsBucket
  SpendTopicArn:
    Value: !Ref SpendTopic
```

- [ ] **Step 2: Write `infra/braket-workloads/README.md`**

Cover: what lives here and the hard rule that nothing else ever does; the deploy command (Task 7); the eu-north-1/Budgets fallback note; how the kill-switch subscription works (platform side, Task 5); re-enabling after a trip is the operator action documented in `lambda/qpu/README.md`.

- [ ] **Step 3: Validate and commit**

Run: `aws cloudformation validate-template --template-body file://infra/braket-workloads/template.yaml --profile org-admin --region eu-north-1 --query Parameters[].ParameterKey --output text`
Expected: `PlatformRoleArns ExternalId PlatformAccountId MonthlyBraketBudget AlertEmail` (any order), no error.

```bash
git add infra/braket-workloads/
git commit -m "feat(infra): the Braket Workloads account — scoped role, results bucket, budget, spend topic"
```

---

### Task 4: Cross-account credentials in the Lambda wiring

**Files:**
- Create: `lambda/qpu/braket-credentials.mjs`
- Create: `lambda/qpu/braket-credentials.test.mjs`
- Modify: `lambda/qpu/index.mjs:8-11`
- Modify: `lambda/qpu/reconcile.mjs:237-240`
- Modify: `lambda/qpu/package.json` (add dependency)

**Interfaces:**
- Consumes: env `BRAKET_ROLE_ARN`, `BRAKET_EXTERNAL_ID` (wired by Task 5).
- Produces: `braketCredentials(env, from?) -> credentials-provider | undefined`, used by both entry files.

- [ ] **Step 1: Write the failing test**

`lambda/qpu/braket-credentials.test.mjs`:

```js
// The seam for the account split: BraketClient credentials come from this one
// function. Unset env = same-account (today's behaviour, and the rollback).
import { test } from "node:test";
import assert from "node:assert/strict";
import { braketCredentials } from "./braket-credentials.mjs";

test("unset role ARN -> undefined (same-account; the Lambda's own role)", () => {
  assert.equal(braketCredentials({}), undefined);
  assert.equal(braketCredentials({ BRAKET_ROLE_ARN: "" }), undefined);
});

test("set role ARN -> temporary credentials for exactly that role + external id", () => {
  const calls = [];
  const fake = (opts) => { calls.push(opts); return "PROVIDER"; };
  const out = braketCredentials(
    { BRAKET_ROLE_ARN: "arn:aws:iam::000000000000:role/X", BRAKET_EXTERNAL_ID: "eid-123" },
    fake,
  );
  assert.equal(out, "PROVIDER");
  assert.deepEqual(calls, [{
    params: {
      RoleArn: "arn:aws:iam::000000000000:role/X",
      ExternalId: "eid-123",
      RoleSessionName: "quantum-qpu-braket",
      DurationSeconds: 900,
    },
  }]);
});

test("role ARN without external id throws — a trust policy with a missing condition value must never be attempted", () => {
  assert.throws(
    () => braketCredentials({ BRAKET_ROLE_ARN: "arn:aws:iam::000000000000:role/X" }),
    /BRAKET_EXTERNAL_ID/,
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd lambda/qpu && node --test braket-credentials.test.mjs`
Expected: FAIL — `Cannot find module './braket-credentials.mjs'`

- [ ] **Step 3: Implement**

`lambda/qpu/braket-credentials.mjs`:

```js
// Credentials for the BraketClient, and nothing else. When BRAKET_ROLE_ARN is
// set, Braket calls execute in the Braket Workloads account under a role scoped
// to Garnet + the results bucket; unset reproduces same-account behaviour
// byte-for-byte (the rollback is unsetting it — same pattern as WALLET_TABLE).
// The SDK provider caches and auto-refreshes: one STS call per cold container.
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";

export function braketCredentials(env, from = fromTemporaryCredentials) {
  const roleArn = env.BRAKET_ROLE_ARN;
  if (!roleArn) return undefined;
  const externalId = env.BRAKET_EXTERNAL_ID;
  if (!externalId) {
    throw new Error("BRAKET_ROLE_ARN is set but BRAKET_EXTERNAL_ID is not — refusing a trust-policy mismatch");
  }
  return from({
    params: {
      RoleArn: roleArn,
      ExternalId: externalId,
      RoleSessionName: "quantum-qpu-braket",
      DurationSeconds: 900,
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd lambda/qpu && node --test braket-credentials.test.mjs`
Expected: 3 pass.

- [ ] **Step 5: Wire both entry files and add the dependency**

In `lambda/qpu/index.mjs`, add `import { braketCredentials } from "./braket-credentials.mjs";` beside the existing imports and change the client line:

```js
  braket: new BraketClient({ region: DEVICE_REGION, credentials: braketCredentials(process.env) }),
```

In `lambda/qpu/reconcile.mjs`, same import, and at :239:

```js
  braket: new BraketClient({ region: DEVICE_REGION, credentials: braketCredentials(process.env) }),
```

Run: `cd lambda/qpu && npm install @aws-sdk/credential-providers@^3.699.0 --save-exact=false`

- [ ] **Step 6: Full offline suite green**

Run: `cd lambda/qpu && npm test`
Expected: all pass (existing suites inject a fake `braket` into the DI cores and never construct real clients).

- [ ] **Step 7: Commit**

```bash
git add lambda/qpu/braket-credentials.mjs lambda/qpu/braket-credentials.test.mjs \
        lambda/qpu/index.mjs lambda/qpu/reconcile.mjs lambda/qpu/package.json lambda/qpu/package-lock.json
git commit -m "feat(qpu): env-gated cross-account Braket credentials — unset means same-account, the rollback"
```

---

### Task 5: Platform template — assume-role in, direct grants out, kill-switch hears the foreign budget

**Files:**
- Modify: `lambda/qpu/template.yaml` (Parameters; the SubmitFunction and ReconcileFunction `Policies:` and `Environment:` blocks; the KillSwitch resources)
- Test: `lambda/qpu/template.test.mjs` (new assertions; Task 6 writes them first — do Task 6 Step 1 before this task's Step 2 if executing strictly TDD)

**Interfaces:**
- Consumes: Task 3's stack outputs, passed as parameters at deploy.
- Produces: parameters `BraketRoleArn`, `BraketExternalId`, `BraketSpendTopicArn` (all default `""`); env `BRAKET_ROLE_ARN`/`BRAKET_EXTERNAL_ID` on both functions.

- [ ] **Step 1: Add parameters and condition**

In `Parameters:`, after `RateCardSecret`:

```yaml
  BraketRoleArn:
    Type: String
    Default: ""
    Description: >
      ARN of QuantumLearnerBraketExecution in the Braket Workloads account.
      Empty = same-account execution (today's behaviour, and the rollback).
  BraketExternalId:
    Type: String
    Default: ""
    NoEcho: true
    Description: sts:ExternalId for the role above. Required iff BraketRoleArn is set.
  BraketSpendTopicArn:
    Type: String
    Default: ""
    Description: >
      The quantum-braket-spend topic ARN in the Braket Workloads account
      (eu-north-1). Empty = kill-switch listens only to the in-account budget.
```

In `Conditions:` (beside `HasWalletTable`):

```yaml
  HasBraketRole: !Not [!Equals [!Ref BraketRoleArn, ""]]
  HasBraketSpendTopic: !Not [!Equals [!Ref BraketSpendTopicArn, ""]]
```

- [ ] **Step 2: Swap the grants on BOTH function `Policies:` lists**

On **each** of SubmitFunction and ReconcileFunction, wrap that function's existing Braket statement (and, on SubmitFunction, the S3 results statement) so it exists only same-account, and add the assume-role statement only cross-account:

```yaml
        - !If
          - HasBraketRole
          - Statement:
              - Effect: Allow
                Action: sts:AssumeRole
                Resource: !Ref BraketRoleArn
          - Statement:
              - Effect: Allow
                Action:
                  - braket:CreateQuantumTask
                  - braket:GetQuantumTask
                Resource:
                  - arn:aws:braket:eu-north-1::device/qpu/iqm/Garnet
                  - !Sub arn:aws:braket:eu-north-1:${AWS::AccountId}:device/qpu/iqm/Garnet
                  - !Sub arn:aws:braket:eu-north-1:${AWS::AccountId}:quantum-task/*
        - !If
          - HasBraketRole
          - !Ref AWS::NoValue
          - Statement:
              - Effect: Allow
                Action: [s3:PutObject, s3:GetBucketLocation, s3:ListBucket]
                Resource:
                  - !Sub arn:aws:s3:::${ResultsBucket}
                  - !Sub arn:aws:s3:::${ResultsBucket}/*
```

(ReconcileFunction's Braket statement is `braket:GetQuantumTask` only — preserve its narrower action list in the same-account branch, and give its cross-account branch the identical `sts:AssumeRole` statement.)

- [ ] **Step 3: Add the env vars to BOTH functions**

In each function's `Environment: Variables:` block:

```yaml
          BRAKET_ROLE_ARN: !Ref BraketRoleArn
          BRAKET_EXTERNAL_ID: !Ref BraketExternalId
```

- [ ] **Step 4: Subscribe the kill-switch to the foreign spend topic**

Beside the existing KillSwitch resources:

```yaml
  # The Braket budget now lives in the Braket Workloads account (the platform
  # budget cannot see spend that accrues there). Its topic notifies THIS
  # account's kill-switch: same Lambda, second subscription. Cross-region is
  # explicit (the topic is in eu-north-1); the topic's policy grants Subscribe.
  BraketSpendSubscription:
    Type: AWS::SNS::Subscription
    Condition: HasBraketSpendTopic
    Properties:
      TopicArn: !Ref BraketSpendTopicArn
      Protocol: lambda
      Endpoint: !GetAtt KillSwitchFunction.Arn
      Region: eu-north-1
  BraketSpendInvokePermission:
    Type: AWS::Lambda::Permission
    Condition: HasBraketSpendTopic
    Properties:
      FunctionName: !Ref KillSwitchFunction
      Action: lambda:InvokeFunction
      Principal: sns.amazonaws.com
      SourceArn: !Ref BraketSpendTopicArn
```

- [ ] **Step 5: Offline suites green (template tests from Task 6 included)**

Run: `cd lambda/qpu && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lambda/qpu/template.yaml lambda/qpu/template.test.mjs
git commit -m "feat(qpu): template flips between same-account grants and one assumed role; kill-switch subscribes to the foreign spend topic"
```

---

### Task 6: Template guardrail tests

**Files:**
- Modify: `lambda/qpu/template.test.mjs` (append; reuse its existing `section`/`blocks` helpers — the file deliberately parses structurally rather than adding a YAML dependency)

**Interfaces:**
- Consumes: `template.yaml` source text via the file's existing `template` binding.
- Produces: red tests that Task 5 turns green (write these FIRST when executing).

- [ ] **Step 1: Write the failing tests**

Append to `lambda/qpu/template.test.mjs`:

```js
test("braket split: both functions carry the env pair and the conditional assume-role", () => {
  const res = section(template, "Resources").join("\n");
  // Env wiring on both functions (two occurrences each).
  assert.equal(res.match(/BRAKET_ROLE_ARN: !Ref BraketRoleArn/g)?.length, 2,
    "BRAKET_ROLE_ARN must be wired on SubmitFunction AND ReconcileFunction");
  assert.equal(res.match(/BRAKET_EXTERNAL_ID: !Ref BraketExternalId/g)?.length, 2);
  // The cross-account branch grants exactly sts:AssumeRole on the parameter.
  assert.equal(res.match(/Action: sts:AssumeRole/g)?.length, 2);
  assert.equal(res.match(/Resource: !Ref BraketRoleArn/g)?.length, 2);
});

test("braket split: direct grants survive ONLY behind the same-account branch", () => {
  const res = section(template, "Resources").join("\n");
  // Every braket:CreateQuantumTask grant must sit inside a HasBraketRole !If —
  // structurally: no such action line may appear before the first HasBraketRole
  // conditional in its function's Policies list. Cheap proxy that catches the
  // realistic regression (someone re-adding an unconditional grant): the counts
  // of conditional wrappers must cover every braket action line.
  const braketLines = res.match(/braket:CreateQuantumTask/g)?.length ?? 0;
  const condWrappers = res.match(/- !If\n\s+- HasBraketRole/g)?.length ?? 0;
  assert.ok(braketLines >= 1, "same-account branch must still exist (it is the rollback)");
  assert.ok(condWrappers >= 3,
    "expected >=3 HasBraketRole conditionals (submit braket, submit s3, reconcile braket)");
});

test("braket split: the kill-switch subscribes to the foreign spend topic, conditionally", () => {
  const res = blocks(section(template, "Resources"));
  const sub = res.BraketSpendSubscription?.join("\n") ?? "";
  assert.match(sub, /Condition: HasBraketSpendTopic/);
  assert.match(sub, /Protocol: lambda/);
  assert.match(sub, /Region: eu-north-1/);
  const perm = res.BraketSpendInvokePermission?.join("\n") ?? "";
  assert.match(perm, /Principal: sns\.amazonaws\.com/);
  assert.match(perm, /SourceArn: !Ref BraketSpendTopicArn/);
});
```

- [ ] **Step 2: Run to verify they fail (before Task 5's edits)**

Run: `cd lambda/qpu && node --test template.test.mjs`
Expected: the three new tests FAIL.

- [ ] **Step 3: (After Task 5) verify they pass, then commit with Task 5**

Run: `cd lambda/qpu && npm test`
Expected: all pass. Committed in Task 5 Step 6.

---

### Task 7: Deploy — HQ foundations, then Braket Workloads

**Files:** none (deploy only). **Founder go-ahead required before each `deploy`.**

**Interfaces:**
- Consumes: Tasks 2–3 templates; the live Altivum function role names.
- Produces: `ExecutionRoleArn`, `ResultsBucketName`, `SpendTopicArn` values for Task 8.

- [ ] **Step 1: Mint chained profiles (config only, no mutation)**

Append to `~/.aws/config` (ids resolved by name — never pasted):

```sh
BRAKET_ACCT=$(aws organizations list-accounts --profile org-admin \
  --query "Accounts[?Name=='Braket Workloads'].Id" --output text)
HQ_ACCT=$(aws organizations list-accounts --profile org-admin \
  --query "Accounts[?Name=='Quantum Learner - HQ'].Id" --output text)
cat >> ~/.aws/config <<EOF

[profile ql-braket]
role_arn = arn:aws:iam::${BRAKET_ACCT}:role/OrganizationAccountAccessRole
source_profile = org-admin
region = eu-north-1

[profile ql-hq]
role_arn = arn:aws:iam::${HQ_ACCT}:role/OrganizationAccountAccessRole
source_profile = org-admin
region = us-east-1
EOF
aws sts get-caller-identity --profile ql-braket --query Arn --output text
aws sts get-caller-identity --profile ql-hq --query Arn --output text
```

Expected: two assumed-role ARNs ending in `OrganizationAccountAccessRole/...`.

- [ ] **Step 2: Deploy HQ foundations** *(founder go-ahead)*

```sh
aws cloudformation deploy --profile ql-hq --region us-east-1 \
  --stack-name quantum-hq-foundations \
  --template-file infra/hq/template.yaml
```

Expected: `Successfully created/updated stack`. Then confirm the budget email from the hq@ inbox (see `CLAUDE.md`: unconfirmed subscriptions deliver nothing).

- [ ] **Step 3: Look up the live platform function roles (read-only, default profile = Altivum)**

```sh
SUBMIT_ROLE=$(aws lambda get-function-configuration --region us-east-2 \
  --function-name quantum-qpu-submit --query Role --output text)
RECONCILE_ROLE=$(aws lambda get-function-configuration --region us-east-2 \
  --function-name quantum-qpu-reconcile --query Role --output text)
PLATFORM_ACCT=$(aws sts get-caller-identity --query Account --output text)
echo "$SUBMIT_ROLE"; echo "$RECONCILE_ROLE"
```

(If the reconcile function name differs, list with `aws lambda list-functions --region us-east-2 --query "Functions[?starts_with(FunctionName,'quantum-qpu')].FunctionName"` and use the reconciler's actual name.)

- [ ] **Step 4: Generate the external id, store it, deploy Braket Workloads** *(founder go-ahead)*

```sh
EID=$(openssl rand -hex 24)   # store in 1Password: "Quantum Learner / Braket ExternalId" — BEFORE deploying
aws cloudformation deploy --profile ql-braket --region eu-north-1 \
  --stack-name quantum-braket-workloads \
  --template-file infra/braket-workloads/template.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    "PlatformRoleArns=${SUBMIT_ROLE},${RECONCILE_ROLE}" \
    "ExternalId=${EID}" \
    "PlatformAccountId=${PLATFORM_ACCT}"
aws cloudformation describe-stacks --profile ql-braket --region eu-north-1 \
  --stack-name quantum-braket-workloads \
  --query 'Stacks[0].Outputs' --output table
```

Expected: three outputs. If `BraketBudget` fails in eu-north-1, apply the template's documented fallback (budget+topic to a us-east-2 sibling stack) and record which happened.

---

### Task 8: Flip the live stack *(founder go-ahead — production mutation)*

**Files:** none (deploy only).

- [ ] **Step 1: Deploy the platform stack with the new parameters**

Using Task 7's outputs (`ROLE_ARN`, `TOPIC_ARN`) and the stored `EID` — this is a `sam deploy` of the code + template from this branch, so it also ships Task 4's wiring:

```sh
cd lambda/qpu && npm ci && sam build && \
sam deploy --stack-name quantum-qpu-submit --region us-east-2 \
  --parameter-overrides \
    "BraketRoleArn=${ROLE_ARN}" \
    "BraketExternalId=${EID}" \
    "BraketSpendTopicArn=${TOPIC_ARN}" \
    <existing parameter overrides unchanged — read them first with:
     aws cloudformation describe-stacks --region us-east-2 --stack-name quantum-qpu-submit \
       --query 'Stacks[0].Parameters' --output table>
```

**Every existing parameter must be re-passed explicitly** — `sam deploy --parameter-overrides` replaces the full set, and silently reverting `WalletTableName`/`RateCardSecret`/`AlertEmail` to defaults is exactly the class of accident the audit warned about.

- [ ] **Step 2: Confirm the deployed env**

```sh
aws lambda get-function-configuration --region us-east-2 \
  --function-name quantum-qpu-submit \
  --query 'Environment.Variables.{role:BRAKET_ROLE_ARN,eid_set:BRAKET_EXTERNAL_ID!=`""`}'
```

Expected: the role ARN, `eid_set: true`.

- [ ] **Step 3: Rollback rehearsal note**

Rollback = the same `sam deploy` with `BraketRoleArn=` `BraketExternalId=` `BraketSpendTopicArn=` all empty. Do not rehearse it now; know it.

---

### Task 9: Verify with one real run *(founder go-ahead — spends ≤ $1.75 real money)*

**Files:** none. A mock proves nothing about cross-account trust, bucket writability, or eu-north-1 — this is the spec's mandated live verification.

- [ ] **Step 1: Submit the cheapest real Garnet run through the deployed API**

Use the existing verified path (the workspace UI against production, or the repo's documented submit flow in `lambda/qpu/README.md`) with the minimum shots Garnet accepts (`shot_bounds` floor = 1): cost ≈ $0.30 + $0.00145.

- [ ] **Step 2: Assert the four cross-account facts**

```sh
# 1. The task was created IN Braket Workloads (its ARN carries that account):
aws dynamodb scan --region us-east-2 --table-name <TasksTable from stack> \
  --max-items 3 --query 'Items[].{arn:taskArn.S,state:state.S}'   # newest row's ARN account = Braket Workloads
# 2. The result object landed in the Braket Workloads bucket:
aws s3 ls "s3://$(aws cloudformation describe-stacks --profile ql-braket --region eu-north-1 \
  --stack-name quantum-braket-workloads --query 'Stacks[0].Outputs[?OutputKey==`ResultsBucketName`].OutputValue' \
  --output text)/" --profile ql-braket --recursive | tail -3
# 3. The reconciler settled the row (state leaves SUBMITTED; no qpu-release-failed alarm).
# 4. NOTHING landed in the platform's old results bucket for this run.
```

- [ ] **Step 3: Prove the kill-switch path end-to-end (no spend)**

```sh
aws sns publish --profile ql-braket --region eu-north-1 \
  --topic-arn "${TOPIC_ARN}" --subject "kill-switch-drill" --message "drill"
# Then in the platform account:
aws dynamodb get-item --region us-east-2 --table-name <LedgerTable> \
  --key '{"pk":{"S":"KILL"}}'
```

Expected: `disabled: true`, `reason: kill-switch-drill`. **Then clear it** (the operator action in `lambda/qpu/README.md`) and confirm a subsequent status call is no longer 503.

- [ ] **Step 4: Record the verification**

Append the run's date, task ARN (account-redacted), and the four assertions' results to `infra/braket-workloads/README.md` under a "Verified" heading. Commit:

```bash
git add infra/braket-workloads/README.md
git commit -m "docs(braket-workloads): record the live cross-account verification"
```

---

### Task 10: Documentation sweep

**Files:**
- Modify: `CLAUDE.md` (§ AWS — flip "deployed reality still disagrees" for the Braket half; name the two new stacks and the two chained profiles)
- Modify: `lambda/qpu/README.md` (execution model: assumed role, foreign results bucket, foreign budget feeding the same kill-switch; the rollback)
- Modify: `docs/superpowers/specs/2026-08-27-braket-account-split-design.md` (Status → Phase 1 EXECUTED, date)

- [ ] **Step 1: Make the three edits above** — each is a truthful-present-tense update, no aspirational claims (rule 13 applies to internal docs too).

- [ ] **Step 2: Guards still green**

Run: `source .venv/bin/activate && python -m pytest tests/test_pricing_prose.py -q && cd lambda/qpu && npm test`
Expected: all pass (the claim guard reads README.md — hardware availability wording must stay present-true: execution moved accounts; learners still cannot buy runs until Phase 3).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md lambda/qpu/README.md docs/superpowers/specs/2026-08-27-braket-account-split-design.md
git commit -m "docs: record the executed Braket split — QPU execution now isolated in Braket Workloads"
```

---

## Self-Review (performed at write time)

- **Spec coverage:** §3 credential flow → Tasks 3–5; §4 code → Task 4; §5 IaC → Tasks 2–3, 5; §6 Phase 0 → Tasks 1–2, Phase 1 → Tasks 3–9; §7 rollback → Task 8 Step 3 + env-gating throughout. Phase 2/3 items (NS flip, ACM, OIDC role, drift account-dimension, funding) are explicitly deferred, matching the spec.
- **Placeholders:** Task 8 Step 1 contains one deliberate operator lookup (`<existing parameter overrides>`) — it cannot be pre-filled because the live values must be read at execution time, and pre-filling them from memory is the exact accident the step warns against. All other steps carry real code/commands.
- **Type consistency:** `braketCredentials(env, from?)` matches between test and implementation; template parameter names (`BraketRoleArn`, `BraketExternalId`, `BraketSpendTopicArn`) are identical across Tasks 5, 7, 8; output names (`ExecutionRoleArn`, `ResultsBucketName`, `SpendTopicArn`) match Tasks 3→7→8→9.
- **Known uncertainty, stated:** `AWS::Budgets::Budget` in eu-north-1 is unverified (it provably works in us-east-2); the fallback is written into the template description and Task 7.
