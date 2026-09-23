"""112 Simulator API v2 — FastAPI application entry point."""

import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
from backend.api.router_classifier import classifier_router
from backend.api.router_dds import router_dds
from backend.api.router_groups import groups_router
from backend.api.router_scenario import router as scenario_router
from backend.api.router_reports import reports_router
from backend.api.router_scenarios import scenarios_router
from backend.api.router_sessions import sessions_router
from backend.api.router_users import users_router
from backend.api.router_analytics import analytics_router
from backend.api.router_admin import admin_router
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
app.include_router(users_router)
app.include_router(scenarios_router)
app.include_router(assignments_router)
app.include_router(sessions_router)
app.include_router(router_call)
app.include_router(router_dds)
app.include_router(classifier_router)
app.include_router(reports_router)
app.include_router(analytics_router)
app.include_router(audit_router)
app.include_router(admin_router)



@app.get("/health", tags=["System"])
async def health_check():
    return {"status": "ok"}


@app.get("/api/health", tags=["System"])
async def api_health_check():
    return {"status": "ok", "version": "v2"}


# ─── Legacy HTML frontend (static) ────────────────────────────────────────────
# index.html = login page, admin.html, teacher.html, operator.html
# All JS files use relative /api/... paths → must be served from same origin as API (:8000)
_FRONTEND_PATH = os.path.normpath(os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "..", "112_simulator", "frontend"
))

if os.path.isdir(_FRONTEND_PATH):
    # IMPORTANT: mount AFTER all include_router() calls.
    # FastAPI resolves include_router routes before checking mounts.
    app.mount("/", StaticFiles(directory=_FRONTEND_PATH, html=True), name="frontend")
