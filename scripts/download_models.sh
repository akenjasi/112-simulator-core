#!/usr/bin/env bash
# ─── 112 Simulator — GGUF Model Downloader (standalone) ──────────────────────
# Can be run manually from the project root: bash scripts/download_models.sh
# In Docker, models are downloaded automatically by scripts/init.sh on startup.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MODELS_DIR="${PROJECT_ROOT}/backend/core/qwen_tts/models"
HF_BASE="https://huggingface.co/Serveurperso/Qwen3-TTS-GGUF/resolve/main"

mkdir -p "${MODELS_DIR}"

download_if_missing() {
    local dest="$1"
    local url="$2"
    local name
    name="$(basename "${dest}")"

    if [ -f "${dest}" ] && [ -s "${dest}" ]; then
        echo "  ✅ ${name} — уже есть, пропускаем."
    else
        echo "  ⬇️  Скачиваем ${name}..."
        wget --inet4-only --continue --tries=5 -O "${dest}" "${url}" \
            || { echo "  ❌ Ошибка скачивания ${name}."; exit 1; }
        echo "  ✅ ${name} — скачан."
    fi
}

echo "🤖 Загрузка моделей Qwen TTS в ${MODELS_DIR}"

download_if_missing \
    "${MODELS_DIR}/qwen-tokenizer-12hz-Q4_K_M.gguf" \
    "${HF_BASE}/qwen-tokenizer-12hz-Q4_K_M.gguf?download=true"

download_if_missing \
    "${MODELS_DIR}/qwen-talker-0.6b-base-Q4_K_M.gguf" \
    "${HF_BASE}/qwen-talker-0.6b-base-Q4_K_M.gguf?download=true"

echo ""
echo "✅ Готово! Модели в: ${MODELS_DIR}"

download_if_missing \
    "/app/models/gigaam-v3-ctc-Q8_0.gguf" \
    "https://huggingface.co/salute-developers/GigaAM/resolve/main/gigaam-v3-ctc-Q8_0.gguf?download=true"

