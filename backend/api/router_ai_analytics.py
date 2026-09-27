"""API router for AI background analysis (Qwen 3.5 9B / Qwen 2.5 9B).

Endpoints:
  POST/GET /api/ai-analytics/trigger      — Trigger manual or scheduled background analysis
  GET      /api/ai-analytics/student/{id} — Retrieve advice history for a cadet
  GET      /api/ai-analytics/group/{id}   — Retrieve AI analysis reports for a group
  PATCH    /api/ai-analytics/advice/{id}/read — Mark advice as read
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.ai_worker import (
    DEFAULT_MODEL_NAME,
    MODEL_FILENAME,
    MODEL_GGUF_URL,
    ai_worker,
    run_cadet_analysis,
    run_group_analysis,
)
from backend.core.deps import get_current_user
from backend.database import get_db
from backend.models.domain_01 import User, StudentGroup
from backend.models.domain_03 import AIStudentAdvice, AIGroupAdvice

logger = logging.getLogger("router_ai_analytics")

router = APIRouter(
    prefix="/api/ai-analytics",
    tags=["AI Analytics"],
)


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class AIRefineRequest(BaseModel):
    correction_comment: str


class TriggerAnalysisRequest(BaseModel):
    cadet_id: Optional[str] = None
    group_id: Optional[str] = None
    all_students: bool = False
    background: bool = True
    sleep_seconds: Optional[float] = None
    model: Optional[str] = DEFAULT_MODEL_NAME


class AdviceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    advice_id: str
    cadet_id: Optional[str] = None
    group_id: Optional[str] = None
    analysis_text: str
    date: datetime
    is_read: bool
    model_used: str


class ModelInfoResponse(BaseModel):
    model_name: str
    gguf_url: str
    filename: str
    status: str


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/info", response_model=ModelInfoResponse)
async def get_ai_model_info():
    """Information about configured heavy LLM for background analysis."""
    return ModelInfoResponse(
        model_name=DEFAULT_MODEL_NAME,
        gguf_url=MODEL_GGUF_URL,
        filename=MODEL_FILENAME,
        status="ready",
    )


@router.post("/trigger")
@router.get("/trigger")
async def trigger_ai_analysis(
    req: Optional[TriggerAnalysisRequest] = None,
    cadet_id: Optional[str] = Query(None),
    group_id: Optional[str] = Query(None),
    all_students: bool = Query(False),
    background: bool = Query(True),
    sleep_seconds: Optional[float] = Query(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Trigger background or immediate AI analysis for a cadet, a group, or all active students."""
    c_id = (req.cadet_id if req else None) or cadet_id
    g_id = (req.group_id if req else None) or group_id
    all_std = (req.all_students if req else False) or all_students
    bg = (req.background if req else True) if background is None else background
    if req and req.background is not None:
        bg = req.background
    sleep_sec = (req.sleep_seconds if req else None) if sleep_seconds is None else sleep_seconds
    if sleep_sec is None:
        sleep_sec = 0.0 if not bg else 5.0
    model = (req.model if req else None) or DEFAULT_MODEL_NAME

    # Role check: cadets can only trigger for themselves
    if current_user and current_user.role == "CADET":
        c_id = current_user.user_id
        g_id = None
        all_std = False

    # Default fallback: if nothing specified, analyze current user or first available cadet
    if not c_id and not g_id and not all_std:
        if current_user:
            c_id = current_user.user_id
        else:
            stmt = select(User).where(User.role.in_(["CADET", "STUDENT"])).limit(1)
            res = await db.execute(stmt)
            found_user = res.scalar_one_or_none()
            if found_user:
                c_id = found_user.user_id
            else:
                return {
                    "status": "warning",
                    "message": "No cadets or groups found to analyze.",
                }

    tasks_triggered = []

    # 1. Single Cadet Analysis
    if c_id:
        if not bg:
            # Synchronous execution
            advice = await run_cadet_analysis(
                cadet_id=c_id,
                db=db,
                sleep_seconds=sleep_sec,
                model=model,
            )
            return {
                "status": "completed",
                "target_type": "cadet",
                "target_id": c_id,
                "advice_id": advice.advice_id,
                "model_used": advice.model_used,
            }
        else:
            # Ensure background worker is running
            ai_worker.start()
            job_id = await ai_worker.enqueue(
                job_type="cadet",
                target_id=c_id,
                sleep_seconds=sleep_sec,
                model=model,
            )
            tasks_triggered.append({"type": "cadet", "target_id": c_id, "job_id": job_id})

    # 2. Group Analysis
    if g_id:
        if not bg:
            advice = await run_group_analysis(
                group_id=g_id,
                db=db,
                sleep_seconds=sleep_sec,
                model=model,
            )
            return {
                "status": "completed",
                "target_type": "group",
                "target_id": g_id,
                "advice_id": advice.advice_id,
                "model_used": advice.model_used,
            }
        else:
            ai_worker.start()
            job_id = await ai_worker.enqueue(
                job_type="group",
                target_id=g_id,
                sleep_seconds=sleep_sec,
                model=model,
            )
            tasks_triggered.append({"type": "group", "target_id": g_id, "job_id": job_id})

    # 3. All Students Analysis
    if all_std:
        stmt_users = select(User).where(User.role.in_(["CADET", "STUDENT"])).limit(50)
        res_users = await db.execute(stmt_users)
        cadets = res_users.scalars().all()
        ai_worker.start()
        for cadet in cadets:
            job_id = await ai_worker.enqueue(
                job_type="cadet",
                target_id=cadet.user_id,
                sleep_seconds=sleep_sec,
                model=model,
            )
            tasks_triggered.append({"type": "cadet", "target_id": cadet.user_id, "job_id": job_id})

    return {
        "status": "queued",
        "count": len(tasks_triggered),
        "tasks": tasks_triggered,
        "model": model,
        "message": "AI analysis tasks have been placed in the background processing queue.",
    }


