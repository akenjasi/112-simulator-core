"""Prepare/review four DDS demo tickets; only --apply writes the explicit SQLite DB."""
import argparse
import asyncio
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sqlite3

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.core.dds_demo_catalog import DemoManifest, install_demo, prepare_demo, validate_demo
from backend.core.paths import PROJECT_ROOT


def target_path(path):
    path = Path(path).resolve(strict=True)
    if not path.is_file():
        raise ValueError("An existing SQLite database is required")
    for protected in (PROJECT_ROOT / "data/112_simulator.db", PROJECT_ROOT / "112_simulator.db"):
        if protected.exists() and path.samefile(protected):
            raise ValueError("The main database is not a demo replacement target")
    return path


def backup_database(path):
    directory = path.parent / "backups"
    directory.mkdir(exist_ok=True)
    target = directory / f"dds-before-city-demo-{datetime.now(timezone.utc):%Y%m%dT%H%M%S%f}.sqlite"
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(fd)
    with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as source, sqlite3.connect(target) as dest:
        source.backup(dest)
        if dest.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("Backup integrity check failed")
        if dest.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Backup contains broken references")
    return target


async def run(database, manifest, *, apply=False):
    path = target_path(database)
    validate_demo(manifest)
    engine = create_async_engine(f"sqlite+aiosqlite:///{path}")

    @event.listens_for(engine.sync_engine, "connect")
    def foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            await db.execute(text("BEGIN IMMEDIATE"))
            if (await db.execute(text("PRAGMA foreign_key_check"))).all():
                raise ValueError("Database has broken references; replacement refused")
            # The write lock prevents changes between the backup and replacement.
            backup = backup_database(path) if apply else None
            counts = await install_demo(db, manifest)
            if (await db.execute(text("PRAGMA foreign_key_check"))).all():
                raise ValueError("Replacement introduced broken references")
            if apply:
                await db.commit()
            else:
                await db.rollback()
        return {"database": str(path), "applied": apply, "backup": str(backup) if backup else None, **counts}
    finally:
        await engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True, help="Explicit existing demo SQLite path")
    parser.add_argument("--prepared", type=Path, help="Previously saved and reviewed JSON manifest")
    parser.add_argument("--output", type=Path, help="Save a new reviewable JSON; refuses to overwrite")
    parser.add_argument("--apply", action="store_true", help="Back up, replace demo catalog and clear scoped history")
    args = parser.parse_args()
    if args.apply and not args.prepared:
        parser.error("--apply requires --prepared with the reviewed ticket content")
    if args.prepared and args.output:
        parser.error("Choose either --prepared or --output")
    try:
        target_path(args.database)
        manifest = DemoManifest.model_validate_json(args.prepared.read_text()) if args.prepared else prepare_demo()
        validate_demo(manifest)
        result = asyncio.run(run(args.database, manifest, apply=args.apply))
        if args.output:
            with args.output.open("x", encoding="utf-8") as output:
                output.write(manifest.model_dump_json(indent=2) + "\n")
            result["prepared"] = str(args.output.resolve())
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, OSError) as error:
        parser.exit(1, f"DDS demo: {error}\n")


if __name__ == "__main__":
    main()
