# Quality Gate и обязательный CI (P3)

Документ фиксирует регламент контроля качества, архитектуру обязательного CI, состав проверяемых манифестов, реестр диагностических/legacy падений и шаги по настройке Branch Protection в GitHub.

---

## 1. Назначение и принципы Quality Gate

Quality Gate гарантирует постоянную работоспособность актуального продуктового контура (DDS, RBAC-авторизация, профили курсантов, генерация билетов, журналы и панели преподавателя/администратора):
- **Строгий контроль типов**: ошибки компиляции TypeScript не подавляются (`ignoreBuildErrors: false` в `next.config.mjs`, отсутствие `@ts-ignore` и `any` в продуктовом коде).
- **Изоляция тестовых данных**: проверки бэкенда выполняются исключительно через изолированный раннер `scripts/verify_build.sh` (P2) на свежих временных базах данных с верификацией токена владения.
- **Блокирующий CI**: сбой любой обязательной проверки (`backend-core`, `frontend-tests`, `typecheck`, `frontend-build`, `tools_tests`) немедленно приводит к падению CI-билда с ненулевым кодом выхода.
- **Честный статус проекта**: полный репозиторий не объявляется "100% зелёным" фиктивным сокрытием legacy-ошибок. Неактуальные или исторические тесты голосового контура зафиксированы в отдельном диагностическом реестре.

---

## 2. Архитектура CI Workflow (`.github/workflows/quality.yml`)

