#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
require_install
SRC="${1:?Usage: ./restore-data.sh /path/to/backup}"
SRC="$(cd -- "$SRC" && pwd)"
[[ -s "$SRC/database.sql" && -s "$SRC/app-data.tar" ]] || { echo 'Incomplete backup' >&2; exit 1; }
if [[ -f "$SRC/SHA256SUMS" ]]; then (cd "$SRC"; sha256sum -c SHA256SUMS); fi
compose up -d --no-build --pull never postgres
ready=0
for ((i=0; i<90; i++)); do
  if compose exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
((ready)) || { echo 'PostgreSQL did not become ready' >&2; exit 1; }
count="$(compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM pg_tables WHERE schemaname = '\''public'\''"')"
[[ "$count" == 0 ]] || { echo 'Refusing to overwrite an existing database. Restore into a fresh project.' >&2; exit 1; }
docker run --rm --network none --mount "type=volume,source=${PROJECT}_application,target=/restore" \
  --entrypoint python "$(backend_image)" -c \
  'from pathlib import Path; allowed={"classifier_ekp.json","moscow_112_addresses.json","template_students.csv"}; assert all(p.name in allowed for p in Path("/restore").iterdir()), "Application volume is not empty"'
compose exec -T postgres sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$SRC/database.sql"
docker run --rm --network none --mount "type=volume,source=${PROJECT}_application,target=/restore" \
  --mount "type=bind,source=$SRC,target=/backup,readonly" --entrypoint tar "$(backend_image)" -C /restore -xf /backup/app-data.tar
echo 'Restored database and files. Start the stack with ./start.sh.'
