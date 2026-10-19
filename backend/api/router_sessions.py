import datetime
from copy import deepcopy
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.core.deps import require_role, get_current_user
from backend.core.runtime_router import RuntimeRouter
from backend.database import get_db
from backend.models.domain_01 import User
from backend.models.domain_02 import GeneratedTicket, ScenarioTicket
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import IncidentCard, TicketResult, EvaluationResult
from backend.schemas.students import DemoSessionRequest, DemoSessionResponse
from backend.core.evaluator import evaluate_ticket
from backend.schemas.domain_04 import (
    TicketEvaluationRequest,
    TicketEvaluationResult,
    TicketResultResponse,
    TicketResultUpdate,
    IncidentCardSubmit,
    EvaluationResultResponse,
)
from backend.schemas.domain_03 import (
    SessionConfigCreate,
    SessionConfigResponse,
)
from backend.schemas.sessions import (
    MessageRequest,
    MessageResponse,
    SessionStartRequest,
    SessionStartResponse,
    SessionStateResponse,
    SubmitCardRequest,
    SubmitCardResponse,
    CadetSessionStats,
    SessionStatsResponse,
)

sessions_router = APIRouter(
    prefix="/api/v2",
    tags=["Runtime Sessions"],
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)


async def _is_assigned_dds_session(db: AsyncSession, session: ExamSession) -> bool:
    if (session.dynamic_state or {}).get("dds"):
        return True
    if session.session_type == "CARD_ACTIONS" and session.assignment_id:
        stmt = select(Assignment).where(Assignment.assignment_id == session.assignment_id)
        assign = (await db.execute(stmt)).scalar_one_or_none()
        if assign and assign.target_role == "DISPATCHER_DDS":
            return True
    return False


@sessions_router.post(
    "/assignments/{assignment_id}/sessions/start",
    response_model=SessionStartResponse,
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)
async def start_session(
    assignment_id: str,
    req: SessionStartRequest,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Assignment).where(Assignment.assignment_id == assignment_id)
    result = await db.execute(stmt)
    assignment = result.scalar_one_or_none()

    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found",
        )

    if assignment.target_role == "DISPATCHER_DDS":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="DDS assignments must be started via /api/v1/lessons/{id}/start",
        )

    exam_session = ExamSession(
        session_type=assignment.session_type,
        assignment_id=assignment_id,
        cadet_id=req.cadet_id,
        status="active",
    )
    db.add(exam_session)
    await db.commit()
    await db.refresh(exam_session)

    return exam_session


@sessions_router.get(
    "/sessions/{session_id}",
    response_model=SessionStateResponse,
)
async def get_session_state(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ExamSession).where(ExamSession.session_id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    if current_user.role == "CADET" and session.cadet_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if current_user.role == "TEACHER" and session.assignment_id:
        stmt_a = select(Assignment).where(Assignment.assignment_id == session.assignment_id)
        assign = (await db.execute(stmt_a)).scalar_one_or_none()
        if assign and assign.assigned_by != current_user.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if await _is_assigned_dds_session(db, session):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Assigned DDS sessions must use /api/dds/sessions/{session_id}",
        )

    return session


@sessions_router.post(
    "/sessions/{session_id}/message",
    response_model=MessageResponse,
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)
async def post_session_message(
    session_id: str,
    req: MessageRequest,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ExamSession).where(ExamSession.session_id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    if await _is_assigned_dds_session(db, session):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="DDS sessions cannot receive legacy dialogue messages",
        )

    log = list(session.dialogue_log or [])
    log.append(
        {
            "role": "OPERATOR",
            "text": req.text,
            "timestamp": datetime.datetime.now().isoformat(),
        }
    )

    from backend.core.runtime_router import RuntimeRouter
    router_instance = RuntimeRouter(session_id=session_id)
    import asyncio
    ai_result = await asyncio.to_thread(router_instance.process_message, message=req.text, session_id=session_id)

    log.append(
        {
            "role": "CALLER",
            "text": ai_result.get("reply_text", "Error"),
            "timestamp": datetime.datetime.now().isoformat(),
        }
    )
    session.dialogue_log = log
    flag_modified(session, "dialogue_log")
    await db.commit()
    await db.refresh(session)
    
    # Save to file system as well
    import os
    records_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "data", "records")
    os.makedirs(records_dir, exist_ok=True)
    text_file_path = os.path.join(records_dir, f"{session_id}.txt")
    try:
        with open(text_file_path, "a", encoding="utf-8") as tf:
            tf.write(f"[{datetime.datetime.now().isoformat()}] OPERATOR: {req.text}\n")
            tf.write(f"[{datetime.datetime.now().isoformat()}] CALLER: {ai_result.get('reply_text', 'Error')}\n")
    except Exception as e:
        pass

    return {
        "reply": ai_result.get("reply_text", ""),
        "audio_id": ai_result.get("audio_id"),
    }



