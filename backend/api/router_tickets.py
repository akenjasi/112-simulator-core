"""API router for Ticket generation and management."""

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.bricks_compiler import compile_ticket
from backend.core.faker import FakeDataGenerator
from backend.core.ticket_generator import generate_tickets
from backend.core.tts_v2 import tts_engine_v2
from backend.database import AsyncSessionLocal, get_db
from backend.models.domain_02 import GeneratedTicket, ScenarioTicket
from backend.schemas.domain_02 import (
    TicketFilterParams,
    TicketGenerateAcceptedResponse,
    TicketGenerateRequest,
    TicketResponse,
    TicketStatusResponse,
)
from backend.schemas.generator import ClassifierRow

logger = logging.getLogger(__name__)

api_tickets_router = APIRouter(
    prefix="/api/tickets",
    tags=["Tickets"],
)

tickets_router = APIRouter(
    prefix="/api/v1/tickets",
    tags=["Tickets"],
)

# Helper function for display_id
def make_abbr(text: str) -> str:
    if not text:
        return "ХЗ"
    return "".join([w[0].upper() for w in text.split()[:2] if w])


AVAILABLE_DEFAULT_CATEGORIES: List[str] = [
    "Пожары и задымления",
    "ДТП",
    "Запах газа",
    "Оказание медицинской скорой и неотложной помощи",
    "Нарушение правопорядка",
    "Взрывы",
    "Аварии и происшествия в городском хозяйстве",
    "Человек в опасности",
]

# Preset templates for categories
CATEGORY_TEMPLATES: Dict[str, List[str]] = {
    "дтп": [
        "Срочно! Произошло лобовое столкновение двух автомобилей на ул. {street}, рядом с домом {house}. Водитель зажат, есть пострадавшие! Я {role} {first_name}.",
        "Авария, сильное ДТП возле дома {house} по улице {street}. Машина перевернулась, требуется деблокировка и скорая! Заявитель: {last_name} {first_name}.",
        "На перекрёстке у дома {house} на улице {street} столкнулись автобус и легковушка. Много пострадавших. Звонит {role}, тел. {phone}.",
    ],
    "пожар": [
        "Здравствуйте! Горит квартира на 3 этаже, сильный дым в подъезде по адресу ул. {street}, д. {house}! Звонит {role} {first_name}. Срочно пожарных!",
        "У нас пожар! Из окна валит густой чёрный дым, улица {street}, дом {house}. Я {role}, зовут {last_name} {first_name}. Помогите!",
        "Пожар в многоквартирном доме, улица {street}, д. {house}. Огонь перекинулся на балкон. Заявитель: {role} {first_name} {middle_name}, тел. {phone}.",
    ],
    "газ": [
        "В подъезде дома {house} на улице {street} резкий сильный запах газа, режет глаза! Жильцы выходят на улицу. Я {role} {first_name} {last_name}, тел. {phone}.",
        "Утечка газа на лестничной клетке по адресу {street}, д. {house}. Боимся взрыва! Заявитель: {role} {first_name}.",
    ],
    "медицин": [
        "Скорую помощь, пожалуйста! Человеку плохо с сердцем, потерял сознание по адресу ул. {street}, д. {house}. Я {role} {first_name} {last_name}.",
        "Человек упал на улице возле дома {house}, ул. {street}, тяжело дышит и не реагирует. Звонит {role} {first_name}. Пришлите реанимацию!",
    ],
    "правопоряд": [
        "Полицию срочно! Во дворе дома {house} по ул. {street} массовая драка, бьют витрины. Я {role} {first_name} {middle_name}.",
        "Во дворе на улице {street}, около дома {house}, группа неизвестных шумит и ломает забор. Заявитель: {role} {last_name} {first_name}.",
    ],
}

