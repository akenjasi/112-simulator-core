"""Router for generating and downloading evaluation reports (PDF/CSV)."""

import asyncio
import logging
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from backend.core.deps import require_role, get_current_user
from backend.core.access import require_session, visible_session_ids
from backend.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models.domain_01 import StudentGroup
from backend.core.reports_engine import (
    calculate_final_score,
    generate_csv_from_data,
    generate_excel_from_data,
    generate_pdf_from_html,
    render_report_html,
)
from backend.core.gradebook_export import (
    MOSCOW, build_gradebook_context, generate_gradebook_csv, generate_gradebook_excel,
)
from backend.database import AsyncSessionLocal
from backend.models.domain_01 import User
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import EvaluationResult, IncidentCard
from backend.schemas.reports import (
    ReportGenerateRequest,
    ReportGenerateResponse,
    ReportStatusResponse,
)

logger = logging.getLogger(__name__)

reports_router = APIRouter(
    prefix="/api/reports",
    tags=["Reports"],
    dependencies=[Depends(require_role("TEACHER"))],
)

# In-memory dictionary for task status tracking
TASKS: Dict[str, Dict[str, Any]] = {}
REPORT_TTL_SECONDS = 86400


def prune_completed_reports():
    """Bound process-local jobs and their private files to one day."""
    now = datetime.now(timezone.utc)
    for task_id, task in list(TASKS.items()):
        if task.get("status") == "processing":
            continue
        created = datetime.fromisoformat(task["created_at"])
        if (now - created).total_seconds() < REPORT_TTL_SECONDS:
            continue
        root = Path(os.getenv("REPORT_DIR", "data/reports")).resolve()
        for key in ("file_path", "csv_path", "excel_path"):
            if task.get(key):
                path = Path(task[key])
                if root in path.resolve().parents and not path.is_symlink():
                    path.unlink(missing_ok=True)
                    try:
                        path.parent.rmdir()
                    except OSError:
                        pass
        del TASKS[task_id]


