# syntax=docker/dockerfile:1

# ─── Stage 1: Build Next.js Frontend ──────────────────────────────────────────
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend_react

# Install dependencies first (better caching)
COPY frontend_react/package*.json ./
RUN npm ci

# Copy sources and build standalone bundle
COPY frontend_react/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage 2: Final Runtime Image (Python + Node.js) ─────────────────────────
FROM python:3.12-slim AS runner

# Install Node.js 20 runtime & curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend and seed scripts
COPY backend/ /app/backend/
COPY scripts/ /app/scripts/
COPY seed.py /app/seed.py
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Copy seed datasets
RUN mkdir -p /app/seed_data /app/data
COPY data/classifier_ekp.json /app/seed_data/
COPY data/moscow_112_addresses.json /app/seed_data/

# Copy standalone frontend from builder
COPY --from=frontend-builder /app/frontend_react/.next/standalone /app/frontend
COPY --from=frontend-builder /app/frontend_react/.next/static /app/frontend/.next/static
COPY --from=frontend-builder /app/frontend_react/public /app/frontend/public

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV DATABASE_URL="sqlite+aiosqlite:////app/data/112_simulator.db"
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV BACKEND_INTERNAL_URL="http://127.0.0.1:8000"

EXPOSE 3000 8000
VOLUME ["/app/data"]

ENTRYPOINT ["/app/docker-entrypoint.sh"]