DEFAULT_TEMPLATES: List[str] = [
    "Срочно требуется помощь по адресу ул. {street}, д. {house}! Происшествие: {incident_name}. Звонит {role} {first_name} {last_name}, тел. {phone}.",
    "Здравствуйте! По адресу ул. {street}, дом {house} произошло ЧП: {incident_name}! Я {role} {first_name}. Срочно пришлите помощь!",
    "Помогите, у нас тут {incident_name}! Адрес: улица {street}, дом {house}. Заявитель: {role} {last_name} {first_name}.",
]

_CLASSIFIER_EKP_DATA: Optional[Dict[str, Any]] = None


def load_classifier_ekp() -> Dict[str, Any]:
    """Lazy load data/classifier_ekp.json."""
    global _CLASSIFIER_EKP_DATA
    if _CLASSIFIER_EKP_DATA is None:
        possible_paths = [
            os.path.join(os.path.dirname(__file__), "..", "..", "data", "classifier_ekp.json"),
            os.path.join(os.getcwd(), "data", "classifier_ekp.json"),
            "/home/orborus/Desktop/A_vibecoding/projects/112_simulator_2/data/classifier_ekp.json",
        ]
        for path in possible_paths:
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        _CLASSIFIER_EKP_DATA = json.load(f)
                    break
                except Exception as e:
                    logger.warning("Error loading classifier_ekp.json from %s: %s", path, e)
        if _CLASSIFIER_EKP_DATA is None:
            _CLASSIFIER_EKP_DATA = {"records": []}
    return _CLASSIFIER_EKP_DATA


def get_templates_for_category(category: str, subcategory: Optional[str] = None) -> List[str]:
    combined = f"{category} {subcategory or ''}".lower()
    for key, tpls in CATEGORY_TEMPLATES.items():
        if key in combined:
            return tpls
    return DEFAULT_TEMPLATES


def extract_service_codes(record: Dict[str, Any], category: str) -> List[str]:
    raw_services = record.get("services") or record.get("all_services") or []
    codes = set()
    for s in raw_services:
        s_str = str(s).lower()
        if "101" in s_str or "пожар" in s_str or "мчс" in s_str:
            codes.add("01")
        if "102" in s_str or "полиц" in s_str or "мвд" in s_str:
            codes.add("02")
        if "103" in s_str or "скорая" in s_str or "медицин" in s_str or "цэмп" in s_str:
            codes.add("03")
        if "104" in s_str or "газ" in s_str:
            codes.add("04")
    if not codes:
        cat_lower = category.lower()
        if "пожар" in cat_lower:
            codes = {"01", "03"}
        elif "дтп" in cat_lower:
            codes = {"01", "02", "03"}
        elif "газ" in cat_lower:
            codes = {"04", "01"}
        elif "медицин" in cat_lower:
            codes = {"03"}
        elif "правопоряд" in cat_lower:
            codes = {"02"}
        else:
            codes = {"01"}
    return sorted(list(codes))


def resolve_classifier_row(category: str, subcategory: Optional[str] = None) -> ClassifierRow:
    ekp_data = load_classifier_ekp()
    records = ekp_data.get("records", [])

    cat_query = (category or "").strip().lower()
    sub_query = (subcategory or "").strip().lower() if subcategory else ""

    matched_records = [
        r for r in records
        if cat_query in r.get("category", "").lower() or r.get("category", "").lower() in cat_query
    ]

    if sub_query and matched_records:
        sub_matched = [
            r for r in matched_records
            if sub_query in r.get("group", "").lower()
            or sub_query in r.get("final_type", "").lower()
            or r.get("group", "").lower() in sub_query
        ]
        if sub_matched:
            matched_records = sub_matched

    templates = get_templates_for_category(category, subcategory)

    import random
    if matched_records:
        rec = random.choice(matched_records)
        code = str(rec.get("id") or "01.01")
        incident_name = rec.get("final_type") or rec.get("group") or category
        services = extract_service_codes(rec, category)
        raw_markers = [
            rec.get("feature1"),
            rec.get("feature2"),
            rec.get("feature3"),
            rec.get("group"),
            rec.get("final_type"),
        ]
        markers = [str(m) for m in raw_markers if m]
        
        # Если подкатегория не была передана, мы назначаем её из выбранного инцидента
        if not subcategory:
            subcategory = rec.get("group") or rec.get("final_type")
    else:
        code = "01.01"
        incident_name = subcategory or category
        services = extract_service_codes({}, category)
        markers = [category]

    return ClassifierRow(
        code=code,
        incident_name=incident_name,
        services=services,
        markers=markers,
        templates=templates,
    )


