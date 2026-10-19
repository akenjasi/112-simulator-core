"""Synthetic generation contract; no inference or working database is used.

Unlike catalog mirrors, the collision has different UUIDs and identical content.
The control retains distinct cards sharing a plot; exhaustion must end honestly.
"""

import json
import uuid

import pytest
from sqlalchemy import select

from backend.api import router_tickets
from backend.models.domain_02 import GeneratedTicket, ScenarioTicket
from backend.schemas.generator import ClassifierRow, TicketData


def content_fingerprint(ticket):
    """Identity and sequence numbers do not make an exercise different."""
    return json.dumps(
        {
            "plot": ticket.plot,
            "factoids": ticket.factoids,
            "ground_truth": ticket.ground_truth,
            "etalon_services": ticket.etalon_services,
            "complexity": ticket.complexity,
        },
        ensure_ascii=False,
        sort_keys=True,
    )


@pytest.mark.parametrize("prefix", ["/api/tickets", "/api/v1/tickets"])
@pytest.mark.parametrize("collision", [False, True], ids=["same-plot-different-card", "identical-content-new-uuid"])
async def test_generation_batch_contains_two_distinct_exercises(
    prefix, collision, teacher_auth_client, db_session, monkeypatch
):
    category = f"tester-generation-{uuid.uuid4()}"
    houses = iter(["1", "1", "2"] if collision else ["1", "2"])
    generated = []

    def synthetic_generate(**kwargs):
        assert kwargs["count"] == 1
        house = next(houses)
        candidate = TicketData(
            complexity=1,
            plot="Поступило сообщение о происшествии.",
            factoids={"situation_1": "Поступило сообщение о происшествии."},
            ground_truth={
                "fio": "Тестовый Заявитель",
                "phone": "+79990000000",
                "street": "Тестовая",
                "house": house,
            },
            etalon_services=["01 Пожарные"],
        )
        generated.append(candidate)
        return [candidate]

    monkeypatch.setattr(router_tickets, "generate_tickets", synthetic_generate)
    monkeypatch.setattr(
        router_tickets,
        "resolve_classifier_row",
        lambda **kwargs: ClassifierRow(code="01.01", incident_name="Тестовый пожар", services=["01 Пожарные"]),
    )

    response = await teacher_auth_client.post(f"{prefix}/generate", json={"category": category, "count": 2})
    assert response.status_code == 202

    rows = list((await db_session.execute(select(GeneratedTicket).where(GeneratedTicket.category == category))).scalars())
    assert len(rows) == 2, "The requested batch size counts accepted distinct exercises"
    assert len({row.id for row in rows}) == 2
    assert len({content_fingerprint(row) for row in rows}) == 2, (
        "Different UUIDs with identical plot, facts, answer and services must not both be saved in one batch"
    )
    assert len(generated) == (3 if collision else 2), "Retry a collision, retain distinct cards sharing a plot"

    # The two storage representations of each accepted exercise are intentional.
    mirrors = list((await db_session.execute(select(ScenarioTicket).where(ScenarioTicket.category == category))).scalars())
    assert {row.scenario_id for row in mirrors} == {row.id for row in rows}
    listed = await teacher_auth_client.get(prefix, params={"category": category})
    assert listed.status_code == 200
    assert sorted(item["id"] for item in listed.json()) == sorted(row.id for row in rows)


async def test_exhausted_unique_batch_reports_partial_result_and_stops(teacher_auth_client, db_session, monkeypatch):
    category = f"tester-exhausted-{uuid.uuid4()}"
    calls = []

    def generate_same_content(**kwargs):
        calls.append(1)
        return [TicketData(complexity=1, plot="Один учебный пожар", factoids={},
                           ground_truth={"house": "1"}, etalon_services=["01 Пожарные"])]

    monkeypatch.setattr(router_tickets, "generate_tickets", generate_same_content)
    monkeypatch.setattr(router_tickets, "resolve_classifier_row", lambda **kwargs:
                        ClassifierRow(code="01.01", incident_name="Пожар", services=["01 Пожарные"]))
    accepted = await teacher_auth_client.post("/api/v1/tickets/generate", json={"category": category, "count": 2})
    assert accepted.status_code == 202
    job_id = accepted.json()["generation_id"]
    result = await teacher_auth_client.get("/api/v1/tickets/status", params={"generation_id": job_id})
    assert result.status_code == 200
    assert result.json()["status"] == "failed"
    assert result.json()["error_code"] == "UNIQUE_TICKETS_EXHAUSTED"
    assert result.json()["generated_count"] == 1
    assert result.json()["requested_count"] == 2
    assert result.json()["is_generating"] is False
    assert len(calls) == 11
    rows = list((await db_session.scalars(select(GeneratedTicket).where(GeneratedTicket.category == category))).all())
    assert len(rows) == 1
