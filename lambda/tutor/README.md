# Ask the margin — lesson tutor (streaming Lambda)

A single, stateless, response-streaming Lambda that answers questions **grounded in
the current lesson** using Amazon Bedrock (Claude, `ConverseStream`). The rest of
the site stays a static export; this is the only server-side surface.

- `index.mjs` — the streaming handler. Imports its prompt/grounding logic from
  `tutor-core.mjs`; no hand-copied mirror.
- `tutor-core.mjs` — **the single source of truth** for the strip/heading/system-prompt
  logic. Committed, dependency-free ESM. Imported directly by `index.mjs` (`./tutor-core.mjs`)
  and the corpus builder (`scripts/build_tutor_corpus.mjs`). It lives here so `sam build`
  (default Node builder, `CodeUri: ./`) bundles it. The web app consumes a gitignored
  prebuild copy, `web/src/lib/tutor-core.generated.ts` (see Notes).
- `corpus.json` — generated grounding text, **not committed** (gitignored). Build it
  before packaging: `npm --prefix web run build:tutor-corpus`.
- `template.yaml` — AWS SAM (recommended). `trust.json` / `policy.json` — for the
  raw AWS CLI path.

## Prerequisites

1. **Request Bedrock model access** for the Claude model you'll use, in your deploy
   region (Bedrock console → Model access). Get its id/inference-profile:
   ```bash
   aws bedrock list-inference-profiles --query "inferenceProfileSummaries[].inferenceProfileId"
   ```
