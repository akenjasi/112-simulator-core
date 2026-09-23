"""Database backup script supporting SQLite and PostgreSQL."""

import asyncio
import os
import shutil
import sqlite3
import subprocess
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def get_database_url(db_url: str | None = None) -> str:
    """Resolve database URL from argument, environment, or .env file."""
    if db_url:
        return db_url

    url = os.getenv("DATABASE_URL")
    if url:
        return url

    # Check for .env in project root
    env_file = PROJECT_ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                if key.strip() == "DATABASE_URL":
                    return val.strip().strip("'\"")

    # Fallback to local default sqlite db if present
    default_db = PROJECT_ROOT / "data" / "112_simulator.db"
    if default_db.exists():
        return f"sqlite+aiosqlite:///{default_db}"

    return "sqlite+aiosqlite:///./data/database.db"


def get_backup_dir() -> Path:
    """Ensure data/backups directory exists and return its path."""
    backup_dir = PROJECT_ROOT / "data" / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir


def _resolve_sqlite_source(db_url: str) -> Path:
    """Identify or create the source SQLite database file."""
    # Extract path part from sqlite URL
    raw_path = db_url
    for prefix in ("sqlite+aiosqlite:///", "sqlite:///"):
        if raw_path.startswith(prefix):
            raw_path = raw_path[len(prefix):]
            break

    candidate = Path(raw_path)
    if not candidate.is_absolute():
        candidate = PROJECT_ROOT / candidate

    if candidate.exists() and candidate.is_file() and candidate.name != ":memory:":
        return candidate

    # Check default project databases
    db_file_1 = PROJECT_ROOT / "data" / "database.db"
    if db_file_1.exists():
        return db_file_1

    db_file_2 = PROJECT_ROOT / "data" / "112_simulator.db"
    if db_file_2.exists():
        return db_file_2

    # In-memory or missing db file (e.g. during test run) -> create an empty sqlite db
    db_file_1.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_file_1)
    conn.close()
    return db_file_1


def create_backup(db_url: str | None = None) -> str:
    """Create a database backup synchronously. Returns the path to the backup file."""
    url = get_database_url(db_url)
    backup_dir = get_backup_dir()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if "postgresql" in url or "asyncpg" in url:
        # PostgreSQL dump
        target_path = backup_dir / f"database_{timestamp}.sql"
        clean_url = url.replace("postgresql+asyncpg://", "postgresql://").replace("postgres+asyncpg://", "postgresql://")
        result = subprocess.run(
            ["pg_dump", clean_url, "-f", str(target_path)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"pg_dump failed: {result.stderr}")
        return str(target_path)
    else:
        # SQLite backup
        source_path = _resolve_sqlite_source(url)
        stem = source_path.stem if source_path.stem else "database"
        target_path = backup_dir / f"{stem}_{timestamp}.db"
        shutil.copy2(source_path, target_path)
        return str(target_path)


async def create_backup_async(db_url: str | None = None) -> str:
    """Create a database backup asynchronously without blocking the event loop."""
    url = get_database_url(db_url)
    backup_dir = get_backup_dir()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if "postgresql" in url or "asyncpg" in url:
        # PostgreSQL dump via asyncio subprocess
        target_path = backup_dir / f"database_{timestamp}.sql"
        clean_url = url.replace("postgresql+asyncpg://", "postgresql://").replace("postgres+asyncpg://", "postgresql://")
        proc = await asyncio.create_subprocess_exec(
            "pg_dump",
            clean_url,
            "-f",
            str(target_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"pg_dump failed: {stderr.decode()}")
        return str(target_path)
    else:
        # SQLite copy in thread to avoid blocking event loop
        source_path = _resolve_sqlite_source(url)
        stem = source_path.stem if source_path.stem else "database"
        target_path = backup_dir / f"{stem}_{timestamp}.db"
        await asyncio.to_thread(shutil.copy2, source_path, target_path)
        return str(target_path)


if __name__ == "__main__":
    backup_file = create_backup()
    print(f"Backup created successfully: {backup_file}")
