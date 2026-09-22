import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import os

@pytest.mark.asyncio
async def test_database_manager():
    from backend.database import get_db, engine, AsyncSessionLocal
    
    # Engine is created
    assert engine.name in ["sqlite", "postgresql"]
    
    # Session is working
    gen = get_db()
    session = await anext(gen)
    
    assert isinstance(session, AsyncSession)
    res = await session.execute(text("SELECT 1"))
    assert res.scalar() == 1
    
    with pytest.raises(StopAsyncIteration):
        await anext(gen)
