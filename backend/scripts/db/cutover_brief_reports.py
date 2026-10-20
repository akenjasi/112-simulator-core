"""Remove old generated reports after stopping the backend; coursework is untouched."""
import argparse
import asyncio
from datetime import datetime, timezone
import json
import os
from pathlib import Path


async def run(args):
    from backend.core.report_cutover import cutover
    from backend.database import AsyncSessionLocal, engine
    def backup(data):
        folder = Path(args.backup_dir)
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / ("ai-reports-before-brief-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".json")
        with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as output:
            json.dump(data, output, ensure_ascii=False, default=str)
        print("Private report backup:", path)
    try:
        async with AsyncSessionLocal() as db:
            counts = await cutover(db, apply=args.apply, backup=backup)
            if args.apply:
                await db.commit()
            print(json.dumps({"applied": args.apply, "reports": counts}, ensure_ascii=False))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file")
    parser.add_argument("--apply", action="store_true", help="Requires the old backend worker to be stopped")
    parser.add_argument("--backup-dir", default="data/backups")
    args = parser.parse_args()
    if args.env_file:
        from dotenv import load_dotenv
        load_dotenv(args.env_file, override=True)
    asyncio.run(run(args))
