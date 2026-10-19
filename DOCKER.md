# Развёртывание и модели

## Новая установка

```bash
python3 setup_env.py --init
bash scripts/generate_certs.sh
docker compose up -d --build
```

Для действующей установки сначала сделайте проверяемый backup. Не заменяйте её `.env` новым файлом: это меняет ключи и пароли. Значения `SECRET_KEY` и `POSTGRES_PASSWORD` обязательны, общих секретов нет. `TESTING` в Compose принудительно false. Начальный пароль ADMIN хранится в приватном `.env`.

Вход через Nginx: http://localhost:3000 или https://localhost. Сервисы frontend/backend слушают только loopback хоста; PostgreSQL не публикуется. Для доступа из сети явно установите `FRONTEND_BIND_ADDRESS`, настроив TLS, firewall и доверенные origins. Production: `docker compose -f docker-compose.prod.yml up -d` использует готовые images, не публикует backend. Это отдельный файл, не override dev Compose. Безопаснее не публиковать dev backend наружу. Uvicorn обрабатывает forwarding только от доверенных proxy; не доверяйте произвольному X-Forwarded-For. Для корректного внешнего IP настройте trust в контролируемой сети.

Backend работает под UID/GID 10001. Новый named volume `simulator_data` получает владельца из образа. Старый volume может требовать переноса прав: сначала backup, затем проверка UID и владельца администратором. Автоматически права существующих данных не меняются. На SELinux системах bind-каталоги должны иметь разрешённую контейнерам метку; для сертификатов/моделей Compose уже задаёт bind `:ro,z`. Не перемечайте общие системные каталоги.

`simulator_data` содержит БД SQLite при локальном режиме, uploads, кэш, reports и backups. PostgreSQL использует отдельный `postgres_data`. На production Compose backend всегда работает с PostgreSQL. Каталоги `data/models` и `data/tts_models` монтируются read-only. Код/ключи/сгенерированный frontend output не включаются в Git как артефакты поставки. Backend не раздаёт статический Next output: для UI нужен Next dev или Nginx.

## Внешние возможности

Базовый образ не скачивает модели и не включает PyTorch. Синтез речи по умолчанию выключен (`TTS_ENABLED=false`); включайте его явно только после установки и проверки локальных моделей. DDS, авторизация, занятия и протоколы доступны без ML. Для операторского классификатора установите CPU torch из официального индекса и `requirements-ml.txt`, либо соберите backend с `--build-arg INSTALL_SPEECH_DEPS=true`. Этот отдельный тяжёлый граф не входит в базовый hash lock; перед эксплуатацией проверьте его на целевой платформе.

`bash scripts/download_models.sh` явно скачивает GGUF в `data/models`, Qwen TTS weights — в `data/tts_models`. Скрипт переносим и публикует файл после завершения загрузки; криптографическое происхождение весов и нативных бинарей этим не подтверждается. Перед автономной установкой поставьте и проверьте модели отдельно. Пропущенная модель означает недоступную внешнюю функцию, не условный успешный результат.

Для отчётов DDS требуется OpenAI-compatible HTTP runtime. Локальный backend использует `DDS_LLM_BASE_URL=http://127.0.0.1:8081/v1`; внутри Compose — `DDS_LLM_CONTAINER_BASE_URL=http://llm:8080/v1`. Можно указать иной доступный endpoint. Дополнительный GPU runtime:

```bash
DDS_LLM_MODEL_PATH=/absolute/path/report.gguf docker compose -f docker-compose.yml -f docker-compose.llm.yml --profile llm up -d
```

GPU должен быть доступен Docker по CDI `nvidia.com/gpu=all`; это отдельное требование хоста. Standalone runtime: те же два Compose файла, `--profile llm up -d llm`; основной backend можно запускать локально. Файл модели должен существовать, автоматическое создание запрещено. Реальные SIP originate/play не завершены: API честно предоставляет симуляцию и отклоняет запрос production-телефонии. Legacy HTTP TTS настраивается `LEGACY_TTS_URL`. LDAP выключен по умолчанию; включение требует проверяемого LDAPS-сертификата, данных каталога и утверждённой политики регистрации (JIT создаёт только CADET).

Запускайте **один процесс backend**: часть runtime/экспорт задач хранится в памяти, DDS job worker имеет это ограничение. Масштабирование на несколько workers/реплик требует отдельной реализации и испытаний. CSV/XLSX экспорты доступны при отказе PDF renderer. Процессные экспорты принадлежат создателю, ограничены по количеству и истекают через сутки; это временные файлы, не архив. Регулярно очищайте старые приватные report-каталоги после рестарта согласно retention установки. DDS job/protocol хранятся отдельно в БД.

## Резервирование и выпуск

Sidecar `backup` по умолчанию делает снимок каждые 86400 секунд и хранит 180 дней. Изменяйте `BACKUP_INTERVAL_SECONDS`/`BACKUP_RETENTION_DAYS` по нормативам установки, контролируйте логи и свободное место. Снимок в том же volume не защищает от потери диска — нужен внешний backup. Восстановление: [RECOVERY.md](RECOVERY.md).

`bash scripts/pack_release.sh` собирает images и переносимый каталог `release/`; ошибка любой команды прерывает выпуск. Images публикуются в `images.tar` только после успешного `docker save`. Секреты, TLS ключи и модели в комплект не входят. Для параметров `BACKEND_IMAGE`/`FRONTEND_IMAGE` используйте те же имена в окружении Compose. На целевом хосте загрузите `docker load -i images.tar`, создайте новые `.env` и сертификаты, перенесите проверенные модели и запустите production Compose.

Ранее закоммиченный TLS ключ исключён из tracking, но остаётся в истории. **На установках, где он применялся, замените пару key/cert и настройте доверие.** Уже существующие локальные сертификаты генератор сохраняет; историю Git автоматически не переписываем. Nginx требует сертификаты для старта, поэтому генерируйте их перед `up`.

Для проверяемой CPU-only offline поставки из актуального main также сохранены `package_offline.sh`, `deploy_offline.sh` и [OFFLINE.md](OFFLINE.md). Этот комплект включает закреплённый report GGUF с SHA256 и свой installer; ASR/TTS в нём выключены, GPU не требуется. Это отдельная процедура, отличная от облегчённого `scripts/pack_release.sh`.
