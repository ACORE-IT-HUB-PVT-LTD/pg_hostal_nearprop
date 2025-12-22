#!/bin/bash
# Simple startup script for PG Hostel API

# Create log file
mkdir -p /app/logs
LOG_FILE="/app/logs/app.log"
echo "$(date): Starting API server..." > $LOG_FILE

# Load environment configuration
if [ -f /app/.env ]; then
  echo "Using mounted .env file"
  source /app/.env
elif [ -f /app/.env.docker ]; then
  echo "Using .env.docker file"
  cp /app/.env.docker /app/.env
  source /app/.env
else
  echo "Using Docker environment variables"
fi

# Set defaults
PORT=${PORT:-3002}
NODE_ENV=${NODE_ENV:-production}
MONGODB_URI=${MONGODB_URI:-mongodb://admin:password@mongodb:27017/pg_rental_db?authSource=admin}
REDIS_URL=${REDIS_URL:-redis://redis:6379}

# Wait for MongoDB
echo "Waiting for MongoDB..."
# Extract MongoDB host more reliably
if [[ "$MONGODB_URI" == *"@"* ]]; then
  # URI contains authentication
  MONGO_HOST=$(echo $MONGODB_URI | sed -n 's|.*@\([^:]*\).*|\1|p')
else
  # URI without authentication
  MONGO_HOST=$(echo $MONGODB_URI | sed -n 's|.*://\([^:]*\).*|\1|p')
fi
MONGO_HOST=${MONGO_HOST:-mongodb}

COUNTER=0
MAX_RETRIES=30
while ! wget -q -T 2 -O /dev/null http://${MONGO_HOST}:27017 2>/dev/null && [ $COUNTER -lt $MAX_RETRIES ]; do
  sleep 1
  COUNTER=$((COUNTER+1))
  if [ $((COUNTER % 5)) -eq 0 ]; then
    echo "Still waiting for MongoDB... ($COUNTER/$MAX_RETRIES)"
  fi
done

# Create required directories
mkdir -p /app/src/uploads/temp /app/src/uploads/reels

# Start the application
echo "Starting server on port $PORT"
exec node src/server.js
