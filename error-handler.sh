#!/bin/bash
# error-handler.sh - Wrapper script for app startup with error handling
# This script ensures proper handling of errors during container startup

# Log file for startup errors
LOG_FILE="/app/logs/startup-errors.log"
mkdir -p /app/logs

# Ensure the log file exists
touch $LOG_FILE

log() {
  echo "$(date -Iseconds): $1" | tee -a $LOG_FILE
}

log "Container starting..."

# Error handling function
handle_error() {
  log "ERROR: Application crashed with exit code $?"
  log "Check the application logs for details"
  exit 1
}

# Set up error trap
trap handle_error ERR

# Check if required directories exist
mkdir -p /app/src/uploads/temp /app/src/uploads/reels /app/logs

# Verify Node.js installation
if ! command -v node &> /dev/null; then
  log "CRITICAL ERROR: Node.js not found"
  exit 1
fi

# Validate environment
if [ -z "$PORT" ]; then
  log "INFO: PORT not set, defaulting to 3002"
  export PORT=3002
fi

# Execute the original command (usually startup.sh)
log "Starting application: $@"
exec "$@"
