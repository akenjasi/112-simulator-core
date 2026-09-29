#!/usr/bin/env bash
# ─── 112 Simulator — Container Initialization Script ──────────────────────────
# Runs inside the backend container before uvicorn starts.
# 1. Ensures required directories exist.
# 2. Downloads GGUF models if not present (idempotent).
# 3. Exports LD_LIBRARY_PATH for native .so libs.
# 4. Starts the uvicorn server.
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail



echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║        112 Simulator V2 — Container Init             ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ─── 1. Ensure data directories exist ────────────────────────────────────────
echo "📁 Ensuring data directories exist..."
mkdir -p \
    /app/data/tts_cache \
    /app/data/backups \
    /app/data/uploads

if [ -d "/app/preseeded_tts_cache" ] && [ "$(ls -A /app/preseeded_tts_cache)" ]; then
    echo "🎵 Copying pre-generated TTS audio files to cache..."
    cp -rn /app/preseeded_tts_cache/* /app/data/tts_cache/ || true
fi


# ─── 2. Models are pre-downloaded in Dockerfile ─────────────────────────────
echo "🤖 Models are built into the image"

# ─── 3. Export LD_LIBRARY_PATH for native shared libs ────────────────────────
export LD_LIBRARY_PATH="/app/backend/bin:${LD_LIBRARY_PATH:-}"

# ─── 4. Run Seed Script ────────────────────────────────────────────────────────
echo ""
echo "🌱 Running database seeder..."
python3 -m scripts.seed || echo "⚠️  Seeder returned an error, but continuing..."

# ─── 5. Start uvicorn ────────────────────────────────────────────────────────
echo ""
echo "🚀 Запускаем FastAPI backend (uvicorn)..."
echo "   API:     http://0.0.0.0:8000"
echo "   Swagger: http://0.0.0.0:8000/docs"
echo ""

exec python3 -m uvicorn backend.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --log-level info
