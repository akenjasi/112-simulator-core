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
async def test_domain_03_models_creation():
    from backend.models.domain_03 import Assignment, ExamSession, CardActionSession, ReferenceMaterial
    from backend.models.domain_01 import User
    from backend.models.domain_02 import ScenarioTicket
    
    # Create dependencies
    user = User(username="teacher1", password_hash="hash", role="TEACHER")
    scenario = ScenarioTicket()
    
    now = datetime.datetime.now(datetime.timezone.utc)
    
    # Assignment
    assignment = Assignment(
        scenario_id=scenario.scenario_id,
        session_type="CALL_SIMULATION",
        mode="TRAINING",
        assigned_by=user.user_id,
        available_from=now,
        deadline=now
    )
    
    # ExamSession
    exam_session = ExamSession(
        session_type="CALL_SIMULATION",
        assignment_id=assignment.assignment_id,
        cadet_id=user.user_id,
        status="pending"
    )
    
    # CardActionSession
    card_session = CardActionSession(
        assignment_id=assignment.assignment_id,
        cadet_id=user.user_id,
        status="pending"
    )
    
    # ReferenceMaterial
    ref = ReferenceMaterial(
        title="Protocol",
        content_html="<p>Test</p>",
        created_by=user.user_id
    )
    
    from backend.database import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        session.add_all([user, scenario, assignment, exam_session, card_session, ref])
        await session.commit()

        await session.refresh(assignment)
        assert assignment.assignment_id is not None
        assert assignment.card_pool_ids == []

        await session.refresh(exam_session)
        assert exam_session.browser_call == {}

        await session.refresh(card_session)
        assert card_session.card_queue == []

        await session.refresh(ref)
        assert ref.tags == []
