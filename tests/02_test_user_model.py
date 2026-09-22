import pytest
from sqlalchemy.exc import IntegrityError
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
async def test_user_creation_and_defaults():
    from backend.models.domain_01 import User
    
    user = User(username="test", password_hash="hash", role="CADET")
    assert user.user_id is not None
    assert isinstance(user.user_id, str)
    assert len(user.user_id) == 36
    
    from backend.database import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        session.add(user)
        await session.commit()
        await session.refresh(user)

        assert user.is_active is True
        assert user.failed_login_attempts == 0
        assert user.group_ids == []


@pytest.mark.asyncio
async def test_user_role_check():
    from backend.models.domain_01 import User
    
    from backend.database import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        user = User(username="hacker", password_hash="hash", role="HACKER")
        session.add(user)
        with pytest.raises(IntegrityError):
            await session.commit()

