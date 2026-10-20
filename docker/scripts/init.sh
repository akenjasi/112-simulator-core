#!/usr/bin/env bash
# ─── 112 Simulator — Container Initialization Script ──────────────────────────
# Runs inside the backend container before uvicorn starts.
# 1. Ensures required directories exist.
# 2. Uses operator-supplied optional speech models.
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

if [ -d "/app/assets/tts-cache" ] && [ "$(ls -A /app/assets/tts-cache)" ]; then
    echo "🎵 Copying pre-generated TTS audio files to cache..."
    cp -rn /app/assets/tts-cache/* /app/data/tts_cache/ || true
fi


# ─── 2. Models are supplied separately ────────────────────────────────────
echo "🤖 Models are provisioned before launch by make models/up or the offline packager; no runtime downloads."

# ─── 3. Export LD_LIBRARY_PATH for native shared libs ────────────────────────
export LD_LIBRARY_PATH="/app/backend/bin:${LD_LIBRARY_PATH:-}"

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
