"""Independent acceptance checks added during Codex review.

Run only against a disposable test database; the fixture drops its tables.
"""
from datetime import datetime, timedelta, timezone

import pytest

from backend.database import AsyncSessionLocal, engine
from backend.models.base import Base
from backend.models.domain_01 import SystemErrorLog


@pytest.fixture(autouse=True)
async def isolated_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.parametrize("endpoint", [
    "/api/admin/audit-logs", "/api/admin/error-logs", "/api/admin/audit",
])
@pytest.mark.parametrize("query", ["limit=0", "limit=1001", "limit=-1", "offset=-1"])
async def test_all_log_routes_validate_pagination(auth_client, endpoint, query):
    response = await auth_client.get(f"{endpoint}?{query}")
    assert response.status_code == 422, (endpoint, query, response.text)


async def test_error_pagination_applies_after_inclusive_period_filter(auth_client):
    base = datetime(2026, 10, 1, tzinfo=timezone.utc)
    async with AsyncSessionLocal() as session:
        session.add_all([
            SystemErrorLog(id=f"review-{i}", error_message=f"error {i}",
                           timestamp=base + timedelta(hours=i))
            for i in range(6)
        ])
        await session.commit()
    params = {"from_at": "2026-10-01T04:00:00+03:00",
              "to_at": "2026-10-01T06:00:00+03:00", "limit": 2, "offset": 0}
    first = await auth_client.get("/api/admin/error-logs", params=params)
    assert first.status_code == 200
    assert [row["id"] for row in first.json()] == ["review-3", "review-2"]
    second = await auth_client.get("/api/admin/error-logs", params={**params, "offset": 2})
    assert second.status_code == 200
    assert [row["id"] for row in second.json()] == ["review-1"]