def expand_address_for_tts(text: str) -> str:
    """Разворачивание сокращений адресов для TTS."""
    if not text:
        return ""
    text = re.sub(r'\bул\.\s*', 'улица ', text)
    text = re.sub(r'\bд\.\s*', 'дом ', text)
    text = re.sub(r'\bк\.\s*', 'корпус ', text)
    text = re.sub(r'\bкв\.\s*', 'квартира ', text)
    text = re.sub(r'\bпр-кт\.\s*', 'проспект ', text)
    text = re.sub(r'\bпр-кт\s+', 'проспект ', text)
    return text.strip()


expand_address = expand_address_for_tts


def format_phone_for_tts(phone: str) -> str:
    """Извлечение только цифр и вставка пробелов для поцифровой озвучки номера."""
    if not phone:
        return ""
    digits = re.sub(r'\D', '', str(phone))
    return " ".join(digits)


active_generations: int = 0


async def generate_tickets_background_task(
    category: Optional[str],
    subcategory: Optional[str],
    count: int,
):
    """Background task to generate tickets, save to DB, and cache TTS audio for bricks."""
    global active_generations
    processed = 0
    try:
        faker = FakeDataGenerator()
        tickets_with_sub = []
        import random

        for _ in range(count):
            cur_cat = category
            if not cur_cat or cur_cat.strip().lower() in ["случайная категория", "случайная", "random", "any"]:
                cur_cat = random.choice(AVAILABLE_DEFAULT_CATEGORIES)
            classifier_row = resolve_classifier_row(category=cur_cat, subcategory=subcategory)
            ticket_sub = subcategory or classifier_row.incident_name
            generated_list = generate_tickets(classifier_row=classifier_row, count=1, faker=faker)
            for t in generated_list:
                tickets_with_sub.append((t, cur_cat, ticket_sub))

        # 1. Save to DB
        async with AsyncSessionLocal() as session:
            max_seq = await session.execute(select(func.max(GeneratedTicket.sequence_number)))
            current_seq = max_seq.scalar() or 0

            for t, cur_cat, cur_sub in tickets_with_sub:
                current_seq += 1
                gen_ticket = GeneratedTicket(
                    id=t.ticket_id,
                    category=cur_cat,
                    subcategory=cur_sub,
                    complexity=t.complexity,
                    plot=t.plot,
                    factoids=t.factoids,
                    ground_truth=t.ground_truth,
                    etalon_services=t.etalon_services,
                    sequence_number=current_seq,
                )
                session.add(gen_ticket)

                scenario_ticket = ScenarioTicket(
                    scenario_id=t.ticket_id,
                    settings={
                        "complexity": t.complexity,
                        "etalon_services": t.etalon_services,
                        "plot": t.plot,
                        "category": cur_cat,
                        "subcategory": cur_sub,
                        "sequence_number": current_seq,
                    },
                    ground_truth=t.ground_truth,
                    ai_content={
                        "factoids": t.factoids,
                        "plot": t.plot,
                    },
                    workflow_state={"status": "active"},
                )
                session.add(scenario_ticket)

            await session.commit()

        # 2. Compile BricksMatrix and cache audio via TTS
        for t, _, _ in tickets_with_sub:
            try:
                matrix = compile_ticket(t)
                for brick in matrix.bricks:
                    if brick.text:
                        try:
                            tts_engine_v2.synthesize(brick.text)
                        except Exception as e:
                            logger.warning("TTS synthesize error for text '%s': %s", brick.text[:30], e)
            except Exception as e:
                logger.warning("Error compiling bricks for ticket %s: %s", t.ticket_id, e)
            finally:
                processed += 1
                active_generations = max(0, active_generations - 1)

    except Exception as e:
        logger.error("Error in generate_tickets_background_task: %s", e, exc_info=True)
    finally:
        remaining_to_deduct = count - processed
        if remaining_to_deduct > 0:
            active_generations = max(0, active_generations - remaining_to_deduct)



