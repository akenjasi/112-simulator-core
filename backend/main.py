"""112 Simulator API v2 — FastAPI application entry point."""

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
from backend.api.router_auth import auth_router
from backend.api.router_assignments import assignments_router
from backend.api.router_groups import groups_router
from backend.api.router_scenarios import scenarios_router
from backend.api.router_sessions import sessions_router
from backend.api.router_users import users_router


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

    from backend.database import engine
    from backend.models.base import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield
    # (Optional) dispose engine on shutdown to release pool connections
    await engine.dispose()


# ─── App factory ──────────────────────────────────────────────────────────────
app = FastAPI(title="112 Simulator API v2", lifespan=lifespan)

# CORS: wildcard + credentials is rejected by browsers per W3C spec.
# Use explicit origin list. For local dev we allow localhost:3000 (Next.js)
# and localhost:8000 (Swagger/direct). Set CORS_ORIGINS env var for extra origins.
import os

_raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
    expose_headers=["Content-Type"],
)

app.include_router(auth_router)
app.include_router(groups_router)
app.include_router(users_router)
app.include_router(scenarios_router)
app.include_router(assignments_router)
app.include_router(sessions_router)


@app.get("/api/health", tags=["System"])
async def health_check():
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
