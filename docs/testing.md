# Проверки проекта

Статус: действующий интерфейс запуска. Состав проверок задают manifests и workflow; не копируйте сюда постоянно меняющиеся количества тестов.

## Среда и изоляция

CI/Docker используют Python3.11, frontend — Node22/npm. Установите runtime через --require-hashes из backend/requirements/runtime.lock и frontend package-lock, тестовый инструментарий из backend/requirements/test.txt. ML-зависимости могут требовать отдельной установки, как в существующем workflow. Версии этой уборкой не обновляются. Все четыре Python-манифеста собраны в backend/requirements.

`tools/quality/verify.sh` создаёт собственную SQLite/token proof до импорта backend и удаляет только свои ресурсы. Унаследованный непустой DATABASE_URL запрещён. Не обходите эту защиту адресом рабочей БД. Pytest backend/tests/conftest.py тоже проверяет изоляцию; исторические тесты в отличие от runner могут иметь другие внешние требования.

Общий вход — `make test`; `make test-all` дополнительно выполняет полный backend suite. Даже при отказе одного независимого набора Makefile выполняет остальные наборы и возвращает ненулевой итог. Точечные команды из корня проекта:

```bash
bash tools/quality/verify.sh backend-core
bash tools/quality/verify.sh frontend
bash tools/quality/verify.sh all
bash tools/quality/verify.sh backend-all
python -m pytest -c tools/tests/acceptance/pytest.ini tools/tests/acceptance -q
python -m unittest discover -s docker/offline/tests -p 'test_offline_*.py' -v
python -m unittest discover -s tools/tests/utilities -v
python backend/tests/postgres/check_queue.py
```

| Режим runner | Что проверяет |
|---|---|
| backend-core | tools/quality/checks/backend-core.txt |
| frontend | frontend manifest, Vitest, tsc, static production export |
| all | backend-core и frontend; это режим по умолчанию |
| backend-all | Все backend/tests/: полный набор, включая актуализированные legacy-контракты |

Reports/summary.json сохраняются в data/checks/verification либо IMBA_VERIFY_REPORT_DIR. Проверка manifests выполняется до выделения ресурсов. Runner не принимает недостающий файл как успешно пропущенную стадию и не изменяет список при падении.

## Независимые и целевые проверки

`tools/tests/acceptance` имеет отдельную pytest.ini, чтобы проверка runner не импортировала его изолирующий tests/conftest. Независимые tests/acceptance manifests не меняют ради зелёного результата. [Правила приёмки](../tools/tests/acceptance/README.md).

- DDS queue/saved tickets/cycle/service policy: backend/tests/test_dds_queue.py и связанные наборы из backend manifest. PG-скрипт создаёт собственный PostgreSQL15 container и проверяет реальные конкурирующие транзакции.
- Student workspace, history и review: backend test_student_workspace.py, frontend student-current-lesson/student-attempt-review наборы. Наличие пяти UI-критериев не заменяет протокол API.
- Экспертное оценивание: backend/tests/test_teacher_grading_acceptance.py и frontend 27_teacher/teacher-grading.acceptance.test.tsx.
- Нейроотчёты: tests/test_dds_report_{data,jobs,llm}_{acceptance,unit}.py и frontend dds-lesson-report tests. Controlled LLM responses/отказы не являются live inference.
- Scope guard рабочего DDS использует docs/dds-workflow-frontend-baseline.json. Первоначальная карта sha256 сохранена; approved_updates закрепляет точные хеши уже интегрированных изменений и исправления жизненного цикла уведомлений. У каждой записи есть основание и исходная ревизия. Произвольные изменения, добавления и удаления по-прежнему отклоняются; это проверяют отрицательные probes. Новое согласованное изменение требует отдельного рассмотрения, а не замены всей карты.
- Offline checks используют recording Docker/curl fakes и временные файлы, не настоящие images/weights/live DB. Отдельная проверка утилит имитирует TTS/копирование моделей; не запускает seeder для реальной БД.

Исторические исходы проверок сохранены в [истории](history/README.md). Не превращайте старый SUCCESS/красный тест в текущее состояние без повторного запуска.

## CI и границы доказательства

`.github/workflows/quality.yml` устанавливает backend/frontend dependencies и запускает backend-core и backend-all, offline contracts, проверки утилит/Makefile, frontend и независимые tests. GitHub branch protection задаётся вне репозитория; конфигурация workflow не доказывает, что удалённый run прошёл.

После перемещения файлов проверьте imports, scripts, Docker/packaging paths, локальные Markdown links и `git diff --check`. При изменении frontend routes выполняйте tsc на чистом generated state и production export. Не подавляйте Vitest unhandled errors.

Core остаётся быстрым минимальным контуром; backend-all обязателен в CI. Старые имена тестов не означают поддержку прежних обходов авторизации, синтетических ответов ML или удалённых API. Неподключённый runtime проверяется на явный отказ; модельный unit test использует явную заглушку и не выдаётся за inference.

Реальные speech/SIP/LDAPS/GPU, RPO/RTO, нагрузка, mobile и нормативные требования принимаются отдельно; остаточные работы собраны в [backlog](backlog.md).