@sessions_router.post(
    "/sessions/{session_id}/submit_card",
    response_model=SubmitCardResponse,
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)
async def submit_card(
    session_id: str,
    req: SubmitCardRequest,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ExamSession).where(ExamSession.session_id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    if await _is_assigned_dds_session(db, session):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="DDS sessions must be submitted via /api/dds/sessions/{id}/finish",
        )

    session.status = "COMPLETED"
    session.end_time = datetime.datetime.now(datetime.timezone.utc)

    card = IncidentCard(
        card_origin="runtime",
        session_id=session.session_id,
        operator_id=req.operator_id,
        filled_data=req.filled_data,
        assigned_services=req.assigned_services,
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)

    return {"card_id": card.card_id, "session_status": "COMPLETED"}


@sessions_router.post(
    "/tickets/evaluate",
    response_model=TicketEvaluationResult,
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)
async def evaluate_ticket_endpoint(
    req: TicketEvaluationRequest,
):
    return evaluate_ticket(req)


@sessions_router.patch(
    "/ticket-results/{result_id}/appeal",
    response_model=TicketResultResponse,
    dependencies=[Depends(require_role("TEACHER"))],
)
async def appeal_ticket_result(
    result_id: str,
    req: TicketResultUpdate,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TicketResult).where(TicketResult.result_id == result_id)
    result = await db.execute(stmt)
    ticket_result = result.scalar_one_or_none()

    if not ticket_result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ticket result not found",
        )

    if ticket_result.session_id:
        stmt_s = select(ExamSession).where(ExamSession.session_id == ticket_result.session_id)
        sess = (await db.execute(stmt_s)).scalar_one_or_none()
        if sess and await _is_assigned_dds_session(db, sess):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Appeals for assigned DDS sessions are not supported",
            )

    ticket_result.is_passed = req.is_passed
    ticket_result.teacher_comment = req.teacher_comment
    ticket_result.is_appealed = True
    ticket_result.updated_at = datetime.datetime.now(datetime.timezone.utc)

    await db.commit()
    await db.refresh(ticket_result)
    return ticket_result


@sessions_router.patch(
    "/tickets/{result_id}/appeal",
    response_model=TicketResultResponse,
    dependencies=[Depends(require_role("TEACHER"))],
)
async def appeal_ticket(
    result_id: str,
    req: TicketResultUpdate,
    db: AsyncSession = Depends(get_db),
):
    return await appeal_ticket_result(result_id=result_id, req=req, db=db)


sessions_v1_router = APIRouter(
    prefix="/api/v1/sessions",
    tags=["Sessions v1"],
)


from starlette.requests import Request


