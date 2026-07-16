#!/usr/bin/env bash
# CI failover between GitHub Actions and the CodeBuild standby mirror.
#
# The merge gate on main is a set of required status checks. Normally those are
# the 7 GitHub Actions job contexts; when GitHub Actions is unavailable (billing
# lock, outage), `engage` re-points the gate at the CodeBuild standby project so
# verified work can still merge, and `stand-down` restores the normal gate.
#
# Requires: gh (authenticated with repo admin), aws CLI (credentials for the
# account holding the quantum-ci-standby stack).
#
# Usage:
#   ./failover.sh status      # show the current gate + standby project state
#   ./failover.sh engage      # webhook on, gate -> standby context, build open PRs
#   ./failover.sh stand-down  # webhook off, gate -> the 7 GitHub Actions contexts
#   ./failover.sh drill       # one manual standby build of main (health proof)
set -euo pipefail

REPO="AltivumInc-Admin/quantum-computing"
PROJECT="quantum-ci-standby"
REGION="us-east-2"
STANDBY_CONTEXT="CI (CodeBuild standby)"
# GitHub Actions app id — required checks are pinned to it in normal operation
# so a random commit status can't satisfy the gate.
GHA_APP_ID=15368
GHA_CONTEXTS=(
  "Python tests + lint"
  "Web tests + lint"
  "JupyterLite + static export build smoke"
  "Lambda tests (tutor)"
  "Lambda tests (qpu)"
  "Lambda tests (sync)"
  "Lambda tests (review-email)"
)

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
  printf '%s\n' "${GHA_CONTEXTS[@]}" |
    jq -R . | jq -s --argjson app "$GHA_APP_ID" \
      '{strict: true, checks: map({context: ., app_id: $app})}' |
    gh api -X PATCH "$PROTECTION_ENDPOINT" --input - >/dev/null

  echo "STOOD DOWN. Gate is back on GitHub Actions."
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
  engage) engage ;;
  stand-down) stand_down ;;
  drill) drill ;;
  *)
    echo "usage: $0 {status|engage|stand-down|drill}" >&2
    exit 1
    ;;
esac
