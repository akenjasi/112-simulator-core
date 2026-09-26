#!/bin/bash
set -e
mkdir -p backend/core/qwen_tts/models/
cd backend/core/qwen_tts/models/

echo "Downloading tokenizer..."
wget -q --show-progress -cO qwen-tokenizer-12hz-Q4_K_M.gguf "https://huggingface.co/Serveurperso/Qwen3-TTS-GGUF/resolve/main/qwen-tokenizer-12hz-Q4_K_M.gguf?download=true"

echo "Downloading base model..."
wget -q --show-progress -cO qwen-talker-0.6b-base-Q4_K_M.gguf "https://huggingface.co/Serveurperso/Qwen3-TTS-GGUF/resolve/main/qwen-talker-0.6b-base-Q4_K_M.gguf?download=true"

echo "Done!"
