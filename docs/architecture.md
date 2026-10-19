# Фактическое устройство

Статус: действующее описание структуры, сверено с main с принятыми исправлениями аудита (`ea845fc`) 19.10.2026. Функции приложения этой уборкой не меняются. Старые описания `v2_engine` не соответствуют текущим путям.

## Точки входа

Пути backend в таблице относительны `backend/`.

| Область | Код и связи |
|---|---|
| API/startup | `main.py`: routers, lifespan, middleware, health; `database.py`: основной async engine |
| Вход и администрирование | `api/router_auth.py`, `router_users.py`, `router_admin.py`, `router_audit.py`; `core/security.py`, `deps.py`, `auth_sessions.py`, `bootstrap.py`, `integrity.py` |
| Группы, билеты, знания | `router_groups.py`, `router_tickets.py`, `router_scenarios.py`, `router_scenario.py`, `router_knowledge.py`; генераторы/imports/uploads |
| Занятия | `router_lessons.py`, `router_assignments.py`, `router_sessions.py`; `Assignment → ExamSession` |
| DDS | `router_dds_cycle.py`, `router_dds.py`; `dds_cycle.py`, `dds_queue.py`, `dds_service_policy.py`; карточки, последовательность, действия, завершение |
| Кабинет курсанта | `router_student_workspace.py`, `/api/dds/student-workspace`; UI `app/student/profile`, `components/student`, `lib/student-review.ts` |
| Аналитика/оценка | `router_analytics.py`, `router_ai_analytics.py`, `ai_analytics_access.py`; экспертные оценки и результаты |
| Нейроотчёты DDS | `router_dds_reports.py` → `dds_report_data.py`, `dds_report_jobs.py`, `dds_report_llm.py`; сохранённый job/snapshot, HTTP inference |
| Оператор/речь | `router_call.py`, `router_asr.py`, `router_telephony.py`; `runtime_router.py`, `dialogue_router.py`, `intent_classifier.py`, `tts_v2.py`, `tts_engine.py` |
| Интерфейс | `frontend_react/app`: Next routes; `components`, `hooks`, `lib`, `store`: UI/network/state |

Это карта поиска, не обещание готовности каждой интеграции. API разных поколений и ASR/TTS/SIP/SPO112 требуют отдельных проверок.

## Данные

Модели находятся в `models/domain_01.py` … `domain_06.py`, `base.py`, `dds_report_job.py`.

- `User`, `StudentGroup`, M2M link и исторические JSON membership существуют одновременно. Это не основание удалить одно представление.
- Учебная работа: `Assignment → ExamSession → IncidentCard`, `TicketResult`, `EvaluationResult`. DDS хранит снимки карточек/действия и очередь в `dynamic_state.dds`.
- Билеты представлены несколькими форматами (`ScenarioTicket`, `GeneratedTicket`, матрица). Их объединение требует миграции потребителей.
- `DDSReportJob` сохраняет job/attempt/status/snapshot/result; worker поддерживает один backend-процесс.
- Файлы uploads, TTS cache, recordings и backups находятся в `data`; модели поставляются отдельно. Снимок БД не резервирует все файлы.

Локально основной engine по умолчанию SQLite; основные Compose задают PostgreSQL15. `backend/db/database.py` — совместимый re-export основного engine.

## Поставка

Next dev проксирует `/api`, production frontend — статический export за Nginx. Backend-only запуск не заменяет frontend. Dockerfiles, обычные Compose и offline bundle — разные точки входа; см. [эксплуатацию](operations/deployment.md).

Проверки лежат в `tests`, `frontend_react/tests`, независимых `tools_tests` и `scripts/tests`. Состав gate задаётся manifests/workflow, а не количеством тестов в старом отчёте. См. [тестирование](testing.md), [backlog](backlog.md) и [историю](history/README.md).

## Артефакты и нативные зависимости

- `backend/native/asr/transcribe_cpp` — сторонние Python bindings, перенесённые без изменения содержимого. `router_asr.py` добавляет их родительский каталог в Python search path; native library задаётся через TRANSCRIBE_LIBRARY.
- `backend/bin` — исполняемый ASR CLI и shared libraries; нужны также loader/Docker и integrity manifest, поэтому это не мусор сборки.
- `backend/core/qwen_tts` — TTS runtime с внешними weights; модели не входят в базовый image автоматически.
- `assets/tts-cache` — поставляемые готовые WAV. Entrypoint копирует их в рабочий `data/tts_cache`, не смешивая исходные assets с пользовательским cache.
- `data/112_simulator.db` — стандартная локальная БД; явный DATABASE_URL имеет приоритет. Старый корневой файл используется только как совместимый fallback, если canonical файла ещё нет. Backup использует ту же политику пути.

База, uploads и результаты не являются исходным кодом. Удалять их при уборке нельзя; перенос данных выполняется отдельно после проверки открытых файлов и резервной копии.
