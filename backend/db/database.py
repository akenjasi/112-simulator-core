"""Deprecated import path; use backend.database. Never create another DB."""
from backend.database import DATABASE_URL, AsyncSessionLocal, engine, get_db

async_session_maker = AsyncSessionLocal
__all__ = ["DATABASE_URL", "AsyncSessionLocal", "async_session_maker", "engine", "get_db"]
