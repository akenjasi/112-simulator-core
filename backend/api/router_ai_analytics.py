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

from backend.core.ai_analytics_access import (
    get_teacher_cadet_ids,
    is_cadet_accessible_to_teacher,
)
from backend.core.ai_worker import (
    DEFAULT_MODEL_NAME,
    MODEL_FILENAME,
    MODEL_GGUF_URL,
)
from backend.core.deps import get_current_user, require_role
from backend.database import get_db
from backend.core.report_compat import (durable_advice_queue as ai_worker,
    queue_student_report as run_cadet_analysis, queue_group_reports as run_group_analysis)
from backend.models.domain_01 import User, StudentGroup
from backend.models.domain_03 import AIStudentAdvice, AIGroupAdvice, Assignment
from backend.core.dds_report_data import (
    DDSLessonReportDataResponse,
    collect_lesson_report_data,
)

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

@router.get(
    "/info",
    response_model=ModelInfoResponse,
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)
async def get_ai_model_info():
    """Information about configured heavy LLM for background analysis."""
    return ModelInfoResponse(
        model_name=DEFAULT_MODEL_NAME,
        gguf_url=MODEL_GGUF_URL,
        filename=MODEL_FILENAME,
        status="ready",
    )


@router.post(
    "/trigger",
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)
@router.get(
    "/trigger",
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)
async def trigger_ai_analysis(
    req: Optional[TriggerAnalysisRequest] = None,
    cadet_id: Optional[str] = Query(None),
    group_id: Optional[str] = Query(None),
    all_students: bool = Query(False),
    background: bool = Query(True),
    sleep_seconds: Optional[float] = Query(None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger background or immediate AI analysis for a cadet, a group, or all active students."""
    c_id = None
    if req and req.cadet_id:
        c_id = req.cadet_id.strip()
    elif cadet_id and cadet_id.strip():
        c_id = cadet_id.strip()

    g_id = None
    if req and req.group_id:
        g_id = req.group_id.strip()
    elif group_id and group_id.strip():
        g_id = group_id.strip()

    all_std = False
    if req and req.all_students:
        all_std = True
    elif all_students:
        all_std = True

    bg = True
    if req is not None and req.background is not None:
        bg = bool(req.background)
    elif background is not None:
        bg = bool(background)

    sleep_sec = 0.0
    if req and req.sleep_seconds is not None:
        sleep_sec = req.sleep_seconds
    elif sleep_seconds is not None:
        sleep_sec = sleep_seconds

    model = (req.model if req and req.model else None) or DEFAULT_MODEL_NAME

    # Role checks & target validation
    if current_user and current_user.role == "CADET":
        # Cadets can ONLY trigger for themselves; ignore any passed foreign targets
        c_id = current_user.user_id
        g_id = None
        all_std = False
    elif current_user and current_user.role == "TEACHER":
        if not c_id and not g_id and not all_std:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Explicit target (cadet_id, group_id, or all_students) is required for teacher trigger.",
            )

        # Validate explicit targets before any work/enqueue/mutation
        if c_id:
            cadet = await db.get(User, c_id)
            if not cadet:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Cadet not found.",
                )
            if not await is_cadet_accessible_to_teacher(db, current_user.user_id, c_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied to cadet.",
                )

        if g_id:
            group = await db.get(StudentGroup, g_id)
            if not group:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Group not found.",
                )
            if group.teacher_id != current_user.user_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied to group.",
                )

    # Synchronous execution (when background=False)
    if not bg:
        if c_id and not g_id and not all_std:
            advice = await run_cadet_analysis(
                cadet_id=c_id,
                db=db,
                sleep_seconds=sleep_sec,
                model=model,
            )
            return {
                "status": getattr(advice, "status", "completed"),
                "target_type": "cadet",
                "target_id": c_id,
                "advice_id": advice.advice_id,
                "model_used": advice.model_used,
            }
        if g_id and not c_id and not all_std:
            advice = await run_group_analysis(
                group_id=g_id,
                db=db,
                sleep_seconds=sleep_sec,
                model=model,
            )
            return {
                "status": getattr(advice, "status", "completed"),
                "target_type": "group",
                "target_id": g_id,
                "advice_id": advice.advice_id,
                "model_used": advice.model_used,
            }

    # Asynchronous background execution
    tasks_to_enqueue: List[tuple[str, str]] = []

    if c_id and not all_std:
        tasks_to_enqueue.append(("cadet", c_id))

    if g_id:
        tasks_to_enqueue.append(("group", g_id))

    if all_std and current_user:
        teacher_cadet_ids = await get_teacher_cadet_ids(db, current_user.user_id)
        if teacher_cadet_ids:
            stmt_users = (
                select(User.user_id)
                .where(
                    User.user_id.in_(teacher_cadet_ids),
                    User.role.in_(["CADET", "STUDENT"]),
                    User.is_active == True,
                )
                .limit(50)
            )
            res_users = await db.execute(stmt_users)
            for row in res_users.all():
                tasks_to_enqueue.append(("cadet", row[0]))

    # Deduplicate while preserving order
    seen = set()
    unique_tasks = []
    for jtype, tid in tasks_to_enqueue:
        if (jtype, tid) not in seen:
            seen.add((jtype, tid))
            unique_tasks.append((jtype, tid))

    if not unique_tasks:
        return {
            "status": "queued",
            "count": 0,
            "tasks": [],
            "model": model,
            "message": "AI analysis tasks have been placed in the background processing queue.",
        }

    ai_worker.start()
    tasks_triggered = []
    for jtype, tid in unique_tasks:
        job_id = await ai_worker.enqueue(
            job_type=jtype,
            target_id=tid,
            sleep_seconds=sleep_sec,
            model=model,
        )
        tasks_triggered.append({"type": jtype, "target_id": tid, "job_id": job_id})

    return {
        "status": "queued",
        "count": len(tasks_triggered),
        "tasks": tasks_triggered,
        "model": model,
        "message": "AI analysis tasks have been placed in the background processing queue.",
    }


@router.get(
    "/student/{id}",
    response_model=List[AdviceResponse],
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)
async def get_student_advice(
    id: str,
    unread_only: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve AI-generated guidance and recommendations for a cadet."""
    if current_user and current_user.role == "CADET":
        if current_user.user_id != id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to another cadet's AI recommendations.",
            )
    elif current_user and current_user.role == "TEACHER":
        student = await db.get(User, id)
        if not student:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found.",
            )
        if not await is_cadet_accessible_to_teacher(db, current_user.user_id, id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to cadet.",
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


@router.get(
    "/group/{id}",
    response_model=List[AdviceResponse],
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)
async def get_group_advice(
    id: str,
    unread_only: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve AI-generated group analytical reports for instructors."""
    if current_user and current_user.role == "CADET":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cadets do not have access to group instructor reports.",
        )

    group = await db.get(StudentGroup, id)
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found.",
        )

    if group.teacher_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to group.",
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


@router.patch(
    "/advice/{advice_id}/read",
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)
@router.patch(
    "/student/advice/{advice_id}/read",
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)
async def mark_student_advice_as_read(
    advice_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
        if not grp_adv:
            raise HTTPException(status_code=404, detail="Advice item not found.")

        # Fallback to group advice: CADET cannot read/mutate group advice
        if current_user and current_user.role == "CADET":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cadets do not have access to group advice.",
            )

        # For TEACHER: verify group ownership
        group = await db.get(StudentGroup, grp_adv.group_id)
        if not group or group.teacher_id != current_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to group advice.",
            )

        grp_adv.is_read = True
        await db.commit()
        return {"status": "ok", "advice_id": advice_id, "is_read": True}

    # Found personal advice in AIStudentAdvice
    if current_user and current_user.role == "CADET":
        if current_user.user_id != adv.cadet_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot mark other cadet's advice as read.",
            )
    elif current_user and current_user.role == "TEACHER":
        if not await is_cadet_accessible_to_teacher(db, current_user.user_id, adv.cadet_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to cadet's advice.",
            )

    adv.is_read = True
    await db.commit()
    return {"status": "ok", "advice_id": advice_id, "is_read": True}


@router.patch(
    "/group/advice/{advice_id}/read",
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)
async def mark_group_advice_as_read(
    advice_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark group AI advice report as read."""
    stmt = select(AIGroupAdvice).where(AIGroupAdvice.advice_id == advice_id)
    res = await db.execute(stmt)
    adv = res.scalar_one_or_none()
    if not adv:
        raise HTTPException(status_code=404, detail="Group advice not found.")

    if current_user and current_user.role == "CADET":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cadets do not have access to group advice.",
        )

    group = await db.get(StudentGroup, adv.group_id)
    if not group or group.teacher_id != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to group advice.",
        )

    adv.is_read = True
    await db.commit()
    return {"status": "ok", "advice_id": advice_id, "is_read": True}


