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
    from backend.models.domain_03 import Assignment, ExamSession, ScenarioTicket
    from backend.database import AsyncSessionLocal
    
    async with AsyncSessionLocal() as session:
        t = User(username="eval_test", password_hash="h", role="STUDENT")
        session.add(t)
        await session.flush()
        
        ticket = ScenarioTicket(
            title="Test Fire",
            category="Fire",
            complexity=1,
            content={"etalon_services": ["101", "103"], "address": "Ясный проезд", "fabula": "пожар на балконе"}
        )
        session.add(ticket)
        await session.flush()
        
        e = ExamSession(
            session_type="CALL_SIMULATION",
            cadet_id=t.user_id,
            status="active",
            ticket_id=ticket.scenario_id
        )
        session.add(e)
        await session.commit()
        await session.refresh(e)
        yield e.session_id, t.user_id, ticket.scenario_id
        
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_evaluate_perfect_score(init_db, auth_client):
    session_id, user_id, ticket_id = init_db
    
    payload = {
        "ticket_id": ticket_id,
        "time_taken_seconds": 45,
        "caller_name": "Иван",
        "caller_status": "очевидец",
        "address_string": "Ясный проезд 10",
        "incident_description": "пожар на балконе",
        "assigned_services": ["101", "103"],
        "is_refusal_03": False
    }
    
    res = await auth_client.post(f"/api/v1/sessions/{session_id}/evaluate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "evaluation_id" in data
    assert data["scores"]["total"] == 100
    assert data["metrics"]["time_taken_seconds"] == 45
    assert len(data["errors_list"]) == 0

@pytest.mark.asyncio
async def test_evaluate_time_penalty(init_db, auth_client):
    session_id, user_id, ticket_id = init_db
    
    payload = {
        "ticket_id": ticket_id,
        "time_taken_seconds": 105, # > 90 seconds
        "caller_name": "Иван",
        "caller_status": "очевидец",
        "address_string": "Ясный проезд 10",
        "incident_description": "пожар",
        "assigned_services": ["101", "103"],
        "is_refusal_03": False
    }
    
    res = await auth_client.post(f"/api/v1/sessions/{session_id}/evaluate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["scores"]["total"] < 100
    assert any("секунд" in e for e in data["errors_list"])

@pytest.mark.asyncio
async def test_evaluate_missing_service(init_db, auth_client):
    session_id, user_id, ticket_id = init_db
    
    payload = {
        "ticket_id": ticket_id,
        "time_taken_seconds": 45,
        "caller_name": "Иван",
        "caller_status": "очевидец",
        "address_string": "Ясный",
        "incident_description": "пожар",
        "assigned_services": ["101"], # missing 103
        "is_refusal_03": False
    }
    
    res = await auth_client.post(f"/api/v1/sessions/{session_id}/evaluate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["scores"]["total"] <= 70
    assert any("Службы" in e or "103" in e for e in data["errors_list"])
