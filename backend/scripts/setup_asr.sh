#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BIN_DIR="${BACKEND_DIR}/bin"
PROJECT_ROOT="$(cd "${BACKEND_DIR}/.." && pwd)"
MODEL_PATH="${PROJECT_ROOT}/models/gigaam-v3-ctc-Q8_0.gguf"

mkdir -p "${BIN_DIR}"

echo "=================================================="
echo " [Setup ASR] Настройка и сборка GigaAM ASR Сервиса"
echo "=================================================="

# Check model exists
if [ -f "${MODEL_PATH}" ]; then
    echo "✓ Модель обнаружена: ${MODEL_PATH}"
else
    echo "⚠ Внимание: Модель не найдена по пути ${MODEL_PATH}"
fi

# Check if binary and shared library already exist
if [ -f "${BIN_DIR}/transcribe-cli" ] && [ -f "${BIN_DIR}/libtranscribe.so" ] && [ -d "${BACKEND_DIR}/transcribe_cpp" ]; then
    echo "✓ Бинарник transcribe-cli, библиотека libtranscribe.so и Python-пакет уже установлены в ${BIN_DIR}"
    echo "Для принудительной пересборки передайте аргумент --force"
    if [ "${1:-}" != "--force" ]; then
        exit 0
    fi
fi

BUILD_DIR="/tmp/transcribe_build"
echo "Клонирование репозитория transcribe.cpp..."
rm -rf "${BUILD_DIR}"
git clone --depth 1 https://github.com/handy-computer/transcribe.cpp "${BUILD_DIR}"

echo "Сборка transcribe-cli (CLI binary)..."
cmake -B "${BUILD_DIR}/build-cli" -S "${BUILD_DIR}" -DCMAKE_BUILD_TYPE=Release
cmake --build "${BUILD_DIR}/build-cli" --target transcribe-cli -j"$(nproc)"
cp "${BUILD_DIR}/build-cli/bin/transcribe-cli" "${BIN_DIR}/transcribe-cli"
chmod +x "${BIN_DIR}/transcribe-cli"
echo "✓ transcribe-cli установлен в ${BIN_DIR}/transcribe-cli"

echo "Сборка libtranscribe.so и libggml (Shared Libraries)..."
cmake -B "${BUILD_DIR}/build-shared" -S "${BUILD_DIR}" -DTRANSCRIBE_BUILD_SHARED=ON -DCMAKE_BUILD_TYPE=Release
cmake --build "${BUILD_DIR}/build-shared" --target transcribe -j"$(nproc)"
cp "${BUILD_DIR}/build-shared/src/libtranscribe.so" "${BIN_DIR}/libtranscribe.so"
cp "${BUILD_DIR}/build-shared/ggml/src/"*.so "${BIN_DIR}/" 2>/dev/null || true
echo "✓ Библиотеки libtranscribe.so и libggml установлены в ${BIN_DIR}"

echo "Копирование Python-биндингов transcribe_cpp..."
rm -rf "${BACKEND_DIR}/transcribe_cpp"
cp -r "${BUILD_DIR}/bindings/python/src/transcribe_cpp" "${BACKEND_DIR}/transcribe_cpp"
echo "✓ transcribe_cpp установлен в ${BACKEND_DIR}/transcribe_cpp"

echo "Очистка временных файлов сборки..."
rm -rf "${BUILD_DIR}"

echo "=================================================="
echo "✓ Установка ASR успешно завершена!"
echo "=================================================="
