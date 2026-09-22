import pytest
from backend.models.base import Base
from backend.database import engine, AsyncSessionLocal


@pytest.fixture(autouse=True)
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_action_log_creation():
    from backend.models.domain_01 import User, UserActionLog

    user = User(username="admin", password_hash="hash", role="ADMIN")
    log = UserActionLog(user_id=user.user_id, action="LOGIN", role="ADMIN")

    assert log.log_id is not None
    assert len(log.log_id) == 36

    async with AsyncSessionLocal() as session:
        session.add(user)
        session.add(log)
        await session.commit()
        await session.refresh(log)

        assert log.action == "LOGIN"
        assert log.user_id == user.user_id
