#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MODELS_DIR="${MODELS_DIR:-$REPO_ROOT/data/models}"
TTS_MODELS_DIR="${TTS_MODELS_DIR:-$REPO_ROOT/data/tts_models}"
mkdir -p "$MODELS_DIR" "$TTS_MODELS_DIR"
download_if_missing() {
    local dest="$1" url="$2"
    if [ -s "$dest" ]; then
        echo "Retained existing $(basename "$dest"); validate the supplied model provenance separately."
        return
    fi
    wget --inet4-only --continue --tries=5 --timeout=60 -O "$dest.part" "$url"
    test -s "$dest.part"
    mv "$dest.part" "$dest"
}
HF_BASE='https://huggingface.co/Serveurperso/Qwen3-TTS-GGUF/resolve/main'
download_if_missing "$TTS_MODELS_DIR/qwen-tokenizer-12hz-Q4_K_M.gguf" "$HF_BASE/qwen-tokenizer-12hz-Q4_K_M.gguf?download=true"
download_if_missing "$TTS_MODELS_DIR/qwen-talker-0.6b-base-Q4_K_M.gguf" "$HF_BASE/qwen-talker-0.6b-base-Q4_K_M.gguf?download=true"
download_if_missing "$MODELS_DIR/gigaam-v3-ctc-Q8_0.gguf" 'https://huggingface.co/salute-developers/GigaAM/resolve/main/gigaam-v3-ctc-Q8_0.gguf?download=true'
echo 'Downloads completed. Qwen report GGUF is supplied separately; the running app never downloads weights.'
