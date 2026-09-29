"""API router for Classifier Engine (EKP)."""

import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.classifier_rules import calculate_recommended_services
from backend.database import get_db
from backend.models.domain_06 import ClassifierRecord
from backend.schemas.classifier import (
    CalculateRequest,
    ClassifierRecordResponse,
)

logger = logging.getLogger(__name__)

classifier_router = APIRouter(
    prefix="/api/classifier",
    tags=["Classifier"],
)
classifier_v1_router = APIRouter(
    prefix="/api/v1/classifier",
    tags=["Classifier v1"],
)
router = classifier_router

DEFAULT_CATEGORIES: List[str] = [
    "Пожар",
    "Медицина",
    "Происшествия",
    "ДТП",
    "Утечка газа",
    "Аварии и происшествия на транспортных объектах",
    "Аварии на гидротехнических сооружениях",
    "Аварии на опасных и производственных объектах",
    "Взрывы",
    "ДТП",
    "Запах газа",
    "Нарушение правопорядка",
    "Обрушения",
    "Оказание медицинской скорой и неотложной помощи",
    "Опасные геологические, гидрологические и метеорологические явления",
    "Пожары и задымления",
    "Проблемы на дороге",
    "Происшествия с участием животных",
    "Прочие происшествия",
    "Ребенок в опасности",
    "Смертельный исход человека",
    "Социальная помощь",
    "Угрозы взрывов и террористических актов",
    "Угрозы выброса опасных веществ",
    "Угрозы обрушений",
    "Человек в опасности",
    "Экологические происшествия",
    "Отмена вызова",
    "Тестовый вызов",
    "Передача дежурства",
    "Консультация",
    "Вызов на иностранном языке",
    "Ошибочно набран номер",
    "Справка-101",
    "Справка-102",
    "Справка-103",
]


def _resolve_base_services(
    final_type: Optional[str] = None,
    category: Optional[str] = None,
    tags: Optional[List[str]] = None,
) -> List[str]:
    name = f"{final_type or ''} {category or ''}".lower()
    tags_str = " ".join(tags or []).lower()
    full_text = f"{name} {tags_str}".strip()

    services: List[str] = []
    if any(k in full_text for k in ["Пожар", "пожар", "задымлен", "пламя", "взрыв", "гари"]):
        services.append("Служба 101")
    if any(k in full_text for k in ["Происшествия", "скор", "медицин", "пострадав", "травм"]):
        services.append("Служба 103")
    if any(k in full_text for k in ["ДТП", "газ"]):
        services.append("Служба 104")
    if any(k in full_text for k in ["дтп", "дорог", "цодд"]):
        services.append("ЦОДД")
    if any(k in full_text for k in ["мост", "гормост", "тоннель"]):
        services.append("Гормост")
    if any(k in full_text for k in ["транспорт", "автобус", "трамвай", "мосгортранс"]):
        services.append("Мосгортранс")
    if any(k in full_text for k in ["метро", "мцк"]):
        services.append("Метро")
        if "Служба 101" not in services:
            services.append("Служба 101")
    if any(k in full_text for k in ["вода", "водоканал", "канализац"]):
        services.append("Мосводоканал")
    if any(k in full_text for k in ["жкх", "деп. жкх"]):
        services.append("Деп. ЖКХ")
    if any(k in full_text for k in ["социальн", "цса", "бездомн"]):
        services.append("ГКУ ЦСА")
    if any(k in full_text for k in ["животн", "ветеринар", "собак"]):
        services.append("Комитет ветеринарии")

    non_emergency_keywords = [
        "отмена вызова",
        "тестовый вызов",
        "передача дежурства",
        "консультация",
        "вызов на иностранном языке",
        "ошибочно набран номер",
        "справка-101",
        "справка-102",
        "справка-103",
    ]
    if any(ne in full_text for ne in non_emergency_keywords):
        return []

    if not services:
        if "Медицина" in full_text or "полици" in full_text or "краж" in full_text or "драка" in full_text:
            services.append("Служба 102")
        else:
            services.append("Служба 101")

    return list(dict.fromkeys(services))


