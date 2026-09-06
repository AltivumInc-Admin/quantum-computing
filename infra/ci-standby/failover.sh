#!/usr/bin/env bash
# CI failover between GitHub Actions and the CodeBuild standby mirror.
#
# The merge gate on main is a set of required status checks. Normally those are
# every GitHub Actions job context (derived from ci.yml — see gha_contexts);
# when GitHub Actions is unavailable (billing lock, outage), `engage` re-points
# the gate at the CodeBuild standby project so verified work can still merge,
# and `stand-down` restores the normal gate.
#
# WHICH ACCOUNT. The quantum-ci-standby stack belongs in QL-Prod (Delta Centric
# org). On the machines that run this script the DEFAULT AWS profile is Altivum
# production — a different org that still holds the July 2026 copy of this
# stack, under the same name, with a five-week-stale buildspec and the
# Altivum-era Cognito pool id. Until 2026-09-06 this script used whatever
# credentials were ambient, so a bare `./failover.sh engage` would have created
# the webhook on the ALTIVUM project and re-pointed main's merge gate at it — a
# stale mirror reporting green about every PR — and `drill` would have proved
# the wrong mirror healthy. Two guards, both required, before any subcommand
# that touches AWS:
#
#   1. An explicit profile: `--profile <name>` or AWS_PROFILE. No profile, no
#      run. Every aws call names its profile ON THE COMMAND LINE: the project
#      calls go through aws_ql(), and the two identity calls in require_account
#      name theirs directly (one is deliberately the ORG profile, not this one).
#      So nothing here can reach an account by accident even when the shell
#      carries ambient credentials. scripts/ci-standby/failover.test.mjs holds
#      this: a bare `aws ` in this file fails CI.
#   2. Identity, proven by NAME, not by profile name: the organization (read
#      through ORG_PROFILE) says which id "QL-Prod" is, STS says which id the
#      profile answers for, and the two must agree. A profile name is not
#      evidence — `ql-braket` is also a Delta Centric profile and also the wrong
#      account. The account number never appears in this file (public repo)
#      and is never printed (value-blind, the same rule scripts/drift/account.mjs
#      follows): what prints is the NAME and a verdict.
#
# If the org lookup itself fails (SSO session expired, wrong ORG_PROFILE), the
# script fails CLOSED and says what to run. It never falls back to "assume it
# is fine": a status report about the wrong account reads exactly like a clean
# one, and an engage against the wrong account is the incident.
#
# `contexts` reads only ci.yml and lambda/ on disk and needs no credentials.
#
# Requires: gh (authenticated with repo admin), aws CLI, jq, a profile that
# reaches QL-Prod (`ql-prod`, chained from `org-admin`) and one that can read
# the organization (`org-admin`, SSO — override with FAILOVER_ORG_PROFILE).
#
# Usage:
#   AWS_PROFILE=ql-prod ./failover.sh status      # gate + standby project state
#   ./failover.sh --profile ql-prod status        # same, profile as a flag
#   ./failover.sh contexts                        # Actions contexts stand-down would set
#   AWS_PROFILE=ql-prod ./failover.sh engage      # webhook on, gate -> standby, build open PRs
#   AWS_PROFILE=ql-prod ./failover.sh stand-down  # webhook off, gate -> the Actions contexts
#   AWS_PROFILE=ql-prod ./failover.sh drill       # one manual standby build of main
set -euo pipefail

REPO="AltivumInc-Admin/quantum-computing"
PROJECT="quantum-ci-standby"
REGION="us-east-2"
STANDBY_CONTEXT="CI (CodeBuild standby)"
# GitHub Actions app id — required checks are pinned to it in normal operation
# so a random commit status can't satisfy the gate.
GHA_APP_ID=15368

# The account this script is allowed to act on, by NAME. The id is resolved
# from the organization at run time and compared to the caller's identity;
# see require_account. Never write the number here.
EXPECT_ACCOUNT_NAME="QL-Prod"
# The profile that can read the organization's account list. The org-admin
# SSO profile is the only one on this machine that can; the chained
# ql-* profiles assume a role in one member account and cannot.
ORG_PROFILE="${FAILOVER_ORG_PROFILE:-org-admin}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CI_YML="$REPO_ROOT/.github/workflows/ci.yml"

