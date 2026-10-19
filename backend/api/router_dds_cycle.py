"""API router for DDS Lesson Cycle (A-06).

Endpoints:
- GET  /api/dds/tickets                  — catalog of suitable prepared tickets (TEACHER/ADMIN)
- GET  /api/dds/assignments              — own assigned DDS sessions (CADET/ADMIN)
- GET  /api/dds/sessions/{session_id}    — session state (CADET owner, TEACHER owner, ADMIN)
- POST /api/dds/sessions/{session_id}/actions — record action (CADET owner, ADMIN)
- POST /api/dds/sessions/{session_id}/finish  — complete session (CADET owner, ADMIN)
"""

from typing import List, Optional
from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import get_current_user, require_role
from backend.core.dds_cycle import (
    apply_dds_action,
    extract_dds_ticket_metadata,
    finish_dds_session,
    get_dds_session_state,
    is_suitable_dds_ticket,
    list_cadet_dds_assignments,
    matches_dds_ticket_filters,
)
from backend.core.ticket_lifecycle import is_approved_dds_ticket
from backend.database import get_db
from backend.core.dds_queue import available_for_training, complete_card, start_training
from backend.models.domain_01 import User
from backend.models.domain_02 import ScenarioTicket
from backend.schemas.dds_cycle import (
    DDSActionPayload,
    DDSFinishPayload,
    DDSSessionStateResponse,
    DDSTicketSummary,
    DDSCompletePayload,
    DDSTrainingStartPayload,
)

router_dds_cycle = APIRouter(
    prefix="/api/dds",
    tags=["DDS Lesson Cycle"],
)


@router_dds_cycle.get("/audio/{filename}")
async def get_phone_recording(filename: str):
    # Public canned training material, never user uploads or session recordings.
    from fastapi.responses import FileResponse
    from backend.core.dds_phone_catalog import AUDIO_DIR, recordings
    if filename not in recordings() or not (AUDIO_DIR / filename).is_file():
        raise HTTPException(404, "Phone recording not found")
    return FileResponse(AUDIO_DIR / filename, media_type="audio/wav")


