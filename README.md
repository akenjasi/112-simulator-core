# 112 Simulator V2

Полностью обновленная версия симулятора оператора службы 112.
Проект переписан на современный асинхронный стек (FastAPI) с фронтендом на Next.js (React) и полностью контейнеризирован (Docker Compose) для простого и надежного развертывания.

Основной упор сделан на локальный запуск нейросетевых моделей для обработки речи и классификации интентов:
- **TTS (Синтез речи)**: Qwen TTS (GGUF, ~880MB) через локальный С++ бинарник.
- **ASR (Распознавание речи)**: GigaAM-v3 (GGUF) через `transcribe_cpp`.
- **NLU (Классификация)**: Локальная ML-модель Rubert-Tiny2.

## Технологический стек

### Backend
- **Python 3.11+**
- **FastAPI** — асинхронный веб-фреймворк.
- **SQLAlchemy (Async)** — ORM (SQLite `aiosqlite` по умолчанию, возможен `asyncpg` для PostgreSQL).
- **PyTorch (CPU)** — инференс классификатора намерений (без требований к GPU).
- **FFmpeg** — цифровая обработка сигналов (DSP, фильтры рации для аудио).

### Frontend
- **Next.js 16** — React-фреймворк, работает в режиме статического экспорта (`output: export`).
- **Tailwind CSS** + **shadcn/ui** — стилизация и компоненты.
- **Zustand** — управление состоянием (плеер, звонки).
- **WebSockets** — стриминг аудио для распознавания речи (ASR) в реальном времени.

### Инфраструктура
- **Docker Compose** — запуск frontend (Nginx) и backend (Uvicorn).
- Персистентные **Docker Volumes** для хранения базы данных, кэша синтеза речи и весов моделей.

## Архитектура диалогового движка

Движок симулирует звонящего заявителя и построен по принципу **Functional Core, Imperative Shell**:
1. **ASR Router (WebSockets)** принимает аудио от микрофона, распознает текст.
2. **Intent Classifier** классифицирует фразу оператора в один из 10 интентов.
3. **Dialogue Router (Чистая функция)** рассчитывает ответ, динамику паники и штрафы.
4. **TTS Engine (Qwen TTS)** синтезирует ответный голос и накладывает DSP-фильтры "рации".

## Документация

Подробная информация о развертывании, структуре проекта и Docker находится в файлах:
- [DOCKER.md](DOCKER.md) — Инструкция по запуску и обслуживанию Docker-контейнеров.
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) — Подробное описание структуры папок и модулей.

## Безопасность и ФЗ-152

Проект поддерживает работу с PostgreSQL и включает архитектурные решения (в том числе хеширование паролей и инструкции по защите томов БД) для соответствия требованиям ФЗ-152 (защита ПДн). Подробности в [DOCKER.md](DOCKER.md).

## Быстрый старт (Docker)

1. Создайте файл `.env`:
   ```bash
   cp .env.example .env
   ```
2. Запустите стек:
   ```bash
   docker compose up --build
   ```
   *При первом запуске бэкенд скачает необходимые GGUF-веса моделей (~880 MB).*

3. Интерфейсы:
   - **Frontend:** http://localhost:3000
   - **Backend API:** http://localhost:8000
   - **Swagger Docs:** http://localhost:8000/docs

## Environment Variables for Integration

### Asterisk PBX Integration
- `ASTERISK_HOST` - IP or hostname of the Asterisk server (default: 127.0.0.1)
- `ASTERISK_PORT` - AMI port (default: 5038)
- `ASTERISK_LOGIN` - AMI user
- `ASTERISK_PASSWORD` - AMI password

### SPO-112 Integration
- `SPO112_PROTOCOL` - REST or SOAP (default: REST)
- `SPO112_ENDPOINT` - URL to SPO-112 system (default: http://localhost:8080/api/export)
- `SPO112_USERNAME` - Authentication username
- `SPO112_PASSWORD` - Authentication password

### LDAP (Active Directory / FreeIPA) Integration
- `LDAP_ENABLED` - Enable LDAP authentication (default: False)
- `LDAP_SERVER` - URL of the LDAP server (e.g., `ldap://192.168.1.100`)
- `LDAP_DOMAIN` - Domain to append for bind (e.g., `corp.local`)
- `LDAP_BASE_DN` - Base DN to build the uid for bind (e.g., `dc=corp,dc=local`)
