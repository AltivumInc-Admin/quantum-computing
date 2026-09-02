# quantum-analytics

A daily count of who actually reached quantum.altivum.ai.

## What it is

One scheduled Lambda, one DynamoDB table, one row per day. It reads the previous
day's CloudFront access logs through Amplify's `GenerateAccessLogs`, classifies
each visitor, and stores aggregate counts.

**It stores no identifiers.** Not addresses, not user agents, not paths — counts
only. Nothing is added to the browser: no script, no cookie, no beacon. The
privacy policy states in both locales that no analytics or tracking scripts exist
anywhere on the site, and that remains true as written. The logs being read here
already exist and are already disclosed as operational service logs. `index.test.mjs`
pins the written attribute set, so widening it fails the build rather than
quietly breaking that promise.

## Why it exists

Answering "how many users do we have?" on 2026-08-20 took an afternoon of ad-hoc
AWS calls. `GenerateAccessLogs` serves roughly one day per call and refuses
wider windows — 7- and 14-day requests fail with `Unable to complete request for
the given time range` — so a history only exists if something collects it daily.

It also carries the only Google sign-in signal this account has. Cognito's
`FederationSuccesses` metric reads 0 despite federated accounts existing,
CloudTrail records no Cognito sign-in events, and Cognito threat protection
explicitly cannot be used with federated sign-in. But the hosted-UI redirect
lands on our own origin, so a request to `/auth/callback` with an
`accounts.google.com` referer is a completed Google sign-in — verified against
real traffic on 2026-07-28 and 2026-08-16.

Native (SRP) sign-in happens in-page and never touches that route; it is counted
separately by the CloudWatch `SignInSuccesses` metric. **Report the two as
separate series, never summed.**

## How a visitor is classified

Almost all traffic to this site is automated, and naive filtering gets it wrong.
Three approaches were tried and failed on real data:

| Approach | How it failed |
|---|---|
| User-agent only | 19 requests to `/wp-admin/install.php` carried ordinary mobile user-agents. Scanners spoof `SM-G900P`, `Nexus 5`, `Pixel 2`. |
| "Did it load app assets?" | Six addresses fetched HTML *and* `_next/static` chunks — real browser behaviour — while reading at 100-260 pages/minute. |
| Rate only | One address read 442 pages at 0.9 pages/minute over eight hours. Slow enough to pass, far too much for a person. |

So a visitor counts as human only after surviving every signal in
`classify.mjs`: no hostile path, no self-declared bot agent, not inside a
published cloud provider range, loaded app assets, under 100 pages/day, under 20
pages/minute. One exception outranks all of it — a completed Google sign-in is
proof of a person, so it is counted as human regardless.

**`humans` is a floor by construction.** Uncertain visitors are dropped.

Two traps worth keeping in mind if you edit `HOSTILE_PATH`:

- **Never add a pattern that matches a route this site serves.** `/credentials`
  was in the list originally, and `/credentials` is a real page. Because the rule
  convicts the *visitor* rather than the request, that one overlap erased two
  genuine readers who had just signed in with Google. The test "no route this
  site serves is classified hostile" reads the app directory and now fails on any
  repeat.
- Rate needs intervals *between pages*. One page view has none — dividing one
  page by the one-second gap to its stylesheet reports 60 pages/minute and
  convicts a reader.

## Local dev loop

```sh
cd lambda/analytics && npm ci && npm test    # node --test, AWS clients stubbed
```

Invoke the core directly against a real day without deploying anything — this
writes to DynamoDB, so point it at a scratch table or omit the write:

```sh
node -e 'import("./index.mjs").then(m => m.handler({ day: "2026-07-28" }).then(console.log))'
```

## Backfill

The stack only collects from the day it is deployed. To populate history back to
launch (2026-06-28, the oldest day with retrievable logs):

