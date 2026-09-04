# quantum-analytics

A daily count of who actually reached learner.quantumenv.dev.

## What it is

One scheduled Lambda, one DynamoDB table, one row per day. It reads the previous
day's CloudFront access logs through Amplify's `GenerateAccessLogs`, classifies
each visitor, and stores aggregate counts — how many people reached the site,
how many opened each lesson notebook, and how far through the curriculum a day's
readers got.

**It stores no identifiers.** Not addresses, not user agents, not request URLs,
and nothing that links one day to another — counts only. Nothing is added to the
browser: no analytics script, no tracking cookie, no beacon, no visitor
identifier. The logs being read here already exist and are already disclosed as
operational service logs.

**What was read is stored as a curriculum identifier, never as a path.**
`curriculum.mjs` is a checked-in allowlist of the seven section slugs and
forty-five notebook keys, each already public in a lesson URL, and
`curriculum.test.mjs` pins it to `web/src/lib/content-manifest.json` in both
directions. A path outside it cannot become a key, so a scanner's probe, a query
string, a rename or an unreviewed future route are structurally incapable of
reaching the table. `index.test.mjs` pins the written attribute set on every
branch that writes a row **and** asserts every curriculum key against that
allowlist, so widening either fails the build rather than quietly breaking the
promise.

**The privacy policy was amended to match, in both locales, in the same change
(2026-09-04).** "What we store" now discloses the daily counts, says that a
day's requests are grouped by network address to tell crawlers from people and
to count one person's second open once, that those addresses are used and then
discarded, and that nothing kept links one day to another. The code and the copy
move together: an aggregate this row cannot express is one the policy does not
promise, and vice versa.

## Why it exists

Answering "how many users do we have?" on 2026-08-20 took an afternoon of ad-hoc
AWS calls. `GenerateAccessLogs` serves roughly one day per call and refuses
wider windows — 7- and 14-day requests fail with `Unable to complete request for
the given time range` — so a history only exists if something collects it daily.

A single busy day can be refused the same way, and Amplify's retention is
finite, so a day lost to a size refusal is lost permanently. `retrieve.mjs`
halves the window and stitches the CSV halves back into one; both the scheduled
Lambda and the backfill script go through it, the way both go through
`classify.mjs`, so the daily answer and the historical one cannot diverge.

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
pages/minute. One exception outranks the behavioural signals — a completed
Google sign-in is proof of a person — but only when the same address also
fetched a `_next/static` chunk, and never from inside a published cloud range.

That qualification is the whole point: `referer` is written by the client and
`/auth/callback` is a real prerendered page, so a bare GET carrying
`Referer: https://accounts.google.com/` returns 200 with no auth involved. While
that header outranked everything, one forged row bought a datacenter crawler a
human verdict and inflated the only Google sign-in figure this account has. A
forger who also drives a browser from a residential address can still be counted
once; that is a different class of effort, and it is the residual.

**`humans` is a floor by construction.** Uncertain visitors are dropped.

### What a person read

Counted in the same pass, gated on the same `human` verdict, so the notebook
figures and the human total can never disagree about who was a person. A crawler
sweeping the whole curriculum — the real one was 56 requests from `curl/8.7.1`
fetching all 45 notebooks in ten seconds — is already a `declared-bot` and
contributes nothing.

| Attribute | Unit |
|---|---|
| `notebookOpens` | per notebook key: distinct people who loaded it that day |
| `sectionReach` | per section slug: distinct people who touched it that day |
| `sectionDepth` | keyed `"1"`..`"7"`: people who touched that many sections |
| `furthestSection` | per section slug: people whose deepest section it was |

Three measurement facts, all verified against production traffic, that the code
encodes and an edit must not undo:

- **A 304 revalidation carries no `sc-content-type`.** JupyterLite fetches a
  notebook on every open, the object is served `max-age=0`, and the browser
  revalidates. A predicate written on content-type — the way `isPageView` is —
  silently drops every repeat open. `notebookKey` reads status instead.
- **The same notebook is fetched twice per open**, and JupyterLab re-fetches
  whatever was open when the workspace was last used. Counts are therefore
  DISTINCT (address, notebook) pairs per day, not requests. The honest name for
  the metric is "a notebook was loaded into the lab", restores included.
- **`/learn/<slug>/__next.*.txt` is an RSC prefetch, not a read.** Next.js fires
  one for every in-viewport link; on a five-reader day all seven sections carried
  ten each. Counting them would report that everyone reached everything.

**Progression is a SET, deliberately unordered.** "Reached 00, 01 and 03 today"
is recoverable; "read 03 first" is not, and nothing links one day to another, so
retention and per-person funnels are not answerable from these rows and never
will be. That is the design, not a gap: a consenting-account funnel is already
derivable from the `sync` Lambda's stored "sections completed", which the privacy
policy has always disclosed. An ordered transition matrix would answer the
literal words "section-to-section" but, on a day with a handful of visitors,
would coarsely describe one person's path through the site — it is a separate
decision needing its own policy sentence, not an implementation detail.

