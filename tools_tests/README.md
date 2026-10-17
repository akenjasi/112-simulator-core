# Независимая приёмка P1–P3

Эти тесты принадлежат GPT-техлиду. Исполнитель реализации не меняет их, не добавляет skips/xfail и не сокращает manifests. Дефект теста возвращается техлиду с конкретным воспроизведением.

Запуск из корня проекта, установленным Python с pytest/pytest-asyncio; для P3 также нужны зависимости frontend:

```bash
python -m pytest -c tools_tests/pytest.ini tools_tests/test_ai_analytics_ownership_acceptance.py -q --tb=short
python -m pytest -c tools_tests/pytest.ini tools_tests/test_verification_runner.py -q --tb=short
python -m pytest -c tools_tests/pytest.ini tools_tests/test_quality_gate.py -q --tb=short
```

P1 сам создаёт приватную временную SQLite **до импорта backend** и использует tracked JWT с TESTING=false. P2 выполняет инфраструктуру в синтетическом временном проекте, не подключается к PostgreSQL и не запускает ML. P3 проверяет настоящий frontend typecheck; проверки намеренных поломок выполняются в копии frontend с повторным использованием установленных node_modules, без переустановки зависимостей и изменений продуктовых исходников. Workflow проверяется локально, это не доказательство запуска GitHub Actions или branch protection.

Конфигурация расположена вне tests/ намеренно: legacy tests/conftest.py не должен импортироваться при проверке собственного механизма изоляции. Обычный `pytest tests` не включает этот контур автоматически; CI P3 обязан вызвать его явно.

В одной открытой папке задачи выполняются последовательно **P1 → P2 → P3**. Не переключать общий checkout и не запускать несколько писателей одновременно. Тесты уже лежат в этой папке; отдельные новые тесты от исполнителя не требуются. Нельзя объявлять приёмку выполненной, если команды были запрещены или не запускались: указать это и вернуть diff для проверки.