async def _background_generate_report(
    task_id: str,
    group_id: Optional[str] = None,
    session_ids: Optional[List[str]] = None,
    custom_records: Optional[List[Dict[str, Any]]] = None,
    output_format: str = "pdf",
    report_kind: str = "evaluation",
) -> None:
    """Export recorded measurements; missing metrics remain absent."""
    from backend.core.dds_cycle import get_session_score
    from backend.models.domain_04 import TicketResult
    import math
    import tempfile

    def finite(value):
        return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) else None

    directory = None
    try:
        cadets_data = []
        if custom_records is not None:
            for rec in custom_records:
                if "final_score" in rec:
                    # Explicit export rows are caller-supplied, never persisted assessments.
                    # Preserve unknown components rather than inventing a perfect breakdown.
                    cadets_data.append({
                        **rec,
                        **{key: finite(rec.get(key)) for key in ("final_score", "comm_score", "card_score", "sla_score", "time_to_first_dispatch_sec")},
                        "cadet_name": rec.get("cadet_name") or "Курсант",
                        "ticket_id": rec.get("ticket_id") or "Билет",
                        "penalties_list": rec.get("penalties_list") or [],
                        "over_dispatched_services": rec.get("over_dispatched_services") or [],
                        "missed_critical_factoids": rec.get("missed_critical_factoids") or [],
                    })
                    continue
                if not all(isinstance(rec.get(key), dict) and rec[key] for key in ("comm_metrics", "card_metrics", "sla_metrics")):
                    raise ValueError("Explicit measured metrics are required")
                comm, card, sla = (rec[key] for key in ("comm_metrics", "card_metrics", "sla_metrics"))
                score, details = calculate_final_score(comm, card, sla)
                cadets_data.append({**rec, **details, "final_score": score,
                    "time_to_first_dispatch_sec": sla.get("time_to_first_dispatch_sec"),
                    "over_dispatched_services": card.get("over_dispatched_services", []),
                    "missed_critical_factoids": card.get("missed_critical_factoids", [])})
        elif session_ids:
            async with AsyncSessionLocal() as db:
                sessions = (await db.scalars(select(ExamSession).where(ExamSession.session_id.in_(session_ids)))).all()
                for session in sessions:
                    evaluations = (await db.scalars(select(EvaluationResult).where(EvaluationResult.session_id == session.session_id))).all()
                    results = (await db.scalars(select(TicketResult).where(TicketResult.session_id == session.session_id))).all()
                    score = get_session_score(evaluations, results)
                    if score is None:
                        continue
                    user = await db.get(User, session.cadet_id) if session.cadet_id else None
                    latest = max(evaluations, key=lambda e: str(e.evaluated_at or ""), default=None)
                    scores = latest.scores or {} if latest else {}
                    metrics = latest.metrics or {} if latest else {}
                    cadets_data.append({
                        "cadet_name": (user.full_name or user.username) if user else "Курсант",
                        "ticket_id": session.ticket_id or session.session_id,
                        "final_score": score,
                        "comm_score": finite(scores.get("comm_score")),
                        "card_score": finite(scores.get("card_score")),
                        "sla_score": finite(scores.get("sla_score")),
                        "time_to_first_dispatch_sec": finite(metrics.get("time_to_first_dispatch_sec")),
                        "over_dispatched_services": [], "missed_critical_factoids": [],
                        "penalties_list": latest.errors_list or [] if latest else [],
                    })
        if not cadets_data:
            raise ValueError("No measured numerical evaluations are available; use the DDS criteria protocol")

        def average(key):
            values = [record[key] for record in cadets_data if finite(record.get(key)) is not None]
            return round(sum(values) / len(values)) if values else None

        generated_at = datetime.now(MOSCOW)
        context = {"generated_at": generated_at.strftime("%d.%m.%Y %H:%M МСК"),
            "group_id": group_id, "cadets": cadets_data, "avg_final_score": average("final_score"),
            "avg_comm_score": average("comm_score"), "avg_card_score": average("card_score"),
            "critical_errors_count": 0, "over_dispatch_items": [], "missed_factoid_items": []}
        if report_kind == "gradebook":
            context = build_gradebook_context(cadets_data, generated_at)
        report_root = Path(os.getenv("REPORT_DIR", "data/reports"))
        report_root.mkdir(parents=True, exist_ok=True)
        directory = Path(tempfile.mkdtemp(prefix="report-", dir=report_root))
        output_csv, output_xlsx, output_pdf = (directory / name for name in ("report.csv", "report.xlsx", "report.pdf"))
        csv_data = generate_gradebook_csv(context) if report_kind == "gradebook" else generate_csv_from_data(cadets_data)
        await asyncio.to_thread(output_csv.write_text, csv_data, encoding="utf-8")
        excel_data = await asyncio.to_thread(
            generate_gradebook_excel if report_kind == "gradebook" else generate_excel_from_data,
            context if report_kind == "gradebook" else cadets_data,
        )
        await asyncio.to_thread(output_xlsx.write_bytes, excel_data)
        pdf_path = None
        if output_format == "pdf":
            template = "gradebook_layout.html" if report_kind == "gradebook" else "report_layout.html"
            await asyncio.to_thread(generate_pdf_from_html, render_report_html(context, template), str(output_pdf))
            pdf_path = str(output_pdf)
        TASKS[task_id].update(status="ready", file_path=pdf_path, csv_path=str(output_csv),
                             excel_path=str(output_xlsx), generated_at=generated_at.isoformat())
    except Exception:
        logger.exception("Report generation failed for task %s", task_id)
        if directory is not None:
            await asyncio.to_thread(shutil.rmtree, directory, True)
        TASKS[task_id].update(status="failed", error="Не удалось сформировать отчёт. Проверьте данные и повторите попытку.")


