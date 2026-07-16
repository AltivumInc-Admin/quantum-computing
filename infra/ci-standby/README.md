# CI standby — CodeBuild warm mirror of the GitHub Actions gate

`main` is branch-protected: nothing merges without 7 required status checks,
and all 7 are emitted by GitHub Actions with `enforce_admins` on. That makes a
GitHub Actions outage (billing lock, incident) a total merge freeze — deploys
are unaffected (Amplify builds `main` through its own GitHub App), but no
verified work can reach `main` at all. This stack removes that single point of
failure without weakening the gate.

## What it is

- **`template.yaml`** — CloudFormation stack `quantum-ci-standby` (us-east-2):
  one CodeBuild project that runs the *same* matrix as
  `.github/workflows/ci.yml` (web tests + lint, the 4 Lambda suites, python
  tests + lint + manifest drift gate, JupyterLite/Pyodide build smoke, static
  export, Playwright in-browser smoke) as a single sequential build, and
  reports one GitHub commit status: **`CI (CodeBuild standby)`**.
- **`failover.sh`** — flips the merge gate between the two CI engines.

**Cost profile:** $0 while idle — no webhook exists in normal operation, so the
project never builds. Engaged builds run on `BUILD_GENERAL1_LARGE`
(~$0.02/min, roughly $0.60–0.90 per full run). A monthly `drill` build is the
only recommended standing spend.

## One-time setup

1. Create the GitHub connection (CLI, lands in PENDING):

   ```sh
   aws codeconnections create-connection \
     --provider-type GitHub --connection-name quantum-github --region us-east-2
   ```

2. **Human step — console handshake** (cannot be scripted): open
   [CodeConnections in us-east-2](https://us-east-2.console.aws.amazon.com/codesuite/settings/connections),
   select `quantum-github` → **Update pending connection**, and install/authorize
   the "AWS Connector for GitHub" app for `AltivumInc-Admin/quantum-computing`.
   The connection must read `AVAILABLE`.

3. Deploy the stack:

   ```sh
   aws cloudformation deploy \
     --stack-name quantum-ci-standby \
     --template-file infra/ci-standby/template.yaml \
     --parameter-overrides ConnectionArn=<arn from step 1> \
     --capabilities CAPABILITY_NAMED_IAM \
     --region us-east-2
   ```

4. Prove it green once: `./failover.sh drill` (builds `main`, ~30–45 min).

## During a GitHub Actions outage

```sh
./failover.sh engage
```

This creates the webhook (PR events + pushes to `main`), re-points `main`'s
required checks at the single `CI (CodeBuild standby)` context (`app_id: -1`,
because CodeBuild posts a commit status, not an Actions check run), and starts
a build for every open PR head so their gates can go green (~30–45 min). New
pushes build automatically while engaged. Merge as normal once green.

When GitHub Actions is healthy again:

```sh
./failover.sh stand-down
```

Deletes the webhook and restores the 7 Actions contexts (pinned to app id
15368). `./failover.sh status` shows which mode you're in at any time.

## Keeping the mirror honest

The buildspec is **inline in `template.yaml`** — deliberately not a file in the
repo, so the standby can build any commit (including PRs opened before this
stack existed) and can't be broken by a PR touching a buildspec path. The
trade-off is drift: **when `.github/workflows/ci.yml` changes materially (new
job, new step, version pin bump), mirror the change in `template.yaml` and
redeploy the stack** (same `deploy` command as setup step 3). The monthly
`drill` catches silent rot (image updates, dependency changes) before an
outage does.

Version pins live in the buildspec's `runtime-versions` (python 3.12 /
nodejs 20 — keep aligned with ci.yml and the Amplify build image). The build
image `aws/codebuild/standard:7.0` is Ubuntu 22.04, required for
`playwright install --with-deps`.