async def _handle_get_categories(db: AsyncSession = Depends(get_db)) -> List[str]:
    try:
        stmt = (
            select(ClassifierRecord.category)
            .distinct()
            .where(ClassifierRecord.category.is_not(None))
            .order_by(ClassifierRecord.category)
        )
        result = await db.execute(stmt)
        cats = [c for c in result.scalars().all() if c]
        if cats:
            return cats
    except Exception as e:
        logger.warning(f"Could not load categories from DB: {e}")
    return DEFAULT_CATEGORIES


async def _handle_search_classifier(
    q: str = Query(default="", description="Search query"),
    limit: int = Query(default=20, ge=1, le=100, description="Limit results"),
    db: AsyncSession = Depends(get_db),
) -> List[ClassifierRecord]:
    query_str = (q or "").strip()
    if not query_str:
        return []

    pattern = f"%{query_str}%"
    conditions = [
        ClassifierRecord.final_type.ilike(pattern),
        ClassifierRecord.group.ilike(pattern),
    ]
    for variant in {query_str.lower(), query_str.capitalize(), query_str.upper()}:
        var_pat = f"%{variant}%"
        conditions.append(ClassifierRecord.final_type.like(var_pat))
        conditions.append(ClassifierRecord.group.like(var_pat))

    try:
        stmt = select(ClassifierRecord).where(or_(*conditions)).limit(limit)
        result = await db.execute(stmt)
        return result.scalars().all()
    except Exception as e:
        logger.warning(f"Classifier search failed: {e}")
        return []


async def _handle_calculate_services(
    request: CalculateRequest,
    db: AsyncSession = Depends(get_db),
) -> List[str]:
    record_id = request.get_record_id()
    record = None

    if record_id is not None:
        try:
            stmt = select(ClassifierRecord).where(ClassifierRecord.id == record_id)
            result = await db.execute(stmt)
            record = result.scalar_one_or_none()
        except Exception as e:
            logger.warning(f"Error fetching record {record_id}: {e}")

    if not record and (getattr(request, "final_type", None) or getattr(request, "category", None)):
        target_name = (request.final_type or request.category or "").strip()
        try:
            stmt = select(ClassifierRecord).where(
                or_(
                    ClassifierRecord.final_type.ilike(f"%{target_name}%"),
                    ClassifierRecord.category.ilike(f"%{target_name}%"),
                    ClassifierRecord.group.ilike(f"%{target_name}%"),
                )
            )
            result = await db.execute(stmt)
            record = result.scalars().first()
        except Exception as e:
            logger.warning(f"Error searching record by name '{target_name}': {e}")

    base_services = []
    if record and record.base_services:
        base_services = list(record.base_services)
    else:
        base_services = _resolve_base_services(
            final_type=request.final_type,
            category=request.category,
            tags=request.tags,
        )

    # Check tags for victims, blocked, fire
    tags = request.tags or []
    has_victims = request.has_victims or any(
        "пострадав" in t.lower() or "медицин" in t.lower() for t in tags
    )
    is_blocked = request.is_blocked or any(
        "заблокир" in t.lower() or "придавил" in t.lower() or "нет доступа" in t.lower()
        for t in tags
    )
    is_fire = request.is_fire or any(
        "пламя" in t.lower() or "дым" in t.lower() or "гари" in t.lower() for t in tags
    )

    return calculate_recommended_services(
        base_services=base_services,
        has_victims=has_victims,
        is_blocked=is_blocked,
        is_fire=is_fire,
    )


async def _handle_get_subcategories(
    category: str,
    db: AsyncSession = Depends(get_db),
) -> List[str]:
    try:
        stmt = (
            select(ClassifierRecord.final_type)
            .where(ClassifierRecord.category == category)
            .distinct()
            .order_by(ClassifierRecord.final_type)
        )
        res = await db.execute(stmt)
        return [r for r in res.scalars().all() if r]
    except Exception as e:
        logger.warning(f"Error fetching subcategories: {e}")
        return []


