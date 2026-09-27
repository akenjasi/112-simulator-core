# 🐳 Docker Deployment — 112 Simulator V2

## Быстрый старт

```bash
# 1. Скопируй файл окружения
cp .env.example .env

# 2. Собери и запусти все сервисы
docker compose up --build
```

После запуска:
| Сервис | URL |
|--------|-----|
| **Frontend** (Next.js → Nginx) | http://localhost:3000 |
| **Backend API** (FastAPI) | http://localhost:8000 |
| **Swagger UI** | http://localhost:8000/docs |

---

## Архитектура контейнеров

```
┌──────────────────────────────────────────────────┐
│                Docker Compose Network             │
│                  (simulator_net)                  │
│                                                   │
│  ┌─────────────┐        ┌──────────────────────┐ │
│  │  frontend   │ :3000  │      backend         │ │
│  │  Nginx      │───────▶│  FastAPI + Qwen TTS  │ │
│  │  /api/*     │ proxy  │  uvicorn :8000        │ │
│  └─────────────┘        └──────────────────────┘ │
│                                  │                │
│              ┌───────────────────┤                │
│              ▼                   ▼                │
│     simulator_models       simulator_data         │
│     (GGUF ~880 MB)         (SQLite + TTS cache)   │
└──────────────────────────────────────────────────┘
```

---

## Тяжёлые артефакты (GGUF-модели)

При **первом запуске** backend-контейнер автоматически скачивает:
- `qwen-talker-0.6b-base-Q4_K_M.gguf` (~600 MB)
- `qwen-tokenizer-12hz-Q4_K_M.gguf` (~243 MB)

Файлы сохраняются в Docker volume `simulator_models`. При повторных `docker compose up` скачивания **не происходит**.

Чтобы скачать модели вручную (без Docker):
```bash
bash scripts/download_models.sh
```

---

## Персистентные данные (Volumes)

| Volume | Путь в контейнере | Содержимое |
|--------|-------------------|------------|
| `simulator_data` | `/app/data` | SQLite DB, TTS-кэш, загрузки |
| `simulator_models` | `/app/backend/core/qwen_tts/models` | GGUF-модели |

> **Важно:** При `docker compose down` данные **сохраняются** в named volumes.  
> Чтобы полностью удалить всё: `docker compose down -v`

---

## Безопасность и ФЗ-152

В рамках защиты персональных данных (ПДн) и соответствия требованиям ФЗ-152:
- Пароли пользователей хешируются и хранятся в БД с использованием bcrypt.
- В качестве СУБД по умолчанию в Docker Compose используется PostgreSQL.
- Для обеспечения защиты данных в состоянии покоя (data-at-rest), администратору сервера рекомендуется включить шифрование диска на уровне хоста (например, LUKS / dm-crypt для раздела, куда смонтирован `postgres_data`) или использовать встроенные механизмы шифрования PostgreSQL (Postgres TDE - Transparent Data Encryption).
- Включена поддержка TLS/HTTPS на уровне Nginx для защиты трафика.

### Настройка SSL/TLS сертификатов

Для тестов можно сгенерировать самоподписанный сертификат с помощью скрипта:
```bash
bash scripts/generate_certs.sh
```
Для продакшена: подложите корпоративные (боевые) сертификаты (`server.crt` и `server.key`) в папку `certs/` в корне проекта. Nginx автоматически их подхватит при запуске контейнера `frontend`.

---

## Команды управления

```bash
# Запуск (пересборка при изменениях)
docker compose up --build

# Запуск в фоне
docker compose up --build -d

# Только backend (без frontend)
docker compose up backend

# Остановить без удаления данных
docker compose down

# Остановить + удалить volumes (сбросить всё, включая модели и БД!)
docker compose down -v

# Посмотреть логи backend в реальном времени
docker compose logs -f backend

# Зайти в контейнер backend
docker compose exec backend bash
```

---

## Переменные окружения (.env)

Основные переменные для Docker-окружения:

```env
# База данных (путь внутри контейнера, перекрывается в compose)
DATABASE_URL=sqlite+aiosqlite:////app/data/112_simulator.db

# JWT-секрет (обязательно сменить в продакшене!)
SECRET_KEY=your-strong-random-secret-here

# CORS: добавь свой домен для продакшена
CORS_ORIGINS=http://localhost:3000,http://your-domain.com

# Токен жизни сессии (минуты)
ACCESS_TOKEN_EXPIRE_MINUTES=480
```

---

## Структура Docker-файлов

```
112_simulator_2/
├── Dockerfile              ← Backend (синоним Dockerfile.backend)
├── Dockerfile.backend      ← Python 3.11 + ffmpeg + uvicorn
├── Dockerfile.frontend     ← Node 20 (pnpm build) → Nginx 1.27
├── docker-compose.yml      ← Связывает backend + frontend
├── .dockerignore           ← Исключает node_modules, *.gguf, *.db и др.
├── docker/
│   └── nginx.conf          ← Nginx: /api/* → backend, SPA fallback
└── scripts/
    ├── init.sh             ← Точка входа backend-контейнера
    └── download_models.sh  ← Ручная загрузка моделей (вне Docker)
```

---

## Продакшен-рекомендации

1. **SECRET_KEY** — сгенерируй случайный ключ:
   ```bash
   python3 -c "import secrets; print(secrets.token_hex(32))"
   ```

2. **CORS_ORIGINS** — укажи только свои домены, не `*`.

3. **Reverse proxy** — поставь Nginx/Traefik перед стеком, добавь TLS.

4. **PostgreSQL вместо SQLite** — раскомментируй в `.env`:
   ```env
   DATABASE_URL=postgresql+asyncpg://user:pass@db:5432/simulator
   ```

5. **Ресурсы для Qwen TTS** — рекомендуется ≥ 4 CPU cores, ≥ 8 GB RAM.

---

## Использование GigaAM ASR (Опционально)

Скрипт `router_asr.py` ожидает модель `gigaam-v3-ctc-Q8_0.gguf` для офлайн-распознавания речи.
Она **не скачивается** автоматически из-за большого размера и специфичных лицензий.

Если вы хотите использовать распознавание речи в Docker:
1. Скачайте модель GigaAM.
2. Добавьте её проброс в `docker-compose.yml`:
   ```yaml
   volumes:
     - simulator_data:/app/data
     - simulator_models:/app/backend/core/qwen_tts/models
     # Добавьте путь к скачанной модели:
     - /path/to/your/gigaam-v3-ctc-Q8_0.gguf:/app/models/gigaam-v3-ctc-Q8_0.gguf:ro
   environment:
     # Укажите путь внутри контейнера:
     GIGAAM_MODEL_PATH: "/app/models/gigaam-v3-ctc-Q8_0.gguf"
   ```
