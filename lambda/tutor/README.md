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
  --parameter-overrides ModelId=<inference-profile-id> AllowedOrigin=https://quantum.altivum.ai
# note the TutorUrl output
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
  --runtime nodejs20.x --handler index.handler \
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

- **Cost / abuse:** `AuthType: NONE` + tight CORS to your origin; `maxTokens` capped
  at 800 in the handler. Add a CloudWatch billing alarm. Tighten the Bedrock IAM
  `Resource` to the specific model/inference-profile ARN for production. Switch to
  `AWS_IAM` + signed requests if you need to lock it down further.
- **Teardown:** `sam delete` (SAM) or `aws lambda delete-function-url-config` +
  `aws lambda delete-function` (CLI), then unset `NEXT_PUBLIC_TUTOR_URL`. Also
  delete the application inference profile (below).

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