**Known undercount, deliberately not fixed here.** `loadedAppAssets` accepts only
`/_next/static/`, and the JupyterLite lab is not a Next.js page. A visitor who
arrives on a lab deep link — which is what a shared notebook link is — fetches
`/lab/build/*.js` and is bucketed `no-assets`, so their opens go uncounted.
Widening the predicate is the right fix and uses this file's own argument, but it
would produce a step change in the `humans` series on the day it deploys, and
that series is the only history this stack has. It needs an explicit decision and
a note here, not a drive-by.

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
Raw cached logs contain visitor addresses, agents and paths. The script refuses
to run if `--cache` resolves inside this repo and `git check-ignore` does not
already cover it, and writes each CSV `0600` — the guard enforces this, not the
operator remembering.

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
> not skew the report — it drops every row, records `humans: 0`, and the run
> still succeeds. From the QL-Prod cutover until 2026-08-31 nothing said so;
> `quantum-analytics-matched-nothing` is now the alarm that does, and
> `template.test.mjs` fails if the default here and `web/src/lib/site.ts`
> disagree.

Confirm the SNS email subscription from the inbox once, or no alarm will ever
reach a human.

Register a new Lambda directory in **three** hand-maintained lists — nothing
derives them, and `lambda/stripe` was missed in two of them for three weeks:
`.github/workflows/ci.yml` (matrix), `infra/ci-standby/template.yaml` (buildspec
loop), and `web/__tests__/infra/wallet-ttl.test.ts` (`LAMBDA_DIRS`).

The fourth, the drift check's `FUNCTIONS` (now `scripts/drift/rules.mjs`), is
still written by hand but no longer unguarded: `scripts/drift/registry.test.mjs`
derives the expected set from every `lambda/*/template.yaml` and fails in both
directions, so a function declared in a template and missing from the registry
fails CI instead of quietly dropping out of the daily drift report.

## Observability

| Alarm | Fires when |
|---|---|
| `quantum-analytics-errors` | the run threw; that day's counts are missing and the raw logs will age out |
| `quantum-analytics-throttles` | a scheduled run may have been dropped |
| `quantum-analytics-did-not-run` | no invocation in 26 hours |
| `quantum-analytics-slow` | duration approaching the 120s timeout |
| `quantum-analytics-matched-nothing` | the run fetched rows and matched none of them — `SiteHost` or `AmplifyDomain` names a host the app no longer serves; check `SiteHost` against `web/src/lib/site.ts` |
| `quantum-analytics-bot-filter-incomplete` | AWS's prefix list could not be fetched, so the datacenter filter did not run and that day's `humans` is an overcount — the run itself succeeded, so nothing else can see it |
| `quantum-analytics-parse-degraded` | a large share of the day's log lines would not parse, so the counts are an undercount — a wholly unparseable log otherwise records as a quiet day |

`did-not-run` is the only alarm in this stack that **breaches on missing data**,
and deliberately so: a collector that silently stops looks exactly like a site
with no visitors, which is the one failure this stack must never produce.

The last three exist for the same reason from the other direction: a run that
**succeeds** while reporting nothing, an undercount, or an overcount cannot be
seen by an error-rate alarm, and `requests: 0` alone cannot tell breakage from a
quiet day. Each is emitted as a distinctive log line the handler writes and a
metric filter reads; `template.test.mjs` asserts every one of those three
literals still appears in `index.mjs`, so rewording a warning cannot silently
disconnect its alarm.

If a day is missed, re-run it once the cause is fixed:

```sh
aws lambda invoke --function-name quantum-analytics \
  --payload '{"day":"2026-08-19"}' --cli-binary-format raw-in-base64-out /dev/stdout
```

An explicit `day` is a re-run, and a re-run **cannot replace a non-zero row**:
the write carries `attribute_not_exists(day) OR requests = 0`. Amplify's
retention is finite, so a late re-run usually re-reads a shorter log, and
without the guard the documented recovery is itself the way to overwrite a real
measurement with zeroes on the only copy of the history. A refused write is
reported (`written: false`, and an `analytics-kept-existing-row` line), not an
error. When the new counts really are the better ones, say so:

```sh
aws lambda invoke --function-name quantum-analytics \
  --payload '{"day":"2026-08-19","overwrite":true}' \
  --cli-binary-format raw-in-base64-out /dev/stdout
```

The scheduled path (no `day` in the payload) is unguarded and keeps overwriting
its own row. `day` is validated before any AWS call: a real `YYYY-MM-DD`, not in
the future, not before launch — an unchecked one becomes an Invalid Date that
the SDK sends as `startTime: null`, quietly fetching a default window.

Amplify's log retention is finite, so a missed day is recoverable only for a
while. Do not sit on an `errors` alarm.

## Cost / abuse

Negligible and bounded. One invocation a day, reserved concurrency of 2, a
PAY_PER_REQUEST table holding a few kilobytes per day (the four curriculum maps
are at most 45 + 7 + 7 + 7 keys, against a 400 KB item limit) — one row per day
forever is a few megabytes a decade. `GenerateAccessLogs` and the
presigned download are not separately billed.

The table carries **no TTL specification, deliberately**. TTL is table-wide and
keyed on an attribute *name*, which is how the wallet table's `expiresAt` became
a standing landmine. These rows are the only copy of the history: the raw logs
behind them cannot be re-fetched past Amplify's retention. `template.test.mjs`
fails if a TTL is ever added.
