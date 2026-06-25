#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="braket-quantum-workspace"
# Match deploy-infra.sh's region resolution so we target the same stack/region.
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region 2>/dev/null || true)}}"
if [ -z "$REGION" ]; then
    echo "No AWS region is set. Set one first (e.g. export AWS_REGION=us-east-1)."
    exit 1
fi

echo "=== Tearing Down Amazon Braket Workspace Infrastructure ==="
echo "Stack: $STACK_NAME"
echo ""
echo "WARNING: This will delete all infrastructure including the S3 results bucket"
echo "and everything in it. Make sure you have downloaded any results you need."
echo ""
read -p "Are you sure? Type 'delete' to confirm: " CONFIRM

if [ "$CONFIRM" != "delete" ]; then
    echo "Cancelled."
    exit 0
fi

# CloudFormation will not delete a non-empty S3 bucket: the results-bucket nested
# stack would fail with DELETE_FAILED and stall the whole teardown. Empty it first
# (resolved from the parent stack's ResultsBucket output).
BUCKET="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='ResultsBucket'].OutputValue" \
    --output text 2>/dev/null || true)"
if [ -n "$BUCKET" ] && [ "$BUCKET" != "None" ]; then
    echo "Emptying results bucket s3://${BUCKET} ..."
    aws s3 rm "s3://${BUCKET}" --recursive || true
fi

echo "Deleting stack $STACK_NAME ..."
aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$REGION"
echo "Waiting for deletion to complete..."
if aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$REGION"; then
    echo "Teardown complete."
else
    echo "Stack did not reach DELETE_COMPLETE. Inspect the failed resources with:" >&2
    echo "  aws cloudformation describe-stack-events --stack-name $STACK_NAME" >&2
    exit 1
fi

# Note: the deploy-time 'braket-cfn-staging-*' bucket (used only to upload the
# nested templates) is NOT part of this stack and is intentionally left behind for
# reuse on future deploys. Remove it manually for a full cleanup if desired:
#   aws s3 rb "s3://braket-cfn-staging-<account-id>-<region>" --force