async def _handle_get_services(db: AsyncSession = Depends(get_db)) -> List[str]:
    try:
        stmt = select(ClassifierRecord.base_services)
        res = await db.execute(stmt)
        all_services = set()
        for row in res.scalars().all():
            if row:
                for s in row:
                    s_str = str(s).strip()
                    if not s_str:
                        continue
                    lower_s = s_str.lower()
                    if "Пожар" in lower_s:
                        all_services.add("01 Пожарные")
                    elif "Медицина" in lower_s:
                        all_services.add("02 Полиция")
                    elif "Происшествия" in lower_s:
                        all_services.add("03 Скорая")
                    elif "ДТП" in lower_s:
                        all_services.add("04 Газ")
                    else:
                        all_services.add(s_str)
        return sorted(list(all_services))
    except Exception as e:
        logger.warning(f"Error fetching services: {e}")
        return ["01 Пожарные", "02 Полиция", "03 Скорая", "04 Газ", "ЦОДД", "Гормост"]


class ClassifierDetails(BaseModel):
    services: List[str]


async def _handle_get_details(
    category: str,
    subcategory: str,
    db: AsyncSession = Depends(get_db),
) -> ClassifierDetails:
    try:
        stmt = (
            select(ClassifierRecord.base_services)
            .where(
                ClassifierRecord.category == category,
                ClassifierRecord.final_type == subcategory,
            )
            .limit(1)
        )
        res = await db.execute(stmt)
        services_raw = res.scalar() or []
        all_services = set()
        for s in services_raw:
            s_str = str(s).strip()
            if not s_str:
                continue
            lower_s = s_str.lower()
            if "Пожар" in lower_s:
                all_services.add("01 Пожарные")
            elif "Медицина" in lower_s:
                all_services.add("02 Полиция")
            elif "Происшествия" in lower_s:
                all_services.add("03 Скорая")
            elif "ДТП" in lower_s:
                all_services.add("04 Газ")
            else:
                all_services.add(s_str)
        if all_services:
            return ClassifierDetails(services=sorted(list(all_services)))
    except Exception as e:
        logger.warning(f"Error fetching details: {e}")

    fallback_base = _resolve_base_services(final_type=subcategory, category=category)
    return ClassifierDetails(services=fallback_base)


# Register routes on both routers (/api/classifier and /api/v1/classifier)
for r in [classifier_router, classifier_v1_router]:
    r.add_api_route(
        "/categories",
        _handle_get_categories,
        methods=["GET"],
        response_model=List[str],
    )
    r.add_api_route(
        "/categories/",
        _handle_get_categories,
        methods=["GET"],
        response_model=List[str],
        include_in_schema=False,
    )
    r.add_api_route(
        "/search",
        _handle_search_classifier,
        methods=["GET"],
        response_model=List[ClassifierRecordResponse],
    )
    r.add_api_route(
        "/search/",
        _handle_search_classifier,
        methods=["GET"],
        response_model=List[ClassifierRecordResponse],
        include_in_schema=False,
    )
    r.add_api_route(
        "/calculate",
        _handle_calculate_services,
        methods=["POST"],
        response_model=List[str],
    )
    r.add_api_route(
        "/calculate/",
        _handle_calculate_services,
        methods=["POST"],
        response_model=List[str],
        include_in_schema=False,
    )
    r.add_api_route(
        "/subcategories",
        _handle_get_subcategories,
        methods=["GET"],
        response_model=List[str],
    )
    r.add_api_route(
        "/services",
        _handle_get_services,
        methods=["GET"],
        response_model=List[str],
    )
    r.add_api_route(
        "/details",
        _handle_get_details,
        methods=["GET"],
        response_model=ClassifierDetails,
    )
