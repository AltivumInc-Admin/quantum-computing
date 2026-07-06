# quantum-review-email

A scheduled sender that emails a learner **only when they have spaced-repetition
cards genuinely due**, plus a tokenized unsubscribe. It is the re-engagement
surface a static site otherwise can't reach — and it fires with the same
anti-churn discipline as the in-app inbox: no due cards, no email.

## How it works

- **Sender** (`sender.mjs`, scheduled daily via EventBridge): scans the sync
  stack's `quantum-workspace-progress` table, counts each learner's due cards
  (porting `review-schedule.isDue`: `dueEpochDay <= today`), and for anyone with
  due cards, a persisted email, and no opt-out, sends one reminder via SES.
- **Unsubscribe** (`unsubscribe.mjs`, public Function URL): the link in every
  email carries an HMAC token; clicking it flips an opt-out flag. Idempotent.
- **Opt-out** lives in its own tiny `quantum-review-email-prefs` table, so the
  sync Lambda's full-item PUT can never clobber it. The sync Lambda now persists
  the verified `email` claim onto its progress item (a one-line addition), so the
  sender needs no Cognito `ListUsers` lookup.

All logic is in `review-email-core.mjs` with its dependencies injected, so it is
unit-tested offline: `cd lambda/review-email && npm ci && npm test` (`node --test`).

## Prerequisite — SES out of the sandbox (the async long pole)

The sender can't email arbitrary learners until an SES **sending identity is
verified** and the account has **production access**. This is an async AWS
approval (often 24h+), so start it before deploying. In `us-east-2` (to match the
other stacks):

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
     --use-case-description "Opt-in spaced-repetition review reminders to registered learners; every email has one-click unsubscribe." \
     --contact-language EN \
     --additional-contact-email-addresses christian.perez@altivum.io \
     --region us-east-2
   ```

   (Confirm the exact flags against the current AWS docs before running.)

## Deploy (after SES is verified + out of sandbox)

```
cd lambda/review-email
npm ci
sam build
sam deploy --guided --region us-east-2
```

Parameters to set at the guided prompt:

- `FromAddress` — a verified sender on the domain, e.g. `reviews@altivum.ai`
- `UnsubSecret` — a long random string (e.g. `openssl rand -hex 32`); the HMAC key
- `SiteUrl` — `https://quantum.altivum.ai` (default)
- `ScheduleExpression` — daily send time, default `cron(0 15 * * ? *)` (15:00 UTC)

The stack wires the unsubscribe Function URL back into the sender automatically
(`UNSUB_BASE_URL`), so there is nothing to reconcile. It reads the existing
`quantum-workspace-progress` table by name — no change to the sync stack beyond
the email-claim persistence already shipped in `lambda/sync`.

## Cost / abuse

- The daily job has `ReservedConcurrentExecutions: 1` (a hard ceiling). SES
  charges per email; the "only when due" gate keeps volume proportional to real
  activity.
- The unsubscribe endpoint is public but write-scoped to a single opt-out flag
  keyed by a verified HMAC token; a forged token is rejected before any write.
