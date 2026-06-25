#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="braket-quantum-workspace"
TEMPLATE_DIR="$(cd "$(dirname "$0")/../cloudformation" && pwd)"

echo "=== Deploying Amazon Braket Workspace Infrastructure ==="
echo "Stack: $STACK_NAME"
echo "Template: $TEMPLATE_DIR/main.yaml"
echo ""

read -p "Monthly budget (USD) [50]: " BUDGET
BUDGET=${BUDGET:-50}

read -p "Notification email: " EMAIL
if [ -z "$EMAIL" ]; then
    echo "Email required for budget alerts."
    exit 1
fi

read -p "Deploy managed notebook? (true/false) [false]: " NOTEBOOK
NOTEBOOK=${NOTEBOOK:-false}

echo ""
echo "Deploying with:"
echo "  Budget: \$$BUDGET/month"
echo "  Email: $EMAIL"
echo "  Notebook: $NOTEBOOK"
echo ""
read -p "Proceed? (y/N): " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Cancelled."
    exit 0
fi

# package (below) needs a region to stage child templates. Honor the env vars
# first (common in CI) since `aws configure get region` reads only the config file.
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region 2>/dev/null || true)}}"
if [ -z "$REGION" ]; then
    echo "No AWS region is set. Set one first, e.g.:"
    echo "  aws configure set region us-east-1   (or: export AWS_REGION=us-east-1)"
    exit 1
fi

# main.yaml nests four child stacks via local TemplateURL paths (./braket-*.yaml).
# CloudFormation requires TemplateURL to be an S3 URL, so we must `package` first:
# it uploads the child templates to S3 and rewrites main.yaml's TemplateURLs to
# s3:// URLs. Unlike `aws cloudformation deploy`, `package` has no --resolve-s3,
# so it needs an explicit --s3-bucket; ensure a deterministic per-account/region
# staging bucket exists (created once, reused on later deploys).
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"
if [ -z "$ACCOUNT_ID" ]; then
    echo "Could not resolve your AWS account. Check credentials: aws sts get-caller-identity"
    exit 1
fi
STAGING_BUCKET="braket-cfn-staging-${ACCOUNT_ID}-${REGION}"
if ! aws s3api head-bucket --bucket "$STAGING_BUCKET" 2>/dev/null; then
    echo "Creating CloudFormation staging bucket s3://${STAGING_BUCKET} ..."
    if ! aws s3 mb "s3://${STAGING_BUCKET}" --region "$REGION"; then
        echo "Could not create staging bucket ${STAGING_BUCKET} — the name may be taken in" >&2
        echo "the global S3 namespace, or you lack s3:CreateBucket. Create a bucket you own" >&2
        echo "and point the package step at it (--s3-bucket), then re-run." >&2
        exit 1
    fi
fi

# Portable temp file (BSD/macOS mktemp ignores a -t template suffix). package/deploy
# default to YAML output regardless of the file extension.
PACKAGED_TEMPLATE="$(mktemp "${TMPDIR:-/tmp}/braket-packaged-XXXXXX")"
trap 'rm -f "$PACKAGED_TEMPLATE"' EXIT

echo "Packaging nested-stack templates to S3..."
aws cloudformation package \
    --template-file "$TEMPLATE_DIR/main.yaml" \
    --s3-bucket "$STAGING_BUCKET" \
    --region "$REGION" \
    --output-template-file "$PACKAGED_TEMPLATE"

# CAPABILITY_NAMED_IAM is required (braket-iam.yaml sets a custom RoleName).
# CAPABILITY_AUTO_EXPAND is harmless forward-compat: a no-op for plain nested
# stacks via change sets, and only needed if a macro/transform is ever added.
aws cloudformation deploy \
    --template-file "$PACKAGED_TEMPLATE" \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
    --parameter-overrides \
        MonthlyBudget="$BUDGET" \
        NotificationEmail="$EMAIL" \
        DeployNotebook="$NOTEBOOK"

echo ""
echo "=== Deployment Complete ==="
aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" --query "Stacks[0].Outputs" --output table
