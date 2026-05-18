#!/usr/bin/env bash
set -euo pipefail

echo "=== Amazon Braket Workspace Setup Validation ==="
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "[FAIL] AWS CLI not installed. Install: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
    exit 1
fi
echo "[OK] AWS CLI found: $(aws --version 2>&1 | head -1)"

# Check credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "[FAIL] AWS credentials not configured. Run: aws configure"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region 2>/dev/null || echo "not set")
echo "[OK] AWS Account: $ACCOUNT_ID"
echo "[OK] AWS Region: $REGION"

# Check region supports Braket
BRAKET_REGIONS=("us-east-1" "us-west-1" "us-west-2" "eu-west-2" "eu-north-1" "ap-northeast-1")
if [[ " ${BRAKET_REGIONS[*]} " =~ " ${REGION} " ]]; then
    echo "[OK] Region $REGION supports Amazon Braket"
else
    echo "[WARN] Region $REGION may not support all Braket features. Recommended: us-east-1"
fi

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "[FAIL] Python 3 not found"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | awk '{print $2}')
echo "[OK] Python: $PYTHON_VERSION"

# Check Braket SDK
if python3 -c "import braket" 2>/dev/null; then
    SDK_VERSION=$(python3 -c "import braket._sdk as sdk; print(sdk.__version__)" 2>/dev/null || echo "installed")
    echo "[OK] Amazon Braket SDK: $SDK_VERSION"
else
    echo "[WARN] Amazon Braket SDK not installed. Run: make setup"
fi

echo ""
echo "=== Validation Complete ==="
