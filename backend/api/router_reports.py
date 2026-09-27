"""Router for generating and downloading evaluation reports (PDF/CSV)."""

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from backend.core.deps import require_role
from backend.core.reports_engine import (
    calculate_final_score,
    generate_csv_from_data,
    generate_excel_from_data,
    generate_pdf_from_html,
    render_report_html,
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
    dependencies=[Depends(require_role("ADMIN", "TEACHER"))],
)

# In-memory dictionary for task status tracking
TASKS: Dict[str, Dict[str, Any]] = {}


async def _background_generate_report(
    task_id: str,
    group_id: Optional[str] = None,
    session_ids: Optional[List[str]] = None,
    custom_records: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """Async background task that compiles session data, calculates scores,

    renders Jinja2 HTML, and exports PDF without blocking the event loop.
    """
    try:
        cadets_data: List[Dict[str, Any]] = []

        # 1. If custom_records are provided directly (e.g. from API/tests)
        if custom_records:
            for rec in custom_records:
                c_comm = rec.get(
                    "comm_metrics",
                    {"greeting_success": True, "filler_words": 0, "script_followed_pct": 100},
                )
                c_card = rec.get(
                    "card_metrics",
                    {
                        "address_correct": True,
                        "services_matched": True,
                        "over_dispatched_services": [],
                        "missed_critical_factoids": [],
                    },
                )
                c_sla = rec.get(
                    "sla_metrics",
                    {"sla_breached_count": 0, "time_to_first_dispatch_sec": 30},
                )

                score, details = calculate_final_score(c_comm, c_card, c_sla)
                cadets_data.append({
                    "cadet_name": rec.get("cadet_name", "Курсант"),
                    "ticket_id": rec.get("ticket_id", "Билет #1"),
                    "comm_score": details["comm_score"],
                    "card_score": details["card_score"],
                    "sla_score": details["sla_score"],
                    "final_score": score,
                    "time_to_first_dispatch_sec": c_sla.get("time_to_first_dispatch_sec", 0),
                    "over_dispatched_services": c_card.get("over_dispatched_services", []),
                    "missed_critical_factoids": c_card.get("missed_critical_factoids", []),
                    "penalties_list": details["penalties_list"],
                })

        # 2. Query from database if group_id or session_ids are given
        elif group_id or session_ids:
            try:
                async with AsyncSessionLocal() as db:
                    sessions: List[ExamSession] = []
                    if session_ids:
                        stmt = select(ExamSession).where(ExamSession.session_id.in_(session_ids))
                        res = await db.execute(stmt)
                        sessions = list(res.scalars().all())
                    elif group_id:
                        stmt_as = select(Assignment).where(Assignment.group_id == group_id)
                        res_as = await db.execute(stmt_as)
                        assignments = list(res_as.scalars().all())
                        as_ids = [a.assignment_id for a in assignments]
                        if as_ids:
                            stmt_s = select(ExamSession).where(ExamSession.assignment_id.in_(as_ids))
                            res_s = await db.execute(stmt_s)
                            sessions = list(res_s.scalars().all())

                    for s in sessions:
                        # Resolve cadet name
                        cadet_name = f"Курсант {s.cadet_id or s.session_id[:6]}"
                        if s.cadet_id:
                            u_res = await db.execute(select(User).where(User.user_id == s.cadet_id))
                            user = u_res.scalar_one_or_none()
                            if user and (user.full_name or user.username):
                                cadet_name = user.full_name or user.username

                        # Resolve incident card & evaluation result
                        card_res = await db.execute(
                            select(IncidentCard).where(IncidentCard.session_id == s.session_id)
                        )
                        card = card_res.scalar_one_or_none()

                        eval_res = await db.execute(
                            select(EvaluationResult).where(EvaluationResult.session_id == s.session_id)
                        )
                        evaluation = eval_res.scalar_one_or_none()

                        # Resolve ticket
                        ticket_id = f"Сессия {s.session_id[:8]}"
                        if card and card.scenario_id:
                            ticket_id = f"Билет #{card.scenario_id[:6]}"
                        elif s.assignment_id:
                            ticket_id = f"Задание #{s.assignment_id[:6]}"

                        # Build metrics
                        if evaluation and evaluation.metrics:
                            m = evaluation.metrics
                            comm_m = m.get("comm_metrics", {})
                            card_m = m.get("card_metrics", {})
                            sla_m = m.get("sla_metrics", {})
                        else:
                            time_to_first = 45
                            if card and card.created_at and s.start_time:
                                time_to_first = max(0, int((card.created_at - s.start_time).total_seconds()))

                            card_data = card.filled_data if card and card.filled_data else {}
                            over_dispatched = card_data.get("over_dispatched_services") or []
                            missed_factoids = card_data.get("missed_critical_factoids") or []

                            comm_m = s.dynamic_state.get(
                                "comm_metrics",
                                {"greeting_success": True, "filler_words": 0, "script_followed_pct": 100},
                            )
                            card_m = {
                                "address_correct": bool(card_data.get("address")) if card else True,
                                "services_matched": True,
                                "over_dispatched_services": over_dispatched,
                                "missed_critical_factoids": missed_factoids,
                            }
                            sla_m = {
                                "sla_breached_count": 0,
                                "time_to_first_dispatch_sec": time_to_first,
                            }

                        score, details = calculate_final_score(comm_m, card_m, sla_m)
                        cadets_data.append({
                            "cadet_name": cadet_name,
                            "ticket_id": ticket_id,
                            "comm_score": details["comm_score"],
                            "card_score": details["card_score"],
                            "sla_score": details["sla_score"],
                            "final_score": score,
                            "time_to_first_dispatch_sec": sla_m.get("time_to_first_dispatch_sec", 0),
                            "over_dispatched_services": card_m.get("over_dispatched_services", []),
                            "missed_critical_factoids": card_m.get("missed_critical_factoids", []),
                            "penalties_list": details["penalties_list"],
                        })
            except Exception as db_err:
                logger.warning("Database query failed during report generation: %s", db_err)

        # 3. Fallback placeholder if no data was found
        if not cadets_data:
            cadets_data.append({
                "cadet_name": "Курсант (Демо / Данные отсутствуют)",
                "ticket_id": group_id or "Билет #0",
                "comm_score": 100,
                "card_score": 100,
                "sla_score": 100,
                "final_score": 100,
                "time_to_first_dispatch_sec": 30,
                "over_dispatched_services": [],
                "missed_critical_factoids": [],
                "penalties_list": [],
            })

        # 4. Extract critical error highlights for the template
        over_dispatch_items = []
        missed_factoid_items = []
        for c in cadets_data:
            if c.get("over_dispatched_services"):
                over_dispatch_items.append({
                    "cadet_name": c["cadet_name"],
                    "ticket_id": c["ticket_id"],
                    "services": c["over_dispatched_services"],
                })
            if c.get("missed_critical_factoids"):
                missed_factoid_items.append({
                    "cadet_name": c["cadet_name"],
                    "ticket_id": c["ticket_id"],
                    "factoids": c["missed_critical_factoids"],
                })

        critical_errors_count = len(over_dispatch_items) + len(missed_factoid_items)

        avg_final = round(sum(c["final_score"] for c in cadets_data) / len(cadets_data))
        avg_comm = round(sum(c["comm_score"] for c in cadets_data) / len(cadets_data))
        avg_card = round(sum(c["card_score"] for c in cadets_data) / len(cadets_data))

        context = {
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
            "group_id": group_id,
            "cadets": cadets_data,
            "avg_final_score": avg_final,
            "avg_comm_score": avg_comm,
            "avg_card_score": avg_card,
            "critical_errors_count": critical_errors_count,
            "over_dispatch_items": over_dispatch_items,
            "missed_factoid_items": missed_factoid_items,
        }

        # 5. Render HTML
        html_content = render_report_html(context)

        # 6. Save PDF asynchronously via asyncio.to_thread (Event loop is NEVER blocked)
        output_pdf = f"/tmp/report_{task_id}.pdf"
        await asyncio.to_thread(generate_pdf_from_html, html_content, output_pdf)

        # Also save CSV for dual export support
        output_csv = f"/tmp/report_{task_id}.csv"
        csv_data = generate_csv_from_data(cadets_data)
        await asyncio.to_thread(Path(output_csv).write_text, csv_data, encoding="utf-8")

        # Save XLSX asynchronously via asyncio.to_thread (Event loop is NEVER blocked)
        output_xlsx = f"/tmp/report_{task_id}.xlsx"
        excel_data = await asyncio.to_thread(generate_excel_from_data, cadets_data)
        await asyncio.to_thread(Path(output_xlsx).write_bytes, excel_data)

        TASKS[task_id]["status"] = "ready"
        TASKS[task_id]["file_path"] = output_pdf
        TASKS[task_id]["csv_path"] = output_csv
        TASKS[task_id]["excel_path"] = output_xlsx
        logger.info("Report task %s finished successfully -> %s, %s", task_id, output_pdf, output_xlsx)

    except Exception as exc:
        logger.exception("Background report generation failed for task %s", task_id)
        TASKS[task_id]["status"] = "failed"
        TASKS[task_id]["error"] = str(exc)


@reports_router.post("/generate", response_model=ReportGenerateResponse)
async def generate_report(
    req: ReportGenerateRequest,
    background_tasks: BackgroundTasks,
):
    """Start asynchronous generation of an evaluation report."""
    task_id = str(uuid.uuid4())
    TASKS[task_id] = {
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
    )

    return {"task_id": task_id}


@reports_router.get("/status/{task_id}", response_model=ReportStatusResponse)
async def get_report_status(task_id: str):
    """Get the current progress status of a report generation task."""
    if task_id not in TASKS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    task = TASKS[task_id]
    return {
        "task_id": task_id,
        "status": task["status"],
        "file_path": task.get("file_path"),
        "error": task.get("error"),
    }


async def _download_report_response(task_id: str, format: str):
    if task_id not in TASKS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    task = TASKS[task_id]
    if task["status"] == "processing":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Report generation is still in progress",
        )

    if task["status"] == "failed" or not task.get("file_path"):
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

    file_path = task["file_path"]
    if not os.path.exists(file_path):
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
    format: str = Query("pdf", description="Format to download: 'pdf', 'csv', or 'excel'"),
):
    """Download the generated report by task_id query parameter."""
    return await _download_report_response(task_id=task_id, format=format)


@reports_router.get("/download/{task_id}")
async def download_report_path(
    task_id: str,
    format: str = Query("pdf", description="Format to download: 'pdf', 'csv', or 'excel'"),
):
    """Download the generated report in PDF, CSV, or Excel format."""
    return await _download_report_response(task_id=task_id, format=format)

