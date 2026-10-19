# Разработка и Docker-развёртывание

Статус: описание существующих scripts/Compose, сверено с main `ea845fc`. Эта уборка меняет организацию файлов и пути, сохраняя принятые исправления безопасности. Ограничения вынесены в [backlog](../backlog.md).

Все команды ниже запускаются из корня проекта. Локальная разработка описана в [README](../../README.md), CPU-поставка без интернета — в [offline](offline.md), модель отчётов — в [инференсе](inference.md).

При переходе существующего checkout со старой структуры сохраните локальные файлы: прежнюю пару из certs перенесите в data/certs без перегенерации, старые reports — в data/checks, локальную конфигурацию frontend_react — в frontend. Не перезаписывайте занятое назначение и не переносите кэш сборки как исходники. БД, модели, .env и Docker volumes не пересоздаются; старые корневые shell-команды заменены командами Makefile.

## Обычный Compose

1. `python3 -m tools.setup_env --init` создаёт приватный `.env` с уникальными SECRET_KEY, DB password и initial ADMIN password, без перезаписи существующего.
2. Подготовить локальный сертификат `bash docker/scripts/generate_certs.sh`; существующая валидная пара сохраняется. Для сетевого хоста нужны правильный адрес и доверенная цепочка.
3. Подготовить внешние модели в `data/models` и `data/tts_models`; startup не скачивает их. Базовые DDS/API не требуют PyTorch; optional речь готовится отдельно.
4. Проверить конфигурацию и запустить:

```bash
make up
make logs
```

Makefile передаёт явные корень проекта и env-файл. PROJECT переопределяет имя проекта; без него сохраняется стандартный COMPOSE_PROJECT_NAME из environment/.env или имя основной папки.

Backend работает под UID10001, PostgreSQL15 не публикуется наружу. Frontend и dev backend по умолчанию доступны с loopback; для сетевого доступа явно задайте bind и проверьте firewall/TLS/CORS. Production Compose не публикует backend. TESTING в deployment принудительно false. Старые volumes могут требовать проверки прав владельца — перед изменениями сделайте backup.

`postgres_data` содержит PG, `simulator_data` — uploads/cache/backups/reports. Внешние models/certs монтируются read-only с SELinux labeling. Локальные сертификаты находятся в data/certs. Локальная SQLite по умолчанию находится в data; явный DATABASE_URL имеет приоритет. `make down` сохраняет volumes; флаг -v удаляет данные и не является обычной командой обновления.

## Модели и утилиты

- `bash backend/scripts/speech/download_models.sh` — явная загрузка внешних файлов; сначала прочитайте пути скрипта. В текущем main ASR-путь ориентирован на `/app/models`, поэтому локальный вызов не считается универсальным установщиком.
- `python3 -m tools.setup_env` — проверка наличия optional моделей; `--init` создаёт .env. Реализация в tools/setup_env.py переносима, не содержит прежних персональных каталогов автора.
- `python3 -m backend.scripts.speech.generate_static_tts` — генерация статических реплик в frontend public; реальный WAV и качество требуют подготовленного runtime. Не запускайте поверх используемых WAV без отдельной проверки.
- Сидеры синтетических данных не являются обязательной частью старта. Назначение и риски описаны в [утилитах](../development/scripts.md).

## Поставка и обслуживание

`docker/images/backend.Dockerfile` и `docker/images/frontend.Dockerfile` строят приложение; frontend использует Node22/npm/static export, затем Nginx. Корневой Dockerfile-symlink удалён; `make build` собирает оба image из docker/images. `make up` использует base+dev, `make up-prod` — base+prod и готовые images; всегда проверяйте его mounts/credentials отдельно.

Для изолированной сборки можно передать существующую pip-конфигурацию зеркала через Docker BuildKit `--secret id=pip_config,src=/private/pip.conf`. Она используется только при установке hash lock и не копируется в image. Обычная сборка использует стандартные настройки pip; недоступность источника пакетов остаётся ошибкой сборки.

`bash docker/scripts/pack_release.sh` по умолчанию публикует в data/packages/release, собирает images, прерывается при ошибке и публикует images.tar только после успешного save. Helper и .env.example включаются в release с прежней относительной структурой. Модели/секреты/ключи не пакуются. Для полноценного CPU bundle используйте [offline-инструкцию](offline.md).

Резервирование и restore: [recovery](recovery.md). Для данных в покое нужны отдельно настроенные права/шифрование/резервирование хоста. Наличие bcrypt или TLS не доказывает нормативное соответствие. Не публикуйте реальную .env, дампы, uploads, закрытые ключи и веса.
