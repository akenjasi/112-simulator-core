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
    from backend.models.domain_02 import ScenarioTicket
    from backend.models.domain_03 import Assignment, ExamSession
    from backend.database import AsyncSessionLocal
    
    async with AsyncSessionLocal() as session:
        t = User(username="t", password_hash="h", role="TEACHER")
        s = ScenarioTicket()
        session.add_all([t, s])
        await session.flush()
        
        a = Assignment(
            scenario_id=s.scenario_id,
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
            cadet_id=t.user_id,
            status="active"
        )
        session.add(e)
        await session.commit()
        await session.refresh(e)
        yield e.session_id
        
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_session_message_ai(init_db, monkeypatch):
    session_id = init_db
    
    # Mock RuntimeRouter to not load llama weights
    class MockRouter:
        def __init__(self, *args, **kwargs):
            pass
        def process_message(self, message, **kwargs):
            return {"reply_text": "Mock AI response", "audio_id": "mock_123"}
            
    import backend.core.runtime_router
    monkeypatch.setattr(backend.core.runtime_router, "RuntimeRouter", MockRouter)
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.post(f"/api/v2/sessions/{session_id}/message", json={
            "text": "Система-112, слушаю вас."
        })
        assert res.status_code == 200
        data = res.json()
        assert data["reply"] == "Mock AI response"
        assert data["audio_id"] == "mock_123"
        
        state_res = await ac.get(f"/api/v2/sessions/{session_id}")
        log = state_res.json()["dialogue_log"]
        assert len(log) >= 2
        assert log[0]["text"] == "Система-112, слушаю вас."
        assert log[1]["text"] == "Mock AI response"
