#!/usr/bin/env bash
# ─── 112 Simulator — Container Initialization Script ──────────────────────────
# Runs inside the backend container before uvicorn starts.
# 1. Ensures required directories exist.
# 2. Downloads GGUF models if not present (idempotent).
# 3. Exports LD_LIBRARY_PATH for native .so libs.
# 4. Starts the uvicorn server.
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

MODELS_DIR="/app/backend/core/qwen_tts/models"
TOKENIZER_FILE="${MODELS_DIR}/qwen-tokenizer-12hz-Q4_K_M.gguf"
MODEL_FILE="${MODELS_DIR}/qwen-talker-0.6b-base-Q4_K_M.gguf"
HF_BASE="https://huggingface.co/Serveurperso/Qwen3-TTS-GGUF/resolve/main"

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
    /app/data/uploads \
    "${MODELS_DIR}"

# ─── 2. Download GGUF models (idempotent) ────────────────────────────────────
download_if_missing() {
    local dest="$1"
    local url="$2"
    local name
    name="$(basename "${dest}")"

    if [ -f "${dest}" ] && [ -s "${dest}" ]; then
        echo "  ✅ ${name} — уже есть, пропускаем."
    else
        echo "  ⬇️  Скачиваем ${name}..."
        echo "     URL: ${url}"
        wget \
            --quiet \
            --show-progress \
            --continue \
            --tries=5 \
            --timeout=60 \
            -O "${dest}" \
            "${url}" \
            || { echo "  ❌ Ошибка скачивания ${name}. Проверьте сеть / доступ к HuggingFace."; exit 1; }
        echo "  ✅ ${name} — успешно скачан."
    fi
}

echo ""
echo "🤖 Проверяем модели Qwen TTS..."
download_if_missing \
    "${TOKENIZER_FILE}" \
    "${HF_BASE}/qwen-tokenizer-12hz-Q4_K_M.gguf?download=true"

download_if_missing \
    "${MODEL_FILE}" \
    "${HF_BASE}/qwen-talker-0.6b-base-Q4_K_M.gguf?download=true"

# ─── 3. Export LD_LIBRARY_PATH for native shared libs ────────────────────────
export LD_LIBRARY_PATH="/app/backend/bin:${LD_LIBRARY_PATH:-}"

# ─── 4. Start uvicorn ────────────────────────────────────────────────────────
echo ""
echo "🚀 Запускаем FastAPI backend (uvicorn)..."
echo "   API:     http://0.0.0.0:8000"
echo "   Swagger: http://0.0.0.0:8000/docs"
echo ""

exec python3 -m uvicorn backend.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --log-level info
