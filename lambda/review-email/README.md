# quantum-review-email

A scheduled sender that emails a learner **only when they have spaced-repetition
cards genuinely due AND have explicitly opted in**, plus a tokenized unsubscribe
and an authenticated preferences API. It is the re-engagement surface a static
site otherwise can't reach — and it fires with the same anti-churn discipline as
the in-app inbox: no due cards, no email; no consent, no email; at most one
email per learner per 7 days.

## Consent model (opt-in)

- Consent is canonical in the `quantum-review-email-prefs` table:
  `remindersOn` must be **exactly `true`** for any send. An absent row, an
  absent attribute, or `false` all mean **no email**. Nothing is inferred from
  having an account or a verified email claim.
- The learner turns reminders on/off from the workspace at
  `https://quantum.altivum.ai/workspace` ("Manage reminder emails"), which
  calls the authenticated `/prefs` API. The default is **off**.
- Every email still carries a one-click tokenized unsubscribe
  (`remindersOn=false`); the legacy `optOut` attribute from the original
  opt-out model is kept as a backward-compatible veto, and re-enabling from
  the workspace clears it.
- **Cadence cap:** a successful send records `lastSentEpochDay`; the sender
  skips anyone emailed within the last 7 days, so a card that stays due cannot
  regenerate the same email daily.

## How it works

- **Sender** (`sender.mjs`, scheduled daily via EventBridge): first calls
  `sesv2 GetAccount` and **sends nothing while SES is in the sandbox** (emits
  `ReviewEmailSkippedSandbox`). Otherwise scans the sync stack's
  `quantum-workspace-progress` table, counts each learner's due cards (porting
  `review-schedule.isDue`: `dueEpochDay <= today`), and for anyone with due
  cards, a persisted email, `remindersOn=true`, and no send in the last 7 days,
  sends one reminder via SES and records the cadence marker.
- **Unsubscribe** (`unsubscribe.mjs`, public Function URL): the link in every
  email carries an HMAC token; clicking it sets `remindersOn=false`. Idempotent.
- **Prefs API** (`prefs.mjs`, HTTP API + Cognito JWT authorizer — the same
  authorizer discipline as `lambda/sync`): `GET /prefs` returns
  `{ remindersOn }`, `PUT /prefs { remindersOn: boolean }` sets it,
  `DELETE /prefs` removes the caller's row (used by account deletion). The
  identity is always the verified token's `sub`, never the request body. The
  API URL is exposed to the web app as `NEXT_PUBLIC_REVIEW_PREFS_URL`.
- **Fail loud:** the sender emits CloudWatch metrics via EMF (structured stdout,
  no SDK dependency): `ReviewEmailSent`, `ReviewEmailFailed` (send failures AND
  failed cadence-marker writes), and `ReviewEmailSkippedSandbox` — namespace
  `QuantumReviewEmail`. The stack alarms on `ReviewEmailFailed > 0` to an SNS
  topic with an email subscription (`AlertEmail` parameter).

All logic is in `review-email-core.mjs` with its dependencies injected, so it is
unit-tested offline: `cd lambda/review-email && npm install && npm test`
(`node --test`; `package-lock.json` is gitignored, so use `npm install` on a
fresh checkout).

## Prerequisite — SES out of the sandbox (the async long pole)

The sender can't email arbitrary learners until an SES **sending identity is
verified** and the account has **production access**. This is an async AWS
approval (often 24h+), so start it before deploying — and note the sender
refuses to send anything until it is granted (the sandbox guard). In
`us-east-2` (to match the other stacks):

1. **Verify the sending domain** (better deliverability than a single address):

   ```
   aws sesv2 create-email-identity --email-identity altivum.ai --region us-east-2
   ```

   That returns three DKIM CNAME tokens — add them as CNAME records at Cloudflare
   (where `altivum.ai` DNS lives). Verification completes once DNS propagates.

2. **Request production access** (exit the sandbox) via the SES console
   (Account dashboard → Request production access) or:

   ```
   aws sesv2 put-account-details \
     --production-access-enabled \
     --mail-type TRANSACTIONAL \
     --website-url https://quantum.altivum.ai \
     --use-case-description "Opt-in spaced-repetition review reminders to registered learners who explicitly enable them in their workspace (consent is stored per user and checked before every send; default is off). At most one email per learner per 7 days, sent only when that learner has review cards due. Every email has one-click unsubscribe, and learners can also disable reminders or delete their account (and all data) from the workspace." \
     --contact-language EN \
     --additional-contact-email-addresses christian.perez@altivum.io \
     --region us-east-2
   ```

   (Confirm the exact flags against the current AWS docs before running. The
   use-case description above is accurate as of the opt-in consent model — do
   not claim opt-in unless the deployed sender enforces `remindersOn === true`.)

## Deploy (after SES is verified + out of sandbox)

```
cd lambda/review-email
npm install
sam build
sam deploy --guided --region us-east-2
```

Parameters to set at the guided prompt:

- `FromAddress` — a verified sender on the domain, e.g. `reviews@altivum.ai`
- `UnsubSecret` — a long random string (e.g. `openssl rand -hex 32`); the HMAC key
- `SiteUrl` — `https://quantum.altivum.ai` (default)
- `ScheduleExpression` — daily send time, default `cron(0 15 * * ? *)` (15:00 UTC)
- `UserPoolId` / `UserPoolClientId` — the existing quantum-workspace Cognito
  pool + web app client (defaults match the deployed pool); the prefs API's JWT
  authorizer validates against these
- `AlertEmail` — receives the `ReviewEmailFailed > 0` alarm (default
  christian.perez@altivum.io; the SNS subscription must be confirmed once by
  email)

After deploy, set the `PrefsUrl` stack output as `NEXT_PUBLIC_REVIEW_PREFS_URL`
in the Amplify app environment so the workspace shows the reminders control.

The stack wires the unsubscribe Function URL back into the sender automatically
(`UNSUB_BASE_URL`), so there is nothing to reconcile. It reads the existing
`quantum-workspace-progress` table by name — no change to the sync stack beyond
the email-claim persistence already shipped in `lambda/sync`.

## Cost / abuse

- The daily job has `ReservedConcurrentExecutions: 1` (a hard ceiling). SES
  charges per email; the opt-in gate, the "only when due" gate, and the 7-day
  cadence cap keep volume proportional to real, consented activity.
- The unsubscribe endpoint is public but write-scoped to the caller's own
  consent flags, keyed by a verified HMAC token; a forged token is rejected
  before any write.
- The prefs API requires a valid Cognito JWT; the handler only ever reads or
  writes the row keyed by the verified `sub`.
- The sender's prefs access is read plus `dynamodb:UpdateItem` (needed for the
  `lastSentEpochDay` cadence marker — DynamoDB IAM cannot scope to a single
  attribute), and `ses:SendEmail` is condition-scoped to the configured
  `FromAddress` so it cannot send as any other verified identity.
