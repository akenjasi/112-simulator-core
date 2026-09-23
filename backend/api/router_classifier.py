"""API router for Classifier Engine (EKP)."""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.classifier_rules import calculate_recommended_services
from backend.database import get_db
from backend.models.domain_06 import ClassifierRecord
from backend.schemas.classifier import (
    CalculateRequest,
    CalculateResponse,
    ClassifierRecordResponse,
)

router = APIRouter(prefix="/api/classifier", tags=["Classifier"])
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
