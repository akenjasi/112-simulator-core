"""112 Simulator API v2 — FastAPI application entry point."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, Query
from fastapi.middleware.cors import CORSMiddleware

from backend.core.deps import require_role
from backend.core.config import cors_origins

# ─── Routers ──────────────────────────────────────────────────────────────────
from backend.api.router_assignments import assignments_router
from backend.api.router_audit import audit_router, error_logs_router
from backend.api.router_auth import auth_router
from backend.api.router_call import router_call
from backend.api.router_classifier import classifier_router, classifier_v1_router
from backend.api.router_dds import router_dds
from backend.api.router_dds_cycle import router_dds_cycle
from backend.api.router_student_workspace import router as student_workspace_router
from backend.api.router_scenario import router as scenario_router
from backend.api.router_groups import (
    groups_router,
    groups_v1_router,
    api_groups_router,
    students_router,
    students_v1_router,
)


from backend.api.router_reports import reports_router
from backend.api.router_scenarios import scenarios_router
from backend.api.router_sessions import sessions_router, sessions_v1_router
from backend.api.router_lessons import lessons_router
from backend.api.router_users import users_router, api_users_router, users_me_router
from backend.api.router_analytics import analytics_router, analytics_v1_router
from backend.api.router_admin import admin_router
from backend.api.router_generator import router as generator_router
from backend.api.router_tickets import tickets_router, api_tickets_router
from backend.api.router_knowledge import knowledge_router
from backend.api.router_asr import router_asr
from backend.api.router_telephony import router_telephony
from backend.api.router_ai_analytics import router as ai_analytics_router
from backend.api.router_dds_reports import router as dds_reports_router
from backend.api.router_integration import router_integration
from backend.core.audit_middleware import AuditMiddleware


# ─── Database lifespan ────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create all tables on startup (once). Safe to call repeatedly (checkfirst=True)."""
    # Import all domain models so Base.metadata knows about every table
    import backend.models.domain_01  # noqa: F401
    import backend.models.domain_02  # noqa: F401
    import backend.models.domain_03  # noqa: F401
    import backend.models.domain_04  # noqa: F401
    import backend.models.domain_05  # noqa: F401
    import backend.models.domain_06  # noqa: F401
    import backend.models.dds_report_job  # noqa: F401

    from backend.database import AsyncSessionLocal, engine
    from backend.models.base import Base

    from backend.core.schema_migrations import migrate_schema
    async with engine.begin() as conn:
        await conn.run_sync(migrate_schema)

    from backend.core.bootstrap import ensure_initial_admin
    async with AsyncSessionLocal() as db:
        await ensure_initial_admin(
            db,
            username=os.getenv("INITIAL_ADMIN_USERNAME"),
            password=os.getenv("INITIAL_ADMIN_PASSWORD"),
            full_name=os.getenv("INITIAL_ADMIN_FULL_NAME"),
        )

    # --- Warmup Heavy Models (ASR, SLM, TTS) ---
    import logging
    logger = logging.getLogger("main")
    logger.info("Warming up heavy models...")
    
    try:
        from backend.api.router_asr import asr_service
        import numpy as np
        if asr_service.is_ready():
            await asr_service.transcribe_pcm(np.zeros(16000, dtype=np.float32))
        logger.info("ASR service warmed up.")
    except Exception as e:
        logger.error(f"ASR warmup failed: {e}")

    try:
        from backend.core.intent_classifier import classify_intent_sync
        classify_intent_sync("warmup")
        logger.info("Intent classifier warmed up.")
    except Exception as e:
        logger.error(f"Intent classifier warmup failed: {e}")
        
    try:
        from backend.core.runtime_router import RuntimeRouter
        r = RuntimeRouter()
        r.process_message("warmup")
        logger.info("RuntimeRouter warmed up.")
    except Exception as e:
        logger.error(f"RuntimeRouter warmup failed: {e}")

    logger.info("Models warmup complete.")

    from backend.core.dds_report_jobs import dds_report_job_worker
    await dds_report_job_worker.start()

    try:
        yield
    finally:
        try:
            await dds_report_job_worker.stop()
        finally:
            # (Optional) dispose engine on shutdown to release pool connections
            await engine.dispose()


# ─── App factory ──────────────────────────────────────────────────────────────
app = FastAPI(title="112 Simulator API v2", lifespan=lifespan)

