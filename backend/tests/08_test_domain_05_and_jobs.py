import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.base import Base
from backend.database import engine

@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_domain_05_and_jobs_creation():
    from backend.models.domain_05 import BricksMatrixRef, ImportJob
    from backend.models.domain_01 import User
    from backend.models.domain_02 import ScenarioTicket
    
    user = User(username="admin", password_hash="hash", role="ADMIN")
    scenario = ScenarioTicket()
    
    bricks = BricksMatrixRef(
        ticket_id=scenario.scenario_id,
        bricks_file="path/to/bricks.json"
    )
    
    job = ImportJob(
        imported_by=user.user_id,
        filename="scenarios.csv",
        status="running"
    )
    
    from backend.database import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        session.add_all([user, scenario, bricks, job])
        await session.commit()

        await session.refresh(bricks)
        assert bricks.total_bricks == 0
        assert bricks.tts_compiled is False

        await session.refresh(job)
        assert job.imported_count == 0
        assert job.errors == []

