"""API router for Ticket generation and management."""

import random
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.deps import require_role
from backend.core.faker import FakeDataGenerator
from backend.core.ticket_generator import generate_tickets
from backend.database import get_db
from backend.models.domain_02 import ScenarioTicket
from backend.schemas.generator import ClassifierRow, TicketData

tickets_router = APIRouter(
    prefix="/api/v1/tickets",
    tags=["Tickets"],
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)

# Preset classifier scenarios for realistic algorithmic randomization
DEFAULT_CLASSIFIER_ROWS = [
    ClassifierRow(
        code="01.01",
        incident_name="Пожар в жилом здании",
        services=["01", "03"],
        markers=["дым", "огонь", "пострадавшие"],
        templates=[
            "Здравствуйте! Горит квартира на 3 этаже, сильный дым в подъезде по адресу ул. {street}, д. {house}! Звонит {role} {first_name}. Срочно пожарных!",
            "У нас пожар! Из окна валит густой чёрный дым, улица {street}, дом {house}. Я {role}, зовут {last_name} {first_name}. Помогите!",
            "Пожар в многоквартирном доме, улица {street}, д. {house}. Огонь перекинулся на балкон. Заявитель: {role} {first_name} {middle_name}, тел. {phone}.",
        ],
    ),
    ClassifierRow(
        code="02.01",
        incident_name="ДТП с пострадавшими",
        services=["01", "02", "03"],
        markers=["авария", "зажатые", "травмы"],
        templates=[
            "Срочно! Произошло лобовое столкновение двух автомобилей на ул. {street}, рядом с домом {house}. Водитель зажат, есть пострадавшие! Я {role} {first_name}.",
            "Авария, сильное ДТП возле дома {house} по улице {street}. Машина перевернулась, требуется деблокировка и скорая! Заявитель: {last_name} {first_name}.",
            "На перекрёстке у дома {house} на улице {street} столкнулись автобус и легковушка. Много пострадавших. Звонит {role}, тел. {phone}.",
        ],
    ),
    ClassifierRow(
        code="03.01",
        incident_name="Острое нарушение здоровья / Инфаркт",
        services=["03"],
        markers=["сердце", "сознание"],
        templates=[
            "Скорую помощь, пожалуйста! Человеку плохо с сердцем, потерял сознание по адресу ул. {street}, д. {house}. Я {role} {first_name} {last_name}.",
            "Человек упал на улице возле дома {house}, ул. {street}, тяжело дышит и не реагирует. Звонит {role} {first_name}. Пришлите реанимацию!",
        ],
    ),
    ClassifierRow(
        code="04.01",
        incident_name="Утечка газа в подъезде",
        services=["04", "01"],
        markers=["газ", "запах"],
        templates=[
            "В подъезде дома {house} на улице {street} резкий сильный запах газа, режет глаза! Жильцы выходят на улицу. Я {role} {first_name} {last_name}, тел. {phone}.",
            "Утечка газа на лестничной клетке по адресу {street}, д. {house}. Боимся взрыва! Заявитель: {role} {first_name}.",
        ],
    ),
    ClassifierRow(
        code="02.02",
        incident_name="Нарушение общественного порядка / Драка",
        services=["02"],
        markers=["драка", "шум"],
        templates=[
            "Полицию срочно! Во дворе дома {house} по ул. {street} массовая драка, бьют витрины. Я {role} {first_name} {middle_name}.",
            "Во дворе на улице {street}, около дома {house}, группа неизвестных шумит и ломает забор. Заявитель: {role} {last_name} {first_name}.",
        ],
    ),
]


class TicketGenerateRequest(BaseModel):
    count: int = Field(default=50, ge=1, le=500, description="Количество билетов для генерации")


class TicketItemResponse(BaseModel):
    ticket_id: str
    complexity: int
    plot: str
    etalon_services: List[str]
    factoids: Dict[str, Any] = Field(default_factory=dict)
    ground_truth: Dict[str, Any] = Field(default_factory=dict)
    status: str = "draft"
    created_at: Optional[str] = None


