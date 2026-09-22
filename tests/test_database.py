import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from backend.models.base import Base
from backend.models.domain_03 import SessionStateModel

# Тестовая БД в памяти
engine = create_async_engine("sqlite+aiosqlite:///:memory:")
TestingSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

@pytest.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

@pytest.mark.asyncio
async def test_db_session_state_creation():
    async with TestingSessionLocal() as session:
        # Создаем запись
        new_state = SessionStateModel(session_id="sess-123", panic_level=50, asked_intents="address,situation")
        session.add(new_state)
        await session.commit()
        
        # Читаем запись
        from sqlalchemy import select
        result = await session.execute(select(SessionStateModel).where(SessionStateModel.session_id == "sess-123"))
        saved_state = result.scalar_one_or_none()
        
        assert saved_state is not None
        assert saved_state.panic_level == 50
        assert "address" in saved_state.asked_intents
