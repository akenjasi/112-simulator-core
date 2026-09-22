#!/usr/bin/env bash
# ─── 112 Simulator V2 — Local dev server launcher ─────────────────────────────
# Usage: ./run.sh [port]
#   Default port: 8000
#   Requires: Python 3.11+ with .deps packages OR system-installed packages

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${1:-8000}"

# ─── PYTHONPATH: add .deps flat site-packages ─────────────────────────────────
if [ -d "$SCRIPT_DIR/.deps" ]; then
    export PYTHONPATH="$SCRIPT_DIR/.deps:${PYTHONPATH:-}"
fi

# ─── Load .env if it exists ───────────────────────────────────────────────────
if [ -f "$SCRIPT_DIR/.env" ]; then
    echo "📄 Loading .env..."
    set -a
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/.env"
    set +a
fi

# ─── Ensure data directory exists ─────────────────────────────────────────────
mkdir -p "$SCRIPT_DIR/data"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║      112 Simulator V2 — Backend (dev)        ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  API:      http://localhost:${PORT}              ║"
echo "║  Swagger:  http://localhost:${PORT}/docs         ║"
echo "║  DB:       ${DATABASE_URL:-sqlite+aiosqlite:///./data/112_simulator.db}"
echo "╚══════════════════════════════════════════════╝"
echo ""

python3 -m uvicorn backend.main:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --reload \
    --reload-dir backend \
    --log-level info
