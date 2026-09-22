import pytest
from httpx import AsyncClient
from backend.main import app
@pytest.mark.asyncio
async def test_cors_headers():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        res = await ac.options("/api/health", headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET"
        })
        assert res.status_code == 200
        assert "access-control-allow-origin" in res.headers
