import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from backend.core.integrity import (
    MANDATORY_ENTRYPOINTS,
    generate_manifest,
    hash_file_sha256,
    is_path_in_scope,
    scan_scope_files,
    verify_integrity,
)
from backend.core.security import create_access_token, hash_password
from backend.database import AsyncSessionLocal, engine
from backend.main import app
from backend.models.base import Base
from backend.models.domain_01 import User, UserActionLog


@pytest.fixture(autouse=True)
async def init_db(tmp_path):
    # Production validation requires all entrypoints, including in small test trees.
    for relative_path in MANDATORY_ENTRYPOINTS:
        component = tmp_path / relative_path
        component.parent.mkdir(parents=True, exist_ok=True)
        component.write_text("test component", encoding="utf-8")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        admin = User(
            username="admin_integrity",
            password_hash=hash_password("admin_pass"),
            role="ADMIN",
        )
        teacher = User(
            username="teacher_integrity",
            password_hash=hash_password("teacher_pass"),
            role="TEACHER",
        )
        session.add_all([admin, teacher])
        await session.commit()

    yield

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def get_token_for(username: str, role: str) -> str:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User.user_id).where(User.username == username))
        user_id = str(result.scalar_one())
    return create_access_token(subject=user_id, role=role)


# ─── Unit Tests for Integrity Core Module ────────────────────────────────────

def test_hash_file_sha256(tmp_path):
    f = tmp_path / "sample.txt"
    content = b"A" * 70000  # Exceeds 64 KB chunk size to test chunking
    f.write_bytes(content)
    expected_hash = hashlib.sha256(content).hexdigest()
    assert hash_file_sha256(f) == expected_hash


def test_is_path_in_scope():
    # Included
    assert is_path_in_scope("backend/main.py") is True
    assert is_path_in_scope("backend/api/router_admin.py") is True
    assert is_path_in_scope("backend/bin/transcribe-cli") is True
    assert is_path_in_scope("backend/bin/libggml.so") is True
    assert is_path_in_scope("backend/bin/libggml.so.0") is True
    assert is_path_in_scope("backend/core/qwen_tts/qwen-tts") is True
    assert is_path_in_scope("docker/scripts/init.sh") is True
    assert is_path_in_scope("backend/core/backups.py") is True

    # Excluded
    assert is_path_in_scope("backend/__pycache__/main.cpython-311.pyc") is False
    assert is_path_in_scope("backend/main.pyc") is False
    assert is_path_in_scope("backend_manifest.json") is False
    assert is_path_in_scope("data/112_simulator.db") is False
    assert is_path_in_scope("models/whisper/model.bin") is False
    assert is_path_in_scope(".git/config") is False
    assert is_path_in_scope(".pytest_cache/v/cache/nodeids") is False
    assert is_path_in_scope("frontend/package.json") is False


def test_generate_and_verify_clean_tree(tmp_path):
    # Setup mock tree
    (tmp_path / "backend").mkdir(exist_ok=True)
    (tmp_path / "backend" / "main.py").write_text("print('hello')", encoding="utf-8")
    (tmp_path / "docker/scripts").mkdir(parents=True, exist_ok=True)
    (tmp_path / "docker/scripts" / "init.sh").write_text("#!/bin/sh\necho init", encoding="utf-8")
    (tmp_path / "backend" / "bin").mkdir(exist_ok=True)
    (tmp_path / "backend" / "bin" / "libggml.so").write_bytes(b"binary_lib_bytes")
    # Relative symlink
    os.symlink("libggml.so", tmp_path / "backend" / "bin" / "libggml.so.0")

    manifest_path = tmp_path / "backend_manifest.json"
    manifest = generate_manifest(tmp_path, manifest_path)
    assert len(manifest["files"]) == len(MANDATORY_ENTRYPOINTS) + 2

    # Verify
    res = verify_integrity(tmp_path, manifest_path)
    assert res["status"] == "ok"
    assert res["checked_files_count"] == len(MANDATORY_ENTRYPOINTS) + 2
    assert len(res["deviations"]) == 0
    assert res["manifest_digest"] is not None


def test_detect_modified_file(tmp_path):
    (tmp_path / "backend").mkdir(exist_ok=True)
    f = tmp_path / "backend" / "main.py"
    f.write_text("print('original')", encoding="utf-8")

    manifest_path = tmp_path / "backend_manifest.json"
    generate_manifest(tmp_path, manifest_path)

    # Modify file
    f.write_text("print('tampered')", encoding="utf-8")

    res = verify_integrity(tmp_path, manifest_path)
    assert res["status"] == "deviation"
    assert len(res["deviations"]) == 1
    dev = res["deviations"][0]
    assert dev["path"] == "backend/main.py"
    assert dev["reason"] == "modified"


def test_detect_missing_file(tmp_path):
    (tmp_path / "backend").mkdir(exist_ok=True)
    f = tmp_path / "backend" / "main.py"
    f.write_text("print('file')", encoding="utf-8")

    manifest_path = tmp_path / "backend_manifest.json"
    generate_manifest(tmp_path, manifest_path)

    # Delete file
    f.unlink()

    res = verify_integrity(tmp_path, manifest_path)
    assert res["status"] == "deviation"
    assert len(res["deviations"]) == 1
    assert res["deviations"][0]["reason"] == "missing"


