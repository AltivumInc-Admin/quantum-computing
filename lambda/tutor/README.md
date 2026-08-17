# Ask the margin — lesson tutor (streaming Lambda)

A single, stateless, response-streaming Lambda that answers questions **grounded in
the current lesson**, using Anthropic's first-party Messages API. The rest of the
site stays a static export; this is the only server-side surface.

> **Provider, 2026-08-17: this moved off Amazon Bedrock.** Bedrock never entitled
> this account to the paid roster — `converse` answered
> `anthropic.claude-sonnet-5 is not available for this account … contact AWS
> Sales` for sonnet-5, opus-5 and fable-5, so every tier above free was
> unreachable there. Only haiku-4-5 was ever invocable.
>
> Worth knowing because it is the trap that hid it: `list-foundation-models`,
> `list-inference-profiles` **and** `get-foundation-model-availability` all
> reported the paid models present and `AUTHORIZED`. Availability describes the
> model in the region, not your account's entitlement to invoke it. The only
> honest check is an actual call.
>
> Two consequences worth carrying: model inference is no longer on the AWS bill
> at all (see Cost attribution below), and `RATES` in `tutor-billing.mjs` stopped
> being a placeholder — Anthropic's published rates *are* the cost basis here,
> where Bedrock's had to be re-derived from Cost Explorer.

- `index.mjs` — the streaming handler. Imports its prompt/grounding logic from
  `tutor-core.mjs`; no hand-copied mirror.
- `tutor-core.mjs` — **the single source of truth** for the strip/heading/system-prompt
  logic. Committed, dependency-free ESM. Imported directly by `index.mjs` (`./tutor-core.mjs`)
  and the corpus builder (`scripts/build_tutor_corpus.mjs`). It lives here so `sam build`
  (default Node builder, `CodeUri: ./`) bundles it. The web app consumes a gitignored
  prebuild copy, `web/src/lib/tutor-core.generated.ts` (see Notes).
- `corpus.json` — generated grounding text, **not committed** (gitignored). Build it
  before packaging: `npm --prefix lambda/tutor run build:corpus`. `npm run deploy`
  chains it for you (see below), so you should rarely need it on its own.
- `template.yaml` — AWS SAM (recommended). `trust.json` / `policy.json` — for the
  raw AWS CLI path.

## Prerequisites

1. **An Anthropic API key**, stored in one Secrets Manager secret as
   `{"apiKey": "sk-ant-..."}`. The function reads it with its own execution role
   on first model call, so it never enters the environment and is not visible via
   `GetFunctionConfiguration`.
   ```bash
   # create it once (the value is piped, never an argument -- argv is world-readable)
   printf '{"apiKey":"%s"}' "$KEY" | aws secretsmanager create-secret \
     --name quantum-tutor --secret-string file:///dev/stdin --region us-east-2

   # verify it exists WITHOUT reading the value
   aws secretsmanager describe-secret --secret-id quantum-tutor --region us-east-2
   ```
   There is no model-access request to make and no inference profile to create:
   model ids are the bare first-party strings in `tutor-billing.mjs` `MODEL_IDS`.
