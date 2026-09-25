"""API router for Classifier Engine (EKP)."""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.classifier_rules import calculate_recommended_services
from backend.core.deps import require_role
from backend.database import get_db
from backend.models.domain_06 import ClassifierRecord
from backend.schemas.classifier import (
    CalculateRequest,
    CalculateResponse,
    ClassifierRecordResponse,
)

router = APIRouter(
    prefix="/api/classifier",
    tags=["Classifier"],
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)
classifier_router = router


@router.get("/categories", response_model=List[str])
@router.get("/categories/", response_model=List[str], include_in_schema=False)
async def get_categories(db: AsyncSession = Depends(get_db)) -> List[str]:
    """Return distinct categories from classifier_records."""
    stmt = (
        select(ClassifierRecord.category)
        .distinct()
        .where(ClassifierRecord.category.is_not(None))
        .order_by(ClassifierRecord.category)
    )
    result = await db.execute(stmt)
    return [c for c in result.scalars().all() if c]


@router.get("/search", response_model=List[ClassifierRecordResponse])
@router.get("/search/", response_model=List[ClassifierRecordResponse], include_in_schema=False)
async def search_classifier(
    q: str = Query(default="", description="Search query"),
    limit: int = Query(default=20, ge=1, le=100, description="Limit results"),
    db: AsyncSession = Depends(get_db),
) -> List[ClassifierRecord]:
    """Search classifier records with ILIKE %q% over final_type and group."""
    query_str = (q or "").strip()
    if not query_str:
        return []

    pattern = f"%{query_str}%"
    conditions = [
        ClassifierRecord.final_type.ilike(pattern),
        ClassifierRecord.group.ilike(pattern),
    ]

    # In SQLite, standard ILIKE uses lower(col) LIKE lower(?) which is ASCII-only.
    # Adding case variants ensures case-insensitive search for Cyrillic on SQLite.
    for variant in {query_str.lower(), query_str.capitalize(), query_str.upper()}:
        var_pat = f"%{variant}%"
        conditions.append(ClassifierRecord.final_type.like(var_pat))
        conditions.append(ClassifierRecord.group.like(var_pat))

    stmt = select(ClassifierRecord).where(or_(*conditions)).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/calculate", response_model=List[str])
@router.post("/calculate/", response_model=List[str], include_in_schema=False)
async def calculate_services(
    request: CalculateRequest,
    db: AsyncSession = Depends(get_db),
) -> List[str]:
    """Calculate recommended emergency services for an incident situation."""
    record_id = request.get_record_id()
    record = None

    if record_id is not None:
        stmt = select(ClassifierRecord).where(ClassifierRecord.id == record_id)
        result = await db.execute(stmt)
        record = result.scalar_one_or_none()
    elif getattr(request, "final_type", None):
        stmt = select(ClassifierRecord).where(
            ClassifierRecord.final_type.ilike(request.final_type.strip())
        )
        result = await db.execute(stmt)
        record = result.scalars().first()

    if not record:
        target = record_id if record_id is not None else getattr(request, "final_type", None)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Classifier record '{target}' not found",
        )

    return calculate_recommended_services(
        base_services=record.base_services or [],
        has_victims=request.has_victims,
        is_blocked=request.is_blocked,
        is_fire=request.is_fire,
    )


@router.get("/subcategories", response_model=List[str])
async def get_subcategories(category: str, db: AsyncSession = Depends(get_db)):
    stmt = select(ClassifierRecord.final_type).where(ClassifierRecord.category == category).distinct().order_by(ClassifierRecord.final_type)
    res = await db.execute(stmt)
    return [r for r in res.scalars().all() if r]


@router.get("/services", response_model=List[str])
async def get_services(db: AsyncSession = Depends(get_db)):
    stmt = select(ClassifierRecord.base_services)
    res = await db.execute(stmt)
    all_services = set()
    for row in res.scalars().all():
        if row:
            for s in row:
                s_str = str(s).strip()
                if not s_str: continue
                lower_s = s_str.lower()
                if "101" in lower_s: all_services.add("01 Пожарные")
                elif "102" in lower_s: all_services.add("02 Полиция")
                elif "103" in lower_s: all_services.add("03 Скорая")
                elif "104" in lower_s: all_services.add("04 Газ")
                else: all_services.add(s_str)
    return sorted(list(all_services))

from pydantic import BaseModel
class ClassifierDetails(BaseModel):
    services: List[str]

@router.get("/details", response_model=ClassifierDetails)
async def get_classifier_details(category: str, subcategory: str, db: AsyncSession = Depends(get_db)):
    stmt = select(ClassifierRecord.base_services).where(
        ClassifierRecord.category == category,
        ClassifierRecord.final_type == subcategory
    ).limit(1)
    res = await db.execute(stmt)
    services_raw = res.scalar() or []
    
    all_services = set()
    for s in services_raw:
        s_str = str(s).strip()
        if not s_str: continue
        lower_s = s_str.lower()
        if "101" in lower_s: all_services.add("01 Пожарные")
        elif "102" in lower_s: all_services.add("02 Полиция")
        elif "103" in lower_s: all_services.add("03 Скорая")
        elif "104" in lower_s: all_services.add("04 Газ")
        else: all_services.add(s_str)
        
    return ClassifierDetails(services=sorted(list(all_services)))
