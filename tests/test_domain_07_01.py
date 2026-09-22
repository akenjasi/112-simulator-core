import pytest
import uuid
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

@pytest.mark.asyncio
async def test_get_db_initialization():
    from backend.database import get_db, engine
    from backend.models.base import Base
    
    # Init tables for memory DB
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async for session in get_db():
        assert isinstance(session, AsyncSession)
        res = await session.execute(text("SELECT 1"))
        assert res.scalar() == 1

@pytest.mark.asyncio
async def test_user_role_check_constraint():
    from backend.database import engine
    from backend.models.base import Base
    from backend.models.domain_01 import User
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
        
    async with AsyncSession(engine) as session:
        user = User(
            username="invalid_role_user",
            password_hash="hash",
            role="INVALID_ROLE"
        )
        session.add(user)
        with pytest.raises(IntegrityError):
            await session.commit()

@pytest.mark.asyncio
async def test_user_id_generation():
    from backend.database import engine
    from backend.models.base import Base
    from backend.models.domain_01 import User
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
        
    user = User(
        username="auto_id_user",
        password_hash="hash",
        role="CADET"
    )
    # Check generation on python level before flush
    assert user.user_id is not None

    async with AsyncSession(engine) as session:
        session.add(user)
        await session.commit()
        await session.refresh(user)
        
    assert user.user_id is not None

@pytest.mark.asyncio
async def test_json_serialization():
    from backend.database import engine
    from backend.models.base import Base
    from backend.models.domain_01 import User, StudentGroup
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    group_id_str = str(uuid.uuid4())
    cadet_id_str = str(uuid.uuid4())

    async with AsyncSession(engine) as session:
        user = User(
            username="json_user",
            password_hash="hash",
            role="CADET",
            group_ids=[group_id_str]
        )
        group = StudentGroup(
            group_name="Test Group",
            cadet_ids=[cadet_id_str]
        )
        session.add(user)
        session.add(group)
        await session.commit()
        
        await session.refresh(user)
        await session.refresh(group)
        
        assert isinstance(user.group_ids, list)
        assert user.group_ids[0] == group_id_str
        
        assert isinstance(group.cadet_ids, list)
        assert group.cadet_ids[0] == cadet_id_str

@pytest.mark.asyncio
async def test_user_action_log():
    from backend.database import engine
    from backend.models.base import Base
    from backend.models.domain_01 import User, UserActionLog
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSession(engine) as session:
        user = User(
            username="log_user",
            password_hash="hash",
            role="ADMIN"
        )
        session.add(user)
        await session.flush()
        
        log = UserActionLog(
            user_id=user.user_id,
            action="TEST_ACTION",
            details="Some details"
        )
        session.add(log)
        await session.commit()
        await session.refresh(log)
        
        assert log.log_id is not None
        assert log.user_id == user.user_id
        assert log.action == "TEST_ACTION"