usage() {
  cat <<EOF
usage: $0 [--profile <aws profile>] {status|contexts|engage|stand-down|drill}

  The profile may also come from AWS_PROFILE. status, engage, stand-down and
  drill require one and refuse to run unless it reaches $EXPECT_ACCOUNT_NAME;
  contexts needs no credentials.
EOF
}

# --profile as a flag, else AWS_PROFILE, else nothing — and nothing is a
# refusal, not a default. `make drift` defaults to ql-prod and announces it;
# this script does not, because its subcommands are not reports but changes
# to the merge gate, and the operator running them mid-outage should have to
# say which account they mean.
PROFILE="${AWS_PROFILE:-}"
if [ "${1:-}" = "--profile" ]; then
  if [ -z "${2:-}" ]; then
    usage >&2
    exit 2
  fi
  PROFILE="$2"
  shift 2
fi
SUBCOMMAND="${1:-status}"
# `--profile` is recognised only as the FIRST argument. Given later it used to
# be dropped silently, and the run then refused with "no AWS profile named" —
# fail-closed, but misdiagnosing the operator's mistake mid-outage. Name it.
if [ $# -gt 1 ]; then
  echo "unexpected argument(s) after '$SUBCOMMAND': ${*:2}" >&2
  case " ${*:2} " in *" --profile "*) echo "(--profile must come FIRST: $0 --profile <name> $SUBCOMMAND)" >&2;; esac
  usage >&2
  exit 2
fi

# Every call against the STANDBY PROJECT goes through here: explicit profile,
# explicit region, on the command line. (The two identity calls in
# require_account do not — one must use the org-reading profile — but they name
# theirs on the command line the same way.) A `--profile` given on the command line outranks
# AWS_PROFILE and any AWS_ACCESS_KEY_ID exported into the shell, so the
# credentials this resolves are the named profile's and nothing else's. The
# identity check in require_account is still what PROVES the account — this
# only removes the ambient path.
aws_ql() { aws --profile "$PROFILE" --region "$REGION" "$@"; }

# Anything from the AWS CLI that this script echoes passes through here first.
# The CLI's error text names ARNs, and an ARN names an account. Value-blind is a
# property of what reaches the terminal, not only of what is in this file.
scrub_ids() { sed -E 's/[0-9]{12}/<account id>/g'; }

# Refuse unless the named profile answers for EXPECT_ACCOUNT_NAME. Value-blind
# throughout: no account id reaches stdout, stderr, or this file.
require_account() {
  if [ -z "$PROFILE" ]; then
    cat >&2 <<EOF
REFUSING: no AWS profile named. This script never uses ambient credentials —
          on this machine those are ALTIVUM production, a different org that
          holds a stale copy of the same stack. Say which account you mean:
            AWS_PROFILE=ql-prod $0 $SUBCOMMAND
            $0 --profile ql-prod $SUBCOMMAND
EOF
    return 1
  fi

  # The organization answers "which id is QL-Prod" at run time; the CLI
  # paginates list-accounts itself. Inside one org two accounts CAN share a
  # name, and two different orgs each hold a "Quantum Learner" account
  # already, so anything other than exactly one 12-digit id is a refusal —
  # this must not pick one of two and carry on.
  # stderr is captured apart from the value and SCRUBBED before it is shown.
  # Two reasons, both observed: an AssumeRole AccessDenied carries the caller
  # and target ARNs, i.e. two account ids, and a pasted terminal transcript is
  # exactly how a number would enter this public repo; and a benign CLI notice
  # on stderr (SSO auto-refresh, a deprecation) folded into the VALUE would make
  # the id comparison below fail with a message blaming the wrong thing.
  local expected actual n err
  err=$(mktemp); trap 'rm -f "$err"' RETURN
  if ! expected=$(aws --profile "$ORG_PROFILE" organizations list-accounts \
        --query "Accounts[?Name=='$EXPECT_ACCOUNT_NAME'].Id" --output text 2>"$err"); then
    cat >&2 <<EOF
REFUSING: could not read the organization through profile '$ORG_PROFILE', so
          this run cannot prove which account it is about — and an unproven
          account is treated as the wrong one. Nothing was changed.
            $(scrub_ids <"$err" | grep -m1 .)
          Usually the SSO session has expired:
            aws sso login --profile $ORG_PROFILE
          (FAILOVER_ORG_PROFILE=<name> names a different org-reading profile.)
EOF
    return 1
  fi
  n=$(printf '%s' "$expected" | wc -w | tr -d ' ')
  if [ "$n" != "1" ] || ! printf '%s' "$expected" | grep -qE '^[0-9]{12}$'; then
    cat >&2 <<EOF
REFUSING: the organization read through '$ORG_PROFILE' lists $n account(s)
          named "$EXPECT_ACCOUNT_NAME"; exactly one is required to know which
          account this script may act on. Nothing was changed.
EOF
    return 1
  fi

  if ! actual=$(aws --profile "$PROFILE" sts get-caller-identity \
        --query Account --output text 2>"$err"); then
    cat >&2 <<EOF
REFUSING: profile '$PROFILE' produced no usable credentials. Nothing was changed.
            $(scrub_ids <"$err" | grep -m1 .)
          A chained ql-* profile needs a live $ORG_PROFILE SSO session:
            aws sso login --profile $ORG_PROFILE
EOF
    return 1
  fi
  if [ "$actual" != "$expected" ]; then
    cat >&2 <<EOF
REFUSING: profile '$PROFILE' answers for a different account than
          "$EXPECT_ACCOUNT_NAME". Every subcommand here creates, deletes or
          builds in whatever account the credentials reach, and engage would
          re-point main's merge gate at what it found there. Nothing was
          changed. Re-run with a profile that reaches $EXPECT_ACCOUNT_NAME:
            $0 --profile ql-prod $SUBCOMMAND
EOF
    return 1
  fi

  echo "account: $EXPECT_ACCOUNT_NAME (verified by name against the organization; profile '$PROFILE', region $REGION)"
}

