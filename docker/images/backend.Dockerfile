# ─────────────────────────────────────────────────────────────────────────────
# 112 Simulator V2 — Backend Dockerfile
# Python 3.11-slim + ffmpeg + Qwen TTS binaries + uvicorn
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.11-slim AS base

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_ROOT_USER_ACTION=ignore

WORKDIR /app

# ─── System dependencies ──────────────────────────────────────────────────────
# ffmpeg    — audio DSP pipeline (tts_v2.py: highpass/lowpass/amix filters)
# wget      — optional manual model provisioning utility
# curl      — healthcheck probe
# libgomp1  — OpenMP runtime for ggml CPU parallel inference
# libstdc++6— C++ stdlib for native transcribe-cli / qwen-tts ELF binaries
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        curl \
        wget \
        libgomp1 \
        libstdc++6 \
        gcc \
        python3-dev \
        libpango-1.0-0 \
        libpangoft2-1.0-0 \
        fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# ─── Python dependencies ──────────────────────────────────────────────────────
# Install in a separate layer — cached unless backend/requirements/runtime.lock changes.
# sqlalchemy[asyncio] pulls in greenlet (required for async SQLAlchemy).
COPY backend/requirements/ ./backend/requirements/
# Optional BuildKit pip_config secret supports a private mirror without image credentials.
RUN --mount=type=secret,id=pip_config,target=/etc/pip.conf pip install --no-cache-dir --require-hashes -r backend/requirements/runtime.lock
ARG INSTALL_SPEECH_DEPS=false
RUN if [ "$INSTALL_SPEECH_DEPS" = "true" ]; then pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu && pip install -r backend/requirements/speech.txt; fi

# ─── PostgreSQL client (pg_dump, psql) ─────────────────────────────────────────
# Match the PostgreSQL 15 server: newer pg_dump can emit SQL that 15 cannot restore.
# Use the signed upstream repository without invalidating the torch pip cache.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl --fail --show-error --silent \
        https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    && . /etc/os-release \
    && printf 'Types: deb\nURIs: https://apt.postgresql.org/pub/repos/apt\nSuites: %s-pgdg\nComponents: main\nSigned-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc\n' \
        "$VERSION_CODENAME" > /etc/apt/sources.list.d/pgdg.sources \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-client-15 \
    && rm -rf /var/lib/apt/lists/*

# ─── Application source ───────────────────────────────────────────────────────
# Heavy binary files (*.so, qwen-tts, transcribe-cli) are in the repo under
# backend/bin/ and backend/core/qwen_tts/ — they are COPY-ed here.
# GGUF weights are excluded via .dockerignore and mounted separately.
# docker/offline/package.sh downloads report Qwen before creating the offline bundle.
COPY . .

# ─── Executable permissions ───────────────────────────────────────────────────
# Ensure all native binaries are executable inside the container.
RUN chmod +x \
    /app/backend/bin/transcribe-cli \
    /app/backend/core/qwen_tts/qwen-tts \
    /app/docker/scripts/init.sh

# Fix Windows CRLF issues in shell scripts
RUN find . -type f -name "*.sh" -exec sed -i -e 's/\r$//' {} +

# ─── Integrity manifest generation ───────────────────────────────────────────
# Generate SHA-256 manifest of all backend python files, scripts, and native binaries.
RUN python -m backend.core.integrity generate --root /app --output /app/backend_manifest.json \
    && chmod 0644 /app/backend_manifest.json



# ─── Runtime: shared library search path ─────────────────────────────────────
# backend/bin/ contains: libggml.so, libggml.so.0 (symlink),
#                        libggml-cpu.so, libggml-cpu.so.0 (symlink),
#                        libggml-base.so, libggml-base.so.0 (symlink),
#                        libtranscribe.so, transcribe-cli
# qwen-tts has a hardcoded RUNPATH to the dev build dir which won't exist in
# the container. Linux dynamic linker falls back to LD_LIBRARY_PATH when the
# RUNPATH doesn't exist — so setting it here is the correct fix.
ENV LD_LIBRARY_PATH="/app/backend/bin" \
    DATABASE_URL="sqlite+aiosqlite:////app/data/112_simulator.db" \
    PYTHONPATH="/app"

# ─── Persistent data layout ───────────────────────────────────────────────────
# /app/data/                          → SQLite DB, TTS audio cache, uploads
# /app/backend/core/qwen_tts/models/  → optional externally provisioned TTS weights
VOLUME ["/app/data", "/app/backend/core/qwen_tts/models"]

RUN useradd --uid 10001 --create-home simulator \
    && mkdir -p /app/data /app/backend/core/qwen_tts/models \
    && chown -R simulator:simulator /app/data
USER simulator

EXPOSE 8000

# init.sh: mkdir -p data dirs → exec uvicorn (no model downloads)
CMD ["/app/docker/scripts/init.sh"]
