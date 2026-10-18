#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
require_install
umask 077
DEST="${1:-$ROOT/backups/$(date -u +%Y%m%d-%H%M%S)}"
[[ ! -e "$DEST" ]] || { echo 'Backup destination already exists' >&2; exit 1; }
mkdir -p "$DEST"
compose exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl' > "$DEST/database.sql"
compose exec -T backend tar -C /app/data --exclude='./backups' --exclude='*.db' -cf - . > "$DEST/app-data.tar"
(cd "$DEST"; sha256sum database.sql app-data.tar > SHA256SUMS)
printf 'Backup completed: %s\nKeep .env separately to preserve application secrets.\n' "$DEST"
