"""Tests for Worker 1: Scenarios, Tickets, and DDS Catalog.

Covers:
- Strict incoming_card construction and sanitize_incoming_card validation
- Separation of technical suitability and workflow approval status
- Ticket approval: POST /api/tickets/{id}/approve
- Soft delete / archiving: DELETE /api/tickets/{id} -> is_deleted=True, status='ARCHIVED'
- Substantial edit: PATCH /api/tickets/{id} -> status='UNDER_REVIEW', version_history updated
- Catalog categories & counts: GET /api/dds/tickets/categories
- Repeatable ticket restoration script
"""

import copy
import uuid
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from backend.core.dds_cycle import build_incoming_card, is_suitable_dds_ticket, sanitize_incoming_card
from backend.core.security import create_access_token
from backend.database import AsyncSessionLocal
from backend.main import app
from backend.models.domain_01 import User
from backend.models.domain_02 import GeneratedTicket, ScenarioTicket
from backend.scripts.db.restore_tickets import restore_existing_tickets


async def auth_req(method: str, path: str, user: tuple[str, str], **kwargs):
    headers = {"Authorization": f"Bearer {create_access_token(user[0], user[1])}"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=headers) as client:
        return await client.request(method, path, **kwargs)


@pytest.fixture
async def users_fixture():
    tag = uuid.uuid4().hex[:8]
    async with AsyncSessionLocal() as db:
        teacher = User(username=f"w1_t_{tag}", role="TEACHER", password_hash="unused", is_active=True)
        admin = User(username=f"w1_a_{tag}", role="ADMIN", password_hash="unused", is_active=True)
        cadet = User(username=f"w1_c_{tag}", role="CADET", password_hash="unused", is_active=True)
        db.add_all([teacher, admin, cadet])
        await db.commit()
        return {
            "teacher": (teacher.user_id, "TEACHER"),
            "admin": (admin.user_id, "ADMIN"),
            "cadet": (cadet.user_id, "CADET"),
        }


def test_build_incoming_card_strict_validation():
    """Verify build_incoming_card produces a card passing sanitize_incoming_card."""
    card = build_incoming_card(
        category="Пожары и задымления",
        subcategory="Возгорание на балконе",
        plot="Горит балкон на 5 этаже жилого дома",
        ground_truth={
            "phone": "+79161112233",
            "fio": "Петров Петр Петрович",
            "street": "Ленина",
            "house": "10",
            "apartment": "45",
            "injured": "нет",
        },
        etalon_services=["01 Пожарные"],
        seq=42,
    )

    # Must pass sanitize_incoming_card
    sanitized = sanitize_incoming_card({"incoming_card": card})
    assert sanitized["connection"] == "Установлено"
    assert sanitized["phones"]["aon"] == "+79161112233"
    assert sanitized["incident"]["number"] == "A42-112"
    assert sanitized["caller"]["name"] == "Петров Петр Петрович"
    assert "Ленина" in sanitized["caller"]["address"]
    assert sanitized["description"] == "Горит балкон на 5 этаже жилого дома"
    assert sanitized["statuses"]["injured"] == "нет"
    assert sanitized["emergency"] == {"cs": False, "cp": False}
    assert sanitized["classification"]["section"] == "Пожары и задымления"
    assert sanitized["classification"]["title"] == "Возгорание на балконе"
    assert len(sanitized["services"]) == 1
    assert sanitized["services"][0]["name"] == "01 Пожарные"
    assert sanitized["services"][0]["status"] == "Получена службой"


@pytest.mark.parametrize("source_time", [
    datetime(2026, 10, 20, 8, 57, 19, tzinfo=timezone.utc),
    datetime(2026, 10, 20, 8, 57, 19),
])
def test_new_card_records_source_save_time_and_teaching_operator(source_time):
    card = build_incoming_card(plot="Учебное происшествие", seq=42, now=source_time)
    assert card["incident"] == {
        "number": "A42-112",
        "savedAt": "2026-10-20T11:57:19+03:00",
        "operator": "Опер. 14, АРМ 7, Рожкова О. И.",
    }
    assert card["services"][0]["time"] == "11:57"
    assert sanitize_incoming_card({"incoming_card": card}) == card


