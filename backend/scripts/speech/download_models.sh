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
python3 "$REPO_ROOT/tools/provision_models.py" --tts-dir "$TTS_MODELS_DIR"
download_if_missing "$MODELS_DIR/gigaam-v3-ctc-Q8_0.gguf" 'https://huggingface.co/salute-developers/GigaAM/resolve/main/gigaam-v3-ctc-Q8_0.gguf?download=true'
echo 'Downloads completed. Qwen report GGUF is supplied separately; the running app never downloads weights.'
