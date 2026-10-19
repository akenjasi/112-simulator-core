"""Database backup script supporting SQLite and PostgreSQL."""

import asyncio
import os
import re
import sqlite3
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from backend.core.paths import PROJECT_ROOT

BACKUP_EXTENSIONS = {".sql", ".dump", ".db", ".sqlite"}
PG_DUMP_TIMEOUT: float = 120.0


def _sanitize_text(text: str) -> str:
    """Mask credentials and database connection details from strings."""
    if not text:
        return ""
    # Mask postgresql://user:password@host -> postgresql://user:***@host
    cleaned = re.sub(r"://([^:]+):([^@]+)@", r"://\1:***@", text)
    # Mask password=xyz or PGPASSWORD=xyz
    cleaned = re.sub(r"(password\s*=\s*)([^\s;]+)", r"\1***", cleaned, flags=re.IGNORECASE)
    return cleaned


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

    from backend.core.paths import local_database_path
    return f"sqlite+aiosqlite:///{local_database_path(PROJECT_ROOT)}"


def get_backup_dir(custom_dir: Path | str | None = None) -> Path:
    """Ensure data/backups directory exists and return its path."""
    if custom_dir:
        backup_dir = Path(custom_dir)
    elif os.getenv("BACKUP_DIR"):
        backup_dir = Path(os.environ["BACKUP_DIR"])
    else:
        backup_dir = PROJECT_ROOT / "data" / "backups"

    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir


def _resolve_sqlite_source(db_url: str) -> Path:
    """Identify the source SQLite database file. Does not create missing DB."""
    raw_path = db_url
    for prefix in ("sqlite+aiosqlite:///", "sqlite:///"):
        if raw_path.startswith(prefix):
            raw_path = raw_path[len(prefix):]
            break

    candidate = Path(raw_path)
    if not candidate.is_absolute():
        candidate = (PROJECT_ROOT / candidate).resolve()
    else:
        candidate = candidate.resolve()

    if candidate.name == ":memory:":
        raise ValueError("In-memory SQLite database cannot be backed up to disk via file copy")

    if not candidate.exists() or not candidate.is_file():
        raise FileNotFoundError(f"SQLite source database does not exist: {candidate}")

    return candidate


def _generate_backup_filenames(stem: str, ext: str, backup_dir: Path) -> tuple[Path, Path]:
    """Generate unique temporary and final backup file paths."""
    now = datetime.now(timezone.utc)
    timestamp = now.strftime("%Y%m%d_%H%M%S")
    unique_suffix = f"{now.microsecond:06d}_{uuid.uuid4().hex[:6]}"
    final_name = f"{stem}_{timestamp}_{unique_suffix}{ext}"
    temp_name = f".tmp_{final_name}"
    return backup_dir / temp_name, backup_dir / final_name


def _sqlite_backup_sync(source_file: Path, dest_file: Path) -> None:
    """Execute SQLite online backup API to safely capture WAL state."""
    source_uri = f"file:{source_file.resolve().as_posix()}?mode=ro"
    src_conn = sqlite3.connect(source_uri, uri=True)
    try:
        dst_conn = sqlite3.connect(str(dest_file.resolve()))
        try:
            src_conn.backup(dst_conn)
        finally:
            dst_conn.close()
    finally:
        src_conn.close()


def _publish_backup(temp_path: Path, final_path: Path) -> str:
    """Publish a nonempty backup, cleaning up even when the atomic rename fails."""
    try:
        if not temp_path.is_file() or temp_path.stat().st_size == 0:
            raise RuntimeError("Database backup failed: produced an empty file")
        temp_path.replace(final_path)
        return str(final_path)
    finally:
        temp_path.unlink(missing_ok=True)


def is_valid_backup_filename(filename: str) -> bool:
    """Validate that filename is safe, completed, and of supported backup format."""
    if not filename or not isinstance(filename, str):
        return False
    # No path traversal, no slashes, no backslashes
    if "/" in filename or "\\" in filename or ".." in filename:
        return False
    p = Path(filename)
    if p.name != filename:
        return False
    # Exclude temporary, hidden or incomplete files
    if filename.startswith(".") or filename.startswith("tmp_") or filename.endswith(".tmp"):
        return False
    if p.suffix.lower() not in BACKUP_EXTENSIONS:
        return False
    return True


def list_backups(backup_dir: Path | None = None) -> list[dict]:
    """List completed backup files sorted newest first."""
    b_dir = backup_dir or get_backup_dir()
    if not b_dir.exists():
        return []

    resolved_backup_dir = b_dir.resolve()
    items = []
    for entry in b_dir.iterdir():
        if not entry.is_file():
            continue
        if entry.is_symlink():
            try:
                resolved_target = entry.resolve()
                if not resolved_target.is_relative_to(resolved_backup_dir):
                    continue
            except (ValueError, RuntimeError):
                continue

        if not is_valid_backup_filename(entry.name):
            continue

        try:
            stat = entry.stat()
            if stat.st_size == 0:
                continue
            dt_utc = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
            items.append({
                "filename": entry.name,
                "created_at": dt_utc.isoformat(),
                "size_bytes": stat.st_size,
                "mtime": stat.st_mtime,
            })
        except OSError:
            continue

    # Stable sort: newest first, tie-break by filename DESC
    items.sort(key=lambda x: (x["mtime"], x["filename"]), reverse=True)
    return items


