#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"
RELEASE_DIR="${RELEASE_DIR:-data/packages/release}"
BACKEND_IMAGE="${BACKEND_IMAGE:-simulator_backend:latest}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-simulator_frontend:latest}"
mkdir -p "$RELEASE_DIR/scripts" "$RELEASE_DIR/certs" "$RELEASE_DIR/data/models" "$RELEASE_DIR/data/tts_models"
docker build -t "$BACKEND_IMAGE" -f docker/images/backend.Dockerfile .
docker build -t "$FRONTEND_IMAGE" -f docker/images/frontend.Dockerfile .
docker pull postgres:15-alpine
docker save -o "$RELEASE_DIR/images.tar.part" "$BACKEND_IMAGE" "$FRONTEND_IMAGE" postgres:15-alpine
mv "$RELEASE_DIR/images.tar.part" "$RELEASE_DIR/images.tar"
# Flatten the source overlays for the existing standalone release interface.
# --no-interpolate keeps secret placeholders out of the published compose.
docker compose --project-directory "$REPO_ROOT" --env-file /dev/null -f docker/compose/base.yml -f docker/compose/prod.yml config --no-interpolate --no-path-resolution --format json > "$RELEASE_DIR/docker-compose.yml"
python3 - "$RELEASE_DIR/docker-compose.yml" <<'PY'
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
config = json.loads(p.read_text())
# Do not ship the source checkout's generated project/volume/network names.
config.pop('name', None)
for section in ('volumes', 'networks'):
    for resource in config.get(section, {}).values():
        resource.pop('name', None)
for service in config.get('services', {}).values():
    for mount in service.get('volumes', []):
        if isinstance(mount, dict) and mount.get('source') == './data/certs':
            mount['source'] = './certs'
# JSON is valid YAML and avoids a host PyYAML dependency for release packaging.
p.write_text(json.dumps(config, indent=2, ensure_ascii=False) + '\n')
PY
cp tools/setup_env.py "$RELEASE_DIR/scripts/"
cp .env.example "$RELEASE_DIR/"
cp docker/scripts/generate_certs.sh "$RELEASE_DIR/scripts/"
python3 - "$RELEASE_DIR/scripts/generate_certs.sh" <<'PY'
import sys
from pathlib import Path
p=Path(sys.argv[1]);p.write_text(p.read_text().replace('${SCRIPT_DIR}/../../data/certs', '${SCRIPT_DIR}/../certs'))
PY
cp docs/operations/deployment.md "$RELEASE_DIR/README.md"
echo 'Release images saved. Configure a fresh .env/certificate and supply external model files before startup.'
