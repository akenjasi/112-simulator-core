# Проверки проекта

Статус: действующий интерфейс запуска. Состав проверок задают manifests и workflow; не копируйте сюда постоянно меняющиеся количества тестов.

## Среда и изоляция

CI/Docker используют Python3.11, frontend — Node22/npm. Установите runtime через --require-hashes из requirements.lock и frontend package-lock, тестовый инструментарий из tools_tests/requirements.txt. ML-зависимости могут требовать отдельной установки, как в существующем workflow. Версии этой уборкой не обновляются.

`scripts/verify_build.sh` создаёт собственную SQLite/token proof до импорта backend и удаляет только свои ресурсы. Унаследованный непустой DATABASE_URL запрещён. Не обходите эту защиту адресом рабочей БД. Pytest tests/conftest.py тоже проверяет изоляцию; исторические тесты в отличие от runner могут иметь другие внешние требования.

Из корня проекта:

```bash
bash scripts/verify_build.sh backend-core
bash scripts/verify_build.sh frontend
bash scripts/verify_build.sh all
bash scripts/verify_build.sh backend-all
python -m pytest -c tools_tests/pytest.ini tools_tests -q
python -m unittest discover -s scripts/tests -p 'test_offline_*.py' -v
python -m unittest discover -s scripts/tests -p 'test_repository_utilities.py' -v
python scripts/check_dds_queue_postgres.py
```

| Режим runner | Что проверяет |
|---|---|
| backend-core | scripts/checks/backend-core.txt |
| frontend | frontend manifest, Vitest, tsc, static production export |
| all | backend-core и frontend; это режим по умолчанию |
| backend-all | Все tests/: полный диагностический набор, не синоним core |

Reports/summary.json сохраняются в reports/verification либо IMBA_VERIFY_REPORT_DIR. Проверка manifests выполняется до выделения ресурсов. Runner не принимает недостающий файл как успешно пропущенную стадию и не изменяет список при падении.

## Независимые и целевые проверки

`tools_tests` имеет отдельную pytest.ini, чтобы проверка runner не импортировала его изолирующий tests/conftest. Независимые tests/acceptance manifests не меняют ради зелёного результата. [Правила приёмки](../tools_tests/README.md).

- DDS queue/saved tickets/cycle/service policy: tests/test_dds_queue.py и связанные наборы из backend manifest. PG-скрипт создаёт собственный PostgreSQL15 container и проверяет реальные конкурирующие транзакции.
- Student workspace, history и review: backend test_student_workspace.py, frontend student-current-lesson/student-attempt-review наборы. Наличие пяти UI-критериев не заменяет протокол API.
- Экспертное оценивание: tests/test_teacher_grading_acceptance.py и frontend 27_teacher/teacher-grading.acceptance.test.tsx.
- Нейроотчёты: tests/test_dds_report_{data,jobs,llm}_{acceptance,unit}.py и frontend dds-lesson-report tests. Controlled LLM responses/отказы не являются live inference.
- Scope guard рабочего DDS использует docs/dds-workflow-frontend-baseline.json. Его не переписывают для сокрытия посторонних изменений.
- Offline checks используют recording Docker/curl fakes и временные файлы, не настоящие images/weights/live DB. Отдельная проверка утилит имитирует TTS/копирование моделей; не запускает seeder для реальной БД.

Исторические исходы проверок сохранены в [истории](history/README.md). Не превращайте старый SUCCESS/красный тест в текущее состояние без повторного запуска.

## CI и границы доказательства

`.github/workflows/quality.yml` устанавливает backend/frontend dependencies и запускает backend-core, offline contracts, frontend и независимые tests. GitHub branch protection задаётся вне репозитория; конфигурация workflow не доказывает, что удалённый run прошёл.

После перемещения файлов проверьте imports, scripts, Docker/packaging paths, локальные Markdown links и `git diff --check`. При изменении frontend routes выполняйте tsc на чистом generated state и production export. Не подавляйте Vitest unhandled errors.

Core не обещает зелёный backend-all. Реальные speech/SIP/LDAPS/GPU, RPO/RTO, нагрузка, mobile и нормативные требования принимаются отдельно; остаточные работы собраны в [backlog](backlog.md).
