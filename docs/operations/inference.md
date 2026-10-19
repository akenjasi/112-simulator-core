# Локальный inference нейроотчёта

Статус: инструкция к существующим Compose и HTTP-клиенту DDS. API/data/jobs описаны в [продуктовом контракте](../product/reports.md); здесь только runtime и подключение.

`backend/core/dds_report_llm.py` обращается к OpenAI-compatible `/v1/chat/completions` с сохранённым snapshot завершённого DDS-занятия. Модель получает учебные данные как данные, не как полномочия или инструкции. Ограничения текста/таймаутов определены в этом модуле; размер контекста сервера не увеличивается автоматически.

## GPU runtime

`docker-compose.llm.yml` использует закреплённый digest llama.cpp CUDA, `--offline`, alias `dds-qwen`, ctx8192 и NVIDIA CDI `nvidia.com/gpu=all`. Нужны Linux/Docker/Compose с поддержкой CDI и SELinux bind, подходящая NVIDIA-среда и заранее подготовленный единый GGUF.

Создайте внешнюю env-конфигурацию на основе `.env.llm.example`. Не храните реальную `.env.llm` в репозитории: это имя не исключено текущим `.gitignore`. Задайте существующий абсолютный DDS_LLM_MODEL_PATH. Bind read-only, create_host_path=false, SELinux z; отсутствующий файл не должен превращаться в каталог.

Из корня проекта, после подстановки реального приватного env-файла:

```bash
docker compose -p imba-llm -f docker-compose.llm.yml --env-file /absolute/private/.env.llm up -d
curl -f http://127.0.0.1:8081/health
docker compose -p imba-llm -f docker-compose.llm.yml --env-file /absolute/private/.env.llm logs -f
```

Получение image требует сети; offline режим относится к уже подготовленному runtime. Сетевая изоляция контейнера firewall-правилами этим Compose не гарантирована.

## Backend в основной Compose-сети

Для общего запуска используются три файла. `docker-compose.reports.yml` задаёт backend URL и присоединяет llm к общей сети:

```bash
docker compose -f docker-compose.yml -f docker-compose.llm.yml -f docker-compose.reports.yml --env-file /absolute/private/.env.llm config --quiet
docker compose -f docker-compose.yml -f docker-compose.llm.yml -f docker-compose.reports.yml --env-file /absolute/private/.env.llm up -d
```

Обычный Compose дополнительно требует корневой `.env` для backend. `--env-file` интерполирует переменные Compose, но не отменяет объявленный service env_file. Убедитесь в его наличии и правильных значениях.

На хосте DDS_LLM_BASE_URL — `http://127.0.0.1:8081/v1`; в общей сети — `http://llm:8080/v1`, DDS_LLM_MODEL — `dds-qwen`. Для локального Python backend значения нужно передать в его environment; env-файл только Compose не экспортирует их в shell.

Health проверяется по `/health`, не `/v1/health`. Затем нужна синтетическая генерация и авторизованный report flow, без реальных персональных данных. Ошибка модели/контекста/таймаут не превращается в экспертный балл. Не считайте historical mock-приёмку доказательством качества inference на текущем хосте.

## CPU offline

Для переноса без GPU и без сети используется другой комплект: [package_offline/deploy_offline](offline.md). Его installer сохраняет подготовленные image IDs/weights и собственную конфигурацию. Не смешивайте его compose/env с GPU-стендом.

Операторский classifier/ASR/TTS и старые AI advice/factoid clients — другие потребители, с собственными настройками. Подключение DDS report URL не включает их автоматически. Текущие ограничения перечислены в [backlog](../backlog.md).
