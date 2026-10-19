#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
RELEASE_DIR="${RELEASE_DIR:-release}"
BACKEND_IMAGE="${BACKEND_IMAGE:-simulator_backend:latest}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-simulator_frontend:latest}"
mkdir -p "$RELEASE_DIR/scripts" "$RELEASE_DIR/certs" "$RELEASE_DIR/data/models" "$RELEASE_DIR/data/tts_models"
docker build -t "$BACKEND_IMAGE" -f Dockerfile.backend .
docker build -t "$FRONTEND_IMAGE" -f Dockerfile.frontend .
docker pull postgres:15-alpine
docker save -o "$RELEASE_DIR/images.tar.part" "$BACKEND_IMAGE" "$FRONTEND_IMAGE" postgres:15-alpine
mv "$RELEASE_DIR/images.tar.part" "$RELEASE_DIR/images.tar"
cp docker-compose.prod.yml "$RELEASE_DIR/docker-compose.yml"
cp scripts/setup_env.py "$RELEASE_DIR/scripts/"
cp .env.example "$RELEASE_DIR/"
cp scripts/generate_certs.sh "$RELEASE_DIR/scripts/"
cp docs/operations/deployment.md "$RELEASE_DIR/README.md"
echo 'Release images saved. Configure a fresh .env/certificate and supply external model files before startup.'
