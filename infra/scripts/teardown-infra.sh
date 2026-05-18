#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="braket-quantum-workspace"

echo "=== Tearing Down Amazon Braket Workspace Infrastructure ==="
echo "Stack: $STACK_NAME"
echo ""
echo "WARNING: This will delete all infrastructure including the S3 bucket."
echo "Make sure you have downloaded any results you need."
echo ""
read -p "Are you sure? Type 'delete' to confirm: " CONFIRM

if [ "$CONFIRM" != "delete" ]; then
    echo "Cancelled."
    exit 0
fi

aws cloudformation delete-stack --stack-name "$STACK_NAME"
echo "Stack deletion initiated. Monitor progress:"
echo "  aws cloudformation describe-stacks --stack-name $STACK_NAME"