def test_detect_unexpected_file(tmp_path):
    (tmp_path / "backend").mkdir(exist_ok=True)
    (tmp_path / "backend" / "main.py").write_text("print('orig')", encoding="utf-8")

    manifest_path = tmp_path / "backend_manifest.json"
    generate_manifest(tmp_path, manifest_path)

    # Add unexpected file in scope
    (tmp_path / "backend" / "backdoor.py").write_text("evil()", encoding="utf-8")

    res = verify_integrity(tmp_path, manifest_path)
    assert res["status"] == "deviation"
    assert any(d["path"] == "backend/backdoor.py" and d["reason"] == "unexpected" for d in res["deviations"])


def test_excluded_dirs_not_causing_deviations(tmp_path):
    (tmp_path / "backend").mkdir(exist_ok=True)
    (tmp_path / "backend" / "main.py").write_text("print('orig')", encoding="utf-8")
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "user_db.sqlite").write_bytes(b"initial_data")

    manifest_path = tmp_path / "backend_manifest.json"
    generate_manifest(tmp_path, manifest_path)

    # Mutate excluded directory
    (tmp_path / "data" / "user_db.sqlite").write_bytes(b"modified_data_at_runtime")
    (tmp_path / "data" / "new_upload.wav").write_bytes(b"audio")
    (tmp_path / "backend" / "__pycache__").mkdir()
    (tmp_path / "backend" / "__pycache__" / "main.cpython-311.pyc").write_bytes(b"bytecode")

    res = verify_integrity(tmp_path, manifest_path)
    assert res["status"] == "ok"
    assert len(res["deviations"]) == 0


def test_absolute_symlink_forbidden(tmp_path):
    (tmp_path / "backend" / "bin").mkdir(parents=True, exist_ok=True)
    target = tmp_path / "backend" / "bin" / "libggml.so"
    target.write_bytes(b"lib")
    link = tmp_path / "backend" / "bin" / "libggml.so.0"
    os.symlink(str(target.resolve()), link)

    manifest_path = tmp_path / "backend_manifest.json"
    with pytest.raises(ValueError, match="Absolute symlink forbidden"):
        generate_manifest(tmp_path, manifest_path)


def test_traversal_symlink_forbidden(tmp_path):
    (tmp_path / "backend" / "bin").mkdir(parents=True, exist_ok=True)
    link = tmp_path / "backend" / "bin" / "lib_escape.so"
    os.symlink("../../../../etc/passwd", link)

    manifest_path = tmp_path / "backend_manifest.json"
    with pytest.raises(ValueError, match="path traversal forbidden"):
        generate_manifest(tmp_path, manifest_path)


def test_corrupt_manifest_handling(tmp_path):
    manifest_path = tmp_path / "backend_manifest.json"
    manifest_path.write_text("{invalid json", encoding="utf-8")

    res = verify_integrity(tmp_path, manifest_path)
    assert res["status"] == "unavailable"
    assert "повреждён" in res["error"]


def test_missing_manifest_handling(tmp_path):
    non_existent = tmp_path / "missing.json"
    res = verify_integrity(tmp_path, non_existent)
    assert res["status"] == "unavailable"
    assert res["checked_files_count"] == 0
    assert "отсутствует" in res["error"]


# ─── API Integration Tests ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_api_integrity_check_unauthenticated():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.post("/api/admin/integrity/check")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_api_integrity_check_teacher_forbidden():
    teacher_token = await get_token_for("teacher_integrity", "TEACHER")
    headers = {"Authorization": f"Bearer {teacher_token}"}
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.post("/api/admin/integrity/check", headers=headers)
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_api_integrity_check_admin_success(tmp_path, monkeypatch):
    # Setup controlled mock root for this API test
    (tmp_path / "backend").mkdir(exist_ok=True)
    (tmp_path / "backend" / "main.py").write_text("print('test')", encoding="utf-8")
    manifest_path = tmp_path / "backend_manifest.json"
    generate_manifest(tmp_path, manifest_path)

    monkeypatch.setenv("APP_ROOT", str(tmp_path))
    monkeypatch.setenv("INTEGRITY_MANIFEST_PATH", str(manifest_path))

    admin_token = await get_token_for("admin_integrity", "ADMIN")
    headers = {"Authorization": f"Bearer {admin_token}"}

    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.post("/api/admin/integrity/check", headers=headers)

    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["checked_files_count"] == len(MANDATORY_ENTRYPOINTS)
    assert data["deviations"] == []
    assert data["manifest_digest"] is not None

    # Check that audit log was recorded
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(UserActionLog).where(UserActionLog.action == "INTEGRITY_CHECK_COMPLETED")
        )
        log = result.scalar_one_or_none()
        assert log is not None
        assert log.endpoint == "/api/admin/integrity/check"
        assert log.target_entity == "system_integrity"
        details = json.loads(log.details)
        assert details["status"] == "ok"
        assert details["checked_files_count"] == len(MANDATORY_ENTRYPOINTS)
