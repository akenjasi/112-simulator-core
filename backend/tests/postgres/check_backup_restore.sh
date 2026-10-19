#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Integration test: Real PostgreSQL 15 dump & restore verification
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

BACKEND_IMAGE="${BACKEND_IMAGE:-simulator_backend:latest}"
docker image inspect "$BACKEND_IMAGE" >/dev/null

RAND_ID="$(date +%s)_$RANDOM"
TEST_CONTAINER="pg15_integ_${RAND_ID}"
TEST_NET="pg15_net_${RAND_ID}"
TEST_BACKUP_DIR="$(mktemp -d /tmp/pg15_backup_integ.XXXXXX)"

cleanup() {
    echo "==> Cleaning up test resources..."
    docker rm -fv "$TEST_CONTAINER" >/dev/null 2>&1 || true
    docker network rm "$TEST_NET" >/dev/null 2>&1 || true
    rm -rf "$TEST_BACKUP_DIR"
}
trap cleanup EXIT

echo "==> 1. Creating isolated test network: $TEST_NET"
docker network create "$TEST_NET" >/dev/null

echo "==> 2. Starting isolated PostgreSQL 15 container: $TEST_CONTAINER"
docker run -d \
    --name "$TEST_CONTAINER" \
    --network "$TEST_NET" \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=integ_secret_pass \
    -e POSTGRES_DB=source_test_db \
    postgres:15-alpine >/dev/null

echo "==> 3. Waiting for PostgreSQL 15 to be healthy..."
DATABASE_READY=false
for i in {1..60}; do
    if docker exec -e PGPASSWORD=integ_secret_pass "$TEST_CONTAINER" psql -h 127.0.0.1 -X -v ON_ERROR_STOP=1 -U postgres -d source_test_db -t -A -c 'SELECT 1' >/dev/null 2>&1; then
        DATABASE_READY=true
        break
    fi
    sleep 1
done
if [ "$DATABASE_READY" != true ]; then
    echo 'ERROR: Test database was not initialized within 60 seconds' >&2
    exit 1
fi

echo "==> 4. Populating source database with known test schema and rows..."
docker exec -i "$TEST_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d source_test_db >/dev/null << 'EOF'
CREATE TABLE cadet_exam_results (
    id SERIAL PRIMARY KEY,
    cadet_name VARCHAR(120) NOT NULL,
    score INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO cadet_exam_results (cadet_name, score, status) VALUES
    ('Алексеев Алексей', 94, 'Сдал'),
    ('Борисов Борис', 88, 'Сдал'),
    ('Васильев Василий', 52, 'Пересдача');
EOF

echo "==> 5. Creating database backup using application code in ${BACKEND_IMAGE}..."
chmod 777 "$TEST_BACKUP_DIR"
docker run --rm \
    --network "$TEST_NET" \
    -v "$TEST_BACKUP_DIR:$TEST_BACKUP_DIR:Z" \
    -w /app \
    -e DATABASE_URL="postgresql+asyncpg://postgres:integ_secret_pass@${TEST_CONTAINER}:5432/source_test_db" \
    -e BACKUP_DIR="$TEST_BACKUP_DIR" \
    "${BACKEND_IMAGE}" \
    python3 -c "
import asyncio
from backend.core.backups import create_backup_async
path = asyncio.run(create_backup_async())
print(f'BACKUP_CREATED={path}')
"

echo "==> 6. Verifying generated backup file..."
BACKUP_FILE=$(find "$TEST_BACKUP_DIR" -maxdepth 1 -name "*.sql" | head -n 1)
if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
    echo "ERROR: Backup SQL file was not generated in $TEST_BACKUP_DIR" >&2
    exit 1
fi

FILE_SIZE=$(wc -c < "$BACKUP_FILE")
echo "Found backup file: $BACKUP_FILE (size: $FILE_SIZE bytes)"
if [[ "$FILE_SIZE" -le 100 ]]; then
    echo "ERROR: Backup file is too small ($FILE_SIZE bytes)" >&2
    exit 1
fi

echo "==> 7. Creating separate clean target database: target_restore_db..."
docker exec "$TEST_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -c "CREATE DATABASE target_restore_db;" >/dev/null

echo "==> 8. Restoring dump into target_restore_db using psql..."
docker exec -i "$TEST_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d target_restore_db < "$BACKUP_FILE" >/dev/null

echo "==> 9. Verifying restored schema and data in target_restore_db..."
ROW_COUNT=$(docker exec "$TEST_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d target_restore_db -t -A -c "SELECT COUNT(*) FROM cadet_exam_results;")
SUM_SCORE=$(docker exec "$TEST_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d target_restore_db -t -A -c "SELECT SUM(score) FROM cadet_exam_results;")
CADET_NAMES=$(docker exec "$TEST_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d target_restore_db -t -A -c "SELECT string_agg(cadet_name, ',' ORDER BY id) FROM cadet_exam_results;")

echo "Restored rows: $ROW_COUNT"
echo "Sum of scores: $SUM_SCORE"
echo "Cadets: $CADET_NAMES"

if [[ "$ROW_COUNT" -ne 3 ]]; then
    echo "ERROR: Expected 3 rows, found $ROW_COUNT" >&2
    exit 1
fi

if [[ "$SUM_SCORE" -ne 234 ]]; then
    echo "ERROR: Expected sum score 234 (94+88+52), got $SUM_SCORE" >&2
    exit 1
fi

if [[ "$CADET_NAMES" != "Алексеев Алексей,Борисов Борис,Васильев Василий" ]]; then
    echo "ERROR: Cadet names mismatch: $CADET_NAMES" >&2
    exit 1
fi

echo "======================================================================"
echo "SUCCESS: PostgreSQL 15 backup and restore verified successfully!"
echo "======================================================================"
