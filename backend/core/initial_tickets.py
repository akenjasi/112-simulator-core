"""Install the shipped, reviewed DDS catalog once on an empty database.

This is additive first-run initialization, separate from demo history replacement.
Existing catalogs, including archived tickets, are always left untouched.
"""
from pathlib import Path

from sqlalchemy import select, text

from backend.core.dds_demo_catalog import DemoManifest, classifier_records, validate_demo
from backend.core.dds_phone_catalog import default_phone_plan
from backend.core.ticket_storage import save_generated_ticket
from backend.models.domain_02 import GeneratedTicket, ScenarioTicket

CATALOG_PATH = Path(__file__).resolve().parents[1] / "catalogs/dds-city-demo-v1.json"


def load_initial_catalog():
    manifest = DemoManifest.model_validate_json(CATALOG_PATH.read_text(encoding="utf-8"))
    validate_demo(manifest)
    return manifest


async def ensure_initial_tickets(db):
    """Own the transaction; serialize checks/inserts on SQLite and PostgreSQL."""
    async with db.begin():
        dialect = db.get_bind().dialect.name
        if dialect == "sqlite":
            await db.execute(text("BEGIN IMMEDIATE"))
        elif dialect == "postgresql":
            await db.execute(text(
                "LOCK TABLE generated_tickets, scenario_tickets IN SHARE ROW EXCLUSIVE MODE"
            ))
        else:
            raise RuntimeError("Initial DDS catalog supports SQLite and PostgreSQL only")

        # Do not infer that hidden/archived tickets constitute an empty catalog.
        if await db.scalar(select(ScenarioTicket.scenario_id).limit(1)) is not None:
            return 0
        if await db.scalar(select(GeneratedTicket.id).limit(1)) is not None:
            return 0

        manifest = load_initial_catalog()
        records = classifier_records()
        for ticket in manifest.tickets:
            await save_generated_ticket(
                db, ticket.data, category=ticket.category, subcategory=ticket.short_title,
                status="APPROVED", now=manifest.prepared_at,
                exercise=default_phone_plan(ticket.data.etalon_services),
                settings={"demo_catalog": manifest.catalog, "classifier_source": {
                    "id": ticket.classifier_id, "category": ticket.category,
                    "group": records[ticket.classifier_id]["group"],
                    "final_type": ticket.final_type,
                }},
            )
        return len(manifest.tickets)
