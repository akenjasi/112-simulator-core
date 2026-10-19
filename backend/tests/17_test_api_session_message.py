import pytest
import datetime
from httpx import AsyncClient
from backend.main import app
from backend.database import engine
from backend.models.base import Base

@pytest.fixture(autouse=True)
async def init_db(teacher_id):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    from backend.models.domain_01 import User
    from backend.models.domain_03 import Assignment, ExamSession
    from backend.database import AsyncSessionLocal
    
    async with AsyncSessionLocal() as session:
        t = await session.get(User, teacher_id)
        session.add(t)
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
async def test_session_message(init_db, teacher_auth_client, monkeypatch):
    session_id = init_db
    from unittest.mock import Mock
    router = Mock()
    router.process_message.return_value = {"reply_text": "Тестовый ответ", "audio_id": None}
    monkeypatch.setattr("backend.core.runtime_router.RuntimeRouter", Mock(return_value=router))
    
    res = await teacher_auth_client.post(f"/api/v2/sessions/{session_id}/message", json={
        "text": "Система-112, слушаю вас."
    })
    assert res.status_code == 200
    data = res.json()
    assert "reply" in data
    
    # Check if it was appended to dialogue_log
    state_res = await teacher_auth_client.get(f"/api/v2/sessions/{session_id}")
    log = state_res.json()["dialogue_log"]
    assert len(log) >= 2 # Operator message + Bot reply
    assert log[0]["text"] == "Система-112, слушаю вас."
    assert log[0]["role"] == "OPERATOR"
    assert log[1]["role"] == "CALLER"

