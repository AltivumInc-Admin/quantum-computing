# CI standby — CodeBuild warm mirror of the GitHub Actions gate

`main` is branch-protected: nothing merges without every CI job passing as a
required status check, all emitted by GitHub Actions with `enforce_admins` on
(9 contexts as of this writing — `./failover.sh contexts` prints the current
set, derived from `ci.yml` rather than hardcoded). That makes a
GitHub Actions outage (billing lock, incident) a total merge freeze — deploys
are unaffected (Amplify builds `main` through its own GitHub App), but no
verified work can reach `main` at all. This stack removes that single point of
failure without weakening the gate.

## Which account

This stack belongs in **QL-Prod** (Delta Centric org, `us-east-2`) — the
account that runs everything learners touch except Braket jobs. Every command
in this file carries `--profile ql-prod` (or `AWS_PROFILE=ql-prod`), and
`failover.sh` refuses to run without a profile.

The default AWS profile on the machines that run this is **Altivum
production**, a different org entirely, and it still holds the July 2026 copy
of this stack under the same name (see "History" below). A bare `aws` command
or a bare `./failover.sh engage` therefore does not fail — it acts on the
Altivum copy, silently, and reports success. `failover.sh` closes that path
two ways:

- It never uses ambient credentials. Every AWS call names its profile on the
  command line; with no `--profile` and no `AWS_PROFILE` it refuses.
- Before `status`, `engage`, `stand-down` or `drill` it resolves the id of the
  account **named** `QL-Prod` from the organization (through the `org-admin`
  SSO profile) and compares it with what the given profile answers for via
  STS. A profile name is not evidence: `ql-braket` is also a Delta Centric
  profile and is also refused. If the organization cannot be read (an expired
  SSO session, usually), the script fails closed and prints the
  `aws sso login` to run — it never falls back to "assume it is fine".

Account ids never appear in this repo and are never printed by the script.
What prints is the name and a verdict, the same value-blind rule
`scripts/drift/account.mjs` follows.

## What it is

- **`template.yaml`** — CloudFormation stack `quantum-ci-standby`: one
  CodeBuild project whose inline buildspec mirrors `.github/workflows/ci.yml`
  as a single sequential build and reports one GitHub commit status:
  **`CI (CodeBuild standby)`**. "Mirrors" is a checked claim, not a
  remembered one: `scripts/ci-standby/parity.test.mjs` runs in CI's
  script-guard step and fails the merge whenever the buildspec and `ci.yml`
  disagree — because the previous copy drifted for five weeks with nothing
  to notice (see "History"). The build also runs
  `scripts/verify-founding-ten.mjs`, which needs `cognito-idp:ListUsers` on
  the QL-Prod `quantum-workspace` user pool — the pool every learner now
  lives in — to check that every issued badge still resolves to a live user.
  The `ServiceRole`'s `founding-ten-verify` policy grants exactly that, scoped
  to that one pool; the template is the authority for the pool id.
- **`failover.sh`** — flips the merge gate between the two CI engines, and
  refuses to act on any account but QL-Prod.

**Cost profile.** Idle means no webhook, so no builds. The only standing
resources are the S3 cache bucket (objects expire after 30 days) and a 30-day
log group — cents at most between drills, not a bill. A build runs on
`BUILD_GENERAL1_LARGE` at **$0.02 per build-minute** (Price List API,
us-east-2, read 2026-09-06). Across the July 2026 copy's 60 successful
builds the median was 14.1 minutes (29 of them ran under 14; the last five, on
2026-07-29 with the fullest buildspec of that era, took 14.1 to 15.7), which
is about $0.30 per run. `ci.yml` has grown since, so re-measure with the first
QL-Prod drill before leaning on that figure. A monthly `drill` is the only recommended standing
spend.

## One-time setup (QL-Prod)

The GitHub connection is created by CLI and lands in `PENDING`. Making it
`AVAILABLE` is a **console step a human must do**: it installs a GitHub App
on the organization, and GitHub requires an interactive login for that. There
is no API for it. Nothing below deploys until it is done.

1. Create the connection (done 2026-09-06; the handshake in step 2 was
   completed the same day and it reads `AVAILABLE`):

   ```sh
   aws codeconnections create-connection --provider-type GitHub \
     --connection-name quantum-github --region us-east-2 --profile ql-prod
   ```