# The gate must require EXACTLY the contexts ci.yml emits. This list used to be
# hardcoded, and went stale the moment lambda/stripe landed: stand-down restored
# a 7-context gate against an 8-job workflow, so the one Lambda that moves real
# money ran on every PR but could never block a merge. A list that has to be
# hand-updated will drift again, so derive it from the workflow instead, and
# cross-check against the directories that actually exist — drift now fails
# loudly here rather than silently widening the gate.
gha_contexts() {
  local from_ci on_disk
  from_ci=$(sed -n 's/^ *dir: \[\(.*\)\] *$/\1/p' "$CI_YML" | tr -d ' ' | tr ',' '\n' | sed '/^$/d' | sort)
  on_disk=$(find "$REPO_ROOT/lambda" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort)

  if [ -z "$from_ci" ]; then
    echo "FATAL: could not read the lambda matrix from $CI_YML" >&2
    return 1
  fi
  if [ "$from_ci" != "$on_disk" ]; then
    echo "FATAL: ci.yml's lambda matrix does not match lambda/ on disk." >&2
    echo "  ci.yml:  $(echo "$from_ci" | tr '\n' ' ')" >&2
    echo "  on disk: $(echo "$on_disk" | tr '\n' ' ')" >&2
    echo "Fix the matrix (and the standby buildspec loop) before touching the gate." >&2
    return 1
  fi

  # The three non-matrix jobs, then one context per Lambda suite.
  printf '%s\n' \
    "Python tests + lint" \
    "Web tests + lint" \
    "JupyterLite + static export build smoke"
  while read -r d; do printf 'Lambda tests (%s)\n' "$d"; done <<<"$from_ci"
}

PROTECTION_ENDPOINT="repos/$REPO/branches/main/protection/required_status_checks"

show_status() {
  echo "== Required status checks on main =="
  gh api "$PROTECTION_ENDPOINT" --jq '.checks[] | "  \(.context) (app_id: \(.app_id // "any"))"'
  echo
  echo "== Standby project webhook ($EXPECT_ACCOUNT_NAME, $REGION) =="
  # One call, then read both halves of the answer. The old shape swallowed
  # every error and printed "disengaged" for a project that does not exist,
  # which is exactly what an account with no stack looks like — and that
  # answer is indistinguishable from a healthy idle standby.
  local projects webhook
  projects=$(aws_ql codebuild batch-get-projects --names "$PROJECT" --output json)
  if [ "$(printf '%s' "$projects" | jq -r '.projectsNotFound | length')" != "0" ]; then
    echo "  NO PROJECT named $PROJECT in $EXPECT_ACCOUNT_NAME — the stack is not deployed here."
    echo "  engage and drill would fail. See README.md, one-time setup."
    return 0
  fi
  webhook=$(printf '%s' "$projects" | jq -r '.projects[0].webhook.url // empty')
  if [ -z "$webhook" ]; then
    echo "  disengaged (no webhook — standby is idle, no builds run)"
  else
    echo "  ENGAGED (webhook active: $webhook)"
  fi
}

