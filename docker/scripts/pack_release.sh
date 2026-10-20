#!/usr/bin/env bash
# Compatibility entry point: every release is now a complete offline bundle.
set -euo pipefail
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
RELEASE_DIR="${RELEASE_DIR:-$REPO_ROOT/data/packages/release}"
[[ "$RELEASE_DIR" == /* ]] || RELEASE_DIR="$REPO_ROOT/$RELEASE_DIR"
VERSION="$(date -u +%Y%m%d-%H%M%S)"
exec bash "$REPO_ROOT/docker/offline/package.sh" \
  --output "$RELEASE_DIR/simulator112-$VERSION-linux-amd64.tar.gz" "$@"
