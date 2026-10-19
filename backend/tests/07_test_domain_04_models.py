import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.base import Base
from backend.database import engine
from sqlalchemy.exc import IntegrityError
import datetime

@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_domain_04_models_creation():
    from backend.models.domain_04 import IncidentCard, EvaluationResult, SessionReport
    from backend.models.domain_01 import User, StudentGroup
    
    # Create dependencies
    user = User(username="eval_user", password_hash="hash", role="TEACHER")
    group = StudentGroup(group_name="Test Group")
    
    # IncidentCard
    incident_card = IncidentCard(
        operator_id=user.user_id,
        card_origin="ai_generated",
        status="open"
    )
    
    # EvaluationResult
    eval_result = EvaluationResult(
        card_id=incident_card.card_id,
        expert_modified_by=user.user_id
    )
    
    # SessionReport
    session_report = SessionReport(
        group_id=group.group_id,
        teacher_id=user.user_id,
        session_type="CALL_SIMULATION"
    )
    
    from backend.database import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        session.add_all([user, group, incident_card, eval_result, session_report])
        await session.commit()

        await session.refresh(incident_card)
        assert incident_card.filled_data == {}
        assert incident_card.status == "open"

        await session.refresh(eval_result)
        assert eval_result.scores == {}
        assert eval_result.errors_list == []

        await session.refresh(session_report)
        assert session_report.summary == {}
        assert session_report.is_attestation is False