@router_dds_cycle.get(
    "/tickets",
    response_model=List[DDSTicketSummary],
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
@router_dds_cycle.get(
    "/tickets/",
    response_model=List[DDSTicketSummary],
    include_in_schema=False,
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
async def get_prepared_dds_tickets(
    category: Optional[str] = Query(None, description="Категория происшествия"),
    subcategory: Optional[str] = Query(None, description="Подкатегория происшествия"),
    complexity: Optional[int] = Query(None, ge=1, le=3, description="Уровень сложности (1-3)"),
    db: AsyncSession = Depends(get_db),
) -> List[DDSTicketSummary]:
    """Return prepared scenario tickets suitable for DDS dispatch lessons without exposing etalons."""
    stmt = (
        select(ScenarioTicket)
        .where(
            (ScenarioTicket.is_deleted == False) | (ScenarioTicket.is_deleted.is_(None))  # noqa: E712
        )
        .order_by(ScenarioTicket.created_at.desc())
    )
    tickets = (await db.scalars(stmt)).all()

    suitable: List[DDSTicketSummary] = []
    for t in tickets:
        if not is_approved_dds_ticket(t):
            continue

        if is_suitable_dds_ticket(t):
            if matches_dds_ticket_filters(
                t, category=category, subcategory=subcategory, complexity=complexity
            ):
                cat, subcat, comp, title = extract_dds_ticket_metadata(t)
                suitable.append(
                    DDSTicketSummary(
                        ticket_id=t.scenario_id,
                        title=title,
                        category=cat,
                        subcategory=subcat,
                        complexity=comp,
                    )
                )
    return suitable


@router_dds_cycle.get("/training/tickets", response_model=List[DDSTicketSummary],
                      dependencies=[Depends(require_role("CADET"))])
async def get_training_tickets(
    category: Optional[str] = Query(None),
    complexity: Optional[int] = Query(None, ge=1, le=3),
    db: AsyncSession = Depends(get_db),
):
    tickets = (await db.scalars(select(ScenarioTicket).order_by(ScenarioTicket.created_at.desc()))).all()
    result = []
    for ticket in tickets:
        if (is_suitable_dds_ticket(ticket) and available_for_training(ticket)
                and matches_dds_ticket_filters(ticket, category=category, complexity=complexity)):
            cat, subcat, comp, title = extract_dds_ticket_metadata(ticket)
            result.append(DDSTicketSummary(ticket_id=ticket.scenario_id, title=title,
                                          category=cat, subcategory=subcat, complexity=comp))
    return result


@router_dds_cycle.post("/training", response_model=DDSSessionStateResponse)
async def post_training(
    payload: DDSTrainingStartPayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await start_training(db, payload, current_user)


@router_dds_cycle.get(
    "/tickets/categories",
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
@router_dds_cycle.get(
    "/tickets/categories/",
    include_in_schema=False,
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
async def get_dds_ticket_categories(
    complexity: Optional[int] = Query(None, ge=1, le=3, description="Сложность (1-3)"),
    db: AsyncSession = Depends(get_db),
):
    """Категории и подкатегории доступных билетов ДДС со счетчиками (только APPROVED и пригодные)."""
    stmt = (
        select(ScenarioTicket)
        .where(
            (ScenarioTicket.is_deleted == False) | (ScenarioTicket.is_deleted.is_(None))  # noqa: E712
        )
        .order_by(ScenarioTicket.created_at.desc())
    )
    tickets = (await db.scalars(stmt)).all()

    counts = {}
    for t in tickets:
        if not is_approved_dds_ticket(t):
            continue
        if not is_suitable_dds_ticket(t):
            continue

        cat_name, subcat, comp, _ = extract_dds_ticket_metadata(t)
        if complexity is not None and comp != complexity:
            continue

        cat_key = cat_name or "Общее"
        if cat_key not in counts:
            counts[cat_key] = {
                "category": cat_key,
                "total": 0,
                "subcategories": {},
            }
        counts[cat_key]["total"] += 1
        if subcat:
            counts[cat_key]["subcategories"][subcat] = counts[cat_key]["subcategories"].get(subcat, 0) + 1

    result = []
    for cat_name in sorted(counts.keys()):
        item = counts[cat_name]
        subcats = item["subcategories"]
        item["items"] = [{"subcategory": k, "count": v} for k, v in sorted(subcats.items())]
        result.append(item)

    return result


@router_dds_cycle.get(
    "/assignments",
    response_model=List[DDSSessionStateResponse],
)
@router_dds_cycle.get(
    "/assignments/",
    response_model=List[DDSSessionStateResponse],
    include_in_schema=False,
)
async def get_cadet_assignments(
    include_history: bool = Query(False),
    include_self_training: bool = Query(True),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[DDSSessionStateResponse]:
    """Return assigned DDS sessions for the logged-in CADET (or ADMIN)."""
    items = await list_cadet_dds_assignments(current_user=current_user, db=db)
    if not include_self_training:
        items = [item for item in items if not item.get("is_self_training")]
    if include_history:
        expanded = []
        for item in items:
            expanded.append(item)
            for card in item["cards"]:
                if card["card_id"] != item["card_id"]:
                    expanded.append(await get_dds_session_state(item["session_id"], current_user, db, card_id=card["card_id"]))
        items = expanded
    return [DDSSessionStateResponse.model_validate(it) for it in items]


@router_dds_cycle.get(
    "/sessions/{session_id}",
    response_model=DDSSessionStateResponse,
)
@router_dds_cycle.get(
    "/sessions/{session_id}/",
    response_model=DDSSessionStateResponse,
    include_in_schema=False,
)
async def get_session_state_endpoint(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DDSSessionStateResponse:
    """Retrieve full session state for CADET owner, TEACHER owner, or ADMIN."""
    state = await get_dds_session_state(session_id=session_id, current_user=current_user, db=db)
    return DDSSessionStateResponse.model_validate(state)


@router_dds_cycle.get("/sessions/{session_id}/cards/{card_id}", response_model=DDSSessionStateResponse)
async def get_session_card(
    session_id: str, card_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_dds_session_state(session_id, current_user, db, card_id=card_id)


@router_dds_cycle.post("/sessions/{session_id}/cards/{card_id}/complete", response_model=DDSSessionStateResponse)
async def post_complete_card(
    session_id: str, card_id: str, payload: DDSCompletePayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    state = await complete_card(db, session_id, card_id, payload.request_id, current_user)
    from backend.core.report_demo import start_session
    await start_session(db, session_id)
    return state


@router_dds_cycle.post(
    "/sessions/{session_id}/actions",
    response_model=DDSSessionStateResponse,
)
@router_dds_cycle.post(
    "/sessions/{session_id}/actions/",
    response_model=DDSSessionStateResponse,
    include_in_schema=False,
)
async def post_session_action_endpoint(
    session_id: str,
    payload: DDSActionPayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DDSSessionStateResponse:
    """Submit an action on a cadet's assigned DDS session."""
    state = await apply_dds_action(
        session_id=session_id,
        payload=payload,
        current_user=current_user,
        db=db,
    )
    return DDSSessionStateResponse.model_validate(state)


@router_dds_cycle.post(
    "/sessions/{session_id}/finish",
    response_model=DDSSessionStateResponse,
)
@router_dds_cycle.post(
    "/sessions/{session_id}/finish/",
    response_model=DDSSessionStateResponse,
    include_in_schema=False,
)
async def finish_session_endpoint(
    session_id: str,
    payload: DDSFinishPayload = Body(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DDSSessionStateResponse:
    """Finish a cadet's assigned DDS session atomically."""
    state = await finish_dds_session(
        session_id=session_id,
        current_user=current_user,
        db=db,
    )
    from backend.core.report_demo import start_session
    await start_session(db, session_id)
    return DDSSessionStateResponse.model_validate(state)


from backend.schemas.dds_exercise import ExercisePlan, PhoneCommand
from backend.core.dds_phone import phone_command
from backend.core.dds_exercise import validated_plan


@router_dds_cycle.post("/sessions/{session_id}/phone", response_model=DDSSessionStateResponse)
async def post_phone(session_id: str, payload: PhoneCommand,
                     user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await phone_command(db, session_id, payload, user)


@router_dds_cycle.get("/sessions/{session_id}/phone-notes", dependencies=[Depends(require_role("TEACHER", "ADMIN"))])
async def get_phone_notes(session_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Reuse the session/lesson ownership checks before reading private transcripts.
    await get_dds_session_state(session_id, user, db)
    from backend.models.domain_03 import ExamSession
    session = await db.get(ExamSession, session_id)
    data = (session.dynamic_state or {}).get("dds", {})
    cards = [*data.get("completed_cards", [])]
    if not any(card["card_id"] == data.get("card_id") for card in cards):
        cards.append(data)
    result = []
    for card in cards:
        exercise = card.get("exercise") or {}
        contacts = {c["id"]: c for c in exercise.get("plan", {}).get("contacts", [])}
        notes = [{"report_id": r["id"], "service_name": contacts[r["contact_id"]]["service_name"],
                  "note": exercise["notes"][r["id"]], "expected_text": r["text"]}
                 for r in exercise.get("plan", {}).get("reports", []) if r["id"] in exercise.get("notes", {})]
        result.append({"card_id": card.get("card_id"), "notes": notes})
    return {"cards": result}


@router_dds_cycle.get("/tickets/{ticket_id}/exercise", dependencies=[Depends(require_role("TEACHER", "ADMIN"))])
async def get_exercise_plan(ticket_id: str, db: AsyncSession = Depends(get_db)):
    from backend.core.dds_cycle import incoming_card_from_ticket
    ticket = await db.get(ScenarioTicket, ticket_id)
    if not ticket or ticket.is_deleted:
        raise HTTPException(404, "Ticket not found")
    incoming = incoming_card_from_ticket(ticket)
    from backend.core.dds_phone_catalog import default_phone_plan
    services = [s["name"] for s in incoming["services"]]
    default = default_phone_plan(services)
    plan = (ticket.content or {}).get("dds_exercise") or default
    return {"services": services, "plan": plan, "default_plan": default,
            "needs_upgrade": plan.get("version", 1) != 2}


@router_dds_cycle.put("/tickets/{ticket_id}/exercise", dependencies=[Depends(require_role("TEACHER", "ADMIN"))])
async def put_exercise_plan(ticket_id: str, payload: ExercisePlan, db: AsyncSession = Depends(get_db)):
    from backend.core.dds_cycle import incoming_card_from_ticket
    ticket = await db.get(ScenarioTicket, ticket_id)
    if not ticket or ticket.is_deleted:
        raise HTTPException(404, "Ticket not found")
    incoming = incoming_card_from_ticket(ticket)
    try:
        plan = validated_plan(payload.model_dump(), [s["name"] for s in incoming["services"]])
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    ticket.content = {**(ticket.content or {}), "incoming_card": incoming, "dds_exercise": plan}
    await db.commit()
    return {"services": [s["name"] for s in incoming["services"]], "plan": plan}
