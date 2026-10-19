import pytest
import os
from sqlalchemy.ext.asyncio import create_async_engine

@pytest.mark.asyncio
async def test_postgres_engine_creation():
    """
    Test that the application can successfully parse and create an engine
    from a PostgreSQL async URL if provided in the environment.
    """
    test_url = "postgresql+asyncpg://fakeuser:fakepass@localhost:5432/fakedb"
    try:
        engine = create_async_engine(test_url, echo=False)
        assert engine.name == "postgresql"
    except Exception as e:
        pytest.fail(f"Failed to create Postgres engine: {e}")