@sessions_v1_router.post(
    "/demo",
    response_model=DemoSessionResponse,
)
@sessions_router.post(
    "/sessions/demo",
    response_model=DemoSessionResponse,
    include_in_schema=False,
)
async def create_demo_session(
    request: Request,
    req: Optional[DemoSessionRequest] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a demo training session with 1 random ticket."""
    if req is None:
        try:
            raw_body = await request.body()
            if raw_body:
                import json
                data = json.loads(raw_body)
                req = DemoSessionRequest.model_validate(data)
        except Exception:
            pass

    target_role = (req.target_role if req and req.target_role else "DISPATCHER_DDS").upper()
    if target_role not in ("OPERATOR_112", "DISPATCHER_DDS"):
        target_role = "DISPATCHER_DDS"

    if target_role == "DISPATCHER_DDS" and current_user.role not in ("TEACHER", "CADET"):
        if current_user.role == "ADMIN":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Администратор не может проходить учебные сессии курсанта",
            )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Демо-сессия диспетчера ДДС доступна только преподавателю или курсанту",
        )

    if target_role == "OPERATOR_112" and current_user.role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Демо-сессия оператора 112 доступна только администратору",
        )

    if target_role == "DISPATCHER_DDS":
        if current_user.role == "CADET":
            from backend.core.student_workspace import lock_cadets
            await lock_cadets(db, [current_user.user_id])
        from backend.core.dds_cycle import incoming_card_from_ticket, is_suitable_dds_ticket, extract_dds_ticket_metadata

        from backend.core.dds_queue import available_for_training, initialize_queue

        chosen_id = req.ticket_id if req else None
        if chosen_id:
            saved_ticket = await db.get(ScenarioTicket, chosen_id)
            if not is_suitable_dds_ticket(saved_ticket) or not available_for_training(saved_ticket):
                raise HTTPException(status_code=404, detail="Готовый билет ДДС не найден или удалён")
        else:
            candidates = (await db.scalars(select(ScenarioTicket).where(
                (ScenarioTicket.is_deleted == False) | ScenarioTicket.is_deleted.is_(None)
            ).order_by(ScenarioTicket.created_at.desc()))).all()
            suitable = [ticket for ticket in candidates if is_suitable_dds_ticket(ticket) and available_for_training(ticket)]
            # Prefer explicitly active/published material over unmarked legacy rows.
            published = [ticket for ticket in suitable if (ticket.workflow_state or {}).get("status") in ("active", "published")]
            import secrets
            saved_ticket = secrets.choice(published or suitable) if suitable else None

        if saved_ticket:
            incoming = incoming_card_from_ticket(saved_ticket)
            category, _, complexity, _ = extract_dds_ticket_metadata(saved_ticket)
            assignment = Assignment(session_type="CARD_ACTIONS", mode="TRAINING", status="ACTIVE",
                target_role=target_role, cadet_id=current_user.user_id,
                assigned_by=current_user.user_id if current_user.role == "TEACHER" else None,
                scenario_id=saved_ticket.scenario_id, card_pool_ids=[saved_ticket.scenario_id],
                card_pool_source="self_training",
                categories=[category], complexity=str(complexity),
                teacher_notes="Самостоятельная тренировка по сохранённому билету")
            db.add(assignment)
            await db.flush()
            session = ExamSession(assignment_id=assignment.assignment_id, cadet_id=current_user.user_id,
                ticket_id=saved_ticket.scenario_id, session_type="CARD_ACTIONS", status="ACTIVE",
                categories=[category], complexity=str(complexity))
            db.add(session)
            await db.flush()
            await initialize_queue(db, session, [{"ticket_id": saved_ticket.scenario_id, "incoming_card": incoming}],
                                   datetime.datetime.now(datetime.timezone.utc))
            # Preserve the legacy demo API's incoming-card origin and active result marker.
            card = await db.get(IncidentCard, session.dynamic_state["dds"]["card_id"])
            card.card_origin = "112_CALL"
            db.add(TicketResult(session_id=session.session_id, ticket_id=saved_ticket.scenario_id,
                                status="active", is_passed=False))
            await db.commit()
            return DemoSessionResponse(session_id=session.session_id, ticket_id=saved_ticket.scenario_id,
                role=target_role, redirect_url=f"/dds/journal?focus_session_id={session.session_id}&focus_ticket_id={saved_ticket.scenario_id}")

        raise HTTPException(status_code=409, detail="Нет доступных подготовленных билетов ДДС")

    import uuid
    demo_uuid = str(uuid.uuid4())
    scenario_ticket = ScenarioTicket(
        scenario_id=demo_uuid,
        settings={
            "complexity": 2,
            "etalon_services": ["01 Пожарные", "02 Полиция", "03 Скорая"],
            "plot": "Очевидец сообщает о лобовом столкновении двух легковых АМ на пересечении улицы Ленина и улицы Пушкина. Имеются пострадавшие: один без сознания, второй с травмой головы. Сильный запах бензина, открытого горения нет. Требуется реагирование экстренных служб.",
            "category": "ДТП",
            "subcategory": "ДТП с пострадавшими",
            "class": "Экстренная",
            "visClass": "bg-red-500",
            "sequence_number": 9999,
        },
        ground_truth={
            "fio": "Смирнов Алексей Иванович",
            "phone": "+7 999 123-45-67",
            "street": "улица Ленина, пересечение с улицей Пушкина",
            "house": "15",
            "gender": "male",
            "speaker": "aidar",
            "injured": "да",
            "ambulanceRefusal": "нет",
            "blocked": "нет",
            "caller_status": "Очевидец",
            "class": "Экстренная",
            "visClass": "bg-red-500",
            # Structured bricks for the dialogue classifier (categories 0-9)
            "bricks": [
                {"intent": "intro", "text": "Алло! Помогите! Тут авария!", "emotion": "panic"},
                {"intent": "address", "text": "Улица Ленина, пересечение с улицей Пушкина, возле дома 15!", "emotion": "panic"},
                {"intent": "address_details", "text": "Это около большого перекрёстка, напротив магазина, ориентир — светофор.", "emotion": "neutral"},
                {"intent": "situation", "text": "Две легковые машины столкнулись лоб в лоб. Бензином пахнет сильно, огня пока нет.", "emotion": "panic"},
                {"intent": "victims", "text": "Да, есть пострадавшие! Один водитель без сознания, весь в крови. Второй ходит, но голову держит.", "emotion": "panic"},
                {"intent": "caller_id", "text": "Меня зовут Смирнов Алексей Иванович.", "emotion": "neutral"},
                {"intent": "phone", "text": "Мой номер: плюс семь, девятьсот девяносто девять, сто двадцать три, сорок пять, шестьдесят семь.", "emotion": "neutral"},
                {"intent": "repeat", "text": "Я повторяю! Улица Ленина, дом пятнадцать! Быстрее приезжайте, вас плохо слышно!", "emotion": "panic"},
                {"intent": "bureaucracy", "text": "Какие бумаги?! Человек умирает! Высылайте скорее!", "emotion": "panic"},
                {"intent": "outro", "text": "Хорошо, жду здесь. Поторопитесь, пожалуйста. До свидания.", "emotion": "neutral"},
            ],
        },
        ai_content={
            "factoids": {
                "situation_1": "ДТП лобовое столкновение двух легковых автомобилей",
                "victims_2": "Один водитель без сознания, второй ходит, держится за голову",
                "danger_3": "Запах бензина, угроза возгорания"
            },
            "plot": "Здравствуйте! Тут страшная авария в городе Москва, на пересечении улицы Ленина и улицы Пушкина, прямо возле дома 15. Две легковые машины столкнулись лоб в лоб. Один водитель без сознания, весь в крови, второй вроде ходит, но держится за голову. Бензином сильно пахнет, но огня пока нет. Пришлите скорее скорую, пожарных и ДПС! Меня зовут Смирнов Алексей Иванович.",
        },
        workflow_state={"status": "active"},
    )
    db.add(scenario_ticket)
    await db.flush()

    class DemoTicketObj:
        def __init__(self, sc):
            self.ticket_id = sc.scenario_id
            self.category = sc.settings.get("category", "ДТП")
            self.subcategory = sc.settings.get("subcategory", "ДТП с пострадавшими")
            self.complexity = sc.settings.get("complexity", 2)
            self.plot = sc.settings.get("plot", "")
            self.factoids = sc.ai_content.get("factoids", {})
            self.etalon_services = sc.settings.get("etalon_services", [])
            
    ticket = DemoTicketObj(scenario_ticket)

    session_type = "CALL_SIMULATION" if target_role == "OPERATOR_112" else "CARD_ACTIONS"
    cadet_id = current_user.user_id

    assignment = Assignment(
        session_type=session_type,
        mode="TRAINING",
        status="ACTIVE",
        target_role=target_role,
        cadet_id=cadet_id,
        assigned_by=current_user.user_id if current_user.role == "TEACHER" else None,
        scenario_id=ticket.ticket_id,
        categories=[ticket.category] if ticket.category else [],
        complexity=str(ticket.complexity or "1"),
        teacher_notes="Демо-запуск",
    )
    db.add(assignment)
    await db.flush()

    exam_session = ExamSession(
        assignment_id=assignment.assignment_id,
        cadet_id=cadet_id,
        ticket_id=ticket.ticket_id,
        session_type=session_type,
        status="ACTIVE",
        categories=[ticket.category] if ticket.category else [],
        complexity=str(ticket.complexity or "1"),
    )
    db.add(exam_session)
    await db.flush()

    tr = TicketResult(
        session_id=exam_session.session_id,
        ticket_id=ticket.ticket_id,
        status="active",
        is_passed=False,
    )
    db.add(tr)

    if target_role == "DISPATCHER_DDS":
        from backend.core.dds_cycle import sanitize_incoming_card

        # The assigned DDS UI reads a validated snapshot, not the legacy plot/factoids.
        incoming_card = sanitize_incoming_card({
            "phones": {"aon": scenario_ticket.ground_truth["phone"]},
            "incident": {"number": f"ДЕМО-{demo_uuid[:8]}", "operator": "112"},
            "caller": {
                "name": scenario_ticket.ground_truth["fio"],
                "role": scenario_ticket.ground_truth["caller_status"],
                "address": f"{scenario_ticket.ground_truth['street']}, {scenario_ticket.ground_truth['house']}",
            },
            "description": ticket.plot,
            "statuses": {
                key: scenario_ticket.ground_truth[key]
                for key in ("injured", "ambulanceRefusal", "blocked")
            },
            "classification": {
                "section": ticket.category,
                "title": ticket.subcategory,
                "class": scenario_ticket.settings["class"],
                "visClass": scenario_ticket.settings["visClass"],
            },
            "services": [
                {"id": str(index), "name": name, "status": "Получена службой"}
                for index, name in enumerate(ticket.etalon_services)
            ],
        })
        card = IncidentCard(
            session_id=exam_session.session_id,
            scenario_id=ticket.ticket_id,
            operator_id=cadet_id,
            card_origin="112_CALL",
            status="open",
            filled_data={
                **deepcopy(incoming_card),
                "category": ticket.category,
                "subcategory": ticket.subcategory,
                "plot": ticket.plot,
                "factoids": ticket.factoids,
            },
            assigned_services={
                service["name"]: {
                    "id": service["id"], "status": service["status"], "history": [],
                }
                for service in incoming_card["services"]
            },
        )
        db.add(card)
        await db.flush()
        exam_session.dynamic_state = {
            "dds": {
                "incoming_card": incoming_card,
                "card_id": card.card_id,
                "actions": [],
                "submitted_at": None,
            }
        }

    await db.commit()
    await db.refresh(exam_session)

    ticket_key = ticket.ticket_id
    redirect_url = (
        f"/operator/journal?session_id={exam_session.session_id}&ticket_id={ticket_key}&incoming_call=true"
        if target_role == "OPERATOR_112" else
        f"/dds/journal?focus_session_id={exam_session.session_id}&focus_ticket_id={ticket_key}"
    )

    return DemoSessionResponse(
        session_id=exam_session.session_id,
        ticket_id=ticket_key,
        role=target_role,
        redirect_url=redirect_url,
    )


@sessions_v1_router.post(
    "",
    response_model=SessionConfigResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("TEACHER"))],
)
@sessions_v1_router.post(
    "/",
    response_model=SessionConfigResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("TEACHER"))],
    include_in_schema=False,
)
async def create_session_config(
    config: SessionConfigCreate,
    db: AsyncSession = Depends(get_db),
):
    exam_session = ExamSession(
        session_type=config.distribution_mode or "live_stream",
        status="active",
        categories=config.categories,
        complexity=config.complexity.value if hasattr(config.complexity, "value") else str(config.complexity),
        error_limit=config.error_limit,
        time_limit_seconds=config.time_limit_seconds,
    )
    db.add(exam_session)
    await db.commit()
    await db.refresh(exam_session)

    return SessionConfigResponse(
        session_id=exam_session.session_id,
        group_id=config.group_id,
        categories=exam_session.categories,
        complexity=config.complexity,
        distribution_mode=exam_session.session_type,
        error_limit=exam_session.error_limit,
        time_limit_seconds=exam_session.time_limit_seconds,
        status=exam_session.status,
    )


@sessions_v1_router.get(
    "/{session_id}/stats",
    response_model=SessionStatsResponse,
    dependencies=[Depends(require_role("TEACHER"))],
)
async def get_session_stats(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ExamSession).where(ExamSession.session_id == session_id)
    result = await db.execute(stmt)
    exam_session = result.scalar_one_or_none()

    session_status = exam_session.status if exam_session else "active"
    group_name = "Группа 101"
    if not exam_session:
        stmt_assign = select(Assignment).where(Assignment.assignment_id == session_id)
        res_assign = await db.execute(stmt_assign)
        assignment = res_assign.scalar_one_or_none()
        if assignment:
            session_status = assignment.status
            session_name_val = f"Урок #{session_id[:8]}"
        else:
            session_name_val = f"Сессия #{session_id[:8]}"
    else:
        session_name_val = f"Сессия #{session_id[:8]}"

    is_completed = (session_status == "COMPLETED")
    is_waiting = (session_status == "WAITING")

    cadets_data = [
        CadetSessionStats(
            cadet_id="cadet-1",
            cadet_name="Иванов Иван",
            status="PASSED" if is_completed else ("IN_PROGRESS" if not is_waiting else "IDLE"),
            current_ticket="Билет #2 (Завершено)" if is_completed else ("Билет #2 (Пожар в жилом секторе)" if not is_waiting else "Ожидание"),
            in_progress=0 if (is_completed or is_waiting) else 1,
            passed=2 if not is_waiting else 0,
            failed=0,
            progress=100 if is_completed else (66 if not is_waiting else 0),
            score=92 if not is_waiting else 0,
            last_activity="1 мин назад",
        ),
        CadetSessionStats(
            cadet_id="cadet-2",
            cadet_name="Петров Петр",
            status="PASSED" if not is_waiting else "IDLE",
            current_ticket="Билет #3 (Завершено)" if not is_waiting else "Ожидание",
            in_progress=0,
            passed=3 if not is_waiting else 0,
            failed=0,
            progress=100 if not is_waiting else 0,
            score=98 if not is_waiting else 0,
            last_activity="3 мин назад",
        ),
        CadetSessionStats(
            cadet_id="cadet-3",
            cadet_name="Сидорова Анна",
            status="FAILED" if not is_waiting else "IDLE",
            current_ticket="Билет #2 (ДТП с пострадавшими)" if not is_waiting else "Ожидание",
            in_progress=0,
            passed=1 if not is_waiting else 0,
            failed=1 if not is_waiting else 0,
            progress=100 if is_completed else (50 if not is_waiting else 0),
            score=64 if not is_waiting else 0,
            last_activity="Только что",
        ),
    ]

    total_in_progress = sum(c.in_progress for c in cadets_data)
    total_passed = sum(c.passed for c in cadets_data)
    total_failed = sum(c.failed for c in cadets_data)
    overall_progress = round(sum(c.progress for c in cadets_data) / max(len(cadets_data), 1))

    return SessionStatsResponse(
        session_id=session_id,
        session_name=session_name_val,
        group_name=group_name,
        status=session_status,
        overall_progress=overall_progress,
        total_cadets=len(cadets_data),
        total_in_progress=total_in_progress,
        total_passed=total_passed,
        total_failed=total_failed,
        cadets=cadets_data,
    )


@sessions_v1_router.post(
    "/{session_id}/evaluate",
    response_model=EvaluationResultResponse,
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)
@sessions_router.post(
    "/sessions/{session_id}/evaluate",
    response_model=EvaluationResultResponse,
    include_in_schema=False,
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)
async def evaluate_session_card(
    session_id: str,
    req: IncidentCardSubmit,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ExamSession).where(ExamSession.session_id == session_id)
    result = await db.execute(stmt)
    exam_session = result.scalar_one_or_none()

    if not exam_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    if await _is_assigned_dds_session(db, exam_session):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Assigned DDS sessions cannot be evaluated via legacy evaluate endpoint",
        )

    ticket_id = req.ticket_id or getattr(exam_session, "ticket_id", None)
    ticket = None
    if ticket_id:
        stmt_ticket = select(ScenarioTicket).where(ScenarioTicket.scenario_id == ticket_id)
        res_ticket = await db.execute(stmt_ticket)
        ticket = res_ticket.scalar_one_or_none()

    if not ticket and getattr(exam_session, "ticket_id", None):
        stmt_ticket = select(ScenarioTicket).where(ScenarioTicket.scenario_id == exam_session.ticket_id)
        res_ticket = await db.execute(stmt_ticket)
        ticket = res_ticket.scalar_one_or_none()

    etalon_services: list[str] = []
    if ticket:
        if hasattr(ticket, "content") and isinstance(ticket.content, dict) and "etalon_services" in ticket.content:
            etalon_services = list(ticket.content.get("etalon_services") or [])
        elif hasattr(ticket, "ground_truth") and isinstance(ticket.ground_truth, dict) and "etalon_services" in ticket.ground_truth:
            etalon_services = list(ticket.ground_truth.get("etalon_services") or [])
    elif ticket_id:
        stmt_gen = select(GeneratedTicket).where(GeneratedTicket.id == ticket_id)
        res_gen = await db.execute(stmt_gen)
        gen_ticket = res_gen.scalar_one_or_none()
        if gen_ticket:
            etalon_services = list(gen_ticket.etalon_services or [])

    # Save IncidentCard
    card = IncidentCard(
        card_origin="CALL_SIMULATION",
        session_id=exam_session.session_id,
        scenario_id=ticket.scenario_id if ticket else ticket_id,
        operator_id=exam_session.cadet_id,
        filled_data=req.model_dump(),
        assigned_services=req.assigned_services,
        status="closed",
    )
    db.add(card)
    await db.flush()

    # Evaluation / Scores calculation
    total = 100
    errors_list: list[str] = []
    time_taken_seconds = req.time_taken_seconds

    # Timing: norm is 90 seconds. If time_taken_seconds > 90, 10 penalty points for each full 10 seconds over.
    if time_taken_seconds > 90:
        overtime = time_taken_seconds - 90
        intervals = overtime // 10
        time_penalty = intervals * 10
        total -= time_penalty
        errors_list.append(f"Превышено время обработки вызова на {overtime} секунд")

    # Services:
    assigned_set = set(req.assigned_services)
    etalon_set = set(etalon_services)

    missing_services = sorted(list(etalon_set - assigned_set))
    if missing_services:
        missing_penalty = len(missing_services) * 30
        total -= missing_penalty
        errors_list.append(f"Не вызваны службы: {missing_services}")

    extra_services = sorted(list(assigned_set - etalon_set))
    if extra_services:
        extra_penalty = len(extra_services) * 5
        total -= extra_penalty
        errors_list.append(f"Вызваны лишние службы: {extra_services}")

    total = max(0, total)
    scores = {"total": total}
    metrics = {"time_taken_seconds": time_taken_seconds}

    # Save EvaluationResult and update session status
    eval_result = EvaluationResult(
        card_id=card.card_id,
        session_id=exam_session.session_id,
        scores=scores,
        metrics=metrics,
        errors_list=errors_list,
    )
    db.add(eval_result)

    exam_session.status = "COMPLETED"
    exam_session.end_time = datetime.datetime.now(datetime.timezone.utc)

    await db.commit()
    await db.refresh(eval_result)

    return EvaluationResultResponse(
        evaluation_id=eval_result.evaluation_id,
        scores=eval_result.scores,
        metrics=eval_result.metrics,
        errors_list=eval_result.errors_list,
    )



