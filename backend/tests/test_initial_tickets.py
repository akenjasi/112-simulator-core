"""First-run catalog on disposable databases, preserving subsequent user work."""
import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.core.initial_tickets import ensure_initial_tickets, load_initial_catalog
from backend.models.base import Base
from backend.models.domain_01 import User
from backend.models.domain_02 import GeneratedTicket, ScenarioTicket


@pytest.fixture
async def catalog_db(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/initial.sqlite")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.mark.asyncio
async def test_shipped_tickets_are_approved_and_keep_reviewed_facts(catalog_db):
    manifest = load_initial_catalog()
    async with catalog_db() as db:
        db.add(User(username="existing", password_hash="unchanged", role="ADMIN"))
        await db.commit()
        assert await ensure_initial_tickets(db) == 4
        mirrors = list((await db.scalars(select(GeneratedTicket))).all())
        assert sorted(ticket.sequence_number for ticket in mirrors) == [1, 2, 3, 4]
        for prepared in manifest.tickets:
            scenario = await db.get(ScenarioTicket, prepared.data.ticket_id)
            mirror = await db.get(GeneratedTicket, prepared.data.ticket_id)
            assert scenario.workflow_state == {"status": "APPROVED"}
            assert mirror.status == "APPROVED"
            assert mirror.plot == prepared.data.plot
            assert scenario.ground_truth == mirror.ground_truth == prepared.data.ground_truth
            assert scenario.content["incoming_card"]["phones"]["aon"] == prepared.data.ground_truth["phone"]
            assert scenario.content["dds_exercise"]["version"] == 2
            assert scenario.settings["classifier_source"]["id"] == prepared.classifier_id
        user = await db.scalar(select(User).where(User.username == "existing"))
        assert user.password_hash == "unchanged"


@pytest.mark.asyncio
async def test_restart_preserves_edited_and_archived_tickets(catalog_db):
    async with catalog_db() as db:
        await ensure_initial_tickets(db)
        edited = await db.get(ScenarioTicket, load_initial_catalog().tickets[0].data.ticket_id)
        edited.title = "Edited by teacher"
        edited.is_deleted = True
        edited.workflow_state = {"status": "ARCHIVED"}
        await db.commit()
        assert await ensure_initial_tickets(db) == 0
        await db.refresh(edited)
        assert edited.title == "Edited by teacher"
        assert edited.is_deleted is True
        assert edited.workflow_state == {"status": "ARCHIVED"}


@pytest.mark.parametrize("model,values", [
    (ScenarioTicket, {"title": "Existing catalog", "is_deleted": True}),
    (GeneratedTicket, {"category": "Existing catalog", "is_deleted": True}),
])
@pytest.mark.asyncio
async def test_any_existing_representation_prevents_automatic_import(catalog_db, model, values):
    async with catalog_db() as db:
        db.add(model(**values))
        await db.commit()
        assert await ensure_initial_tickets(db) == 0
        assert len(list((await db.scalars(select(model))).all())) == 1
        other = GeneratedTicket if model is ScenarioTicket else ScenarioTicket
        assert (await db.scalar(select(other).limit(1))) is None


@pytest.mark.asyncio
async def test_concurrent_startups_install_one_set(catalog_db):
    async def start():
        async with catalog_db() as db:
            return await ensure_initial_tickets(db)
    assert sorted(await asyncio.gather(start(), start())) == [0, 4]


@pytest.mark.asyncio
async def test_partial_failure_rolls_back_whole_catalog(catalog_db, monkeypatch):
    from backend.core import initial_tickets
    save = initial_tickets.save_generated_ticket
    calls = 0

    async def fail_second(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise ValueError("simulated failure")
        return await save(*args, **kwargs)

    monkeypatch.setattr(initial_tickets, "save_generated_ticket", fail_second)
    async with catalog_db() as db:
        with pytest.raises(ValueError, match="simulated failure"):
            await ensure_initial_tickets(db)
        assert await db.scalar(select(ScenarioTicket).limit(1)) is None
        assert await db.scalar(select(GeneratedTicket).limit(1)) is None
