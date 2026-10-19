#!/usr/bin/env bash
# ─── 112 Simulator V2 — Local dev server launcher ─────────────────────────────
# Usage: ./run.sh [port]
#   Default port: 8000
#   Requires: Python 3.11+ with .deps packages OR system-installed packages
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${1:-8000}"

# ─── PYTHONPATH: add .deps flat site-packages ─────────────────────────────────
if [ -d "$SCRIPT_DIR/.deps" ]; then
    export PYTHONPATH="$SCRIPT_DIR/.deps:${PYTHONPATH:-}"
fi

# ─── LD_LIBRARY_PATH: expose transcribe_cpp shared libs ──────────────────────
if [ -d "$SCRIPT_DIR/backend/bin" ]; then
    export LD_LIBRARY_PATH="$SCRIPT_DIR/backend/bin:${LD_LIBRARY_PATH:-}"
fi

ENV_ARGS=()
if [ -f "$SCRIPT_DIR/.env" ]; then
    ENV_ARGS=(--env-file "$SCRIPT_DIR/.env")
fi

# ─── Ensure data directory exists ─────────────────────────────────────────────
mkdir -p "$SCRIPT_DIR/data"

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║      112 Simulator V2 — Backend (dev)                                    ║"
echo "╠══════════════════════════════════════════════════════════════════════════╣"
echo "║  API:      http://localhost:${PORT}                                      ║"
echo "║  Swagger:  http://localhost:${PORT}/docs                                 ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""

python3 -m uvicorn backend.main:app "${ENV_ARGS[@]}" \
    --host 0.0.0.0 \
    --port "$PORT" \
    --reload \
    --reload-dir backend \
    --log-level info
