# Команды и владельцы утилит

Общий интерфейс — `make help` из корня или `make -C /path/to/project help`. Команды с данными не запускаются ради инвентаризации. Backend/инструментальные Python-команды используют подготовленную среду Python 3.11.

| Раздел | Что здесь находится и как запускать |
|---|---|
| Backend dev | `make backend [PORT=8000]`, реализация backend/scripts/run.sh |
| Frontend dev | `make frontend`; обычные npm-команды также доступны из frontend |
| backend/core/backups.py | Общая реализация backup для API и CLI, не одноразовый скрипт |
| backend/scripts/db | `python -m backend.scripts.db.backup`, backup_loop для sidecar, schema с явным --apply, restore_tickets, seed_demo и seed_analytics; `make replace-dds-tickets [ARGS=--apply]` — проверенная атомарная замена старых билетов новыми планами v2 с backup и сохранением истории |
| backend/scripts/speech | setup_asr.sh, download_models.sh и `python -m backend.scripts.speech.generate_static_tts`; требуют подготовленного runtime, не запускаются при обычном старте |
| backend/scripts/check_report_runtime.py | `python -m backend.scripts.check_report_runtime --base-url http://127.0.0.1:18081/v1 [--container isolated-name]`: синтетическая проверка отмены, сна/RSS и повторного inference без БД; только отдельный тестовый runtime |
| backend/scripts/lock_dependencies.py | Явная регенерация runtime.lock на Python 3.11/Linux x86_64; не обычная установка |
| backend/tests/postgres | check_queue.py, check_phone.py, check_audit.py и check_backup_restore.sh; собственные disposable PostgreSQL, не рабочая БД |
| tools/setup_env.py | `make init` создаёт приватный .env без перезаписи; `make check-env` проверяет итоговые настройки Compose без вывода секретов; вызов без флагов проверяет optional model paths |
| tools/quality | verify.sh с backend-core/frontend/all/backend-all и обязательные manifests; [проверки](../testing.md) |
| docker/scripts | init.sh — entrypoint image; generate_certs.sh — локальная TLS-пара с сохранением существующей; pack_release.sh — прежний трёхобразный release |
| docker/offline | package.sh/deploy.sh через Makefile, затем standalone install/start/stop/backup/restore/verify из готового комплекта |

Сидеры различаются: seed_demo создаёт демонстрационных пользователей/билеты с фиксированными паролями, seed_analytics — синтетическую аналитику. Оба CLI требуют новый SQLite-файл; существующие данные и PostgreSQL отклоняются. Не объединяйте их без отдельной миграции требований.

Схема: `python -m backend.scripts.db.schema` проверяет выбранную установку; --apply меняет её и требует предварительно проверенной копии. Backup/restore описаны в [восстановлении](../operations/recovery.md). Упаковка не включает реальные секреты и автоматически не развёртывает приложение.

Удалённые одноразовые fix_db/check_db/check_schema, update_readme/update_docker_* и scale_ui не являются процедурами обслуживания. Их оригиналы доступны через Git из [истории](../history/README.md).
