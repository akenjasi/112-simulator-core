#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="${SIMULATOR_PROJECT:-simulator112_offline}"
[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { echo 'Invalid SIMULATOR_PROJECT' >&2; exit 1; }
compose() {
  docker compose --project-directory "$ROOT" --env-file "$ROOT/images.env" \
    --env-file "$ROOT/.env" -p "$PROJECT" -f "$ROOT/compose.yml" "$@"
}
backend_image() { sed -n 's/^BACKEND_IMAGE=//p' "$ROOT/images.env"; }
require_install() { [[ -f "$ROOT/.env" ]] || { echo 'Run ./install.sh first' >&2; exit 1; }; }
