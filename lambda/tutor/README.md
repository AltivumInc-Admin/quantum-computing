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
2. AWS CLI v2 configured; Node 20.

## Deploy (SAM, recommended)

```bash
npm --prefix web run build:tutor-corpus          # writes lambda/tutor/corpus.json
cd lambda/tutor
npm install
sam build
sam deploy --guided \
  --parameter-overrides \
    ModelId=<inference-profile-arn> \
    FoundationModelId=anthropic.claude-haiku-4-5-20251001-v1:0 \
    MaxConcurrency=5
# note the TutorUrl output. MaxConcurrency is the hard cost ceiling (reserved
# concurrency). FoundationModelId scopes the Bedrock IAM to the model the profile
# routes to.
```

## Deploy (raw CLI, fallback)

```bash
npm --prefix web run build:tutor-corpus
cd lambda/tutor && npm install --omit=dev && zip -r ../tutor.zip . -x 'index.test.mjs' && cd ../..

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
# node --test: streaming deltas, the <<TUTOR-STREAM-ERROR>> sentinel on failure,
# and the out-of-scope / oversized-body gate (no model call)
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
  `zip` path is a plain archive, so it excludes the test explicitly with `-x 'index.test.mjs'`.
- **Cost / abuse:** the load-bearing control is `ReservedConcurrentExecutions`
  (`MaxConcurrency`, default 5) — a hard ceiling on simultaneous billable
  invocations; excess requests are throttled (429) rather than fanning out into
  unbounded paid generations. The template also scopes the Bedrock IAM `Resource`
  to the inference-profile + its foundation-model ARNs (least privilege, not `*`),
  and caps `maxTokens` at 800 in the handler. Abuse monitoring is managed
  separately (outside this stack): a CloudWatch alarm `quantum-tutor-high-invocations`
  (hourly Invocations > 500) already notifies the `quantum-tutor-alerts` SNS topic.
  Note: `AuthType: NONE` +
  CORS is a browser-only UX allowlist, **not** an access control — it does not stop
  curl/scripted clients, so don't rely on it for abuse protection. For per-IP
  limits, front the Function URL with AWS WAF rate-based rules; or switch to
  `AWS_IAM` + signed requests if the UX can absorb it. Log retention: the auto-created
  `/aws/lambda/quantum-tutor` log group defaults to never-expire — set it with
  `aws logs put-retention-policy --log-group-name /aws/lambda/quantum-tutor --retention-in-days 14`.
- **Teardown:** `sam delete` (SAM) or `aws lambda delete-function-url-config` +
  `aws lambda delete-function` (CLI), then unset `NEXT_PUBLIC_TUTOR_URL`.
