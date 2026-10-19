"""Demonstration credentials/data must never be mixed into an existing database."""
from pathlib import Path
from sqlalchemy.engine import make_url


def require_new_demo_sqlite(raw_url):
    if not raw_url:
        raise SystemExit("Set DATABASE_URL explicitly to a NEW demonstration SQLite file")
    url = make_url(raw_url)
    if url.drivername != "sqlite+aiosqlite" or not url.database or url.database == ":memory:":
        raise SystemExit("Demo seed CLI requires a new file-backed sqlite+aiosqlite database")
    target = Path(url.database)
    if target.exists() or target.is_symlink():
        raise SystemExit("Refusing demo seed into an existing database; choose a new file")