```sh
node scripts/analytics/backfill.mjs                 # all days, cached in .analytics-cache/
node scripts/analytics/backfill.mjs --from 2026-07-28 --to 2026-07-28
node scripts/analytics/backfill.mjs --json
node scripts/analytics/backfill.mjs --profile ql-prod
```

It takes its app id, apex and host filter from this stack's own `template.yaml`
defaults, so it cannot fetch one app's logs and filter them for another app's
host — which is exactly what it did after the QL-Prod cutover. **A day the site
served under an older hostname needs all three overridden together**, because
all three moved together:

```sh
node scripts/analytics/backfill.mjs --to 2026-08-30 \
  --app-id d1ao02to23x85y --domain altivum.ai --site-host quantum.altivum.ai
```

It prints the answering account before it starts (`sts get-caller-identity`);
pass `--profile` when the default credentials are not the ones you mean.

It is read-only and writes no DynamoDB rows — it reports and caches locally.
Exit codes: `0` every day retrieved, `1` retrieved with gaps **or a day whose
rows all missed the host filter** (`MISMATCHED`), `2` could not run.
Raw cached logs contain visitor addresses and are gitignored; do not commit them.

## Deploy

```sh
cd lambda/analytics && npm ci && sam build
sam deploy --stack-name quantum-analytics --region us-east-2 \
  --capabilities CAPABILITY_IAM --resolve-s3 \
  --parameter-overrides AlertEmail=<operator email> \
    AmplifyAppId=d2o7mzaq4cktxf AmplifyDomain=quantumenv.dev \
    SiteHost=learner.quantumenv.dev
```

> **`SiteHost` and `AmplifyDomain` move together with the site's domain.**
> `AmplifyDomain` is the ASSOCIATION (the apex) whose logs are fetched;
> `SiteHost` is the x-host-header that counts as ours. A stale `SiteHost` does
> not skew the report — it drops every row, records `humans: 0`, and still
> succeeds, so no alarm fires. That held silently from the QL-Prod cutover
> until 2026-08-31.

Confirm the SNS email subscription from the inbox once, or no alarm will ever
reach a human.

Register a new Lambda directory in **four** hand-maintained lists — nothing
derives them, and `lambda/stripe` was missed in two of them for three weeks:
`.github/workflows/ci.yml` (matrix), `infra/ci-standby/template.yaml` (buildspec
loop), `scripts/check-lambda-drift.mjs` (`FUNCTIONS`), and
`web/__tests__/infra/wallet-ttl.test.ts` (`LAMBDA_DIRS`).

## Observability

| Alarm | Fires when |
|---|---|
| `quantum-analytics-errors` | the run threw; that day's counts are missing and the raw logs will age out |
| `quantum-analytics-throttles` | a scheduled run may have been dropped |
| `quantum-analytics-did-not-run` | no invocation in 26 hours |
| `quantum-analytics-slow` | duration approaching the 120s timeout |

`did-not-run` is the only alarm in this stack that **breaches on missing data**,
and deliberately so: a collector that silently stops looks exactly like a site
with no visitors, which is the one failure this stack must never produce.

If a day is missed, re-run it once the cause is fixed:

```sh
aws lambda invoke --function-name quantum-analytics \
  --payload '{"day":"2026-08-19"}' --cli-binary-format raw-in-base64-out /dev/stdout
```

Amplify's log retention is finite, so a missed day is recoverable only for a
while. Do not sit on an `errors` alarm.

## Cost / abuse

Negligible and bounded. One invocation a day, reserved concurrency of 2, a
PAY_PER_REQUEST table holding a few hundred bytes per day — one row per day
forever is well under a megabyte a decade. `GenerateAccessLogs` and the
presigned download are not separately billed.

The table carries **no TTL specification, deliberately**. TTL is table-wide and
keyed on an attribute *name*, which is how the wallet table's `expiresAt` became
a standing landmine. These rows are the only copy of the history: the raw logs
behind them cannot be re-fetched past Amplify's retention. `template.test.mjs`
fails if a TTL is ever added.
