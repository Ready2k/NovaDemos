#!/bin/bash
# Source this script to export VoiceS2S-Bedrock credentials into the current shell.
# Usage: source ./assume-role.sh
#
# Credentials last 12 hours — run once per dev session per terminal.

ROLE_ARN="arn:aws:iam::388660028061:role/VoiceS2S-Bedrock"
MFA_SERIAL="arn:aws:iam::388660028061:mfa/James_Iphone"
SESSION_NAME="voice-s2s-dev"
DURATION=43200

printf "MFA code: "
read TOKEN

echo "Assuming VoiceS2S-Bedrock role..."
CREDS=$(aws sts assume-role \
  --profile voices2s-source \
  --role-arn "$ROLE_ARN" \
  --role-session-name "$SESSION_NAME" \
  --serial-number "$MFA_SERIAL" \
  --token-code "$TOKEN" \
  --duration-seconds "$DURATION" \
  --query 'Credentials' \
  --output json)

export AWS_ACCESS_KEY_ID=$(echo "$CREDS" | python3 -c "import sys,json; print(json.load(sys.stdin)['AccessKeyId'])")
export AWS_SECRET_ACCESS_KEY=$(echo "$CREDS" | python3 -c "import sys,json; print(json.load(sys.stdin)['SecretAccessKey'])")
export AWS_SESSION_TOKEN=$(echo "$CREDS" | python3 -c "import sys,json; print(json.load(sys.stdin)['SessionToken'])")
export AWS_REGION=us-east-1
unset AWS_PROFILE

echo "✅ Credentials exported. Valid for 12 hours."