# Audit middleware
app.add_middleware(AuditMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connect routers
app.include_router(scenario_router)
app.include_router(auth_router)
app.include_router(groups_router)
app.include_router(groups_v1_router)
app.include_router(api_groups_router)
app.include_router(students_router)
app.include_router(students_v1_router)
app.include_router(users_router)
app.include_router(api_users_router)
app.include_router(users_me_router)
app.include_router(scenarios_router)
app.include_router(assignments_router)
app.include_router(sessions_router)
app.include_router(sessions_v1_router)
app.include_router(lessons_router)
app.include_router(router_call)
app.include_router(router_dds_cycle)
app.include_router(student_workspace_router)
app.include_router(router_dds)
app.include_router(classifier_router)
app.include_router(classifier_v1_router)
app.include_router(reports_router)
app.include_router(analytics_router)
app.include_router(analytics_v1_router)
app.include_router(audit_router)
app.include_router(error_logs_router)
app.include_router(admin_router)
app.include_router(generator_router)
app.include_router(tickets_router)
app.include_router(api_tickets_router)
app.include_router(knowledge_router)
app.include_router(router_asr)
app.include_router(router_telephony)
app.include_router(ai_analytics_router)
app.include_router(dds_reports_router)
app.include_router(router_integration)

# Standalone addresses search endpoint (must be separate to avoid conflict with /{ticket_id})
from fastapi import APIRouter as _APIRouter, Query as _Query
import json as _json, os as _os

_addresses_router = _APIRouter(prefix="/api/v1/addresses", tags=["Addresses"])

@_addresses_router.get("")
@_addresses_router.get("/", include_in_schema=False)
async def _search_addresses(q: str = _Query("", description="Поисковый запрос")):
    """Поиск адресов Москвы по строке."""
    _project_root = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
    _paths = [
        _os.path.join(_project_root, "data", "moscow_112_addresses.json"),
        _os.path.join(_os.getcwd(), "data", "moscow_112_addresses.json"),
    ]
    _data = []
    for _path in _paths:
        if _os.path.exists(_path):
            try:
                with open(_path, "r", encoding="utf-8") as _f:
                    _data = _json.load(_f)
                break
            except Exception:
                pass
    _q = q.lower()
    _results, _seen = [], set()
    for _item in _data:
        _street = _item.get("street", "")
        if _q and _q in _street.lower():
            _key = f"{_street}|{_item.get('okrug','')}|{_item.get('district','')}"
            if _key not in _seen:
                _seen.add(_key)
                _results.append({"street": _street, "okrug": _item.get("okrug", ""), "district": _item.get("district", "")})
                if len(_results) >= 20:
                    break
    return _results

app.include_router(_addresses_router)



@app.get("/health", tags=["System"])
async def health_check():
    return {"status": "ok"}


@app.get("/api/health", tags=["System"])
async def api_health_check():
    return {"status": "ok", "version": "v2"}



import sentry_sdk
if os.getenv("SENTRY_DSN"):
    sentry_sdk.init(dsn=os.getenv("SENTRY_DSN"))

from fastapi import Request
from fastapi.responses import JSONResponse
import traceback
from backend.models.domain_01 import SystemErrorLog
from backend.database import AsyncSessionLocal

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_msg = str(exc)
    tb = traceback.format_exc()
    
    try:
        async with AsyncSessionLocal() as session:
            session.add(SystemErrorLog(error_message=error_msg, traceback=tb))
            await session.commit()
    except Exception as db_exc:
        print(f"Failed to log error to DB: {db_exc}")

    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"}
    )


# ─── Legacy compatibility endpoints for frontend/*.html ──────────────────────


@app.get("/api/teacher/analytics", tags=["Legacy Compatibility"], dependencies=[Depends(require_role("TEACHER"))])
async def get_legacy_teacher_analytics():
    from fastapi import HTTPException
    raise HTTPException(410, "Use /api/analytics; synthetic legacy statistics are no longer available")


@app.get("/api/admin/audit", tags=["Legacy Compatibility"], dependencies=[Depends(require_role("ADMIN"))])
async def get_legacy_admin_audit(
    limit: int = Query(100, ge=1, le=1000, description="Max number of logs to return"),
    offset: int = Query(0, ge=0, description="Number of logs to skip"),
    from_at: str | None = Query(None, description="Start datetime with explicit timezone"),
    to_at: str | None = Query(None, description="End datetime with explicit timezone"),
    user_id: str | None = Query(None, description="Filter by user ID"),
):
    from backend.api.router_audit import get_audit_logs
    from backend.database import get_db
    async for db in get_db():
        logs = await get_audit_logs(
            limit=limit,
            offset=offset,
            from_at=from_at,
            to_at=to_at,
            user_id=user_id,
            db=db,
        )
        return {"logs": logs}



@app.get("/api/admin/system_stats", tags=["Legacy Compatibility"], dependencies=[Depends(require_role("ADMIN"))])
async def get_legacy_admin_system_stats():
    from backend.api.router_admin import healthcheck
    from backend.database import get_db
    async for db in get_db():
        hc = await healthcheck(db=db)
        return {
            "cpu_percent": hc.cpu_percent,
            "ram_percent": hc.ram_percent,
            "db_status": hc.db_status,
        }



# Frontend is served at its origin by Nginx or Next.js, including /_next assets.
