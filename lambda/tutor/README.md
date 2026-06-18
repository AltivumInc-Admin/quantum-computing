# Ask the margin — lesson tutor (streaming Lambda)

A single, stateless, response-streaming Lambda that answers questions **grounded in
the current lesson** using Amazon Bedrock (Claude, `ConverseStream`). The rest of
the site stays a static export; this is the only server-side surface.

- `index.mjs` — the streaming handler. Mirrors `web/src/lib/tutor.ts` (the tested
  canonical) for prompt/grounding; keep them in sync.
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
    MaxConcurrency=5 \
    AlarmEmail=you@example.com
# note the TutorUrl output. MaxConcurrency is the hard cost ceiling (reserved
# concurrency). FoundationModelId scopes the Bedrock IAM to the model the profile
# routes to. AlarmEmail is optional — a non-blank value sends an SNS confirmation
# email you must accept; leave blank to create the alarm/topic without a subscriber.
```

## Deploy (raw CLI, fallback)

```bash
npm --prefix web run build:tutor-corpus
cd lambda/tutor && npm install --omit=dev && zip -r ../tutor.zip . && cd ../..

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

```bash
curl -N -X POST "<FunctionUrl>" \
  -H 'content-type: application/json' \
  -d '{"slug":"05-quantum-chemistry","question":"why does the Z-string only act on the lower modes?"}'
# expect a streamed, grounded answer; an out-of-scope question should be declined
```

## Notes

- **Cost / abuse:** the load-bearing control is `ReservedConcurrentExecutions`
  (`MaxConcurrency`, default 5) — a hard ceiling on simultaneous billable
  invocations; excess requests are throttled (429) rather than fanning out into
  unbounded paid generations. The template also scopes the Bedrock IAM `Resource`
  to the inference-profile + its foundation-model ARNs (least privilege, not `*`),
  caps `maxTokens` at 800 in the handler, and ships a CloudWatch alarm on hourly
  invocations to the `quantum-tutor-alarms` SNS topic. Note: `AuthType: NONE` +
  CORS is a browser-only UX allowlist, **not** an access control — it does not stop
  curl/scripted clients, so don't rely on it for abuse protection. For per-IP
  limits, front the Function URL with AWS WAF rate-based rules; or switch to
  `AWS_IAM` + signed requests if the UX can absorb it. Log retention: the auto-created
  `/aws/lambda/quantum-tutor` log group defaults to never-expire — set it with
  `aws logs put-retention-policy --log-group-name /aws/lambda/quantum-tutor --retention-in-days 14`.
- **Teardown:** `sam delete` (SAM) or `aws lambda delete-function-url-config` +
  `aws lambda delete-function` (CLI), then unset `NEXT_PUBLIC_TUTOR_URL`.