@router.post(
    "/student/{advice_id}/refine",
    response_model=AdviceResponse,
    dependencies=[Depends(require_role("TEACHER", "CADET"))],
)
async def refine_student_advice(
    advice_id: str,
    req: AIRefineRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Refine AI student advice based on a correction comment."""
    stmt = select(AIStudentAdvice).where(AIStudentAdvice.advice_id == advice_id)
    res = await db.execute(stmt)
    adv = res.scalar_one_or_none()

    if not adv:
        raise HTTPException(status_code=404, detail="Student advice not found.")

    if current_user and current_user.role == "CADET":
        raise HTTPException(status_code=403, detail="Cadets cannot refine advice.")

    if current_user and current_user.role == "TEACHER":
        if not await is_cadet_accessible_to_teacher(db, current_user.user_id, adv.cadet_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied to cadet's advice.",
            )

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


# ─── DDS Lesson Report Data Endpoint ──────────────────────────────────────────

@router.get(
    "/lessons/{lesson_id}/data",
    response_model=DDSLessonReportDataResponse,
)
async def get_lesson_report_data(
    lesson_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Retrieve verified, trustworthy completed lesson data for DDS neural report generation.

    Access rules:
    - 401 if unauthenticated (enforced by get_current_user)
    - 403 if role is CADET/other, or TEACHER who did not assign the lesson
    - 404 if lesson not found
    - 409 if lesson is not COMPLETED or target_role is not DISPATCHER_DDS
    """
    if current_user.role not in ("ADMIN", "TEACHER"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Cadets are not authorized to view lesson report data.",
        )

    stmt = select(Assignment).where(Assignment.assignment_id == lesson_id)
    res = await db.execute(stmt)
    lesson = res.scalar_one_or_none()
    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lesson '{lesson_id}' not found.",
        )

    if current_user.role == "TEACHER" and lesson.assigned_by != current_user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Teachers can only access report data for their own lessons.",
        )

    status_str = (lesson.status or "").strip().upper()
    target_role_str = (lesson.target_role or "").strip().upper()
    if status_str != "COMPLETED" or target_role_str != "DISPATCHER_DDS":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lesson is not completed or target role is not DISPATCHER_DDS.",
        )

    return await collect_lesson_report_data(db, lesson_id, lesson=lesson)