2. AWS CLI v2 configured; Node 22 (matches the function's `nodejs22.x` runtime).

## Deploy (SAM, recommended)

```bash
npm --prefix web run build:tutor-corpus          # writes lambda/tutor/corpus.json
# Preflight gate: fails early if the corpus is missing/stale or the model id is
# malformed (so you never ship an empty corpus that answers OUT_OF_SCOPE to everyone).
TUTOR_MODEL_ID=<inference-profile-arn> node lambda/tutor/deploy-check.mjs
cd lambda/tutor
npm install
sam build
sam deploy --guided \
  --parameter-overrides \
    ModelId=<inference-profile-arn> \
    FoundationModelId=anthropic.claude-haiku-4-5-20251001-v1:0 \
    MaxConcurrency=5 \
    LogRetentionInDays=30
# note the TutorUrl output. MaxConcurrency is the hard cost ceiling (reserved
# concurrency). FoundationModelId scopes the Bedrock IAM to the model the profile
# routes to. LogRetentionInDays sets the (now stack-managed) log group's retention.
```

> **First deploy after the log group was added to the template:** the
> `/aws/lambda/quantum-tutor` group was auto-created by Lambda before it was in
> `template.yaml`, so a plain `sam deploy` now fails `TutorLogGroup ... already
> exists`. Resolve it once — see [Log retention (now in the template)](#log-retention).

## Deploy (raw CLI, fallback)

```bash
npm --prefix web run build:tutor-corpus
cd lambda/tutor && npm install --omit=dev && zip -r ../tutor.zip . -x '*.test.mjs' 'deploy-check.mjs' && cd ../..

aws iam create-role --role-name quantum-tutor-role \
  --assume-role-policy-document file://lambda/tutor/trust.json
aws iam put-role-policy --role-name quantum-tutor-role \
  --policy-name tutor --policy-document file://lambda/tutor/policy.json

aws lambda create-function --function-name quantum-tutor \
  --runtime nodejs22.x --handler index.handler \
  --role arn:aws:iam::<ACCOUNT_ID>:role/quantum-tutor-role \
  --zip-file fileb://lambda/tutor.zip --timeout 60 --memory-size 512 \
  --environment "Variables={TUTOR_MODEL_ID=<inference-profile-id>}"

aws lambda create-function-url-config --function-name quantum-tutor \
  --auth-type NONE --invoke-mode RESPONSE_STREAM \
  --cors '{"AllowOrigins":["https://quantum.altivum.ai"],"AllowMethods":["POST"],"AllowHeaders":["content-type"]}'
# the returned FunctionUrl is your endpoint
```

## Wire up the frontend

Set the Function URL as `NEXT_PUBLIC_TUTOR_URL` in the Amplify app's environment
variables and redeploy. The `<AskTutor />` affordance stays hidden until this is set
and the learner is inside a `/learn/<slug>` lesson.

## Smoke test

Offline handler test (no AWS creds, stubs Bedrock, no `corpus.json` needed — the
import-time corpus read is guarded). `npm install` is required first because
`index.mjs` imports the Bedrock SDK at module top:

```bash
cd lambda/tutor && npm install && npm test
# node --test discovers all *.test.mjs:
#  - index.test.mjs       streaming deltas, the <<TUTOR-STREAM-ERROR>> sentinel,
#                         the out-of-scope / oversized-body gate (no model call)
#  - tutor-core.test.mjs  strip/heading/system-prompt + corpus-entry logic
#  - deploy-check.test.mjs the deploy preflight (model-id + corpus-freshness) validators
```

Live end-to-end (deployed Function URL):

```bash
curl -N -X POST "<FunctionUrl>" \
  -H 'content-type: application/json' \
  -d '{"slug":"05-quantum-chemistry","question":"why does the Z-string only act on the lower modes?"}'
# expect a streamed, grounded answer; an out-of-scope question should be declined
```

## Notes

- **Single-source tutor logic:** `tutor-core.mjs` is the only copy of the
  strip/heading/system-prompt logic. `index.mjs` and `scripts/build_tutor_corpus.mjs`
  import it natively (both are plain Node ESM). The web app does **not** import the
  `.mjs` directly — ts-jest's transform key is `^.+\.tsx?$`, so a cross-boundary `.mjs`
  re-export makes the Jest suite fail with `SyntaxError: Unexpected token 'export'`.
  Instead the web `gen:tutor-core` script (run by the `pretest`/`prebuild` hooks) copies
  `tutor-core.mjs` into the gitignored `web/src/lib/tutor-core.generated.ts` (with a
  `// @ts-nocheck` banner so `next build`'s strict check passes), and `web/src/lib/tutor.ts`
  re-exports it. `sam build` bundles `tutor-core.mjs` automatically because it sits under
  `CodeUri`.
- **Deployed artifact contents:** the `package.json` `files` whitelist
  (`index.mjs`, `tutor-core.mjs`, `corpus.json`) scopes what `sam build` packages
  (its Node builder honors npm pack semantics), so `index.test.mjs` and the non-runtime
  `template.yaml`/`policy.json`/`trust.json` are kept out of the function bundle. The raw-CLI
  `zip` path is a plain archive, so it excludes the test files and the preflight CLI
  explicitly with `-x '*.test.mjs' 'deploy-check.mjs'`.
- **Cost / abuse — two layers.**
  1. **Per-IP rate limiting at the edge (`edge.yaml`).** WAF **cannot** attach
     directly to a Lambda Function URL — WAFv2 web ACLs only attach to CloudFront,
     ALB, API Gateway, AppSync, Cognito, App Runner, Verified Access. So per-IP
     limiting requires fronting the Function URL with **CloudFront + a WAFv2
     rate-based rule**. `edge.yaml` (a separate **us-east-1** stack — CloudFront-scope
     WAF must live there) deploys that: a per-IP rate rule (default 300 req/60s →
     429) plus an **Origin Access Control** that signs every CloudFront→origin
     request with SigV4. OAC **requires** the Function URL `AuthType: AWS_IAM`
     (`FunctionUrlAuthType` param), which also closes the public bypass — direct
     unsigned hits to the raw Function URL then return 403. **POST through OAC
     requires the client to send `x-amz-content-sha256` (SHA-256 of the body)** —
     "Lambda doesn't support unsigned payloads"; `web/src/components/ask-tutor.tsx`
     computes it via `web/src/lib/sha256.ts`, and the Function URL CORS allows the
     header. Deploy + wire it with:
     ```bash
     # 1) us-east-2 stack stays as-is for now (AuthType still NONE during cutover):
     sam deploy --parameter-overrides FunctionUrlAuthType=NONE ...
     # 2) edge stack in us-east-1 (host part of the TutorUrl output):
     aws cloudformation deploy --region us-east-1 --stack-name quantum-tutor-edge \
       --template-file edge.yaml --capabilities CAPABILITY_IAM \
       --parameter-overrides FunctionUrlDomain=<host-of-TutorUrl>
     # 3) grant CloudFront OAC access to the Function URL (CLI only):
     DISTRIBUTION_ID=<edge output DistributionId> ./scripts/grant-oac.sh
     # 4) verify CloudFront streams a grounded answer (signed POST + x-amz-content-sha256),
     #    point NEXT_PUBLIC_TUTOR_URL at https://<DistributionDomainName>/ and redeploy Amplify,
     # 5) finally flip the Function URL closed: sam deploy --parameter-overrides FunctionUrlAuthType=AWS_IAM
     ```
     (API Gateway is **rejected** as the front door: HTTP APIs don't support Lambda
     response streaming, which would break the streaming tutor UX.)
  2. **`ReservedConcurrentExecutions`** (`MaxConcurrency`, default 5) — a hard
     ceiling on simultaneous billable invocations behind the edge limit; excess is
     throttled rather than fanning out into unbounded paid generations. The
     template also scopes the Bedrock IAM `Resource` to the inference-profile + its
     foundation-model ARNs (least privilege, not `*`) and caps `maxTokens` at 800.
     A CloudWatch alarm `quantum-tutor-high-invocations` (hourly Invocations > 500)
     notifies the `quantum-tutor-alerts` SNS topic (managed separately). Log
     retention is now **stack-managed** by the `TutorLogGroup` resource
     (`LogRetentionInDays`, default 30) — see [Log retention](#log-retention).
- **Teardown:** `sam delete` (SAM) or `aws lambda delete-function-url-config` +
  `aws lambda delete-function` (CLI), then unset `NEXT_PUBLIC_TUTOR_URL`. Also
  delete the application inference profile (below).

## Log retention

The function's CloudWatch log group is declared in `template.yaml`
(`TutorLogGroup` → `/aws/lambda/quantum-tutor`) with a finite retention
(`LogRetentionInDays`, default 30) instead of Lambda's never-expire default — so
log spend is bounded and the policy lives in version control, not a one-off CLI call.

**One-time reconciliation (existing stack only).** Lambda auto-created the group on
the first deploy, before it was in the template, so a plain `sam deploy` now fails
`TutorLogGroup ... already exists`. Pick one (region is **us-east-2**; confirm the
stack name with `aws cloudformation list-stacks`):

- **Preserve existing logs — CloudFormation resource import.** `sam build`, then
  create an `IMPORT` change set that adopts the existing group into the stack
  (`ResourceType: AWS::Logs::LogGroup`, `LogicalResourceId: TutorLogGroup`,
  `ResourceIdentifier: {"LogGroupName": "/aws/lambda/quantum-tutor"}`) against the
  built `.aws-sam/build/template.yaml`, passing the stack's current parameter
  values, then execute it. After import, normal `sam deploy` manages the group.
  (`TutorLogGroup` carries `DeletionPolicy: Retain`, which CloudFormation requires
  on every resource being imported.)
- **Simplest, drops existing logs.**
  ```bash
  aws logs delete-log-group --region us-east-2 --log-group-name /aws/lambda/quantum-tutor
  sam deploy   # recreates it under the stack with the LogRetentionInDays retention
  ```

(The previous manual `aws logs put-retention-policy` step is no longer needed —
retention is set by the template.)

## Cost attribution (gen-AI vs free modules)

The lessons stay free; the gen-AI tutor is tagged so its spend is attributable and
ready to monetize. All tutor resources carry `Project=quantum`, `Feature=ask-tutor`,
`CostCategory=genai`.

The dominant cost is **Bedrock inference**, which is attributed via an **application
inference profile** (AIP) — a tagged wrapper around the model. The Lambda invokes the
AIP ARN (passed as `ModelId`) instead of the raw model id, so the AIP's tags land on
every billing record. Current AIP (us-east-2):

```
quantum-ask-tutor  ->  arn:aws:bedrock:us-east-2:205930636302:application-inference-profile/q050egz0q4mb
   wraps system profile  us.anthropic.claude-haiku-4-5-20251001-v1:0   (tags: Project/Feature/CostCategory)
```

Recreate it if needed:

```bash
aws bedrock create-inference-profile --region us-east-2 \
  --inference-profile-name quantum-ask-tutor \
  --description "Cost attribution for the quantum portal gen-AI lesson tutor" \
  --model-source copyFrom=arn:aws:bedrock:us-east-2:205930636302:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0 \
  --tags '[{"key":"Project","value":"quantum"},{"key":"Feature","value":"ask-tutor"},{"key":"CostCategory","value":"genai"}]'
# then redeploy with ModelId=<the returned application-inference-profile ARN>
```

**Activation (must run in the MANAGEMENT / payer account):** user-defined tags only
appear in Cost Explorer after activation, and this account is a linked member, so the
payer account must activate them — Billing & Cost Management console -> Cost allocation
tags -> activate `Project`, `Feature`, `CostCategory`; or from the management account:

```bash
aws ce update-cost-allocation-tags-status --region us-east-1 \
  --cost-allocation-tags-status TagKey=Project,Status=Active TagKey=Feature,Status=Active TagKey=CostCategory,Status=Active
```

Activation is **not retroactive** (only spend after activation is tagged) and tags take
up to ~24h to appear. Then filter/group by these tags in Cost Explorer or CUR 2.0.
Teardown also: `aws bedrock delete-inference-profile --inference-profile-identifier <AIP-ARN> --region us-east-2`.