2. **Human step — console handshake** (cannot be scripted): open
   [CodeConnections in us-east-2](https://us-east-2.console.aws.amazon.com/codesuite/settings/connections)
   **signed in to QL-Prod, not Altivum**, select `quantum-github`, choose
   **Update pending connection**, and install/authorize the "AWS Connector
   for GitHub" app for `AltivumInc-Admin/quantum-computing`. Gate before
   going on:

   ```sh
   aws codeconnections list-connections --region us-east-2 --profile ql-prod \
     --query "Connections[?ConnectionName=='quantum-github'].ConnectionStatus" --output text
   # must print AVAILABLE
   ```

3. Deploy the stack. The connection ARN is a parameter resolved by name at
   deploy time and never written down — it carries the account id:

   ```sh
   CONNECTION_ARN=$(aws codeconnections list-connections --region us-east-2 --profile ql-prod \
     --query "Connections[?ConnectionName=='quantum-github'].ConnectionArn" --output text)
   aws cloudformation deploy \
     --stack-name quantum-ci-standby \
     --template-file infra/ci-standby/template.yaml \
     --parameter-overrides ConnectionArn="$CONNECTION_ARN" \
     --capabilities CAPABILITY_NAMED_IAM \
     --region us-east-2 --profile ql-prod
   ```

4. Prove it green once: `AWS_PROFILE=ql-prod ./failover.sh drill`, then watch
   the build id it prints. Until a drill has passed in QL-Prod the standby is
   not a standby.

5. `AWS_PROFILE=ql-prod ./failover.sh status` should now name the account,
   list the gate, and report the project present and disengaged.

## During a GitHub Actions outage

```sh
AWS_PROFILE=ql-prod ./failover.sh engage
```

This creates the webhook (PR events + pushes to `main`), re-points `main`'s
required checks at the single `CI (CodeBuild standby)` context (`app_id: -1`,
because CodeBuild posts a commit status, not an Actions check run), and starts
a build for every open PR head so their gates can go green. New pushes build
automatically while engaged. Merge as normal once green.

When GitHub Actions is healthy again:

```sh
AWS_PROFILE=ql-prod ./failover.sh stand-down
```

Deletes the webhook and restores the Actions contexts (pinned to app id 15368).
The context list is derived from `ci.yml`'s jobs and cross-checked against
`lambda/` on disk, so a new Lambda can't silently drop out of the gate; if the
two disagree, `stand-down` refuses rather than restoring a narrower gate.
`AWS_PROFILE=ql-prod ./failover.sh status` shows which mode you're in at any
time, and says which account it is describing before it describes anything.

> Restoring the gate by hand (2026-07-30, the billing lock): the hardcoded list
> this replaced had gone stale, and `stand-down` would have restored a
> 7-context gate over an 8-job workflow — `Lambda tests (stripe)` running on
> every PR but unable to block a merge. A gate that is a hand-maintained copy
> of a job list is a gate that quietly gets smaller.

> The same failure from the other side (found 2026-09-06): `lambda/analytics`
> joined the matrix, and the live gate on `main` stayed at 8 contexts while
> `contexts` derives 9 — `Lambda tests (analytics)` runs on every PR and
> cannot block a merge. Nothing re-applies the derived set when the matrix
> grows; `stand-down` is what applies it.

## Keeping the mirror honest

The buildspec is **inline in `template.yaml`** — deliberately not a file in the
repo, so the standby can build any commit (including PRs opened before this
stack existed) and can't be broken by a PR touching a buildspec path. The
trade-off is drift, and drift is now caught rather than remembered:

- **`scripts/ci-standby/parity.test.mjs`** runs in CI's script-guard step and
  fails the merge when the buildspec and `ci.yml` disagree. When `ci.yml`
  changes materially (new job, new step, version pin bump), mirror the change
  in `template.yaml` in the same PR — the guard will insist — and then
  **redeploy the stack** (same `deploy` command as setup step 3). Merging the
  template is not deploying it; until the redeploy, the live project runs the
  old buildspec, and `make drift` does not cover CodeBuild.
- The monthly `drill` catches what a diff cannot: image updates, dependency
  changes, a connection that has stopped working.

Version pins live in the buildspec's `runtime-versions` (python 3.12 /
nodejs 20 — the same `PYTHON_VERSION` / `NODE_VERSION` as `ci.yml`; keep both
aligned with the Amplify build image). The build image
`aws/codebuild/standard:7.0` is Ubuntu 22.04, required for
`playwright install --with-deps`.

### The founding-ten check is standby-only

