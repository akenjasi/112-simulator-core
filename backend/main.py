"""112 Simulator API v2 — FastAPI application entry point."""

import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

# ─── Compatibility patch ───────────────────────────────────────────────────────
# httpx >= 0.28 removed the 'app' keyword; patch to use ASGITransport instead.
_orig_async_client_init = httpx.AsyncClient.__init__


def _patched_async_client_init(self, *args, **kwargs):
    if "app" in kwargs:
        app = kwargs.pop("app")
        kwargs["transport"] = httpx.ASGITransport(app=app)
    _orig_async_client_init(self, *args, **kwargs)


httpx.AsyncClient.__init__ = _patched_async_client_init

# ─── Routers ──────────────────────────────────────────────────────────────────
from backend.api.router_assignments import assignments_router
from backend.api.router_audit import audit_router
from backend.api.router_auth import auth_router
from backend.api.router_call import router_call
from backend.api.router_classifier import classifier_router, classifier_v1_router
from backend.api.router_dds import router_dds
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

    from backend.database import engine
    from backend.models.base import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        from sqlalchemy import text
        for alter_sql in [
            "ALTER TABLE users ADD COLUMN student_id VARCHAR",
            "ALTER TABLE users ADD COLUMN totp_secret VARCHAR",
            "ALTER TABLE users ADD COLUMN is_2fa_enabled BOOLEAN DEFAULT 0",
            "ALTER TABLE generated_tickets ADD COLUMN status VARCHAR",
            "ALTER TABLE ticket_results ADD COLUMN score_total FLOAT",
            "ALTER TABLE ticket_results ADD COLUMN status VARCHAR",
            "ALTER TABLE scenario_tickets ADD COLUMN title VARCHAR",
            "ALTER TABLE scenario_tickets ADD COLUMN category VARCHAR",
            "ALTER TABLE scenario_tickets ADD COLUMN complexity INTEGER DEFAULT 1",
            "ALTER TABLE scenario_tickets ADD COLUMN content JSON DEFAULT '{}'",
            "ALTER TABLE exam_sessions ADD COLUMN ticket_id VARCHAR",
            "ALTER TABLE user_action_log ADD COLUMN endpoint VARCHAR",
        ]:
            try:
                await conn.execute(text(alter_sql))
            except Exception:
                pass
        await conn.execute(
            text("INSERT OR IGNORE INTO sys_sequences (name, last_val) VALUES ('generated_tickets', 0)")
        )

    yield
    # (Optional) dispose engine on shutdown to release pool connections
    await engine.dispose()


# ─── App factory ──────────────────────────────────────────────────────────────
app = FastAPI(title="112 Simulator API v2", lifespan=lifespan)

# Audit middleware
app.add_middleware(AuditMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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
app.include_router(router_dds)
app.include_router(classifier_router)
app.include_router(classifier_v1_router)
app.include_router(reports_router)
app.include_router(analytics_router)
app.include_router(analytics_v1_router)
app.include_router(audit_router)
app.include_router(admin_router)
app.include_router(generator_router)
app.include_router(tickets_router)
app.include_router(api_tickets_router)
app.include_router(knowledge_router)
app.include_router(router_asr)
app.include_router(router_telephony)
app.include_router(ai_analytics_router)
app.include_router(router_integration)



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


@app.get("/api/teacher/analytics", tags=["Legacy Compatibility"])
async def get_legacy_teacher_analytics():
    return {
        "group_readiness_index": 84,
        "group_status": "Готов к аттестации",
        "total_evaluations": 142,
        "radar": {"stress": 85, "speed": 82, "accuracy": 90, "sla": 88, "protocol": 80, "navigation": 79},
        "heatmap": [
            {"category": "Пожары", "errors": 3, "total": 45, "rate": 6.7},
            {"category": "ДТП", "errors": 8, "total": 52, "rate": 15.4},
            {"category": "ЖКХ", "errors": 2, "total": 30, "rate": 6.7},
            {"category": "Медицина", "errors": 1, "total": 15, "rate": 6.7},
        ],
        "cadet_roster": [
            {"username": "cadet1", "full_name": "Курсант Петров А.В.", "score": 88, "status": "Сдал"},
            {"username": "cadet2", "full_name": "Курсант Сидорова М.К.", "score": 92, "status": "Сдал"},
        ],
    }


@app.get("/api/admin/audit", tags=["Legacy Compatibility"])
async def get_legacy_admin_audit(limit: int = 100, offset: int = 0):
    from backend.api.router_audit import get_audit_logs
    from backend.database import get_db
    async for db in get_db():
        logs = await get_audit_logs(limit=limit, offset=offset, db=db)
        return {"logs": logs}


@app.get("/api/admin/backups", tags=["Legacy Compatibility"])
async def get_legacy_admin_backups():
    return {"backups": []}


@app.get("/api/admin/system_stats", tags=["Legacy Compatibility"])
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



# ─── React SPA frontend (DDS) ─────────────────────────────────────────────────
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_REACT_OUT_DIR = os.path.normpath(os.path.join(_PROJECT_ROOT, "frontend_react", "out"))

@app.get("/dds", include_in_schema=False)
async def redirect_dds():
    return RedirectResponse(url="/dds/")

if os.path.isdir(_REACT_OUT_DIR):
    app.mount("/dds", StaticFiles(directory=_REACT_OUT_DIR, html=True), name="dds_frontend")


# ─── Legacy HTML frontend (static) ────────────────────────────────────────────
# index.html = login page, admin.html, teacher.html, operator.html
# All JS files use relative /api/... paths → must be served from same origin as API (:8000)
_FRONTEND_PATH = os.path.normpath(os.path.join(_PROJECT_ROOT, "frontend"))

if os.path.isdir(_FRONTEND_PATH):
    # IMPORTANT: mount AFTER all include_router() calls.
    # FastAPI resolves include_router routes before checking mounts.
    app.mount("/", StaticFiles(directory=_FRONTEND_PATH, html=True), name="frontend")
