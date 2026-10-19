"""Periodic backups for the deployment sidecar; never invoked by API imports."""
import asyncio
import logging
import os
import re
import time
from pathlib import Path
from scripts.backup_db import create_backup_async

logger = logging.getLogger(__name__)


def prune_owned_backups(directory, days, now=None):
    cutoff = (time.time() if now is None else now) - days * 86400
    for path in Path(directory).iterdir():
        if re.fullmatch(r".+_\d{8}_\d{6}_\d{6}_[0-9a-f]{6}\.(?:sql|db)", path.name) and path.is_file() and not path.is_symlink() and path.suffix in {".sql", ".dump", ".sqlite", ".db"} and path.stat().st_mtime < cutoff:
            path.unlink()


async def run():
    interval = int(os.getenv("BACKUP_INTERVAL_SECONDS", "86400"))
    retention = int(os.getenv("BACKUP_RETENTION_DAYS", "180"))
    if interval < 60 or retention < 1:
        raise ValueError("Backup interval must be >=60 seconds and retention >=1 day")
    while True:
        try:
            path = await create_backup_async()
            prune_owned_backups(Path(path).parent, retention)
            logger.info("Scheduled backup completed")
        except Exception:
            logger.exception("Scheduled backup failed")
        await asyncio.sleep(interval)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