`scripts/verify-founding-ten.mjs` runs in this stack's buildspec, not in
`.github/workflows/ci.yml`. That is not an oversight to fix by adding it
there: `ci.yml` has **no AWS credentials** — no `configure-aws-credentials`
step, no role. The one OIDC role this repo does have
(`quantum-ci-drift-check`, assumed by the nightly `drift.yml` and
`device-fleet.yml`) is scoped to Lambda reads and Braket device listing, not
Cognito. A step calling the script under `ci.yml` would print "no AWS
credentials, skipping the live check" and exit 0 on every run, which is
exactly the false confidence this check exists to avoid (see the script's own
header comment). Do not add the step to `ci.yml` until a role scoped to
`cognito-idp:ListUsers` on the QL-Prod pool exists for that workflow. Until
then, a `stand-down` back to GitHub Actions means this check does not run at
all — `failover.sh` prints a warning to that effect on `stand-down`.

## History: the Altivum copy, and the move to QL-Prod

This stack was first deployed on 2026-07-16 into the **Altivum** account —
the org this project ran under before the 2026-08-27 move to Delta Centric —
and last updated there on 2026-07-29. It built 68 times, all between those
two dates, and never again: the webhook was deleted on stand-down and the
stack sat idle. It was never migrated with the platform. When checked on
2026-09-06 it was wrong in three independent ways:

- **Wrong org.** Everything the merge gate would have been re-pointed at
  lived in the deprecated account, and the script doing the re-pointing used
  ambient credentials — which, on the operator's machine, ARE that account.
  An `engage` would have "worked".
- **Stale buildspec.** `ci.yml` had moved on for five weeks with nothing
  comparing the mirror to it. The mirror ran one guard suite
  (`node --test scripts/founding-credit/*.test.mjs` — a bare glob, which
  exits 0 unmatched on Node 22+) where `ci.yml` discovers all thirteen
  `scripts/**/*.test.mjs` with `find` and fails on zero files, and its Lambda
  loop was a literal list. A merge gate on that mirror would have passed
  commits that break the Stripe, drift, fleet, design-sync and migration
  guards.
- **Wrong user pool.** The `founding-ten-verify` policy and
  `scripts/verify-founding-ten.mjs` named the Altivum-era Cognito pool; every
  learner has lived in QL-Prod's `quantum-workspace` pool since the
  2026-08-31 cutover.

On 2026-09-06 the stack was PREPARED for QL-Prod: a `quantum-github`
connection created there and handshaken to `AVAILABLE`, `failover.sh` made
account-aware, the buildspec re-mirrored against `ci.yml` with
`scripts/ci-standby/parity.test.mjs` to keep it that way, and the pool id
corrected. Deployment to QL-Prod and the first drill are recorded below as
they happen; until a line there says otherwise, treat the QL-Prod stack as
not deployed. The Altivum stack stayed deployed until the first QL-Prod
`drill` proved green — stale as it was, it was the only mirror that existed
until then — and was torn down the same day; see the log.

Deployment log (append, never rewrite):

- 2026-09-06 — QL-Prod stack: not yet deployed at the time this section was
  written.
- 2026-09-06 — **Deployed to QL-Prod.** Change set `initial-ql-prod`: exactly
  four `Add`s (cache bucket, log group, project, service role), parameter
  `FoundingTenUserPoolId=us-east-2_FXKkSoPHw`. `CREATE_COMPLETE`.
- 2026-09-06 — **First drill on QL-Prod: `SUCCEEDED`.** Build
  `quantum-ci-standby:e3e10470-6e74-43c7-8648-9239dc65f901` of `main` at
  `dd918c2`; `BUILD` phase 844 s, about 15.5 min end to end (so re-measure the
  cost paragraph above against this, not July's 14.1). Observed in the log and
  on GitHub, not inferred: `founding-ten: all 1 issued badge(s) resolve to
  live users` (the QL-Prod pool — the Altivum id does not exist here, so this
  could only pass against the right one); the changelog guard correctly
  skipped a non-PR source; and the commit status **`success · CI (CodeBuild
  standby)`** was posted on `main`'s HEAD from QL-Prod, which is the signal the
  merge gate would rely on. The Altivum stack is now redundant and is the next
  thing to go.
- 2026-09-06 — **Altivum copy torn down.** Guarded first: QL-Prod's account id
  was resolved by name through the organization and asserted NOT equal to the
  account the deletes ran in, and the target stack's creation time was
  asserted to be the 2026-07-16 July copy — either check failing would have
  refused. Then `delete-stack quantum-ci-standby` (four resources; the cache
  bucket was empty and unversioned) reached `DELETE_COMPLETE`, and the old
  `quantum-github` connection there was deleted. Verified after: the Altivum
  stack, project and connection are gone; QL-Prod's stack is
  `CREATE_COMPLETE`, its project's last build is the green drill, and its
  connection is `AVAILABLE`. There is now exactly one standby, and it is in
  the account this project runs in.
