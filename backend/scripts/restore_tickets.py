"""Repeatable restoration and validation of existing ScenarioTickets and GeneratedTickets.

Usage:
    python -m backend.scripts.restore_tickets
"""

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
import logging
from typing import Any, Dict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.core.dds_cycle import build_incoming_card, is_suitable_dds_ticket
from backend.database import AsyncSessionLocal
from backend.models.domain_02 import GeneratedTicket, ScenarioTicket

logger = logging.getLogger(__name__)


async def restore_existing_tickets(session: AsyncSession) -> Dict[str, Any]:
    """Iterate over all ScenarioTickets and GeneratedTickets to ensure full incoming_card

    and valid workflow state.
    """
    sc_stmt = select(ScenarioTicket)
    gen_stmt = select(GeneratedTicket)

    scenario_tickets = (await session.execute(sc_stmt)).scalars().all()
    gen_tickets = (await session.execute(gen_stmt)).scalars().all()

    generated_by_id = {g.id: g for g in gen_tickets}
    scenario_by_id = {s.scenario_id: s for s in scenario_tickets}

    stats = {
        "scenarios_total": len(scenario_tickets),
        "generated_total": len(gen_tickets),
        "already_suitable": 0,
        "restored_scenarios": 0,
        "created_scenarios_from_gen": 0,
        "unsuitable_scenarios": 0,
    }

    # Phase 1: Inspect & Restore existing ScenarioTickets
    for s in scenario_tickets:
        if getattr(s, "is_deleted", False) or (s.workflow_state or {}).get("status") == "ARCHIVED":
            continue

        if is_suitable_dds_ticket(s):
            wf = dict(s.workflow_state or {})
            if wf.get("status") in (None, "", "active"):
                # Restoration can repair structure, but approval is a teacher
                # decision and must never be inferred from legacy data.
                wf["status"] = "UNDER_REVIEW"
                s.workflow_state = wf
                flag_modified(s, "workflow_state")
            stats["already_suitable"] += 1
            continue

        # Missing or invalid incoming_card: attempt reconstruction
        was_explicitly_approved = (s.workflow_state or {}).get("status") == "APPROVED"
        settings = s.settings or {}
        ai = s.ai_content or {}
        gt = s.ground_truth or {}
        matching_gen = generated_by_id.get(s.scenario_id)

        cat = (
            s.category
            or settings.get("category")
            or (matching_gen.category if matching_gen else None)
            or "Общее"
        )
        sub = (
            settings.get("subcategory")
            or (matching_gen.subcategory if matching_gen else None)
            or s.title
            or cat
        )
        plot = (
            settings.get("plot")
            or ai.get("plot")
            or (matching_gen.plot if matching_gen else None)
            or ""
        )

        if not gt and matching_gen and matching_gen.ground_truth:
            gt = matching_gen.ground_truth

        etalon_services = (
            settings.get("etalon_services")
            or (matching_gen.etalon_services if matching_gen else None)
            or []
        )
        seq = (
            settings.get("sequence_number")
            or (matching_gen.sequence_number if matching_gen else None)
            or 1
        )

        if plot and plot.strip():
            try:
                card = build_incoming_card(
                    category=cat,
                    subcategory=sub,
                    plot=plot,
                    ground_truth=gt,
                    etalon_services=etalon_services,
                    seq=seq,
                )
                content = dict(s.content or {})
                content["incoming_card"] = card
                s.content = content
                flag_modified(s, "content")

                wf = dict(s.workflow_state or {})
                wf["status"] = "APPROVED" if was_explicitly_approved else "UNDER_REVIEW"
                wf["restored_at"] = datetime.now(timezone.utc).isoformat()
                wf.pop("unsuitability_reason", None)
                s.workflow_state = wf
                flag_modified(s, "workflow_state")

                if not s.title:
                    s.title = sub or cat
                if not s.category:
                    s.category = cat

                stats["restored_scenarios"] += 1
            except Exception as ex:
                logger.warning("Could not reconstruct ScenarioTicket %s: %s", s.scenario_id, ex)
                wf = dict(s.workflow_state or {})
                wf["status"] = "DRAFT"
                wf["unsuitability_reason"] = f"Failed to build card: {ex}"
                s.workflow_state = wf
                flag_modified(s, "workflow_state")
                stats["unsuitable_scenarios"] += 1
        else:
            wf = dict(s.workflow_state or {})
            wf["status"] = "DRAFT"
            wf["unsuitability_reason"] = "Insufficient data: missing plot/description"
            s.workflow_state = wf
            flag_modified(s, "workflow_state")
            stats["unsuitable_scenarios"] += 1

    # Phase 2: Inspect GeneratedTickets and ensure corresponding ScenarioTickets exist
    for g in gen_tickets:
        if getattr(g, "is_deleted", False) or g.status == "ARCHIVED":
            continue
        if g.id not in scenario_by_id:
            plot = g.plot or ""
            if plot and plot.strip():
                try:
                    card = build_incoming_card(
                        category=g.category,
                        subcategory=g.subcategory,
                        plot=plot,
                        ground_truth=g.ground_truth,
                        etalon_services=g.etalon_services,
                        seq=g.sequence_number,
                    )
                    new_sc = ScenarioTicket(
                        scenario_id=g.id,
                        title=g.subcategory or g.category,
                        category=g.category,
                        complexity=g.complexity,
                        content={"incoming_card": card},
                        settings={
                            "complexity": g.complexity,
                            "etalon_services": g.etalon_services,
                            "plot": g.plot,
                            "category": g.category,
                            "subcategory": g.subcategory,
                            "sequence_number": g.sequence_number,
                        },
                        ground_truth=g.ground_truth or {},
                        ai_content={
                            "factoids": g.factoids or {},
                            "plot": g.plot,
                        },
                        workflow_state={
                    "status": "UNDER_REVIEW",
                            "restored_at": datetime.now(timezone.utc).isoformat(),
                        },
                        is_deleted=g.is_deleted,
                    )
                    session.add(new_sc)
                    g.status = "UNDER_REVIEW"
                    stats["created_scenarios_from_gen"] += 1
                except Exception as ex:
                    logger.warning("Could not create ScenarioTicket from GeneratedTicket %s: %s", g.id, ex)
                    new_sc = ScenarioTicket(
                        scenario_id=g.id,
                        title=g.subcategory or g.category,
                        category=g.category,
                        complexity=g.complexity,
                        content={},
                        settings={
                            "complexity": g.complexity,
                            "etalon_services": g.etalon_services,
                            "plot": g.plot,
                            "category": g.category,
                            "subcategory": g.subcategory,
                            "sequence_number": g.sequence_number,
                        },
                        workflow_state={
                            "status": "DRAFT",
                            "unsuitability_reason": f"Failed to build card: {ex}",
                        },
                        is_deleted=g.is_deleted,
                    )
                    session.add(new_sc)
                    g.status = "DRAFT"
                    stats["unsuitable_scenarios"] += 1
            else:
                new_sc = ScenarioTicket(
                    scenario_id=g.id,
                    title=g.subcategory or g.category,
                    category=g.category,
                    complexity=g.complexity,
                    content={},
                    settings={
                        "complexity": g.complexity,
                        "etalon_services": g.etalon_services,
                        "plot": "",
                        "category": g.category,
                        "subcategory": g.subcategory,
                        "sequence_number": g.sequence_number,
                    },
                    workflow_state={
                        "status": "DRAFT",
                        "unsuitability_reason": "Insufficient data: missing plot/description",
                    },
                    is_deleted=g.is_deleted,
                )
                session.add(new_sc)
                g.status = "DRAFT"
                stats["unsuitable_scenarios"] += 1

        # Keep the compatibility table aligned with the workflow source of
        # truth. In particular, don't turn legacy "active" records into
        # approved tickets when their scenario is still a draft/review item.
        existing_scenario = scenario_by_id.get(g.id)
        if existing_scenario is not None:
            g.status = (existing_scenario.workflow_state or {}).get("status") or "DRAFT"

    await session.commit()
    return stats


async def main():
    logging.basicConfig(level=logging.INFO)
    async with AsyncSessionLocal() as session:
        result = await restore_existing_tickets(session)
        print("Restoration finished with results:")
        for k, v in result.items():
            print(f"  {k}: {v}")


if __name__ == "__main__":
    asyncio.run(main())
