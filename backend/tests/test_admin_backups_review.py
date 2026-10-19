"""Independent backup regression checks; use a disposable database only."""
import sqlite3
from pathlib import Path

import pytest

import backend.core.backups as backups
from backend.database import engine
from backend.models.base import Base


@pytest.fixture(autouse=True)
async def isolated_tables():
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)


@pytest.mark.parametrize("use_async", [False, True])
async def test_failed_publication_cleans_temporary_file_and_preserves_old_copy(tmp_path, monkeypatch, use_async):
    source = tmp_path / "source.db"
    with sqlite3.connect(source) as connection:
        connection.execute("CREATE TABLE example (id INTEGER)")
        connection.commit()
    directory = tmp_path / "backups"
    directory.mkdir()
    previous = directory / "previous.db"
    previous.write_bytes(b"previous backup")

    def cannot_publish(self, target):
        raise PermissionError("Publication denied")

    monkeypatch.setattr(Path, "replace", cannot_publish)
    with pytest.raises(PermissionError):
        if use_async:
            await backups.create_backup_async(f"sqlite:///{source}", directory)
        else:
            backups.create_backup(f"sqlite:///{source}", directory)
    assert list(directory.iterdir()) == [previous]
    assert previous.read_bytes() == b"previous backup"


def test_empty_files_are_not_offered_as_completed_backups(tmp_path):
    (tmp_path / "empty.sql").touch()
    (tmp_path / "completed.sql").write_text("-- existing dump")
    assert [item["filename"] for item in backups.list_backups(tmp_path)] == ["completed.sql"]
    with pytest.raises((ValueError, FileNotFoundError)):
        backups.get_backup_file_path("empty.sql", tmp_path)


async def test_backup_api_does_not_return_subprocess_diagnostics(auth_client, monkeypatch):
    async def fail():
        raise RuntimeError("pg_dump: error: host=internal-db password=test-secret dbname=private-db")

    monkeypatch.setattr("backend.api.router_admin.create_backup_async", fail)
    response = await auth_client.post("/api/admin/backup")
    assert response.status_code == 500
    detail = response.json()["detail"]
    assert "test-secret" not in detail
    assert "internal-db" not in detail
    assert "private-db" not in detail
    assert "pg_dump: error:" not in detail
