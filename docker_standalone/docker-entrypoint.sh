#!/usr/bin/env bash
set -e

echo "=================================================="
echo "    🚀 112 Simulator V2 — Starting Container     "
echo "=================================================="

# Ensure data directory exists
mkdir -p /app/data

# Ensure classifier files exist in /app/data if not already present
if [ ! -f /app/data/classifier_ekp.json ] && [ -f /app/seed_data/classifier_ekp.json ]; then
    echo "📦 Copying default classifier_ekp.json to /app/data/..."
    cp /app/seed_data/classifier_ekp.json /app/data/
fi

if [ ! -f /app/data/moscow_112_addresses.json ] && [ -f /app/seed_data/moscow_112_addresses.json ]; then
    echo "📦 Copying default moscow_112_addresses.json to /app/data/..."
    cp /app/seed_data/moscow_112_addresses.json /app/data/
fi

# Run seed script if DB is not initialized or to ensure default accounts
echo "🌱 Initializing / verifying database schemas and seed accounts..."
python3 /app/seed.py

# Function for clean shutdown
cleanup() {
    echo "🛑 Stopping services gracefully..."
    kill -TERM "$BACKEND_PID" 2>/dev/null || true
    kill -TERM "$FRONTEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
    wait "$FRONTEND_PID" 2>/dev/null || true
    echo "👋 Shutdown complete."
    exit 0
}

trap cleanup SIGTERM SIGINT SIGHUP

# Start FastAPI backend
echo "⚡ Starting FastAPI backend on port 8000..."
python3 -m uvicorn backend.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --log-level info &
BACKEND_PID=$!

# Wait for backend to be healthy
echo "⏳ Waiting for backend API to be ready..."
for i in $(seq 1 30); do
    if curl -s http://127.0.0.1:8000/health >/dev/null 2>&1; then
        echo "✅ Backend API is ready!"
        break
    fi
    sleep 1
done

# Start Next.js frontend
echo "💻 Starting Next.js frontend on port 3000..."
cd /app/frontend
PORT=3000 HOSTNAME=0.0.0.0 node server.js &
FRONTEND_PID=$!

echo "=================================================="
echo "  🎉 112 Simulator is UP and RUNNING!            "
echo "  👉 Web UI:     http://localhost:3000           "
echo "  👉 API / Docs: http://localhost:8000/docs      "
echo "=================================================="

wait -n "$FRONTEND_PID" "$BACKEND_PID"