Файл рабочего процесса: [`.github/workflows/quality.yml`](file:///home/orborus/Desktop/hakaton/112-simulator-core/.github/workflows/quality.yml).

### Триггеры запуска
```yaml
on:
  push:
    branches:
      - main
  pull_request:
```
- Исключён привилегированный триггер `pull_request_target`, что исключает риск выполнения недоверенного стороннего кода с доступом к секретам репозитория.
- Для выполнения проверок не требуются production-секреты, приватные ключи, аппаратный GPU или сторонние сетевые ML-сервисы.

### Шаги выполнения
1. **Критический backend (`backend-core`)**:
   ```bash
   bash scripts/verify_build.sh backend-core
   ```
   Запускает критический набор тестов бэкенда на изолированной временной SQLite БД.
2. **Фронтенд-верификация (`frontend`)**:
   ```bash
   bash scripts/verify_build.sh frontend
   ```
   Последовательно выполняет:
   - `frontend-tests`: запуск всех 23 тестовых файлов из `scripts/checks/frontend-core.txt`;
   - `typecheck`: строгая проверка `tsc --noEmit`;
   - `frontend-build`: статический production-билд Next.js с `DOCKER_BUILD=true`.
3. **Независимая приёмка (`tools_tests`)**:
   ```bash
   python -m pytest -c tools_tests/pytest.ini tools_tests -q
   ```
   Запускает независимый внешний тестовый контур (P1 ownership, P2 runner guard, P3 quality gate probes).

Все шаги сконфигурированы без флагов `continue-on-error` и условных условий `if:`, пропускающих проверку.

---

## 3. Состав обязательных наборов (Supported Manifests)

Состав обязательных проверок зафиксирован в манифестах:

1. **`scripts/checks/backend-core.txt`** (Критический бэкенд, 21 файл):
   - `tests/test_merge_security_regressions.py`
   - `tests/test_auth_required.py`
   - `tests/test_auth_session_model.py`
   - `tests/test_auth_session_lifecycle.py`
   - `tests/test_admin_restrictions.py`
   - `tests/test_admin_backups.py`
   - `tests/test_admin_backups_review.py`
   - `tests/test_admin_journal.py`
   - `tests/test_admin_journal_review.py`
   - `tests/test_password_reset.py`
   - `tests/26_test_admin_tools.py`
   - `tests/test_initial_admin.py`
   - `tests/test_47_student_stats.py`
   - `tests/test_49_profile_enhancements.py`
   - `tests/test_dds_cycle_acceptance.py`
   - `tests/test_dds_report_data_acceptance.py`
   - `tests/test_dds_report_data_unit.py`
   - `tests/test_dds_report_jobs_acceptance.py`
   - `tests/test_dds_report_jobs_unit.py`
   - `tests/test_dds_report_llm_acceptance.py`
   - `tests/test_dds_report_llm_unit.py`

2. **`scripts/checks/frontend-core.txt`** (Обязательный фронтенд, 23 файла):
   - `tests/api_fetch.test.ts`
   - `tests/auth_entry.test.tsx`
   - `tests/auth_guard.test.tsx`
   - `tests/logout.test.tsx`
   - `tests/password_reset_api.test.ts`
   - `tests/system_status.test.tsx`
   - `tests/admin_panel.test.tsx`
   - `tests/admin_backups.test.tsx`
   - `tests/admin_journal.test.tsx`
   - `tests/admin_journal_review.test.tsx`
   - `tests/74_2fa_frontend.test.tsx`
   - `tests/48_student/48_student.test.tsx`
   - `tests/27_teacher/27_01_groups.test.tsx`
   - `tests/27_teacher/27_02_tickets.test.tsx`
   - `tests/27_teacher/27_06_knowledge.test.tsx`
   - `tests/27_teacher/dds-lesson-report.test.tsx`
   - `tests/27_teacher/dds-lesson-report.acceptance.test.tsx`
   - `tests/dds-cycle/dds-cycle-validation.test.ts`
   - `tests/dds-cycle/dds-cycle.acceptance.test.tsx`
   - `tests/dds-cycle/dds-route.acceptance.test.tsx`
   - `tests/dds-cycle/teacher-history.acceptance.test.tsx`
   - `tests/dds-cycle/teacher-live.acceptance.test.tsx`
   - `tests/p3_component_contracts.acceptance.test.tsx`

---

## 4. Реестр диагностических и Legacy падений

Падения полного legacy-набора (`backend-all`) не скрываются и вынесены в явный реестр:

| ID | Компонент / Тест | Причина падения | Контракт / Обоснование | Действие | Ответственный |
|---|---|---|---|---|---|
| **LEGACY-TTS-01** | `tests/test_30_tts_fix.py` | `ImportError: cannot import name 'SileroTTSV2' from 'backend.core.tts_v2'` на этапе сбора тестов | Динамический движок Silero TTS выведен из эксплуатации. Согласно ТЗ P3 универсальный голосовой контур отсутствует и не подлежит восстановлению. | Оставлен в диагностическом режиме `backend-all`; изолирован от `backend-core`. | Владелец репозитория / этап голосового контура |
| **LEGACY-VOICE-02** | `tests/test_33_tts_crash.py` | Ошибка инициализации синтезатора речи (отсутствие локальных весов и звуковых драйверов) | Полноценный синтез выведен из состава стенда. Юнит-тест `tests/test_tts.py` изолирован моками и проходит успешно, тогда как интеграционный стресс-тест `test_33_tts_crash.py` требует реальной инициализации моделей. | Вынесен за рамки обязательного CI-контура в диагностический режим `backend-all`. | ML / DevOps инженер |
| **LEGACY-TEL-03** | `tests/test_62_telephony.py` | HTTP `401 Unauthorized` при запросе `POST /api/v2/telephony/start_call` (в `test_start_call_and_status_flow` запрос выполняется без Bearer-токена) | Эндпоинт телефонии защищён проверкой авторизации; падение вызвано отсутствием заголовка Authorization в тесте, а не требованием живой АТС. | Оставлен в диагностическом режиме `backend-all` до обновления теста с передачей токена. | Инженер телефонии / бэкенда |

---

## 5. Инструкция владельцу репозитория по GitHub Branch Protection

Наличие workflow-файла `.github/workflows/quality.yml` в коде является необходимым, но не достаточным условием защиты ветки `main`. Владельцу репозитория необходимо активировать Branch Protection Rules:

1. Открыть репозиторий в браузере и перейти во вкладку **Settings**.
2. В боковом меню перейти в раздел **Code and automation** -> **Branches**.
3. Нажать **Add branch protection rule** (или отредактировать правило для ветки `main`).
4. В поле **Branch name pattern** указать: `main`.
5. Включить обязательные параметры:
   - ✅ **Require a pull request before merging** (требовать PR перед слиянием);
   - ✅ **Require status checks to pass before merging** (требовать успешного прохождения проверок);
   - ✅ **Require branches to be up to date before merging** (проверять актуальность ветки относительно main);
   - В строке поиска проверок найти и добавить: `quality` (имя job из `quality.yml`);
   - ✅ **Do not allow bypassing the above settings** (запретить обход правил администраторам).
6. Нажать кнопку **Save changes**.