@pytest.mark.asyncio
async def test_ticket_lifecycle_and_approval(users_fixture):
    """Test full ticket lifecycle: DRAFT/UNDER_REVIEW -> APPROVED -> PATCH(downgrade) -> APPROVED."""
    teacher = users_fixture["teacher"]
    tag = uuid.uuid4().hex[:6]

    card = build_incoming_card(
        category="ДТП",
        subcategory=f"Лобовое {tag}",
        plot=f"Столкновение двух автомобилей на перекрестке {tag}",
        ground_truth={"phone": "+79261234567", "fio": "Иванов"},
        etalon_services=["01 Пожарные", "02 Полиция", "03 Скорая"],
        seq=101,
    )

    ticket_id = f"test-ticket-{tag}"
    async with AsyncSessionLocal() as db:
        sc = ScenarioTicket(
            scenario_id=ticket_id,
            title=f"Лобовое {tag}",
            category="ДТП",
            complexity=2,
            content={"incoming_card": card},
            settings={
                "category": "ДТП",
                "subcategory": f"Лобовое {tag}",
                "complexity": 2,
                "plot": f"Столкновение двух автомобилей на перекрестке {tag}",
                "etalon_services": ["01 Пожарные", "02 Полиция", "03 Скорая"],
                "sequence_number": 101,
            },
            workflow_state={"status": "UNDER_REVIEW"},
        )
        db.add(sc)
        await db.commit()

    # 1. UNDER_REVIEW ticket must NOT be visible in /api/dds/tickets
    r_cat = await auth_req("GET", "/api/dds/tickets", teacher)
    assert r_cat.status_code == 200
    assert not any(t["ticket_id"] == ticket_id for t in r_cat.json())

    # 2. Approve ticket via POST /api/tickets/{id}/approve
    r_app = await auth_req("POST", f"/api/tickets/{ticket_id}/approve", teacher)
    assert r_app.status_code == 200
    assert r_app.json()["status"] == "APPROVED"

    async with AsyncSessionLocal() as db:
        saved = await db.get(ScenarioTicket, ticket_id)
        assert saved.workflow_state["status"] == "APPROVED"
        assert saved.workflow_state["approved_by"] == teacher[0]
        assert saved.workflow_state["approved_at"]

    # 3. APPROVED ticket is now visible in /api/dds/tickets
    r_cat = await auth_req("GET", "/api/dds/tickets", teacher)
    assert r_cat.status_code == 200
    assert any(t["ticket_id"] == ticket_id for t in r_cat.json())

    # 4. Substantial edit via PATCH /api/tickets/{id} drops status back to UNDER_REVIEW
    patch_payload = {"plot": f"Обновленный сюжет аварии {tag} с заблокированным водителем"}
    r_patch = await auth_req("PATCH", f"/api/tickets/{ticket_id}", teacher, json=patch_payload)
    assert r_patch.status_code == 200
    assert r_patch.json()["status"] == "UNDER_REVIEW"

    async with AsyncSessionLocal() as db:
        saved = await db.get(ScenarioTicket, ticket_id)
        assert saved.workflow_state["status"] == "UNDER_REVIEW"
        assert len(saved.version_history) == 1
        assert saved.version_history[0]["previous_status"] == "APPROVED"
        # incoming_card description must be updated as well
        assert saved.content["incoming_card"]["description"] == patch_payload["plot"]

    # 5. After PATCH, ticket is no longer available in /api/dds/tickets until re-approved
    r_cat = await auth_req("GET", "/api/dds/tickets", teacher)
    assert not any(t["ticket_id"] == ticket_id for t in r_cat.json())

    # 6. Re-approve
    r_app2 = await auth_req("POST", f"/api/tickets/{ticket_id}/approve", teacher)
    assert r_app2.status_code == 200
    assert r_app2.json()["status"] == "APPROVED"


@pytest.mark.asyncio
async def test_ticket_soft_delete_and_archive(users_fixture):
    """Test soft delete sets is_deleted=True and workflow_state.status='ARCHIVED'."""
    teacher = users_fixture["teacher"]
    tag = uuid.uuid4().hex[:6]
    ticket_id = f"test-del-{tag}"

    card = build_incoming_card(
        category="Запах газа",
        subcategory="Утечка в подъезде",
        plot="Резкий запах газа на 3 этаже",
        etalon_services=["04 Газ"],
        seq=55,
    )

    async with AsyncSessionLocal() as db:
        sc = ScenarioTicket(
            scenario_id=ticket_id,
            title="Запах газа",
            category="Запах газа",
            content={"incoming_card": card},
            workflow_state={"status": "APPROVED"},
        )
        gt = GeneratedTicket(
            id=ticket_id,
            category="Запах газа",
            subcategory="Утечка",
            plot="Резкий запах газа на 3 этаже",
            etalon_services=["04 Газ"],
            status="APPROVED",
        )
        db.add_all([sc, gt])
        await db.commit()

    # Soft delete
    r_del = await auth_req("DELETE", f"/api/tickets/{ticket_id}", teacher)
    assert r_del.status_code == 200

    async with AsyncSessionLocal() as db:
        s_db = await db.get(ScenarioTicket, ticket_id)
        g_db = await db.get(GeneratedTicket, ticket_id)
        assert s_db.is_deleted is True
        assert s_db.workflow_state["status"] == "ARCHIVED"
        assert s_db.workflow_state["archived_at"]
        assert g_db.is_deleted is True
        assert g_db.status == "ARCHIVED"

    # Excluded from /api/dds/tickets
    r_cat = await auth_req("GET", "/api/dds/tickets", teacher)
    assert not any(t["ticket_id"] == ticket_id for t in r_cat.json())


