import pytest
from sqlalchemy.ext.asyncio import AsyncSession
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
async def test_student_group_creation():
    from backend.models.domain_01 import User, StudentGroup

    teacher = User(username="teacher", password_hash="hash", role="TEACHER")
    group = StudentGroup(group_name="Group A", teacher_id=teacher.user_id)

    assert group.group_id is not None
    assert len(group.group_id) == 36

    # Use AsyncSessionLocal (expire_on_commit=False) instead of bare AsyncSession
    async with AsyncSessionLocal() as session:
        session.add(teacher)
        session.add(group)
        await session.commit()
        await session.refresh(group)

        assert group.cadet_ids == []
        assert group.is_active is True
        assert group.teacher_id == teacher.user_id
