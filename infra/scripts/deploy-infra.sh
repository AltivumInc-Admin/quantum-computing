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

aws cloudformation deploy \
    --template-file "$TEMPLATE_DIR/main.yaml" \
    --stack-name "$STACK_NAME" \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides \
        MonthlyBudget="$BUDGET" \
        NotificationEmail="$EMAIL" \
        DeployNotebook="$NOTEBOOK"

echo ""
echo "=== Deployment Complete ==="
aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs" --output table
