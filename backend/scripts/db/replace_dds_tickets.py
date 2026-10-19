"""Replace old local DDS catalog tickets with v2 plans, after a verified SQLite backup.

Run explicitly: python -m backend.scripts.db.replace_dds_tickets --apply
The configured database is the target. Historical rows remain as deleted FK anchors.
"""
import argparse
import asyncio
from datetime import datetime, timezone
from pathlib import Path
import sqlite3

from sqlalchemy import text


def backup(path):
    directory = path.parent / 'backups'
    directory.mkdir(exist_ok=True)
    target = directory / f"dds-before-v2-{datetime.now(timezone.utc):%Y%m%dT%H%M%S%f}.sqlite"
    with sqlite3.connect(path) as source, sqlite3.connect(target) as dest:
        source.backup(dest)
        if dest.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('Backup verification failed')
    target.chmod(0o600)
    return target


async def main(apply=False):
    from backend.database import AsyncSessionLocal, engine
    from backend.core.dds_ticket_replacement import replace_catalog
    if engine.url.get_backend_name() != 'sqlite':
        raise ValueError('This local replacement command requires SQLite')
    path = Path(engine.url.database).resolve()
    if not path.is_file():
        raise ValueError('Configured database does not exist')
    saved = backup(path) if apply else None
    async with AsyncSessionLocal() as db:
        await db.execute(text('BEGIN IMMEDIATE'))
        before = list((await db.execute(text('PRAGMA foreign_key_check'))).all())
        mapping = await replace_catalog(db)
        after = list((await db.execute(text('PRAGMA foreign_key_check'))).all())
        if after != before:
            raise ValueError('New broken references; transaction must be rolled back')
        if apply:
            await db.commit()
        else:
            await db.rollback()
    print(f"{'Replaced' if apply else 'Validated (dry run)'}: {len(mapping)} tickets")
    if saved:
        print(f'Backup: {saved}')
    for previous, new in mapping.items():
        print(f'{previous} -> {new}')
    await engine.dispose()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--env-file', type=Path, default=Path(__file__).resolve().parents[3] / '.env')
    args = parser.parse_args()
    if args.env_file.is_file():
        from dotenv import load_dotenv
        load_dotenv(args.env_file, override=False)
    asyncio.run(main(args.apply))