2. AWS CLI v2 configured; Node 22 (matches the function's `nodejs22.x` runtime).

## Deploy (SAM, recommended)

```bash
cd lambda/tutor
npm install
npm run deploy
```

`npm run deploy` is the whole recipe. npm runs `predeploy` first, which rebuilds
`corpus.json` from the current GUIDEs and then runs the preflight gate; a non-zero
exit from either aborts before `sam build`, so you cannot ship a missing, stale or
truncated corpus (the failure mode that answers OUT_OF_SCOPE to every learner), or a
roster model whose id still carries a Bedrock prefix (which 404s at request time and
is indistinguishable from a model outage, because the handler converts it into the
in-band error sentinel inside a committed HTTP 200).

Add `-- --guided` on a first deploy to set the parameters:

```bash
npm run build:corpus \
  && node deploy-check.mjs \
  && sam build \
  && sam deploy --guided \
    --parameter-overrides \
      SecretId=quantum-tutor \
      MaxConcurrency=5 \
      LogRetentionInDays=30
# note the TutorUrl output. MaxConcurrency is the hard cost ceiling (reserved
# concurrency). SecretId names the Secrets Manager secret holding the Anthropic
# API key; the IAM grant is scoped to exactly that one secret, so this role
# cannot read quantum-stripe's live Stripe key from the same account.
# LogRetentionInDays sets the (now stack-managed) log group's retention.
```

> **First deploy after the log group was added to the template:** the
> `/aws/lambda/quantum-tutor` group was auto-created by Lambda before it was in
> `template.yaml`, so a plain `sam deploy` now fails `TutorLogGroup ... already
> exists`. Resolve it once — see [Log retention (now in the template)](#log-retention).

## Deploy (raw CLI, fallback)

```bash
npm --prefix lambda/tutor run build:corpus
cd lambda/tutor && npm install --omit=dev && zip -r ../tutor.zip . -x '*.test.mjs' 'deploy-check.mjs' && cd ../..

aws iam create-role --role-name quantum-tutor-role \
  --assume-role-policy-document file://lambda/tutor/trust.json
aws iam put-role-policy --role-name quantum-tutor-role \
  --policy-name tutor --policy-document file://lambda/tutor/policy.json

aws lambda create-function --function-name quantum-tutor \
  --runtime nodejs22.x --handler index.handler \
  --role arn:aws:iam::<ACCOUNT_ID>:role/quantum-tutor-role \
  --zip-file fileb://lambda/tutor.zip --timeout 60 --memory-size 512 \
  --environment "Variables={SECRET_ID=quantum-tutor}"

aws lambda create-function-url-config --function-name quantum-tutor \
  --auth-type AWS_IAM --invoke-mode RESPONSE_STREAM \
  --cors '{"AllowOrigins":["https://quantum.altivum.ai"],"AllowMethods":["POST"],"AllowHeaders":["content-type","x-amz-content-sha256"],"MaxAge":3600}'
# the returned FunctionUrl is your ORIGIN, not your endpoint: the browser talks
# to the CloudFront distribution in edge.yaml, which signs with OAC. AuthType
# must be AWS_IAM to match the shipped stack -- NONE would leave the raw
# Function URL callable by anyone, bypassing the WAF and its rate limit.
```

## Wire up the frontend

Set the Function URL as `NEXT_PUBLIC_TUTOR_URL` in the Amplify app's environment
variables and redeploy. The `<AskTutor />` affordance stays hidden until this is set
and the learner is inside a `/learn/<slug>` lesson.

## Smoke test

Offline handler test (no AWS creds, stubs the Anthropic client, no `corpus.json`
needed — the import-time corpus read is guarded). `npm install` is required first
because `index.mjs` imports the Anthropic and AWS SDKs at module top:

```bash
cd lambda/tutor && npm install && npm test
# node --test discovers all *.test.mjs:
#  - index.test.mjs       streaming deltas, the <<TUTOR-STREAM-ERROR>> sentinel,
#                         the out-of-scope / too-long gates (no model call), the
#                         shared question cap, and the 45s stream deadline
#  - handler-wiring.test.mjs the PRODUCTION wiring behind a fake `awslambda`:
#                         statusCode 200 + text/plain, and the SECRET_ID env
#                         contract against template.yaml
#  - tutor-billing.test.mjs the money kernel: roster, rates, per-model request
#                         shape, and the usage-report reader
#  - tutor-core.test.mjs  strip/heading/system-prompt + corpus-entry logic
#  - deploy-check.test.mjs the deploy preflight (model-id + corpus-freshness) validators
```

Live end-to-end (deployed Function URL):

```bash
# The shipped stack is AuthType AWS_IAM behind CloudFront+OAC, so an unsigned
# POST to the raw Function URL returns 403 -- that is the hardening working, not
# a broken deploy. Verify through the distribution the browser actually uses,
# and send the body hash OAC requires on POST:
BODY='{"slug":"05-quantum-chemistry","question":"why does the Z-string only act on the lower modes?"}'
curl -N -X POST "https://<distribution-domain>" \
  -H 'content-type: application/json' \
  -H "x-amz-content-sha256: $(printf %s "$BODY" | shasum -a 256 | cut -d' ' -f1)" \
  -d "$BODY"
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
     **429**, via an explicit `CustomResponse` on the rule's Block action — WAF's
     *default* block response is 403, so without it a throttled learner would be
     indistinguishable from a signing failure) plus an **Origin Access Control**
     that signs every CloudFront→origin request with SigV4. OAC **requires** the
     Function URL `AuthType: AWS_IAM` (`FunctionUrlAuthType` param), which also
     closes the public bypass — direct unsigned hits to the raw Function URL then
     return 403. So at the edge: **429 = too fast, 403 = a signing/auth problem.** **POST through OAC
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
     template also scopes the Secrets Manager IAM `Resource` to the one secret
     holding the API key (least privilege, not `*` — this role must not be able to
     read quantum-stripe's live Stripe key from the same account), and the handler
     caps `max_tokens` per model (`MAX_OUTPUT_TOKENS`).
     Monitoring is now **stack-managed** (see [Alarms](#alarms)): the
     `quantum-tutor-high-invocations-stack` alarm (hourly Invocations Sum > 500)
     and the `quantum-tutor-errors` metric-filter alarm (any `tutorError` log line
     in 5 minutes) both notify the stack's own `quantum-tutor-stack-alerts` SNS
     topic (`AlertEmail` parameter). Log retention is likewise stack-managed by
     the `TutorLogGroup` resource (`LogRetentionInDays`, default 30) — see
     [Log retention](#log-retention).
- **Teardown:** `sam delete` (SAM) or `aws lambda delete-function-url-config` +
  `aws lambda delete-function` (CLI), then unset `NEXT_PUBLIC_TUTOR_URL`. Also
  revoke the Anthropic API key in the Anthropic console and delete its secret —
  `sam delete` does not remove a secret it did not create.

## Alarms

Two CloudWatch alarms are declared in `template.yaml`, both notifying the
stack-managed `quantum-tutor-stack-alerts` SNS topic (email subscription via the
`AlertEmail` parameter, default christian.perez@altivum.io):

- **`quantum-tutor-high-invocations-stack`** — hourly Invocations Sum > 500.
  The stack-managed successor to the console-created
  `quantum-tutor-high-invocations` alarm (same metric, statistic, period, and
  threshold). The name is deliberately different: `PutMetricAlarm` upserts by
  name, so reusing the existing name would either fail stack creation or
  silently seize the console-created resource — and then delete it on rollback.
- **`quantum-tutor-errors`** — fed by the `TutorErrorMetricFilter` on the
  function's log group (`QuantumTutor/TutorError`, Sum over 5 minutes > 0).
  `index.mjs` streams inside a committed HTTP 200, so a model failure raises
  neither the HTTP status nor the Lambda `Errors` metric; its only trace is the
  `console.error(JSON.stringify({ tutorError: true, ... }))` line, which the
  filter turns into a metric. The pattern is the literal term `"tutorError"`,
  not a JSON selector — Lambda's default text log format prefixes
  `console.error` output with timestamp/request-id, so a JSON selector would
  never match. `template.test.mjs` pins the term to the actual emission in
  `index.mjs` so the two cannot drift.

The topic is named `quantum-tutor-stack-alerts`, **not** `quantum-tutor-alerts`:
that topic already exists in the account, created by hand for the old
console-managed alarm, and SNS `CreateTopic` is idempotent by name — reusing it
would let CloudFormation silently claim the live topic and delete it (with its
confirmed subscriptions) on stack delete or rollback.

**Migration runbook (one-time, right after the first deploy of this version):**

1. Manually delete the console-created alarm — it now duplicates the
   stack-managed one:
   ```bash
   aws cloudwatch delete-alarms --region us-east-2 --alarm-names quantum-tutor-high-invocations
   ```
2. Optionally retire the hand-created `quantum-tutor-alerts` SNS topic once
   nothing references it (step 1 removes its last consumer):
   ```bash
   aws sns delete-topic --region us-east-2 \
     --topic-arn arn:aws:sns:us-east-2:<ACCOUNT_ID>:quantum-tutor-alerts
   ```
3. Confirm the new topic's email subscription from the `AlertEmail` inbox —
   an SNS email subscription delivers nothing until confirmed once.

## Log retention

The function's CloudWatch log group is declared in `template.yaml`
(`TutorLogGroup` → `/aws/lambda/quantum-tutor`) with a finite retention
(`LogRetentionInDays`, default 30) instead of Lambda's never-expire default — so
log spend is bounded and the policy lives in version control, not a one-off CLI call.

**One-time reconciliation (existing stack only).** Lambda auto-created the group on
the first deploy, before it was in the template, so a plain `sam deploy` now fails
`TutorLogGroup ... already exists`. Pick one (region is **us-east-2**; confirm the
stack name with `aws cloudformation list-stacks`):

- **Preserve existing logs — CloudFormation resource import (two steps; an
  `IMPORT` change set may contain ONLY imports, so it cannot use the full new
  template while that template also adds other resources).**
  1. Fetch the currently deployed template (`aws cloudformation get-template
     --template-stage Original`), append ONLY the `TutorLogGroup` resource
     (literal `LogGroupName: /aws/lambda/quantum-tutor`, `RetentionInDays: 30`,
     `DeletionPolicy: Retain` — CloudFormation requires a DeletionPolicy on
     every imported resource), and create + execute an `IMPORT` change set
     against that template (`ResourceType: AWS::Logs::LogGroup`,
     `LogicalResourceId: TutorLogGroup`, `ResourceIdentifier:
     {"LogGroupName": "/aws/lambda/quantum-tutor"}`), passing
     `UsePreviousValue` for the stack's existing parameters.
  2. After `IMPORT_COMPLETE`, a normal `sam deploy` manages the group. The
     template names the group with the LITERAL string (not
     `!Sub "/aws/lambda/${TutorFunction}"`) deliberately: import stores the
     literal physical name, and CloudFormation flags a raw `!Sub` against it
     as a LogGroupName change — planning a replacement that fails on the
     existing name.
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

**The dominant cost is no longer on the AWS bill at all.** Model inference is billed
by Anthropic against the API key in the `quantum-tutor` secret, so Cost Explorer,
`make cost`, and the tags below now cover only this stack's own AWS footprint:
Lambda compute, CloudWatch Logs, the Function URL, and the edge distribution.

Expect tutor inference in Cost Explorer to drop to zero from the cutover date.
That is the provider move, not a usage collapse — read inference spend in the
Anthropic console instead. The application inference profile `quantum-ask-tutor`
that used to carry the tags onto every Bedrock billing record is now unused and
can be deleted:

```bash
aws bedrock delete-inference-profile --region us-east-2 \
  --inference-profile-identifier <AIP-ARN>
```

Per-request cost is still fully observable *inside* this repo, and more precisely
than Cost Explorer ever showed: every metered generation logs `tutorReserve` and
`tutorSettle` lines carrying the credits reserved, charged and refunded, and
`RATES` in `tutor-billing.mjs` is now the provider's published rate rather than a
placeholder pending verification.

The AWS-side tags below remain useful for the compute footprint. All tutor
resources carry `Project=quantum`, `Feature=ask-tutor`, `CostCategory=genai`.

