# The Quantum Workspace — Cognito auth (sub-project #1)

Provisions the free-account identity layer for learner.quantumenv.dev (the origin
`SiteUrl` defaults to; quantum.altivum.ai still 301s onward): a Cognito user
pool, a public SPA app client (PKCE, no secret), a hosted domain (for the Google
OAuth hop), and Google as an identity provider. The web app (`web/`) consumes the
stack outputs as four `NEXT_PUBLIC_*` env vars. Mirrors `lambda/tutor/` in spirit:
infra-as-code, cost-tagged, env-gated on the frontend.

## Prerequisites

1. **Google OAuth client.** In Google Cloud Console → APIs & Services → Credentials,
   create an **OAuth 2.0 Client ID** of type **Web application**. Add the authorized
   redirect URI (the domain prefix is chosen up front, so this is known before the
   stack exists):

   ```
   https://quantum-altivum.auth.us-east-2.amazoncognito.com/oauth2/idpresponse
   ```

   Note the **Client ID** and **Client secret**.
2. AWS CLI v2 configured for the same account as the tutor (region **us-east-2**).

## Deploy

```bash
aws cloudformation deploy \
  --region us-east-2 \
  --stack-name quantum-workspace-auth \
  --template-file infra/workspace/cognito.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    GoogleClientId=<google-client-id> \
    GoogleClientSecret=<google-client-secret> \
    SiteUrl=<live canonical origin> \
    AlertEmail=<operator email>

# Read the outputs:
aws cloudformation describe-stacks --region us-east-2 \
  --stack-name quantum-workspace-auth \
  --query "Stacks[0].Outputs"
```

## Wire up the frontend

Set these in the Amplify app environment (and in `web/.env.local` for local testing),
from the stack outputs, then redeploy:

| Env var | From output |
|---|---|
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | `UserPoolId` |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | `UserPoolClientId` |
| `NEXT_PUBLIC_COGNITO_DOMAIN` | `HostedDomain` |
| `NEXT_PUBLIC_AWS_REGION` | `Region` |

Until all four are set, the auth UI stays inert (no nav account control; the CTA reads
"Sign-up coming soon"; `/login` and `/workspace` show "coming soon").

The stack has a fifth output, `SignupAlertTopicArn`. It is not an env var and the
web app never sees it — it is for the operator, and it is where the confirm-once
step below happens.

## Real-path smoke test (release gate)

With the four vars in `web/.env.local`, run `npm run dev` and in a real browser:

1. **Sign up** with a real email → receive the Cognito confirmation email → enter the
   code → you are auto signed-in and land on `/workspace`.
2. **A new-signup alert for that address arrives** at `AlertEmail`. If it does not,
   the subscription is probably still unconfirmed (see below); if it is confirmed,
   check `/aws/lambda/quantum-signup-alert` for the `signup alert failed` line. Free
   to check, because step 1 already made a real sign-up.
3. **Sign out**, then **sign in** again.
4. **Forgot password** → receive the reset email → set a new password → sign in. No
   alert should arrive: a reset is not a signup, and the handler filters on
   `triggerSource` so it is not reported as one.
5. **Continue with Google** → Google consent → `/auth/callback` → `/workspace`.
6. Error paths: a wrong password shows "Incorrect email or password."; an unconfirmed
   user is routed to the confirm view with a fresh code.

## Teardown

`DeletionProtection: ACTIVE` and `DeletionPolicy: Retain` guard the pool. To delete:

```bash
aws cognito-idp update-user-pool --region us-east-2 --user-pool-id <id> \
  --deletion-protection INACTIVE
aws cloudformation delete-stack --region us-east-2 --stack-name quantum-workspace-auth
```

Deleting the stack also deletes `quantum-signup-alerts`, its email subscription and
the alerter's log group. Then unset the four env vars in Amplify and remove the
Google OAuth client.

## Cost

Cognito's monthly-active-user free tier covers expected volume. `COGNITO_DEFAULT`
email has a low daily cap and a generic sender — fine to start; SES (verified domain,
higher limits, branded sender) is the production upgrade and requires no app changes.

The alerter adds one 128 MB Lambda invocation and one SNS email notification per
signup, plus CloudWatch storage for a log group held at `LogRetentionInDays` (30 by
default) — rounding error at any plausible signup rate, and the retention parameter
is there so it stays that way.

## New-signup alerts

The pool's `PostConfirmation` trigger (`quantum-signup-alert`) publishes to the
`quantum-signup-alerts` SNS topic, which emails `AlertEmail`. One hook covers both
sign-in methods: a federated user's FIRST Google sign-in raises
`PostConfirmation_ConfirmSignUp` just as a native confirmation does. The same hook
also fires on a completed password reset, and the handler filters that out — a reset
is not a new learner.

The handler is deliberately non-throwing. It sits ON the sign-up path, so a raised
exception is not a lost alert but a broken front door: every failure is caught,
logged, and the event returned unchanged. That is also why the stack carries alarms
it would not otherwise need — a swallowed failure is invisible, and zero alerts
reads exactly like zero signups:

| Alarm | Fires when |
|---|---|
| `quantum-signup-alert-publish-failed` | The sign-up worked, the publish did not. |
| `quantum-signup-alert-errors` | The invocation itself failed — sign-ups are breaking. |
| `quantum-signup-alert-throttles` | Concurrency throttled the trigger. |

All three route to the same topic, so a failure of the TOPIC silences the alarms
too; their own state in `aws cloudwatch describe-alarms` is the backstop.

**Confirm the subscription from the inbox once, or nothing will ever reach a human.**
AWS emails a confirmation link to `AlertEmail` on first deploy, and the subscription
delivers nothing until it is clicked. Changing `AlertEmail` and redeploying replaces
the subscription, which starts unconfirmed again. Check for the symptom:

```bash
aws sns list-subscriptions-by-topic --region us-east-2 \
  --topic-arn <SignupAlertTopicArn from the stack outputs> \
  --query "Subscriptions[].[Endpoint,SubscriptionArn]" --output table
```

A `SubscriptionArn` reading `PendingConfirmation` is an alerter that is deployed,
green, and delivering nothing.

## Progress sync (quantum-workspace-sync)

Cross-device sync for the `qc:*` progress families. The stack is a versioned
per-user KV (DynamoDB) behind an HTTP API whose Cognito JWT authorizer trusts
the pool above; ALL merge rules live in `web/src/lib/progress-merge.ts` — the
server only enforces optimistic concurrency (409 on version conflict).

Deploy (from `lambda/sync/`): `npm install && npm test` (9 offline handler
tests), then `sam build` and `sam deploy --guided` with
`--stack-name quantum-workspace-sync --region us-east-2
--capabilities CAPABILITY_IAM
--tags Project=quantum Feature=workspace-sync CostCategory=workspace`.

Then set the `SyncUrl` stack output as **`NEXT_PUBLIC_SYNC_URL`** in the
Amplify app environment (alongside the four Cognito vars) and redeploy. The
site is unaffected while the var is absent: the workspace keeps its
"not yet synced" copy and the background sync component stays inert.

The DynamoDB table (`quantum-workspace-progress`) carries
`DeletionPolicy: Retain` + point-in-time recovery — learner progress survives
stack deletion.
