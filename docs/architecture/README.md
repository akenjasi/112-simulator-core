# Архитектура и Контракты Данных Системы-112

Документация разбита по принципу **Domain-Driven Design (DDD)** на 5 изолированных доменов (Bounded Contexts).

> **Важно:** Эталонная реализация бэкенда — `backend/v2_engine/`. Весь legacy-код до v2_engine не поддерживается.

1. [01_identity_and_roles.md](./01_identity_and_roles.md) — **Identity & Roles**: Пользователи, Группы и Доступ (User, StudentGroup, UserActionLog, RBAC-матрица).
2. [02_scenario_management.md](./02_scenario_management.md) — **Scenario Management**: Фабрика Билетов (ScenarioTicket со structure `workflow_state`, `ground_truth`, `ai_content`, `version_history`).
3. [03_simulation_runtime.md](./03_simulation_runtime.md) — **Simulation Runtime**: Рантайм Занятия — два типа сессий: ExamSession (`CALL_SIMULATION`) и CardActionSession (`CARD_ACTIONS`), Assignment, ReferenceMaterial.
4. [04_assessment_and_dds.md](./04_assessment_and_dds.md) — **Assessment & Dispatch**: Оценка и ДДС (IncidentCard, EvaluationResult с grammar_detail, SessionReport, AIInsight, SLA Task).
5. [05_dialogue_engine.md](./05_dialogue_engine.md) — **Dialogue Engine (v2_engine)**: Движок бота-заявителя — пайплайн генерации (Qwen 9B → SM1/SM2/SD1/SD2), компиляция BricksMatrix, интент-классификация (Qwen 0.8B, 0–9), TTS (Silero v4_ru + DSP).
6. [06_api_contracts.md](./06_api_contracts.md) — **API Contracts**: Все HTTP/SSE эндпоинты. Закрывает три зазора: автокомпиляция BricksMatrix, инициация сессии (teacher open + cadet start), live-мониторинг преподавателя через SSE.
7. [07_database_schema.md](./07_database_schema.md) — **Database Schema**: Полная схема БД. Dual-engine (SQLite для dev, PostgreSQL для prod через DATABASE_URL). 14 таблиц v2, индексы, EXAM/TRAINING режимы, совместимость с legacy-таблицами, путь миграции.

## Полный список объектов

| Объект | Домен | Назначение |
|---|---|---|
| `User` | 01 | Пользователь системы (ADMIN / TEACHER / CADET) |
| `StudentGroup` | 01 | Учебная группа курсантов |
| `UserActionLog` | 01 | Аудит-лог действий (хранение ≥6 мес) |
| `ScenarioTicket` | 02 | Учебный сценарий с эталонными данными и факторидами |
| `Assignment` | 03 | Назначение сценария на группу/курсанта |
| `ExamSession` | 03 | Сессия типа CALL_SIMULATION (браузерный звонок + карточка) |
| `CardActionSession` | 03 | Сессия типа CARD_ACTIONS (работа с пулом карточек) |
| `ReferenceMaterial` | 03 | Справочная база для курсанта |
| `IncidentCard` | 04 | Карточка происшествия, заполненная курсантом |
| `EvaluationResult` | 04 | Автоматическая оценка (с грамматикой и таймингом) |
| `SessionReport` | 04 | Агрегированный отчёт по занятию/группе |
| `AIInsight` | 04 | Персональная аналитика по курсанту (тренды, рекомендации) |
| `SLA Task` | 04 | Таймер реагирования ДДС (для CARD_ACTIONS) |
| `FactoidGenerationRequest` | 05 | Запрос к Qwen 9B для генерации реплик заявителя |
| `BricksMatrix` | 05 | Скомпилированный каталог «кирпичиков» диалога (файл на диске) |
| `V2ApplicantSession` | 05 | Рантайм-состояние бота-заявителя (паника, revealed-флаги, история) |

## Стек v2_engine

| Компонент | Файл | Назначение |
|---|---|---|
| Генератор факторидов | `factoid_generator.py` | Qwen 9B (Q4_K_M GGUF), SSE-стрим |
| Компилятор диалога | `bricks_compiler.py` | Детерминированная сборка BricksMatrix |
| Рантайм бота | `runtime_router.py` | Qwen 0.8B (Q8_0), intent 0–9, `V2ApplicantSession` |
| TTS движок | `tts_v2.py` | Silero v4_ru + DSP телефонный фильтр, MD5-кеш |

