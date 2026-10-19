# Разработка и Docker-развёртывание

Статус: описание существующих scripts/Compose, сверено с main `ea845fc`. Эта уборка меняет организацию файлов и пути, сохраняя принятые исправления безопасности. Ограничения вынесены в [backlog](../backlog.md).

Все команды ниже запускаются из корня проекта. Локальная разработка описана в [README](../../README.md), CPU-поставка без интернета — в [offline](offline.md), модель отчётов — в [инференсе](inference.md).

## Обычный Compose

1. `python3 -m scripts.setup_env --init` создаёт приватный `.env` с уникальными SECRET_KEY, DB password и initial ADMIN password, без перезаписи существующего.
2. Подготовить локальный сертификат `bash scripts/generate_certs.sh`; существующая валидная пара сохраняется. Для сетевого хоста нужны правильный адрес и доверенная цепочка.
3. Подготовить внешние модели в `data/models` и `data/tts_models`; startup не скачивает их. Базовые DDS/API не требуют PyTorch; optional речь готовится отдельно.
4. Проверить конфигурацию и запустить:

```bash
docker compose config --quiet
docker compose up --build -d
docker compose logs -f backend
```

Backend работает под UID10001, PostgreSQL15 не публикуется наружу. Frontend и dev backend по умолчанию доступны с loopback; для сетевого доступа явно задайте bind и проверьте firewall/TLS/CORS. Production Compose не публикует backend. TESTING в deployment принудительно false. Старые volumes могут требовать проверки прав владельца — перед изменениями сделайте backup.

`postgres_data` содержит PG, `simulator_data` — uploads/cache/backups/reports. Внешние models/certs монтируются read-only с SELinux labeling. Локальная SQLite по умолчанию находится в data; явный DATABASE_URL имеет приоритет. `docker compose down` сохраняет volumes; флаг -v удаляет данные и не является обычной командой обновления.

## Модели и утилиты

- `bash scripts/download_models.sh` — явная загрузка внешних файлов; сначала прочитайте пути скрипта. В текущем main ASR-путь ориентирован на `/app/models`, поэтому локальный вызов не считается универсальным установщиком.
- `python3 -m scripts.setup_env` — проверка наличия optional моделей; `--init` создаёт .env. Скрипт переносим, не содержит прежних персональных каталогов автора.
- `python3 -m scripts.generate_static_tts` — генерация статических реплик в frontend public; реальный WAV и качество требуют подготовленного runtime. Не запускайте поверх используемых WAV без отдельной проверки.
- Сидеры синтетических данных не являются обязательной частью старта. Назначение и риски описаны в [утилитах](../development/scripts.md).

## Поставка и обслуживание

`Dockerfile.backend` и `Dockerfile.frontend` строят приложение; frontend использует Node22/npm/static export, затем Nginx. `Dockerfile` в корне остаётся прежней точкой входа; его содержимое этой уборкой не меняется. Production Compose запускает готовые images; всегда проверяйте его mounts/credentials отдельно.

`scripts/pack_release.sh` собирает images, прерывается при ошибке и публикует images.tar только после успешного save. Helper и .env.example включаются в release с прежней относительной структурой. Модели/секреты/ключи не пакуются. Для полноценного CPU bundle используйте [offline-инструкцию](offline.md).

Резервирование и restore: [recovery](recovery.md). Для данных в покое нужны отдельно настроенные права/шифрование/резервирование хоста. Наличие bcrypt или TLS не доказывает нормативное соответствие. Не публикуйте реальную .env, дампы, uploads, закрытые ключи и веса.
