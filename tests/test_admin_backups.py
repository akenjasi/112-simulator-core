"""Comprehensive tests for admin database backup, listing, downloading, and integrity."""

import asyncio
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select

import scripts.backup_db as backup_module
from backend.core.security import create_access_token, hash_password
from backend.database import AsyncSessionLocal, engine
from backend.main import app
from backend.models.base import Base
from backend.models.domain_01 import User
from scripts.backup_db import (
    create_backup,
    create_backup_async,
    get_backup_dir,
    get_backup_file_path,
    list_backups,
)


@pytest.fixture(autouse=True)
async def init_db(tmp_path, monkeypatch):
    test_backup_dir = tmp_path / "backups"
    test_backup_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("BACKUP_DIR", str(test_backup_dir))

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def _create_user(role: str) -> tuple[User, dict[str, str]]:
    async with AsyncSessionLocal() as session:
        user = User(
            username=f"{role.lower()}_{uuid.uuid4().hex[:8]}",
            password_hash=hash_password("test_pass_123"),
            role=role,
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        token = create_access_token(subject=user.user_id, role=user.role)
        return user, {"Authorization": f"Bearer {token}"}


# ─── 1. RBAC Tests ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_backup_endpoints_rbac():
    _, admin_headers = await _create_user("ADMIN")
    _, teacher_headers = await _create_user("TEACHER")
    _, cadet_headers = await _create_user("CADET")

    async with AsyncClient(app=app, base_url="http://test") as ac:
        # 1. Anonymous -> 401
        assert (await ac.post("/api/admin/backup")).status_code == 401
        assert (await ac.get("/api/admin/backups")).status_code == 401
        assert (await ac.get("/api/admin/backups/test.sql/download")).status_code == 401

        # 2. TEACHER -> 403
        assert (await ac.post("/api/admin/backup", headers=teacher_headers)).status_code == 403
        assert (await ac.get("/api/admin/backups", headers=teacher_headers)).status_code == 403
        assert (await ac.get("/api/admin/backups/test.sql/download", headers=teacher_headers)).status_code == 403

        # 3. CADET -> 403
        assert (await ac.post("/api/admin/backup", headers=cadet_headers)).status_code == 403
        assert (await ac.get("/api/admin/backups", headers=cadet_headers)).status_code == 403
        assert (await ac.get("/api/admin/backups/test.sql/download", headers=cadet_headers)).status_code == 403

        # 4. ADMIN -> allowed
        res_create = await ac.post("/api/admin/backup", headers=admin_headers)
        assert res_create.status_code == 200
        data = res_create.json()
        assert data["status"] == "ok"
        filename = data.get("filename") or Path(data["backup_file"]).name

        res_list = await ac.get("/api/admin/backups", headers=admin_headers)
        assert res_list.status_code == 200
        assert "backups" in res_list.json()

        res_dl = await ac.get(f"/api/admin/backups/{filename}/download", headers=admin_headers)
        assert res_dl.status_code == 200


# ─── 2. Backup Creation, Listing & Byte-for-Byte Download ─────────────────────


@pytest.mark.asyncio
async def test_backup_creation_listing_and_download(tmp_path):
    _, admin_headers = await _create_user("ADMIN")

    async with AsyncClient(app=app, base_url="http://test") as ac:
        # Create backup
        res = await ac.post("/api/admin/backup", headers=admin_headers)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        backup_file = data["backup_file"]
        filename = data.get("filename") or Path(backup_file).name

        disk_path = Path(backup_file)
        assert disk_path.exists()
        assert disk_path.is_file()
        file_size = disk_path.stat().st_size
        assert file_size > 0

        # Verify listing
        res_list = await ac.get("/api/admin/backups", headers=admin_headers)
        assert res_list.status_code == 200
        backups = res_list.json()["backups"]
        assert len(backups) >= 1
        item = next(b for b in backups if b["filename"] == filename)
        assert item["size_bytes"] == file_size
        assert "T" in item["created_at"]

        # Verify download byte-for-byte
        res_dl = await ac.get(f"/api/admin/backups/{filename}/download", headers=admin_headers)
        assert res_dl.status_code == 200
        assert res_dl.content == disk_path.read_bytes()
        assert f'filename="{filename}"' in res_dl.headers.get("content-disposition", "")


# ─── 3. Concurrency, Uniqueness & Sorting ────────────────────────────────────


@pytest.mark.asyncio
async def test_concurrent_backups_unique_and_sorted():
    _, admin_headers = await _create_user("ADMIN")

    async with AsyncClient(app=app, base_url="http://test") as ac:
        # Create two backups concurrently
        task1 = ac.post("/api/admin/backup", headers=admin_headers)
        task2 = ac.post("/api/admin/backup", headers=admin_headers)
        r1, r2 = await asyncio.gather(task1, task2)

        assert r1.status_code == 200
        assert r2.status_code == 200
        f1 = r1.json()["backup_file"]
        f2 = r2.json()["backup_file"]

        # Ensure distinct unique files
        assert f1 != f2
        assert Path(f1).exists()
        assert Path(f2).exists()

        # Listing preserves order
        res_list = await ac.get("/api/admin/backups", headers=admin_headers)
        assert res_list.status_code == 200
        backups = res_list.json()["backups"]
        names = [b["filename"] for b in backups]
        assert Path(f1).name in names
        assert Path(f2).name in names


@pytest.mark.asyncio
async def test_empty_backups_list(tmp_path, monkeypatch):
    empty_dir = tmp_path / "empty_backups"
    empty_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("BACKUP_DIR", str(empty_dir))

    _, admin_headers = await _create_user("ADMIN")
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.get("/api/admin/backups", headers=admin_headers)
        assert res.status_code == 200
        assert res.json() == {"backups": []}


# ─── 4. Download Security & Path Traversal Prevention ─────────────────────────


@pytest.mark.asyncio
async def test_download_security_and_path_traversal(tmp_path):
    _, admin_headers = await _create_user("ADMIN")
    b_dir = get_backup_dir()

    # Create dummy secret outside backup dir
    secret_file = tmp_path / "secret.env"
    secret_file.write_text("SUPER_SECRET_KEY=12345")

    # Create symlink pointing outside backup dir
    symlink_target = b_dir / "external_symlink.sql"
    try:
        symlink_target.symlink_to(secret_file)
    except OSError:
        pass

    # Create temporary hidden file that should not be downloadable
    tmp_backup = b_dir / ".tmp_in_progress.sql"
    tmp_backup.write_text("incomplete data")

    # Create non-backup extension file in backup dir
    txt_file = b_dir / "notes.txt"
    txt_file.write_text("random notes")

    async with AsyncClient(app=app, base_url="http://test") as ac:
        # 1. Non-existent file -> 404
        r_404 = await ac.get("/api/admin/backups/does_not_exist.sql/download", headers=admin_headers)
        assert r_404.status_code == 404

        # 2. Path traversal attempts
        r_trav1 = await ac.get("/api/admin/backups/..%2fsecret.env/download", headers=admin_headers)
        assert r_trav1.status_code in (400, 404)

        r_trav2 = await ac.get("/api/admin/backups/%2e%2e%2fsecret.env/download", headers=admin_headers)
        assert r_trav2.status_code in (400, 404)

        # 3. Temporary file rejected
        r_tmp = await ac.get(f"/api/admin/backups/{tmp_backup.name}/download", headers=admin_headers)
        assert r_tmp.status_code in (400, 404)

        # 4. Non-backup format rejected
        r_txt = await ac.get("/api/admin/backups/notes.txt/download", headers=admin_headers)
        assert r_txt.status_code in (400, 404)

        # 5. External symlink rejected
        if symlink_target.exists():
            r_sym = await ac.get(f"/api/admin/backups/{symlink_target.name}/download", headers=admin_headers)
            assert r_sym.status_code in (400, 404)

        # 6. Verify listing excludes .tmp_, non-backup, and external symlinks
        list_res = await ac.get("/api/admin/backups", headers=admin_headers)
        filenames = [b["filename"] for b in list_res.json()["backups"]]
        assert tmp_backup.name not in filenames
        assert "notes.txt" not in filenames
        assert symlink_target.name not in filenames


# ─── 5. SQLite WAL Consistency & Integrity ───────────────────────────────────


@pytest.mark.asyncio
async def test_sqlite_wal_integrity_and_restore(tmp_path):
    source_db_path = tmp_path / "source_wal.db"

    # Create source DB with WAL journal mode and disable autocheckpoint to keep WAL frames
    conn = sqlite3.connect(str(source_db_path))
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA wal_autocheckpoint=0;")
    conn.execute("CREATE TABLE inventory (id INTEGER PRIMARY KEY, sku TEXT, quantity INTEGER);")
    for i in range(100):
        conn.execute("INSERT INTO inventory (sku, quantity) VALUES (?, ?);", (f"ITEM-{i:03d}", i * 10))
    conn.commit()

    # Insert uncheckpointed row while connection remains open
    conn.execute("INSERT INTO inventory (sku, quantity) VALUES (?, ?);", ("UNCHECKPOINTED-WAL", 999))
    conn.commit()

    wal_file = tmp_path / "source_wal.db-wal"
    assert wal_file.exists()

    # Execute backup while source connection is active with WAL frames
    backup_file = await create_backup_async(db_url=f"sqlite:///{source_db_path}")
    conn.close()
    assert Path(backup_file).exists()
    assert Path(backup_file).name != source_db_path.name

    # Inspect destination database independently
    dest_conn = sqlite3.connect(backup_file)
    cur = dest_conn.cursor()

    # 1. Integrity check
    cur.execute("PRAGMA integrity_check;")
    assert cur.fetchone()[0] == "ok"

    # 2. Count and data verification
    cur.execute("SELECT count(*), sum(quantity) FROM inventory;")
    count, total_qty = cur.fetchone()
    assert count == 101
    assert total_qty == sum(i * 10 for i in range(100)) + 999

    dest_conn.close()


@pytest.mark.asyncio
async def test_missing_sqlite_source_raises_error_without_creating_file(tmp_path):
    missing_path = tmp_path / "does_not_exist_sub" / "missing.db"
    assert not missing_path.exists()

    with pytest.raises(FileNotFoundError):
        await create_backup_async(db_url=f"sqlite:///{missing_path}")

    assert not missing_path.exists()


# ─── 6. Subprocess Failures, Credentials Sanitization & Timeout Cleanup ───────


@pytest.mark.asyncio
async def test_pg_dump_missing_tool_returns_safe_503(monkeypatch):
    _, admin_headers = await _create_user("ADMIN")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://admin:secret_pass_123@localhost:5432/simulator112")

    with patch("scripts.backup_db.asyncio.create_subprocess_exec", side_effect=FileNotFoundError("pg_dump")):
        async with AsyncClient(app=app, base_url="http://test") as ac:
            res = await ac.post("/api/admin/backup", headers=admin_headers)

    assert res.status_code == 503
    detail = res.json()["detail"]
    assert "pg_dump" in detail
    assert "secret_pass_123" not in detail


@pytest.mark.asyncio
async def test_pg_dump_exit_code_error_sanitizes_credentials(monkeypatch):
    _, admin_headers = await _create_user("ADMIN")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://admin:super_secret_pw@localhost:5432/simulator112")

    mock_proc = AsyncMock()
    mock_proc.returncode = 1
    mock_proc.communicate.return_value = (
        b"",
        b"pg_dump: error: connection to server at localhost:5432 failed: password=super_secret_pw authentication failed",
    )

    with patch("scripts.backup_db.asyncio.create_subprocess_exec", return_value=mock_proc):
        async with AsyncClient(app=app, base_url="http://test") as ac:
            res = await ac.post("/api/admin/backup", headers=admin_headers)

    assert res.status_code == 500
    detail = res.json()["detail"]
    assert "super_secret_pw" not in detail
    assert "резервной копии" in detail
    assert "localhost:5432" not in detail
    assert "pg_dump: error:" not in detail


@pytest.mark.asyncio
async def test_pg_dump_timeout_kills_process_and_cleans_up_temp_file(tmp_path, monkeypatch):
    _, admin_headers = await _create_user("ADMIN")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://admin:pass@localhost:5432/simulator112")
    monkeypatch.setattr(backup_module, "PG_DUMP_TIMEOUT", 0.05)

    mock_proc = AsyncMock()
    mock_proc.kill = MagicMock()
    mock_proc.wait = AsyncMock()

    async def slow_communicate():
        await asyncio.sleep(0.5)
        return (b"", b"")

    mock_proc.communicate = slow_communicate

    b_dir = get_backup_dir()

    with patch("scripts.backup_db.asyncio.create_subprocess_exec", return_value=mock_proc):
        async with AsyncClient(app=app, base_url="http://test") as ac:
            res = await ac.post("/api/admin/backup", headers=admin_headers)

    assert res.status_code == 504
    assert "Превышено время ожидания" in res.json()["detail"]
    assert mock_proc.kill.called
    assert mock_proc.wait.called

    # Ensure no leftover temporary files in backup dir
    remaining_files = list(b_dir.iterdir())
    assert len(remaining_files) == 0
