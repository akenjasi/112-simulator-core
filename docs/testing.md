# Проверки проекта

Базовая среда: Python 3.11 / Linux x86_64 и Node 22. Установите runtime по `requirements.lock --require-hashes`, тестовый инструментарий по `tools_tests/requirements.txt`, frontend через `npm ci --ignore-scripts`. PyTorch/модели не нужны для обязательного gate. Локально активируйте именно эту venv; глобальное окружение может содержать несовместимые библиотеки.

```bash
bash scripts/verify_build.sh all
bash scripts/verify_build.sh backend-core
bash scripts/verify_build.sh frontend
bash scripts/verify_build.sh backend-all
python -m pytest -c tools_tests/pytest.ini tools_tests -q
python scripts/check_dds_queue_postgres.py
python scripts/check_dds_phone_postgres.py
python scripts/check_audit_postgres.py
```

Runner валидирует manifests, создаёт собственную SQLite, выдаёт token proof и удаляет только свои ресурсы. Унаследованный `DATABASE_URL` запрещён; не подменяйте эту защиту адресом рабочей БД. PostgreSQL checks выделяют отдельные контейнеры и проверяют блокировки/idempotency/миграции на PG15. Логи и `summary.json` сохраняются в `reports/verification` либо `IMBA_VERIFY_REPORT_DIR`.

`backend-core.txt` — обязательный стабильный набор плюс регрессии аудита, DDS phone и 2FA; `frontend-core.txt` охватывает все текущие frontend test files. Полный `backend-all` остаётся диагностикой исторических контрактов: его фактический результат и поимённый реестр расхождений опубликованы в [отчёте исполнения](audit/2026-10-19/IMPLEMENTATION.md). Наличие зелёного core не означает зелёного полного набора.

CI `.github/workflows/quality.yml` устанавливает hash lock, исполняет core/frontend/независимые tests, отдельно PostgreSQL и restore из backend image; логи сохраняются при ошибке. Локальный прогон не подтверждает исполнение GitHub Actions. Независимые `tools_tests/test_*.py` и acceptance manifests не менялись для подгонки результата.

Frontend-проверка выполняет Vitest, `tsc --noEmit`, статический `DOCKER_BUILD=true next build`. Для ручного сравнения после изменения маршрутов проверяйте также чистые `.next/types` и типы после export. Новые проверки безопасности используют реальные API: LDAP/TOTP challenge/replay, группы и владельцы, analytics isolation, отозванные WebSocket sessions, ограниченные uploads и literal spreadsheet cells.

Эти проверки не заменяют браузерный E2E с микрофоном/аудио, реальные SIP/LDAPS/GPU, нагрузку 100 пользователей, Windows/offline-host drill, независимый аудит native binaries и моделей, сканирование OS images или миграцию всех исторических схем. Изменения тестов должны сохранять продуктовый контракт; старые fixtures исправляются по принятому требованию, а не через фиктивные ответы сервера.
