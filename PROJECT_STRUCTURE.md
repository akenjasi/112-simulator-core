# Фактическая карта проекта

Актуализировано 19.10.2026. Код API находится в `backend/api`, не в отсутствующем `backend/v2_engine`.

| Область | Входы и основные связи |
|---|---|
| Приложение | `backend/main.py`: routers, startup/migrations, middleware, `/health`; `backend/database.py`: единый async engine |
| Вход и права | `router_auth.py` → `security.py`, `auth_sessions.py`, `deps.py`; `access.py` задаёт владение объектами; `socket_auth.py` проверяет первый кадр WS и актуальность сессии |
| Учётные записи | `router_users.py`, `router_groups.py`; `domain_01.py`: пользователи, группы, auth sessions/challenges, журнал |
| Администрирование | `router_admin.py`, `router_audit.py`, `integrity.py`, `scripts/backup_db.py`; UI `/admin/*` |
| Билеты и знания | `router_tickets.py`, `router_scenarios.py`, `router_scenario.py`, `router_knowledge.py`; `domain_02.py`, `domain_05.py`; несколько исторических форматов пока сохраняются |
| Занятия | `router_lessons.py`, `router_assignments.py`, `router_sessions.py`; `Assignment → ExamSession`, `domain_03.py` |
| DDS | `router_dds.py` → `dds_cycle.py`, `dds_queue.py`, `dds_phone.py`, `dds_service_policy.py`; UI `/dds`, `dds-assigned-console.tsx`; результаты `IncidentCard`, `TicketResult`, `EvaluationResult` |
| Отчёты DDS | `router_dds_reports.py` → `dds_report_data.py`, `dds_report_jobs.py`, `dds_report_llm.py`; снимок фактов и persisted job, внешний OpenAI-compatible llama.cpp HTTP |
| Оператор | `/operator`, `useTelephony.ts`, `useCallStore.ts`; `router_asr.py`, `router_telephony.py`, `runtime_router.py`, `tts_v2.py`; отдельный legacy `router_call.py`/`dialogue_router.py`/`tts_engine.py` сохранён до миграции потребителей |
| Аналитика/экспорт | `router_analytics.py`, `analytics_scope.py`; `router_reports.py`/`reports_engine.py`; только доступные преподавателю сохранённые данные; неизвестные оценки nullable |
| Интерфейс | `frontend_react/app` (маршруты), `components`, `hooks`, `lib`; `RequireAuth` + `apiFetch`; браузерные guards дополняют серверную авторизацию |
| Поставка | `Dockerfile.backend` (корневой Dockerfile — symlink), `Dockerfile.frontend`, Compose, `docker/nginx.conf`; output `out/` генерируется, не хранится в Git |
| Контроль | `scripts/verify_build.sh`, `scripts/checks/*`, `tests`, независимые `tools_tests`, PostgreSQL check-скрипты, `.github/workflows/quality.yml` |

Данные групп исторически продублированы в M2M и JSON; без миграции не удалять ни одно представление. `backend/db/database.py` — совместимый re-export единого engine. Схема: `backend/core/schema_migrations.py`, CLI `scripts/schema.py`; неизвестный обязательный drift блокирует старт до изменения схемы.

Исторические архитектурные описания сохранены в `docs/architecture/` с пометкой. Подробный перечень функций, незавершённых путей и кандидатов на удаление — в [аудите](docs/audit/2026-10-19/REPORT.md).
