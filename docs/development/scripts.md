# Вспомогательные команды

Статус: карта существующих утилит. Команды запускаются из корня проекта, если не указано иное. Не запускайте изменяющие данные scripts для инвентаризации.

## Поддерживаемые точки входа

| Команда | Назначение и потребители |
|---|---|
| `bash run.sh [port]` | Dev backend, `.env`, .deps/native libs; основной пользовательский launcher |
| `bash package_offline.sh --help` | CPU offline bundle: проверяемые images/weights/scripts; tests в scripts/tests |
| `bash deploy_offline.sh --help` | Проверка/распаковка/установка готового bundle; сохраняется в корне для переноса отдельно от репозитория |
| `bash scripts/verify_build.sh all` | Изолированный gate; режимы/артефакты в [testing](../testing.md) |
| `python3 scripts/check_dds_queue_postgres.py` | Собственный disposable PG15 для concurrency/queue acceptance |
| `python3 scripts/check_dds_phone_postgres.py` | Изолированная PostgreSQL-проверка телефонного упражнения; создаёт и удаляет собственный контейнер |
| `python3 -m scripts.backup_db` | Создание backup выбранной установки; [восстановление](../operations/recovery.md) |
| `bash scripts/test_pg_backup_restore.sh` | Синтетический dump/restore в собственном PG; требует image из текущего script |
| `bash scripts/generate_certs.sh` | Локальные TLS files, не запускать поверх рабочей пары без проверки |
| `bash scripts/download_models.sh` | Явная загрузка моделей; пути и ограничения в [развёртывании](../operations/deployment.md) |
| `scripts/init.sh` | Entrypoint backend image, не обычный installer для хоста; создаёт data dirs и запускает uvicorn |

## Сохранённые development/legacy helpers

Эти программы используются вручную или входят в старый release; они не вызываются startup как обязательный шаг.

| Команда | Назначение и ограничения |
|---|---|
| `python3 -m scripts.seed_demo` | Прежний корневой seed.py: синтетические пользователи/группы/билеты с фиксированными демонстрационными паролями. Читает корневой .env; CLI разрешает только новый файл SQLite. Существующие данные не смешиваются с демо |
| `python3 -m scripts.seed --db-url <temporary-sqlite-url>` | Другой seeder: синтетическая аналитика; импортируется тестом test_75_analytics.py. Не заменяет demo seeder, CLI также требует новый SQLite-файл |
| `python3 -m scripts.setup_env` | Прежний корневой setup_env.py: --init создаёт приватный .env без перезаписи, без флага проверяет пути моделей; release сохраняет helper в scripts |
| `python3 -m scripts.generate_static_tts` | Прежний generate_static_tts.py: создаёт WAV в frontend public. Требует реального работающего TTS; реальное качество звука требует модели и native проверки |
| `bash scripts/pack_release.sh` | Старый трёхобразный release. Сохранён отдельно от нового offline bundle; fail-fast и атомарная публикация image archive, модели поставляются отдельно |

Утилиты переехали без изменения сценариев/паролей/БД. Исправлены только пути корня, env, imports и назначения output. Не запускайте сидеры/TTS helper для проверки переноса: import тоже может иметь побочные эффекты. Используйте безопасные имитации/временные каталоги.

## Что больше не нужно запускать

Старые check_db/check_schema, fix_db, update_readme/update_docker_* и scale_ui были одноразовыми командами для конкретного состояния. Они не подключены к CI/runtime; ALTER/regex replacements уже не являются надёжной процедурой обслуживания. Они удалены из активного дерева, исходники доступны по Git baseline из [истории](../history/README.md).

Для диагностики схемы сначала используйте read-only подключение к явно выбранной копии БД; универсальная автоматическая migration-утилита этой уборкой не добавляется. Не восстанавливайте старый fix_db как готовый updater.