@api_tickets_router.get("/status", response_model=TicketStatusResponse)
@api_tickets_router.get("/status/", response_model=TicketStatusResponse, include_in_schema=False)
@tickets_router.get("/status", response_model=TicketStatusResponse)
@tickets_router.get("/status/", response_model=TicketStatusResponse, include_in_schema=False)
async def get_tickets_status() -> TicketStatusResponse:
    """Статус фоновых генераций для честного UI."""
    return TicketStatusResponse(
        is_generating=active_generations > 0,
        remaining_tickets=active_generations,
    )


@api_tickets_router.get("", response_model=List[TicketResponse])
@api_tickets_router.get("/", response_model=List[TicketResponse], include_in_schema=False)
@tickets_router.get("", response_model=List[TicketResponse])
@tickets_router.get("/", response_model=List[TicketResponse], include_in_schema=False)
async def list_tickets(
    category: Optional[str] = Query(None, description="Категория билета"),
    subcategory: Optional[str] = Query(None, description="Подкатегория"),
    complexity: Optional[int] = Query(None, ge=1, le=3, description="Сложность (1-3)"),
    limit: Optional[int] = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
) -> List[TicketResponse]:
    """Получение списка сохраненных билетов с поддержкой фильтрации."""
    TicketFilterParams(category=category, subcategory=subcategory, complexity=complexity)

    stmt = select(GeneratedTicket).order_by(desc(GeneratedTicket.created_at))
    if category:
        stmt = stmt.where(GeneratedTicket.category == category)
    if subcategory:
        stmt = stmt.where(GeneratedTicket.subcategory == subcategory)
    if complexity is not None:
        stmt = stmt.where(GeneratedTicket.complexity == complexity)
    if limit is not None:
        stmt = stmt.limit(limit)

    result = await db.execute(stmt)
    records = result.scalars().all()

    output: List[TicketResponse] = []
    for r in records:
        seq = r.sequence_number if r.sequence_number is not None else 0
        display_id = f"{make_abbr(r.category)}_{make_abbr(r.subcategory)}_{seq}"
        output.append(
            TicketResponse(
                id=r.id,
                ticket_id=r.id,
                display_id=display_id,
                sequence_number=r.sequence_number,
                category=r.category,
                subcategory=r.subcategory,
                complexity=r.complexity,
                plot=r.plot,
                factoids=r.factoids or {},
                ground_truth=r.ground_truth or {},
                etalon_services=r.etalon_services or [],
                status="active",
                created_at=r.created_at,
            )
        )

    # Legacy fallback to ScenarioTicket if GeneratedTicket has no records and no filters
    if not output and category is None and subcategory is None and complexity is None:
        stmt_legacy = select(ScenarioTicket).order_by(desc(ScenarioTicket.created_at)).limit(limit or 100)
        res_legacy = await db.execute(stmt_legacy)
        for r in res_legacy.scalars().all():
            settings = r.settings or {}
            ai = r.ai_content or {}
            gt = r.ground_truth or {}
            cat = settings.get("category", "Общее")
            sub = settings.get("subcategory")
            seq = settings.get("sequence_number", 0)
            display_id = f"{make_abbr(cat)}_{make_abbr(sub)}_{seq}"
            output.append(
                TicketResponse(
                    id=r.scenario_id,
                    ticket_id=r.scenario_id,
                    display_id=display_id,
                    sequence_number=seq,
                    category=cat,
                    subcategory=sub,
                    complexity=settings.get("complexity", 1),
                    plot=settings.get("plot") or ai.get("plot", ""),
                    factoids=ai.get("factoids", {}),
                    ground_truth=gt,
                    etalon_services=settings.get("etalon_services", []),
                    status=r.workflow_state.get("status", "active") if r.workflow_state else "active",
                    created_at=r.created_at,
                )
            )

    return output


