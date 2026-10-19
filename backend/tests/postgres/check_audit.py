"""Verify legacy-schema migration on a new, owned PostgreSQL 15 container."""
import asyncio
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
import uuid


async def verify():
    from sqlalchemy import text
    from backend.database import engine
    import backend.models.domain_01
    import backend.models.domain_02
    import backend.models.domain_03
    import backend.models.domain_04
    import backend.models.domain_05
    import backend.models.domain_06
    import backend.models.dds_report_job
    from backend.core.schema_migrations import migrate_schema
    try:
        async with engine.begin() as db:
            await db.execute(text("CREATE TABLE users (user_id VARCHAR PRIMARY KEY, username VARCHAR NOT NULL UNIQUE, password_hash VARCHAR NOT NULL, role VARCHAR NOT NULL, created_at TIMESTAMPTZ NOT NULL, is_active BOOLEAN NOT NULL)"))
            await db.execute(text("INSERT INTO users VALUES ('original','original','hash','CADET',now(),true)"))
            changed = await db.run_sync(migrate_schema)
            assert 'users.is_2fa_enabled' in changed and 'users.created_by_id' in changed
            row = (await db.execute(text("SELECT username, is_2fa_enabled, group_ids FROM users WHERE user_id='original'"))).one()
            assert row == ('original', False, [])
            assert await db.run_sync(migrate_schema) == []
            assert (await db.execute(text("SELECT count(*) FROM users"))).scalar() == 1
        print('PostgreSQL 15: additive migration, boolean/JSON defaults, repeat and row preservation passed')
    finally:
        await engine.dispose()


def main():
    if sys.argv[1:] == ['--owned-child']:
        if os.getenv('AUDIT_OWNED_POSTGRES') != 'true':
            raise SystemExit('Run without arguments to allocate a disposable database')
        sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
        asyncio.run(verify())
        return
    if sys.argv[1:]:
        raise SystemExit('No database arguments are accepted; this command owns its test container')
    name = '112-audit-pg-' + uuid.uuid4().hex[:12]
    password = secrets.token_hex(24)
    created = False
    try:
        subprocess.run(['docker', 'run', '-d', '--name', name, '-p', '127.0.0.1::5432',
                        '-e', 'POSTGRES_USER=audit', '-e', f'POSTGRES_PASSWORD={password}',
                        '-e', 'POSTGRES_DB=audit', 'postgres:15-alpine'], check=True, stdout=subprocess.DEVNULL)
        created = True
        for _ in range(60):
            result = subprocess.run(['docker', 'exec', '-e', f'PGPASSWORD={password}', name, 'psql', '-h', '127.0.0.1', '-U', 'audit', '-d', 'audit', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT 1'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if result.returncode == 0:
                break
            time.sleep(.25)
        else:
            raise RuntimeError('Owned PostgreSQL did not become ready')
        port = subprocess.check_output(['docker', 'port', name, '5432/tcp'], text=True).strip().rsplit(':', 1)[1]
        env = dict(os.environ, AUDIT_OWNED_POSTGRES='true', DATABASE_URL=f'postgresql+asyncpg://audit:{password}@127.0.0.1:{port}/audit')
        subprocess.run([sys.executable, str(Path(__file__).resolve()), '--owned-child'], env=env, check=True)
    finally:
        if created:
            subprocess.run(['docker', 'rm', '-fv', name], check=True, stdout=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
