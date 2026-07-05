# The Quantum Workspace — Cognito auth (sub-project #1)

Provisions the free-account identity layer for quantum.altivum.ai: a Cognito user
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
    GoogleClientSecret=<google-client-secret>

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

## Real-path smoke test (release gate)

With the four vars in `web/.env.local`, run `npm run dev` and in a real browser:

1. **Sign up** with a real email → receive the Cognito confirmation email → enter the
   code → you are auto signed-in and land on `/workspace`.
2. **Sign out**, then **sign in** again.
3. **Forgot password** → receive the reset email → set a new password → sign in.
4. **Continue with Google** → Google consent → `/auth/callback` → `/workspace`.
5. Error paths: a wrong password shows "Incorrect email or password."; an unconfirmed
   user is routed to the confirm view with a fresh code.

## Teardown

`DeletionProtection: ACTIVE` and `DeletionPolicy: Retain` guard the pool. To delete:

```bash
aws cognito-idp update-user-pool --region us-east-2 --user-pool-id <id> \
  --deletion-protection INACTIVE
aws cloudformation delete-stack --region us-east-2 --stack-name quantum-workspace-auth
```

Then unset the four env vars in Amplify and remove the Google OAuth client.

## Cost

Cognito's monthly-active-user free tier covers expected volume. `COGNITO_DEFAULT`
email has a low daily cap and a generic sender — fine to start; SES (verified domain,
higher limits, branded sender) is the production upgrade and requires no app changes.

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
