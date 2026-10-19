import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from backend.main import app
from backend.models.domain_02 import GeneratedTicket
from backend.database import get_db

@pytest.mark.asyncio
async def test_scenario_soft_delete(db_session: AsyncSession):
    """
    Test that soft deleting a scenario sets its is_deleted flag and hides it from the default GET list.
    """
    # Create a ticket directly in DB for testing
    ticket = GeneratedTicket(
        id=str(uuid.uuid4()),
        category="Test Cat",
        subcategory="Test Sub",
        complexity=1,
        plot="Test plot",
    )
    db_session.add(ticket)
    await db_session.commit()
    
    async with AsyncClient(app=app, base_url="http://test") as ac:
        # 1. Verify it's in the list
        response = await ac.get("/api/tickets")
        assert response.status_code == 200
        data = response.json()
        assert any(t["id"] == "test-soft-delete-123" for t in data), "Ticket should be in the list"
        
        # 2. Patch the ticket
        patch_res = await ac.patch("/api/tickets/test-soft-delete-123", json={"complexity": 2})
        assert patch_res.status_code == 200
        assert patch_res.json()["complexity"] == 2
        
        # 3. Delete it
        del_res = await ac.delete("/api/tickets/test-soft-delete-123")
        assert del_res.status_code == 200
        
        # 4. Verify it's hidden from default GET list
        response = await ac.get("/api/tickets")
        assert response.status_code == 200
        data = response.json()
        assert not any(t["id"] == "test-soft-delete-123" for t in data), "Deleted ticket should be hidden by default"
        
        # 5. Verify it's returned if include_deleted=true
        response_inc = await ac.get("/api/tickets?include_deleted=true")
        assert response_inc.status_code == 200
        data_inc = response_inc.json()
        assert any(t["id"] == "test-soft-delete-123" for t in data_inc), "Deleted ticket should be present when include_deleted=true"
