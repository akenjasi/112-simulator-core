"""The catalog counts logical tickets, including tickets stored in both formats."""

from datetime import datetime, timedelta, timezone
import uuid

import pytest

from backend.api import router_tickets
from backend.models.domain_02 import GeneratedTicket, ScenarioTicket
from backend.schemas.generator import ClassifierRow, TicketData


def scenario(ticket_id, category, *, complexity=1, created_at=None):
    return ScenarioTicket(
        scenario_id=ticket_id,
        category=category,
        title="Сценарий",
        complexity=complexity,
        settings={"category": category, "subcategory": "Сценарий", "complexity": complexity, "plot": "Тест"},
        workflow_state={"status": "UNDER_REVIEW"},
        **({"created_at": created_at} if created_at else {}),
    )


@pytest.mark.parametrize("prefix", ["/api/tickets", "/api/v1/tickets"])
async def test_generated_batch_appears_once_in_catalog_and_counts(
    prefix, teacher_auth_client, db_session, monkeypatch
):
    category = f"catalog-{uuid.uuid4()}"
    generated_ids = []

    def generate_one(**kwargs):
        ticket = TicketData(
            complexity=1,
            plot=f"Учебное происшествие {len(generated_ids) + 1}",
            etalon_services=["01"],
        )
        generated_ids.append(ticket.ticket_id)
        return [ticket]


    monkeypatch.setattr(router_tickets, "generate_tickets", generate_one)
    monkeypatch.setattr(
        router_tickets,
        "resolve_classifier_row",
        lambda **kwargs: ClassifierRow(code="01.01", incident_name="Сценарий", services=["01"]),
    )

    created = await teacher_auth_client.post(f"{prefix}/generate", json={"category": category, "count": 2})
    assert created.status_code == 202
    assert len(generated_ids) == 2

    listed = await teacher_auth_client.get(prefix, params={"category": category})
    assert listed.status_code == 200
    assert sorted(ticket["id"] for ticket in listed.json()) == sorted(generated_ids)

    counts = await teacher_auth_client.get(f"{prefix}/counts")
    counted = next(item for item in counts.json() if item["category"] == category)
    assert counted == {"category": category, "total": 2, "subcategories": {"Сценарий": 2}}

    # Both representations are still required by exercises and must be preserved.
    for ticket_id in generated_ids:
        assert await db_session.get(GeneratedTicket, ticket_id) is not None
        assert await db_session.get(ScenarioTicket, ticket_id) is not None


async def test_mirror_cannot_bypass_canonical_filters_or_soft_deletion(teacher_auth_client, db_session):
    category = f"catalog-{uuid.uuid4()}"
    active_id, deleted_id, legacy_id = [str(uuid.uuid4()) for _ in range(3)]
    db_session.add_all([
        GeneratedTicket(id=active_id, category=category, subcategory="Сценарий", complexity=2, plot="Тест"),
        scenario(active_id, category, complexity=1),
        GeneratedTicket(id=deleted_id, category=category, subcategory="Сценарий", complexity=1, plot="Тест", is_deleted=True),
        scenario(deleted_id, category),
        scenario(legacy_id, category),
    ])
    await db_session.commit()

    listed = await teacher_auth_client.get("/api/tickets", params={"category": category, "complexity": 1})
    assert [ticket["id"] for ticket in listed.json()] == [legacy_id]

    with_deleted = await teacher_auth_client.get("/api/tickets", params={"category": category, "include_deleted": True})
    assert sorted(ticket["id"] for ticket in with_deleted.json()) == sorted([active_id, deleted_id, legacy_id])

    counted = await teacher_auth_client.get("/api/tickets/counts", params={"complexity": 1})
    assert next(item for item in counted.json() if item["category"] == category)["total"] == 1


async def test_catalog_sorts_and_limits_after_merging_sources(teacher_auth_client, db_session):
    category = f"catalog-{uuid.uuid4()}"
    now = datetime.now(timezone.utc)
    older_id, newer_id = str(uuid.uuid4()), str(uuid.uuid4())
    db_session.add_all([
        GeneratedTicket(id=older_id, category=category, complexity=1, plot="Тест", created_at=now - timedelta(days=1)),
        scenario(older_id, category, created_at=now),
        scenario(newer_id, category, created_at=now - timedelta(hours=1)),
    ])
    await db_session.commit()

    listed = await teacher_auth_client.get("/api/tickets", params={"category": category, "limit": 1})
    assert listed.status_code == 200
    assert [ticket["id"] for ticket in listed.json()] == [newer_id]

    # Identical text with different identities is legitimate, so retain both.
    all_tickets = await teacher_auth_client.get("/api/tickets", params={"category": category})
    assert [ticket["id"] for ticket in all_tickets.json()] == [newer_id, older_id]
