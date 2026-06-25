#!/usr/bin/env bash
# Grant the CloudFront distribution permission to invoke the tutor Function URL via
# Origin Access Control. The Lambda Function URL resource policy CANNOT be edited in
# the console, so this must run via the CLI after both stacks are deployed.
#
# Per the CloudFront "Restrict access to a Lambda function URL origin" guide, OAC
# needs BOTH lambda:InvokeFunctionUrl AND lambda:InvokeFunction, each scoped to the
# distribution ARN so only THIS distribution may invoke the function.
#
# Usage: DISTRIBUTION_ID=E123ABC ./grant-oac.sh
set -euo pipefail

FUNCTION_NAME="${FUNCTION_NAME:-quantum-tutor}"
REGION="${AWS_REGION:-us-east-2}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
: "${DISTRIBUTION_ID:?Set DISTRIBUTION_ID to the CloudFront distribution id (edge.yaml output DistributionId)}"

SOURCE_ARN="arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DISTRIBUTION_ID}"
echo "Granting CloudFront ${SOURCE_ARN} access to ${FUNCTION_NAME} (${REGION})..."

# add-permission is idempotent-unfriendly (a duplicate statement-id errors), so
# treat an existing statement as success.
grant() {
  local sid="$1" action="$2"
  if aws lambda add-permission \
      --function-name "$FUNCTION_NAME" \
      --statement-id "$sid" \
      --action "$action" \
      --principal cloudfront.amazonaws.com \
      --source-arn "$SOURCE_ARN" \
      --region "$REGION" >/dev/null 2>&1; then
    echo "  granted $action ($sid)"
  else
    echo "  $action ($sid) already present or failed; verifying via get-policy" >&2
    aws lambda get-policy --function-name "$FUNCTION_NAME" --region "$REGION" \
      --query "Policy" --output text 2>/dev/null | grep -q "$sid" \
      || { echo "  ERROR: could not grant $action ($sid)"; exit 1; }
    echo "  $action ($sid) confirmed present"
  fi
}

grant AllowCloudFrontOACInvokeUrl lambda:InvokeFunctionUrl
grant AllowCloudFrontOACInvoke    lambda:InvokeFunction

echo "Done. CloudFront can now invoke the Function URL; direct unsigned access is"
echo "refused once the Function URL AuthType is AWS_IAM."
