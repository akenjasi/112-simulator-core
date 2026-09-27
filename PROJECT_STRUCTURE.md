# Структура проекта (112 Simulator V2)

Ниже описана актуальная структура директорий полностекового приложения (Full-Stack).

## Корень проекта (`/`)
- `README.md` — Главная документация проекта.
- `PROJECT_STRUCTURE.md` — Описание архитектуры и директорий.
- `DOCKER.md` — Инструкция по работе с Docker.
- `docker-compose.yml` — Конфигурация запуска сервисов `frontend` и `backend`.
- `Dockerfile.backend` / `Dockerfile.frontend` — Сценарии сборки образов.
- `.env` и `.env.example` — Конфигурация переменных окружения.
- `requirements.txt` — Список зависимостей Python бэкенда (включает ML-пакеты).

## Backend (`backend/`)
Основной код серверной логики на базе FastAPI.
- `main.py` — Точка входа, инициализация FastAPI, регистрация роутеров.
- `database.py` — Настройки асинхронного подключения к БД (SQLite/PostgreSQL).
- `api/` — Роутеры (Endpoints). Разделены на домены (auth, users, tickets, asr, tts и т.д.).
- `core/` — Основная бизнес-логика и движок диалога:
  - `intent_classifier.py` — Локальная ML-модель Rubert-Tiny2 (PyTorch) для классификации фраз (интенты 0–9).
  - `dialogue_router.py` — Чистая функция хода диалога (`process_turn`), расчет паники и обновление стейта.
  - `tts_v2.py` — Работа с Qwen TTS, интеграция с локальным бинарником `qwen-tts`.
  - `reports_engine.py` — Генерация отчетов через Jinja2 шаблоны.
  - `security.py` — JWT и хэширование паролей.
- `models/` — Описание структур БД (SQLAlchemy Models). Разделены на логические домены (`domain_01`...`domain_05`).
- `schemas/` — Pydantic-схемы валидации DTO (`bricks.py`, `router.py`, `factoids.py` и др.).
- `bin/` — Локальные скомпилированные C++ бинарники и разделяемые библиотеки (`libggml`, `transcribe-cli`), необходимые для моделей речи.
- `qwen_tts/` — Логика работы с TTS, папки для моделей, промптов голоса (`voices`).

## Frontend (`frontend_react/`)
Клиентская часть на базе Next.js 16 (React).
- `package.json` — Зависимости и скрипты Node.js.
- `next.config.mjs` — Конфигурация Next.js, настроенная на статический экспорт (`output: export`) для Docker.
- `app/` — App Router структура Next.js:
  - Роутинг по ролям: `operator/`, `teacher/`, `student/`.
  - Вложенные динамические пути (например, `[id]/live`).
- `components/` — Переиспользуемые React-компоненты (построены с использованием `shadcn/ui` и `Tailwind CSS`).
- `lib/` — Вспомогательные утилиты, API-клиенты.
- `store/` — Глобальное состояние на базе Zustand.

## Data и Models
- `data/` — Локальное хранилище данных: база `112_simulator.db`, аудио-кэш TTS (`tts_cache`), бэкапы. Смонтировано как Docker Volume.
- `models/classifier/` — Локальная нейронная сеть Rubert-Tiny2.

## Тестирование (`tests/`)
Набор unit и интеграционных тестов (Pytest) для проверки функционала. Не требует внешних сервисов благодаря мокированию.

## Docker & Scripts (`docker/`, `scripts/`)
- `docker/nginx.conf` — Конфигурация Nginx для сервиса frontend (проксирование `/api` к бэкенду).
- `scripts/init.sh` — Скрипт инициализации бэкенда (автоматическое скачивание тяжелых GGUF-моделей перед запуском `uvicorn`).
- `scripts/download_models.sh` — Bash-скрипт для ручной загрузки TTS-моделей при запуске без Docker.
- `scripts/setup_asr.sh` — Инструкция и скрипт для локальной сборки микросервиса `transcribe_cpp`.