@reports_router.post("/generate", response_model=ReportGenerateResponse)
async def generate_report(
    req: ReportGenerateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start asynchronous generation of an evaluation report."""
    prune_completed_reports()
    if req.report_kind == "gradebook" and not req.custom_records:
        raise HTTPException(422, "В выбранной области нет записей для отчёта")
    if len(TASKS) >= 1000:
        raise HTTPException(429, "Report storage capacity reached; retry after expiration")
    if req.group_id:
        group = await db.get(StudentGroup, req.group_id)
        if not group:
            raise HTTPException(404, "Group not found")
        if group.teacher_id != current_user.user_id:
            raise HTTPException(403, "Group access denied")
    if req.session_ids:
        for session_id in req.session_ids:
            await require_session(db, current_user, session_id)
    elif req.group_id:
        req.session_ids = list((await db.scalars((await visible_session_ids(db, current_user)).where(
            ExamSession.assignment_id.in_(select(Assignment.assignment_id).where(Assignment.group_id == req.group_id))
        ))).all())
    if req.custom_records is None and not req.session_ids and not req.group_id:
        req.session_ids = list((await db.scalars(await visible_session_ids(db, current_user))).all())
    if req.custom_records is None and not req.session_ids:
        raise HTTPException(422, "No recorded sessions are available for export")
    if sum(task.get("owner_id") == current_user.user_id and task.get("status") == "processing" for task in TASKS.values()) >= 5:
        raise HTTPException(429, "Wait for your running reports to finish")
    task_id = str(uuid.uuid4())
    TASKS[task_id] = {
        "owner_id": current_user.user_id,
        "status": "processing",
        "file_path": None,
        "csv_path": None,
        "excel_path": None,
        "error": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    background_tasks.add_task(
        _background_generate_report,
        task_id=task_id,
        group_id=req.group_id,
        session_ids=req.session_ids,
        custom_records=req.custom_records,
        output_format=req.format,
        report_kind=req.report_kind,
    )

    return {"task_id": task_id}


@reports_router.get("/status/{task_id}", response_model=ReportStatusResponse)
async def get_report_status(task_id: str, current_user: User = Depends(get_current_user)):
    """Get the current progress status of a report generation task."""
    prune_completed_reports()
    if task_id not in TASKS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    task = TASKS[task_id]
    if task.get("owner_id") != current_user.user_id:
        raise HTTPException(404, "Task not found")
    return {
        "task_id": task_id,
        "status": task["status"],
        "file_path": task.get("file_path"),
        "error": task.get("error"),
        "generated_at": task.get("generated_at"),
    }


async def _download_report_response(task_id: str, format: str, current_user: User):
    prune_completed_reports()
    if task_id not in TASKS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    task = TASKS[task_id]
    if task.get("owner_id") != current_user.user_id:
        raise HTTPException(404, "Task not found")
    if task["status"] == "processing":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Report generation is still in progress",
        )

    if task["status"] == "failed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Report generation failed: {task.get('error')}",
        )

    fmt = format.lower()
    if fmt == "csv":
        csv_path = task.get("csv_path")
        if not csv_path or not os.path.exists(csv_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="CSV report file not found",
            )
        return FileResponse(
            path=csv_path,
            filename=f"report_{task_id}.csv",
            media_type="text/csv",
        )

    if fmt in ("excel", "xlsx"):
        excel_path = task.get("excel_path")
        if not excel_path or not os.path.exists(excel_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Excel report file not found",
            )
        return FileResponse(
            path=excel_path,
            filename=f"report_{task_id}.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    file_path = task.get("file_path")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF report file not found",
        )

    return FileResponse(
        path=file_path,
        filename=f"report_{task_id}.pdf",
        media_type="application/pdf",
    )


@reports_router.get("/download")
async def download_report_query(
    task_id: str = Query(..., description="Task ID to download"),
    current_user: User = Depends(get_current_user),
    format: str = Query("pdf", description="Format to download: 'pdf', 'csv', or 'excel'"),
):
    """Download the generated report by task_id query parameter."""
    return await _download_report_response(task_id=task_id, format=format, current_user=current_user)


@reports_router.get("/download/{task_id}")
async def download_report_path(
    task_id: str,
    current_user: User = Depends(get_current_user),
    format: str = Query("pdf", description="Format to download: 'pdf', 'csv', or 'excel'"),
):
    """Download the generated report in PDF, CSV, or Excel format."""
    return await _download_report_response(task_id=task_id, format=format, current_user=current_user)

