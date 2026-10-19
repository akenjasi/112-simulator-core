"""Regression checks for approval state consistency across ticket APIs."""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from backend.core.dds_cycle import build_incoming_card
from backend.core.security import create_access_token
from backend.database import AsyncSessionLocal
from backend.main import app
from backend.models.domain_01 import User
from backend.models.domain_02 import GeneratedTicket, ScenarioTicket
from backend.scripts.db.restore_tickets import restore_existing_tickets


@pytest.fixture
async def teacher():
    name = f"ticket_review_{uuid.uuid4().hex[:10]}"
    async with AsyncSessionLocal() as db:
        user = User(username=name, role="TEACHER", password_hash="unused", is_active=True)
        db.add(user)
        await db.commit()
        return user.user_id, "TEACHER"


async def request(method, path, identity, **kwargs):
    headers = {"Authorization": f"Bearer {create_access_token(*identity)}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=headers) as client:
        return await client.request(method, path, **kwargs)


@pytest.mark.asyncio
async def test_generated_ticket_status_is_reported_and_edit_requires_reapproval(teacher):
    ticket_id = f"review-{uuid.uuid4().hex[:10]}"
    async with AsyncSessionLocal() as db:
        db.add(GeneratedTicket(
            id=ticket_id,
            category="ДТП",
            subcategory="Проверка состояния",
            plot="Столкнулись автомобили на перекрестке.",
            status="APPROVED",
        ))
        await db.commit()

    fetched = await request("GET", f"/api/tickets/{ticket_id}", teacher)
    assert fetched.status_code == 200
    assert fetched.json()["status"] == "APPROVED"

    edited = await request("PATCH", f"/api/tickets/{ticket_id}", teacher, json={"plot": "Обновленное описание аварии."})
    assert edited.status_code == 200
    assert edited.json()["status"] == "UNDER_REVIEW"

    listed = await request("GET", "/api/tickets", teacher)
    row = next(row for row in listed.json() if row["ticket_id"] == ticket_id)
    assert row["status"] == "UNDER_REVIEW"


@pytest.mark.asyncio
async def test_dds_catalog_requires_approved_workflow(teacher):
    tag = uuid.uuid4().hex[:8]
    approved_id, review_id = f"approved-{tag}", f"review-{tag}"
    card = build_incoming_card(
        category="ДТП",
        subcategory="Столкновение",
        plot="Два автомобиля столкнулись у перекрестка.",
        etalon_services=["02 Полиция"],
        seq=8,
    )
    async with AsyncSessionLocal() as db:
        db.add_all([
            ScenarioTicket(scenario_id=approved_id, title="Столкновение", category="ДТП", content={"incoming_card": card}, settings={"category": "ДТП", "subcategory": "Столкновение", "complexity": 1}, workflow_state={"status": "APPROVED"}),
            ScenarioTicket(scenario_id=review_id, title="Столкновение", category="ДТП", content={"incoming_card": card}, settings={"category": "ДТП", "subcategory": "Столкновение", "complexity": 1}, workflow_state={"status": "UNDER_REVIEW"}),
            ScenarioTicket(scenario_id=f"legacy-{tag}", title="Столкновение", category="ДТП", content={"incoming_card": card}, settings={"category": "ДТП", "subcategory": "Столкновение", "complexity": 1}, workflow_state={"status": "active"}),
        ])
        await db.commit()

    catalog = await request("GET", "/api/dds/tickets", teacher)
    assert catalog.status_code == 200
    ids = {row["ticket_id"] for row in catalog.json()}
    assert approved_id in ids
    assert review_id not in ids
    assert f"legacy-{tag}" not in ids

    categories = await request("GET", "/api/dds/tickets/categories", teacher)
    assert categories.status_code == 200
    assert categories.json()


@pytest.mark.asyncio
async def test_restore_keeps_generated_status_aligned_with_draft_scenario():
    ticket_id = f"restore-review-{uuid.uuid4().hex[:10]}"
    async with AsyncSessionLocal() as db:
        db.add(GeneratedTicket(id=ticket_id, category="Общее", subcategory="Без сюжета", plot="", status="active"))
        db.add(ScenarioTicket(scenario_id=ticket_id, title="Без сюжета", category="Общее", content={}, settings={}, workflow_state={"status": "DRAFT"}))
        await db.commit()
        await restore_existing_tickets(db)
        saved = await db.get(GeneratedTicket, ticket_id)
        assert saved.status == "DRAFT"