@api_tickets_router.post(
    "/generate",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=TicketGenerateAcceptedResponse,
)
@api_tickets_router.post(
    "/generate/",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=TicketGenerateAcceptedResponse,
    include_in_schema=False,
)
@tickets_router.post(
    "/generate",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=TicketGenerateAcceptedResponse,
)
@tickets_router.post(
    "/generate/",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=TicketGenerateAcceptedResponse,
    include_in_schema=False,
)
async def generate_ticket_endpoint(
    req: TicketGenerateRequest,
    background_tasks: BackgroundTasks,
) -> TicketGenerateAcceptedResponse:
    """Асинхронная генерация пакета билетов через BackgroundTasks."""
    global active_generations
    active_generations += req.count
    background_tasks.add_task(
        generate_tickets_background_task,
        category=req.category,
        subcategory=req.subcategory,
        count=req.count,
    )
    return TicketGenerateAcceptedResponse(message="Генерация начата")


@api_tickets_router.get("/{ticket_id}/audio")
@api_tickets_router.get("/{ticket_id}/audio/", include_in_schema=False)
@tickets_router.get("/{ticket_id}/audio")
@tickets_router.get("/{ticket_id}/audio/", include_in_schema=False)
async def get_ticket_audio(
    ticket_id: str,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Генерация/склеивание аудио озвучки билета."""
    try:
        ticket = await db.get(GeneratedTicket, ticket_id)
        plot = ""
        gt = {}
        if ticket:
            plot = ticket.plot or ""
            gt = ticket.ground_truth or {}
        else:
            scenario_ticket = await db.get(ScenarioTicket, ticket_id)
            if not scenario_ticket:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Билет не найден")
            settings = scenario_ticket.settings or {}
            ai = scenario_ticket.ai_content or {}
            plot = settings.get("plot") or ai.get("plot", "")
            gt = scenario_ticket.ground_truth or {}

        if not isinstance(gt, dict):
            gt = {}

        speaker = gt.get("speaker", "aidar")
        texts: List[str] = []
        if plot:
            texts.append(expand_address_for_tts(str(plot)))
        if gt.get("fio"):
            texts.append(str(gt["fio"]))
        if gt.get("phone"):
            texts.append("номер " + format_phone_for_tts(str(gt["phone"])))

        address_parts = []
        if gt.get("street"):
            address_parts.append(str(gt["street"]))
        if gt.get("house"):
            address_parts.append(str(gt["house"]))
        if address_parts:
            texts.append(expand_address_for_tts(" ".join(address_parts)))

        audio_bytes = tts_engine_v2.concatenate_tts(texts, speaker=speaker)
        return Response(content=audio_bytes, media_type="audio/wav")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating ticket audio for ticket %s: %s", ticket_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_tickets_router.delete("/{ticket_id}", status_code=status.HTTP_200_OK)
@api_tickets_router.delete("/{ticket_id}/", status_code=status.HTTP_200_OK, include_in_schema=False)
@tickets_router.delete("/{ticket_id}", status_code=status.HTTP_200_OK)
@tickets_router.delete("/{ticket_id}/", status_code=status.HTTP_200_OK, include_in_schema=False)
async def delete_ticket(
    ticket_id: str,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Удаление билета по ID из GeneratedTicket и ScenarioTicket."""
    gen_ticket = await db.get(GeneratedTicket, ticket_id)
    scenario_ticket = await db.get(ScenarioTicket, ticket_id)

    if not gen_ticket and not scenario_ticket:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Билет не найден",
        )

    if gen_ticket:
        await db.delete(gen_ticket)
    if scenario_ticket:
        await db.delete(scenario_ticket)

    await db.commit()
    return {"status": "ok", "message": f"Билет {ticket_id} успешно удален", "id": ticket_id}

