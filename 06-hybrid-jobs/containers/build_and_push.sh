#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REPO_NAME="braket-quantum-workspace"
IMAGE_TAG="latest"

FULL_NAME="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}:${IMAGE_TAG}"

echo "=== Building and Pushing Custom Braket Container ==="
echo "Image: $FULL_NAME"
echo ""

# Create ECR repository if it doesn't exist
aws ecr describe-repositories --repository-names "$REPO_NAME" 2>/dev/null || \
    aws ecr create-repository --repository-name "$REPO_NAME"

# Login to ECR
aws ecr get-login-password --region "$REGION" | \
    docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# Also login to the Braket base image ECR (public)
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin 292282985366.dkr.ecr.us-east-1.amazonaws.com

# Build from project root (need access to lib/)
cd "$(dirname "$0")/../.."
docker build -f 06-hybrid-jobs/containers/Dockerfile -t "$FULL_NAME" .

# Push
docker push "$FULL_NAME"

echo ""
echo "=== Done ==="
echo "Image URI: $FULL_NAME"
echo "Use this in AwsQuantumJob.create(image_uri='$FULL_NAME', ...)"
