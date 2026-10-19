import pytest
from httpx import AsyncClient
from backend.main import app
from backend.database import AsyncSessionLocal
from backend.models.domain_02 import GeneratedTicket
import uuid

@pytest.mark.asyncio
async def test_ticket_refine_endpoint():
    """
    Test that the POST /api/tickets/{id}/refine endpoint accepts a correction_comment 
    and returns a modified ticket.
    """
    ticket_id = f"test-ticket-{uuid.uuid4().hex[:8]}"
    
    # 1. Create a ticket in the DB
    async with AsyncSessionLocal() as session:
        ticket = GeneratedTicket(
            id=ticket_id,
            category="Test Category",
            subcategory="Test Sub",
            complexity=1,
            plot="Original plot.",
            sequence_number=1,
        )
        session.add(ticket)
        await session.commit()
        
    # 2. Make a POST request to /api/tickets/{ticket_id}/refine
    correction_comment = "Добавь крики на фоне"
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post(
            f"/api/tickets/{ticket_id}/refine",
            json={"correction_comment": correction_comment}
        )
        
    # 3. Verify response status is 200 and plot has changed
    assert response.status_code == 200
    data = response.json()
    assert correction_comment in data["plot"]
    assert data["plot"].startswith("Original plot.")
    assert "\n[ИИ-коррекция с учетом: Добавь крики на фоне]" in data["plot"]
    
    # Clean up
    async with AsyncSessionLocal() as session:
        ticket = await session.get(GeneratedTicket, ticket_id)
        if ticket:
            await session.delete(ticket)
            await session.commit()
