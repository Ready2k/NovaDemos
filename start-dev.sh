#!/bin/bash
# Assumes the VoiceS2S-Bedrock IAM role with MFA, then starts the backend.
# Run once per dev session (credentials last 12 hours).

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Assume role and export credentials into this shell
source "$SCRIPT_DIR/assume-role.sh"

echo "Starting backend..."
npm run dev --prefix "$SCRIPT_DIR/backend"
