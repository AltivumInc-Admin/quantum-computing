#!/usr/bin/env bash
# CI failover between GitHub Actions and the CodeBuild standby mirror.
#
# The merge gate on main is a set of required status checks. Normally those are
# every GitHub Actions job context (derived from ci.yml — see gha_contexts);
# when GitHub Actions is unavailable (billing lock, outage), `engage` re-points
# the gate at the CodeBuild standby project so verified work can still merge,
# and `stand-down` restores the normal gate.
#
# Requires: gh (authenticated with repo admin), aws CLI (credentials for the
# account holding the quantum-ci-standby stack).
#
# Usage:
#   ./failover.sh status      # show the current gate + standby project state
#   ./failover.sh contexts    # print the Actions contexts stand-down would set
#   ./failover.sh engage      # webhook on, gate -> standby context, build open PRs
#   ./failover.sh stand-down  # webhook off, gate -> the GitHub Actions contexts
#   ./failover.sh drill       # one manual standby build of main (health proof)
set -euo pipefail

REPO="AltivumInc-Admin/quantum-computing"
PROJECT="quantum-ci-standby"
REGION="us-east-2"
STANDBY_CONTEXT="CI (CodeBuild standby)"
# GitHub Actions app id — required checks are pinned to it in normal operation
# so a random commit status can't satisfy the gate.
GHA_APP_ID=15368

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CI_YML="$REPO_ROOT/.github/workflows/ci.yml"

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
  echo "== Standby project webhook =="
  local webhook
  webhook=$(aws codebuild batch-get-projects --names "$PROJECT" --region "$REGION" \
    --query 'projects[0].webhook.url' --output text 2>/dev/null || echo "None")
  if [ "$webhook" = "None" ] || [ -z "$webhook" ]; then
    echo "  disengaged (no webhook — standby is idle, \$0)"
  else
    echo "  ENGAGED (webhook active: $webhook)"
  fi
}

engage() {
  echo "--> Creating the standby webhook (PR events + pushes to main)..."
  aws codebuild create-webhook \
    --project-name "$PROJECT" \
    --region "$REGION" \
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
    aws codebuild start-build \
      --project-name "$PROJECT" \
      --region "$REGION" \
      --source-version "pr/$pr" \
      --report-build-status-override \
      --query 'build.id' --output text
  done

  echo
  echo "ENGAGED. New pushes to PRs now build on CodeBuild automatically."
  echo "Watch builds: aws codebuild list-builds-for-project --project-name $PROJECT --region $REGION"
  echo "When GitHub Actions is healthy again, run: $0 stand-down"
}

stand_down() {
  echo "--> Deleting the standby webhook (back to \$0 idle)..."
  aws codebuild delete-webhook --project-name "$PROJECT" --region "$REGION" >/dev/null 2>&1 ||
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
  aws codebuild start-build \
    --project-name "$PROJECT" \
    --region "$REGION" \
    --source-version main \
    --query 'build.id' --output text
  echo "Watch: aws codebuild batch-get-builds --ids <id> --region $REGION --query 'builds[0].buildStatus'"
}

case "${1:-status}" in
  status) show_status ;;
  contexts) gha_contexts ;;
  engage) engage ;;
  stand-down) stand_down ;;
  drill) drill ;;
  *)
    echo "usage: $0 {status|contexts|engage|stand-down|drill}" >&2
    exit 1
    ;;
esac
