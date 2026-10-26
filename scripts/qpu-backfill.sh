#!/usr/bin/env bash
# Run lambda/qpu/backfill-counters.mjs pinned to QL-Prod. The .mjs is left unedited
# because it is in drift's source set; it builds its DynamoDB client from the SDK
# default chain, so this wrapper proves the account first and then hands it the
# pinned AWS_PROFILE. QL_AWS_PROFILE overrides the profile; the shell's AWS_PROFILE
# never chooses it.
#   scripts/qpu-backfill.sh [args for backfill-counters.mjs]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/aws-target.sh
source scripts/lib/aws-target.sh
ql_aws_target --default-profile ql-prod --account-name QL-Prod || exit 1
exec node lambda/qpu/backfill-counters.mjs "$@"