engage() {
  echo "--> Creating the standby webhook (PR events + pushes to main)..."
  aws_ql codebuild create-webhook \
    --project-name "$PROJECT" \
    --filter-groups '[
      [{"type": "EVENT", "pattern": "PULL_REQUEST_CREATED, PULL_REQUEST_UPDATED, PULL_REQUEST_REOPENED"}],
      [{"type": "EVENT", "pattern": "PUSH"}, {"type": "HEAD_REF", "pattern": "^refs/heads/main$"}]
    ]' >/dev/null

  echo "--> Re-pointing main's required checks at: $STANDBY_CONTEXT"
  # app_id -1 = any source; CodeBuild reports a commit *status*, not an
  # Actions check run, so the context must not be app-pinned.
  jq -n --arg ctx "$STANDBY_CONTEXT" \
    '{strict: true, checks: [{context: $ctx, app_id: -1}]}' |
    gh api -X PATCH "$PROTECTION_ENDPOINT" --input - >/dev/null

  echo "--> Starting standby builds for every open PR head..."
  local prs
  prs=$(gh pr list --repo "$REPO" --state open --json number --jq '.[].number')
  if [ -z "$prs" ]; then
    echo "    (no open PRs)"
  fi
  for pr in $prs; do
    aws_ql codebuild start-build \
      --project-name "$PROJECT" \
      --source-version "pr/$pr" \
      --report-build-status-override \
      --query 'build.id' --output text
  done

  echo
  echo "ENGAGED. New pushes to PRs now build on CodeBuild automatically."
  echo "Watch builds: aws codebuild list-builds-for-project --project-name $PROJECT --region $REGION --profile $PROFILE"
  echo "When GitHub Actions is healthy again, run: $0 --profile $PROFILE stand-down"
}

stand_down() {
  echo "--> Deleting the standby webhook (back to idle)..."
  aws_ql codebuild delete-webhook --project-name "$PROJECT" >/dev/null 2>&1 ||
    echo "    (no webhook to delete)"

  echo "--> Restoring main's required checks to the GitHub Actions contexts..."
  local contexts
  contexts=$(gha_contexts) || return 1
  printf '%s\n' "$contexts" |
    jq -R . | jq -s --argjson app "$GHA_APP_ID" \
      '{strict: true, checks: map({context: ., app_id: $app})}' |
    gh api -X PATCH "$PROTECTION_ENDPOINT" --input - >/dev/null

  echo "STOOD DOWN. Gate is back on GitHub Actions ($(printf '%s\n' "$contexts" | wc -l | tr -d ' ') contexts)."
  echo "WARNING: the founding-ten badge verification (scripts/verify-founding-ten.mjs)"
  echo "is standby-only — GitHub Actions has no AWS credentials, so it will NOT run"
  echo "until the merge gate is on the CodeBuild standby again. See README.md."
}

drill() {
  echo "--> One manual standby build of main (proves the mirror still passes)..."
  aws_ql codebuild start-build \
    --project-name "$PROJECT" \
    --source-version main \
    --query 'build.id' --output text
  echo "Watch: aws codebuild batch-get-builds --ids <id> --region $REGION --profile $PROFILE --query 'builds[0].buildStatus'"
}

case "$SUBCOMMAND" in
  -h|--help|help)
    usage
    ;;
  contexts)
    gha_contexts
    ;;
  status|engage|stand-down|drill)
    # The guard runs HERE, once, before any subcommand function is entered —
    # engage's first action is a create-webhook, and a guard that lived
    # inside each function would be one forgotten call away from acting on
    # ambient credentials again.
    require_account || exit 1
    case "$SUBCOMMAND" in
      status) show_status ;;
      engage) engage ;;
      stand-down) stand_down ;;
      drill) drill ;;
    esac
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
