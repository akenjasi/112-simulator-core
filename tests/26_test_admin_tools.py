import pytest
from httpx import AsyncClient
from backend.main import app
from backend.database import engine, AsyncSessionLocal
from backend.models.base import Base
from backend.models.domain_01 import User
from backend.core.security import hash_password, create_access_token
from sqlalchemy import select


@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        admin = User(username="admin_tools", password_hash=hash_password("admin_pass"), role="ADMIN")
        session.add(admin)
        await session.commit()

    yield

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def get_admin_token() -> str:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User.user_id).where(User.username == 'admin_tools'))
        user_id = str(result.scalar_one())
    return create_access_token(subject=user_id, role="ADMIN")


@pytest.mark.asyncio
async def test_healthcheck_endpoint():
    token = await get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.get("/api/admin/healthcheck", headers=headers)
        
    assert res.status_code == 200
    data = res.json()
    assert "cpu_percent" in data
    assert "ram_percent" in data
    assert "db_status" in data
    assert data["db_status"] == "ok"


@pytest.mark.asyncio
async def test_backup_endpoint():
    token = await get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.post("/api/admin/backup", headers=headers)
        
    assert res.status_code == 200
    data = res.json()
    assert "backup_file" in data
    assert "status" in data


@pytest.mark.asyncio
async def test_admin_tools_unauthorized():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res1 = await ac.get("/api/admin/healthcheck")
        res2 = await ac.post("/api/admin/backup")
    assert res1.status_code == 401
    assert res2.status_code == 401


@pytest.mark.asyncio
async def test_admin_tools_forbidden_for_non_admin():
    async with AsyncSessionLocal() as session:
        cadet = User(username="cadet_tools", password_hash=hash_password("cadet_pass"), role="CADET")
        session.add(cadet)
        await session.commit()
        await session.refresh(cadet)
        token = create_access_token(subject=str(cadet.user_id), role="CADET")

    headers = {"Authorization": f"Bearer {token}"}
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res1 = await ac.get("/api/admin/healthcheck", headers=headers)
        res2 = await ac.post("/api/admin/backup", headers=headers)

    assert res1.status_code == 403
    assert res2.status_code == 403


@pytest.mark.asyncio
async def test_backup_postgres_handling(monkeypatch):
    from unittest.mock import AsyncMock, patch, MagicMock
    from scripts.backup_db import create_backup, create_backup_async

    # Mock subprocess.run for sync
    with patch("scripts.backup_db.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        file_path = create_backup("postgresql+asyncpg://user:pass@localhost:5432/testdb")
        assert file_path.endswith(".sql")
        assert "data/backups" in file_path
        mock_run.assert_called_once()
        args = mock_run.call_args[0][0]
        assert args[0] == "pg_dump"
        assert args[1] == "postgresql://user:pass@localhost:5432/testdb"

    # Mock asyncio.create_subprocess_exec for async
    mock_proc = AsyncMock()
    mock_proc.communicate.return_value = (b"", b"")
    mock_proc.returncode = 0
    with patch("scripts.backup_db.asyncio.create_subprocess_exec", return_value=mock_proc) as mock_exec:
        file_path_async = await create_backup_async("postgresql+asyncpg://user:pass@localhost:5432/testdb")
        assert file_path_async.endswith(".sql")
        mock_exec.assert_called_once()


