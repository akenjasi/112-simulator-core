import re

with open("docker-compose.yml", "r") as f:
    content = f.read()

# 1. Update backend environment DATABASE_URL
content = re.sub(
    r'DATABASE_URL: "sqlite\+aiosqlite:////app/data/112_simulator\.db"',
    'DATABASE_URL: "postgresql+asyncpg://admin:securepass@postgres:5432/simulator112"',
    content
)

# 2. Add depends_on postgres for backend (since there's no depends_on for backend yet)
# We will insert it before `networks:` in backend
backend_depends_on = """    depends_on:
      postgres:
        condition: service_healthy
    networks:"""
content = re.sub(
    r'    networks:',
    backend_depends_on,
    content,
    count=1
)

# 3. Add postgres service
postgres_service = """  postgres:
    image: postgres:15-alpine
    container_name: simulator_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: securepass
      POSTGRES_DB: simulator112
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U admin -d simulator112"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - simulator_net

  backend:"""
content = re.sub(
    r'  backend:',
    postgres_service,
    content,
    count=1
)

# 4. Add postgres_data volume
volumes_section = """  simulator_models:
    driver: local
  postgres_data:
    driver: local"""
content = re.sub(
    r'  simulator_models:\n    driver: local',
    volumes_section,
    content
)

with open("docker-compose.yml", "w") as f:
    f.write(content)