def get_backup_file_path(filename: str, backup_dir: Path | None = None) -> Path:
    """Safely resolve an existing backup file path ensuring no traversal outside backup_dir."""
    if not is_valid_backup_filename(filename):
        raise ValueError(f"Invalid backup filename: {filename}")

    b_dir = (backup_dir or get_backup_dir()).resolve()
    target = (b_dir / filename).resolve()

    try:
        if not target.is_relative_to(b_dir):
            raise ValueError(f"Path traversal detected: {filename}")
    except (ValueError, RuntimeError):
        raise ValueError(f"Path traversal detected: {filename}")

    if not target.exists() or not target.is_file() or target.stat().st_size == 0:
        raise FileNotFoundError(f"Backup file not found: {filename}")

    return target


def create_backup(db_url: str | None = None, custom_backup_dir: Path | None = None) -> str:
    """Create a database backup synchronously. Returns the path to the backup file."""
    url = get_database_url(db_url)
    backup_dir = get_backup_dir(custom_backup_dir)

    if "postgresql" in url or "asyncpg" in url:
        temp_path, final_path = _generate_backup_filenames("database", ".sql", backup_dir)
        clean_url = url.replace("postgresql+asyncpg://", "postgresql://").replace("postgres+asyncpg://", "postgresql://")
        try:
            result = subprocess.run(
                ["pg_dump", clean_url, "-f", str(temp_path)],
                capture_output=True,
                text=True,
                timeout=PG_DUMP_TIMEOUT,
            )
            if result.returncode != 0:
                temp_path.unlink(missing_ok=True)
                safe_err = _sanitize_text(result.stderr or "")
                raise RuntimeError(f"pg_dump failed (code {result.returncode}): {safe_err}".strip())
        except FileNotFoundError:
            temp_path.unlink(missing_ok=True)
            raise FileNotFoundError("pg_dump executable not found on server")
        except subprocess.TimeoutExpired:
            temp_path.unlink(missing_ok=True)
            raise TimeoutError("pg_dump process timed out")
        except Exception:
            temp_path.unlink(missing_ok=True)
            raise

        return _publish_backup(temp_path, final_path)

    else:
        # SQLite backup
        source_path = _resolve_sqlite_source(url)
        stem = source_path.stem if source_path.stem else "database"
        temp_path, final_path = _generate_backup_filenames(stem, ".db", backup_dir)

        try:
            _sqlite_backup_sync(source_path, temp_path)
        except Exception:
            temp_path.unlink(missing_ok=True)
            raise

        return _publish_backup(temp_path, final_path)


async def create_backup_async(db_url: str | None = None, custom_backup_dir: Path | None = None) -> str:
    """Create a database backup asynchronously without blocking the event loop."""
    url = get_database_url(db_url)
    backup_dir = get_backup_dir(custom_backup_dir)

    if "postgresql" in url or "asyncpg" in url:
        temp_path, final_path = _generate_backup_filenames("database", ".sql", backup_dir)
        clean_url = url.replace("postgresql+asyncpg://", "postgresql://").replace("postgres+asyncpg://", "postgresql://")

        try:
            proc = await asyncio.create_subprocess_exec(
                "pg_dump",
                clean_url,
                "-f",
                str(temp_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except FileNotFoundError:
            temp_path.unlink(missing_ok=True)
            raise FileNotFoundError("pg_dump executable not found on server")

        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=PG_DUMP_TIMEOUT)
        except asyncio.TimeoutError:
            try:
                proc.kill()
                await proc.wait()
            except Exception:
                pass
            temp_path.unlink(missing_ok=True)
            raise TimeoutError("pg_dump process timed out")
        except Exception:
            try:
                proc.kill()
                await proc.wait()
            except Exception:
                pass
            temp_path.unlink(missing_ok=True)
            raise

        if proc.returncode != 0:
            temp_path.unlink(missing_ok=True)
            safe_err = _sanitize_text(stderr.decode("utf-8", errors="replace"))
            raise RuntimeError(f"pg_dump failed (code {proc.returncode}): {safe_err}".strip())

        return _publish_backup(temp_path, final_path)

    else:
        # SQLite online backup executed in thread
        source_path = _resolve_sqlite_source(url)
        stem = source_path.stem if source_path.stem else "database"
        temp_path, final_path = _generate_backup_filenames(stem, ".db", backup_dir)

        try:
            await asyncio.to_thread(_sqlite_backup_sync, source_path, temp_path)
        except Exception:
            temp_path.unlink(missing_ok=True)
            raise

        return _publish_backup(temp_path, final_path)