@router.get("/student/{id}", response_model=List[AdviceResponse])
async def get_student_advice(
    id: str,
    unread_only: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Retrieve AI-generated guidance and recommendations for a cadet."""
    # Cadets can only inspect their own advice
    if current_user and current_user.role == "CADET" and current_user.user_id != id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to another cadet's AI recommendations.",
        )

    stmt = select(AIStudentAdvice).where(AIStudentAdvice.cadet_id == id)
    if unread_only:
        stmt = stmt.where(AIStudentAdvice.is_read == False)  # noqa: E712
    stmt = stmt.order_by(AIStudentAdvice.date.desc()).limit(limit)

    result = await db.execute(stmt)
    advices = result.scalars().all()

    return [
        AdviceResponse(
            id=adv.advice_id,
            advice_id=adv.advice_id,
            cadet_id=adv.cadet_id,
            group_id=None,
            analysis_text=adv.analysis_text,
            date=adv.date,
            is_read=adv.is_read,
            model_used=adv.model_used,
        )
        for adv in advices
    ]


@router.get("/group/{id}", response_model=List[AdviceResponse])
async def get_group_advice(
    id: str,
    unread_only: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Retrieve AI-generated group analytical reports for instructors."""
    if current_user and current_user.role == "CADET":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cadets do not have access to group instructor reports.",
        )

    stmt = select(AIGroupAdvice).where(AIGroupAdvice.group_id == id)
    if unread_only:
        stmt = stmt.where(AIGroupAdvice.is_read == False)  # noqa: E712
    stmt = stmt.order_by(AIGroupAdvice.date.desc()).limit(limit)

    result = await db.execute(stmt)
    advices = result.scalars().all()

    return [
        AdviceResponse(
            id=adv.advice_id,
            advice_id=adv.advice_id,
            cadet_id=None,
            group_id=adv.group_id,
            analysis_text=adv.analysis_text,
            date=adv.date,
            is_read=adv.is_read,
            model_used=adv.model_used,
        )
        for adv in advices
    ]


@router.patch("/advice/{advice_id}/read")
@router.patch("/student/advice/{advice_id}/read")
async def mark_student_advice_as_read(
    advice_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Mark student AI advice item as read."""
    stmt = select(AIStudentAdvice).where(AIStudentAdvice.advice_id == advice_id)
    res = await db.execute(stmt)
    adv = res.scalar_one_or_none()

    if not adv:
        # Check group advice as fallback
        stmt_grp = select(AIGroupAdvice).where(AIGroupAdvice.advice_id == advice_id)
        res_grp = await db.execute(stmt_grp)
        grp_adv = res_grp.scalar_one_or_none()
        if grp_adv:
            grp_adv.is_read = True
            await db.commit()
            return {"status": "ok", "advice_id": advice_id, "is_read": True}
        raise HTTPException(status_code=404, detail="Advice item not found.")

    if current_user and current_user.role == "CADET" and current_user.user_id != adv.cadet_id:
        raise HTTPException(status_code=403, detail="Cannot mark other cadet's advice as read.")

    adv.is_read = True
    await db.commit()
    return {"status": "ok", "advice_id": advice_id, "is_read": True}


@router.patch("/group/advice/{advice_id}/read")
async def mark_group_advice_as_read(
    advice_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Mark group AI advice report as read."""
    stmt = select(AIGroupAdvice).where(AIGroupAdvice.advice_id == advice_id)
    res = await db.execute(stmt)
    adv = res.scalar_one_or_none()
    if not adv:
        raise HTTPException(status_code=404, detail="Group advice not found.")

    adv.is_read = True
    await db.commit()
    return {"status": "ok", "advice_id": advice_id, "is_read": True}


@router.post("/student/{advice_id}/refine", response_model=AdviceResponse)
async def refine_student_advice(
    advice_id: str,
    req: AIRefineRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user),
):
    """Refine AI student advice based on a correction comment."""
    stmt = select(AIStudentAdvice).where(AIStudentAdvice.advice_id == advice_id)
    res = await db.execute(stmt)
    adv = res.scalar_one_or_none()

    if not adv:
        raise HTTPException(status_code=404, detail="Student advice not found.")

    if current_user and current_user.role == "CADET":
        raise HTTPException(status_code=403, detail="Cadets cannot refine advice.")

    # Simulate LLM call
    await asyncio.sleep(2)

    # Update analysis_text
    adv.analysis_text = f"[Перегенерировано ИИ с учетом: {req.correction_comment}]\n\n" + adv.analysis_text
    
    await db.commit()
    await db.refresh(adv)

    return AdviceResponse(
        id=adv.advice_id,
        advice_id=adv.advice_id,
        cadet_id=adv.cadet_id,
        group_id=None,
        analysis_text=adv.analysis_text,
        date=adv.date,
        is_read=adv.is_read,
        model_used=adv.model_used,
    )
