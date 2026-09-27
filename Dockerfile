# ─────────────────────────────────────────────────────────────────────────────
# 112 Simulator V2 — Root Dockerfile (Backend alias)
# This file is a convenience alias for Dockerfile.backend.
# Used by: docker compose (service: backend)
#
# For the full multi-service setup, use:
#   docker compose up --build
#
# To build only the backend manually:
#   docker build -f Dockerfile.backend -t simulator-backend .
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.11-slim AS base

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        curl \
        wget \
        libgomp1 \
        libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Application source
COPY . .

# Native binaries
RUN chmod +x /app/backend/bin/transcribe-cli \
    && chmod +x /app/scripts/init.sh \
    && chmod +x /app/backend/core/qwen_tts/qwen-tts

VOLUME ["/app/data", "/app/backend/core/qwen_tts/models"]

ENV LD_LIBRARY_PATH="/app/backend/bin" \
    DATABASE_URL="sqlite+aiosqlite:////app/data/112_simulator.db" \
    PYTHONPATH="/app"

EXPOSE 8000

CMD ["/app/scripts/init.sh"]
