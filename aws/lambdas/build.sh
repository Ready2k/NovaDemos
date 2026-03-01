#!/usr/bin/env bash
# Build and optionally upload the KVS-bridge Lambda deployment package.
#
# Usage:
#   ./aws/lambdas/build.sh                  # build only → aws/lambdas/dist/kvs-bridge.zip
#   ./aws/lambdas/build.sh <bucket-name>    # build + upload to s3://<bucket>/lambdas/kvs-bridge.zip
#
# Prerequisites: node >=20, npm, zip, aws CLI (for upload)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_DIR="$SCRIPT_DIR/kvs-bridge"
DIST_DIR="$SCRIPT_DIR/dist"
ZIP_NAME="kvs-bridge.zip"
BUCKET="${1:-}"

echo "==> Installing production dependencies..."
(cd "$BRIDGE_DIR" && npm install --omit=dev --silent)

echo "==> Creating deployment package..."
mkdir -p "$DIST_DIR"
rm -f "$DIST_DIR/$ZIP_NAME"
(cd "$BRIDGE_DIR" && zip -r "$DIST_DIR/$ZIP_NAME" . -x "*.test.js" -x "*.md")

echo "==> Package ready: $DIST_DIR/$ZIP_NAME ($(du -sh "$DIST_DIR/$ZIP_NAME" | cut -f1))"

if [ -n "$BUCKET" ]; then
    echo "==> Uploading to s3://$BUCKET/lambdas/$ZIP_NAME ..."
    aws s3 cp "$DIST_DIR/$ZIP_NAME" "s3://$BUCKET/lambdas/$ZIP_NAME"
    echo "==> Upload complete."
    echo ""
    echo "Now deploy the CloudFormation stack with:"
    echo "  aws cloudformation deploy \\"
    echo "    --template-file aws/cloudformation.yaml \\"
    echo "    --stack-name voice-s2s \\"
    echo "    --parameter-overrides DeployBucket=$BUCKET ConnectInstanceArn=<your-arn> \\"
    echo "    --capabilities CAPABILITY_IAM"
fi