@pytest.mark.asyncio
async def test_dds_tickets_categories_endpoint(users_fixture):
    """Test GET /api/dds/tickets/categories returns categories and counts only for approved suitable tickets."""
    teacher = users_fixture["teacher"]
    tag = uuid.uuid4().hex[:6]

    card1 = build_incoming_card(
        category=f"CatA_{tag}",
        subcategory=f"Sub1_{tag}",
        plot="Событие А1",
        etalon_services=["01 Пожарные"],
    )
    card2 = build_incoming_card(
        category=f"CatA_{tag}",
        subcategory=f"Sub2_{tag}",
        plot="Событие А2",
        etalon_services=["01 Пожарные"],
    )
    card_unapproved = build_incoming_card(
        category=f"CatA_{tag}",
        subcategory=f"Sub1_{tag}",
        plot="Событие А3 не утвержденное",
        etalon_services=["01 Пожарные"],
    )

    async with AsyncSessionLocal() as db:
        s1 = ScenarioTicket(
            scenario_id=f"t1_{tag}",
            category=f"CatA_{tag}",
            complexity=1,
            content={"incoming_card": card1},
            settings={"category": f"CatA_{tag}", "subcategory": f"Sub1_{tag}", "complexity": 1},
            workflow_state={"status": "APPROVED"},
        )
        s2 = ScenarioTicket(
            scenario_id=f"t2_{tag}",
            category=f"CatA_{tag}",
            complexity=2,
            content={"incoming_card": card2},
            settings={"category": f"CatA_{tag}", "subcategory": f"Sub2_{tag}", "complexity": 2},
            workflow_state={"status": "APPROVED"},
        )
        s3_unapproved = ScenarioTicket(
            scenario_id=f"t3_{tag}",
            category=f"CatA_{tag}",
            complexity=1,
            content={"incoming_card": card_unapproved},
            settings={"category": f"CatA_{tag}", "subcategory": f"Sub1_{tag}", "complexity": 1},
            workflow_state={"status": "UNDER_REVIEW"},
        )
        db.add_all([s1, s2, s3_unapproved])
        await db.commit()

    # Call /api/dds/tickets/categories
    r = await auth_req("GET", "/api/dds/tickets/categories", teacher)
    assert r.status_code == 200
    data = r.json()
    cat_entry = next((c for c in data if c["category"] == f"CatA_{tag}"), None)
    assert cat_entry is not None
    # total must be 2, NOT 3 (s3 is under review)
    assert cat_entry["total"] == 2
    assert cat_entry["subcategories"][f"Sub1_{tag}"] == 1
    assert cat_entry["subcategories"][f"Sub2_{tag}"] == 1

    # Filter by complexity=2
    r_comp = await auth_req("GET", "/api/dds/tickets/categories?complexity=2", teacher)
    assert r_comp.status_code == 200
    comp_entry = next((c for c in r_comp.json() if c["category"] == f"CatA_{tag}"), None)
    assert comp_entry is not None
    assert comp_entry["total"] == 1
    assert comp_entry["subcategories"][f"Sub2_{tag}"] == 1


@pytest.mark.asyncio
async def test_restoration_script_repeatable():
    """Test repeatable restoration of empty or unvalidated tickets."""
    tag = uuid.uuid4().hex[:6]
    ticket_id = f"legacy-{tag}"

    async with AsyncSessionLocal() as db:
        # Legacy ScenarioTicket with empty content but valid settings/ground_truth
        sc = ScenarioTicket(
            scenario_id=ticket_id,
            title=f"Старый пожар {tag}",
            category="Пожары и задымления",
            content={},
            settings={
                "category": "Пожары и задымления",
                "subcategory": "Пожар на складе",
                "plot": "Возгорание деревянных паллет на складе готовой продукции",
                "etalon_services": ["01 Пожарные"],
                "sequence_number": 999,
            },
            ground_truth={"phone": "+79169998877", "fio": "Охранник склада"},
            workflow_state={"status": "active"},
        )
        db.add(sc)
        await db.commit()

    async with AsyncSessionLocal() as db:
        stats1 = await restore_existing_tickets(db)
        assert stats1["restored_scenarios"] >= 1

        reloaded = await db.get(ScenarioTicket, ticket_id)
        assert is_suitable_dds_ticket(reloaded) is True
        assert reloaded.workflow_state["status"] == "UNDER_REVIEW"
        assert reloaded.content["incoming_card"]["incident"]["number"] == "A999-112"

        # Running again must be idempotent and mark already_suitable
        stats2 = await restore_existing_tickets(db)
        assert stats2["restored_scenarios"] == 0
        reloaded2 = await db.get(ScenarioTicket, ticket_id)
        assert is_suitable_dds_ticket(reloaded2) is True
        assert reloaded2.workflow_state["status"] == "UNDER_REVIEW"
