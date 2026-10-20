"""Persist the generated ticket and its DDS representation in one transaction."""
from copy import deepcopy

from sqlalchemy import func, select, text

from backend.core.dds_cycle import build_incoming_card
from backend.models.domain_02 import GeneratedTicket, ScenarioTicket


async def save_generated_ticket(db, ticket, *, category, subcategory, status="UNDER_REVIEW",
                                settings=None, exercise=None, now=None):
    """Caller owns commit/rollback. Allocate a sequence without resetting the catalog."""
    await db.execute(text("CREATE TABLE IF NOT EXISTS sys_sequences "
                          "(name VARCHAR PRIMARY KEY, last_val INTEGER NOT NULL DEFAULT 0)"))
    await db.execute(text("INSERT INTO sys_sequences (name, last_val) VALUES ('generated_tickets', 0) "
                          "ON CONFLICT (name) DO NOTHING"))
    # Older imported/mirrored rows can have numbers above the allocator's counter.
    highest = (await db.scalar(select(func.max(GeneratedTicket.sequence_number)))) or 0
    seq = (await db.execute(text(
        "UPDATE sys_sequences SET last_val = CASE WHEN last_val < :highest THEN :highest + 1 "
        "ELSE last_val + 1 END WHERE name = 'generated_tickets' RETURNING last_val"
    ), {"highest": highest})).scalar_one()
    gt = deepcopy(ticket.ground_truth)
    if ticket.dds_etalon:
        gt["dds_etalon"] = deepcopy(ticket.dds_etalon)
    card = build_incoming_card(category=category, subcategory=subcategory, plot=ticket.plot,
                               ground_truth=gt, etalon_services=ticket.etalon_services, seq=seq, now=now)
    values = dict(settings or {})
    values.update(complexity=ticket.complexity, etalon_services=list(ticket.etalon_services),
                  plot=ticket.plot, category=category, subcategory=subcategory, sequence_number=seq)
    if ticket.dds_etalon:
        values["dds_etalon"] = deepcopy(ticket.dds_etalon)
    content = {"incoming_card": card}
    if exercise is not None:
        content["dds_exercise"] = deepcopy(exercise)
    mirror = GeneratedTicket(id=ticket.ticket_id, category=category, subcategory=subcategory,
                             complexity=ticket.complexity, plot=ticket.plot,
                             factoids=deepcopy(ticket.factoids), ground_truth=deepcopy(gt),
                             etalon_services=list(ticket.etalon_services), sequence_number=seq, status=status)
    scenario = ScenarioTicket(scenario_id=ticket.ticket_id, title=subcategory or category,
                              category=category, complexity=ticket.complexity, content=content,
                              settings=values, ground_truth=gt,
                              ai_content={"factoids": deepcopy(ticket.factoids), "plot": ticket.plot},
                              workflow_state={"status": status})
    db.add_all([mirror, scenario])
    await db.flush()
    return scenario, mirror