class ApproveResponse(BaseModel):
    message: str
    approved_count: int


@tickets_router.get("", response_model=List[TicketItemResponse])
@tickets_router.get("/", response_model=List[TicketItemResponse], include_in_schema=False)
async def list_tickets(
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
) -> List[TicketItemResponse]:
    """Получение списка сохраненных билетов."""
    stmt = select(ScenarioTicket).order_by(desc(ScenarioTicket.created_at)).limit(limit)
    res = await db.execute(stmt)
    records = res.scalars().all()

    output: List[TicketItemResponse] = []
    for r in records:
        settings = r.settings or {}
        gt = r.ground_truth or {}
        ai = r.ai_content or {}
        workflow = r.workflow_state or {}

        output.append(
            TicketItemResponse(
                ticket_id=r.scenario_id,
                complexity=settings.get("complexity", 1),
                plot=settings.get("plot") or ai.get("plot", ""),
                etalon_services=settings.get("etalon_services", []),
                factoids=ai.get("factoids", {}),
                ground_truth=gt,
                status=workflow.get("status", "draft"),
                created_at=r.created_at.isoformat() if r.created_at else None,
            )
        )
    return output


@tickets_router.post("/generate", response_model=List[TicketItemResponse])
@tickets_router.post("/generate/", response_model=List[TicketItemResponse], include_in_schema=False)
async def generate_ticket_package(
    req: TicketGenerateRequest,
    db: AsyncSession = Depends(get_db),
) -> List[TicketItemResponse]:
    """Сгенерировать пакет билетов с помощью алгоритмического рандомизатора."""
    faker = FakeDataGenerator()
    total_count = req.count

    # Distribute count across different classifier rows
    rows = DEFAULT_CLASSIFIER_ROWS
    num_rows = len(rows)
    base_per_row = total_count // num_rows
    remainder = total_count % num_rows

    all_tickets: List[TicketData] = []
    for idx, row in enumerate(rows):
        cnt = base_per_row + (1 if idx < remainder else 0)
        if cnt > 0:
            batch = generate_tickets(classifier_row=row, count=cnt, faker=faker)
            all_tickets.extend(batch)

    # Shuffle to intermix different scenario types
    random.shuffle(all_tickets)

    # Save to database
    response_items: List[TicketItemResponse] = []
    for t in all_tickets:
        scenario = ScenarioTicket(
            scenario_id=t.ticket_id,
            settings={
                "complexity": t.complexity,
                "etalon_services": t.etalon_services,
                "plot": t.plot,
            },
            ground_truth=t.ground_truth,
            ai_content={
                "factoids": t.factoids,
                "plot": t.plot,
            },
            workflow_state={"status": "draft"},
        )
        db.add(scenario)
        response_items.append(
            TicketItemResponse(
                ticket_id=t.ticket_id,
                complexity=t.complexity,
                plot=t.plot,
                etalon_services=t.etalon_services,
                factoids=t.factoids,
                ground_truth=t.ground_truth,
                status="draft",
            )
        )

    await db.commit()
    return response_items


@tickets_router.post("/approve", response_model=ApproveResponse)
@tickets_router.post("/approve/", response_model=ApproveResponse, include_in_schema=False)
async def approve_ticket_package(
    db: AsyncSession = Depends(get_db),
) -> ApproveResponse:
    """Утвердить текущий пакет билетов."""
    stmt = select(ScenarioTicket)
    res = await db.execute(stmt)
    tickets = res.scalars().all()

    approved_count = 0
    for t in tickets:
        state = dict(t.workflow_state or {})
        if state.get("status") != "approved":
            state["status"] = "approved"
            t.workflow_state = state
            approved_count += 1

    await db.commit()
    return ApproveResponse(
        message="Пакет билетов успешно утвержден",
        approved_count=approved_count,
    )
