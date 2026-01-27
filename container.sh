#!/bin/bash
set -e

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Assuming the script is in the root, or we run it from root. 
# Better to force context to project root if it's placed there.
# If placed in root, SCRIPT_DIR is root.

# Load environment variables from backend/.env if present
ENV_FILE="$SCRIPT_DIR/backend/.env"
if [ -f "$ENV_FILE" ]; then
  echo "📄 Loading environment from $ENV_FILE..."
  set -a
  source "$ENV_FILE"
  # Map NOVA_ vars to standard AWS_ vars for docker-compose
  export AWS_ACCESS_KEY_ID=$NOVA_AWS_ACCESS_KEY_ID
  export AWS_SECRET_ACCESS_KEY=$NOVA_AWS_SECRET_ACCESS_KEY
  export AWS_SESSION_TOKEN=$NOVA_AWS_SESSION_TOKEN
  # Map LANGFUSE_BASE_URL to LANGFUSE_BASEURL
  export LANGFUSE_BASEURL=$LANGFUSE_BASE_URL
  set +a
else
  echo "⚠️  Warning: No .env file found at $ENV_FILE"
fi

COMMAND=$1
shift # Shift arguments so we can pass remaining args if needed (e.g. to logs)

show_help() {
    echo "Voice S2S Container Manager"
    echo "Usage: ./container.sh [command]"
    echo ""
    echo "Commands:"
    echo "  start    - Start all services in the background (detached)"
    echo "  stop     - Stop and remove all containers"
    echo "  build    - Rebuild the images"
    echo "  restart  - Restart all services (stop -> build -> start)"
    echo "  logs     - Follow log output (ctrl+c to exit)"
    echo "  ps       - List running containers"
    echo ""
}

if [ -z "$COMMAND" ]; then
    show_help
    exit 1
fi

case "$COMMAND" in
  start)
    echo "🚀 Starting services..."
    docker-compose up -d
    echo "✅ Services started. Run './container.sh logs' to view output."
    ;;
  stop)
    echo "🛑 Stopping services..."
    docker-compose down
    echo "✅ Services stopped."
    ;;
  build)
    echo "🛠️  Building services..."
    docker-compose build
    echo "✅ Build complete."
    ;;
  restart)
    echo "🔄 Restarting services..."
    docker-compose down
    docker-compose up -d --build
    echo "✅ Services restarted."
    ;;
  logs)
    echo "📋 Service Logs:"
    docker-compose logs -f
    ;;
  ps)
    docker-compose ps
    ;;
  *)
    echo "❌ Unknown command: $COMMAND"
    show_help
    exit 1
    ;;
esac
