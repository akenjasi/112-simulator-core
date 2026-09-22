import pytest
import datetime
from httpx import AsyncClient
from backend.main import app
from backend.database import engine
from backend.models.base import Base

@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    from backend.models.domain_01 import User
    from backend.models.domain_03 import Assignment, ExamSession
    from backend.database import AsyncSessionLocal
    
    async with AsyncSessionLocal() as session:
        t = User(username="t", password_hash="h", role="TEACHER")
        c = User(username="c", password_hash="h", role="CADET")
        session.add_all([t, c])
        await session.flush()
        
        a = Assignment(
            session_type="CALL_SIMULATION",
            assigned_by=t.user_id,
            available_from=datetime.datetime.now(datetime.timezone.utc),
            deadline=datetime.datetime.now(datetime.timezone.utc)
        )
        session.add(a)
        await session.flush()
        
        e = ExamSession(
            session_type="CALL_SIMULATION",
            assignment_id=a.assignment_id,
            cadet_id=c.user_id,
            status="active"
        )
        session.add(e)
        await session.commit()
        await session.refresh(e)
        yield e.session_id
        
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_get_session_state(init_db):
    session_id = init_db
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.get(f"/api/v2/sessions/{session_id}")
        assert res.status_code == 200
        data = res.json()
        assert data["session_id"] == session_id
        assert data["status"] == "active"
        assert "dialogue_log" in data
