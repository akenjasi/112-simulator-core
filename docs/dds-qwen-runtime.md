# Среда локального инференса Qwen и сервис генерации отчётов ДДС (Этап А-03)

Документ описывает запуск локального инференс-сервера `llama.cpp` для модели **Qwen3.5-9B-Q4_K_M.gguf** на GPU (NVIDIA RTX 3060 12 GiB) и использование сервиса генерации отчётов преподавателю ДДС.

---

## 1. Архитектура и границы этапа

- **Инференс**: `docker-compose.llm.yml` запускает закреплённый по digest CUDA-образ `llama.cpp` с параметром `--offline`, запросом выгрузки до 99 слоёв на GPU, контекстом 8192 и лимитом генерации 1200 токенов.
- **Сервис отчёта**: `backend/core/dds_report_llm.py` валидирует снимок завершённого занятия (`DDSLessonReportDataResponse`), формирует промпт и выполняет один ограниченный HTTP-запрос к API `/v1/chat/completions`.
- **Вне рамок этапа**: HTTP REST endpoint, авторизация веб-клиента, UI преподавателя, очереди задач (Celery/Redis), запись отчётов в БД, генерация карточек и изменение оценок.

---

## 2. Аппаратные требования: CDI и SELinux

Проверено на Linux x86_64, RTX 3060 12 GiB, 16 GiB RAM, драйвере NVIDIA 580.142 и Docker Compose 5.1.2. Нужны Docker Engine с поддержкой CDI, Compose с поддержкой длинного bind `selinux` и настроенный NVIDIA Container Toolkit/CDI. Проверка доступа: `docker run --rm --device nvidia.com/gpu=all ubuntu:24.04 nvidia-smi` (первое получение диагностического образа требует сети). Синтаксис CDI описан в [документации Docker](https://docs.docker.com/reference/compose-file/services/#devices).

- **NVIDIA CDI (Container Device Interface)**:
  Используется `devices: ["nvidia.com/gpu=all"]`. Не требуется менять глобальные настройки демона Docker (`/etc/docker/daemon.json`) или переключать default runtime.
- **SELinux**:
  Монтирование файла модели использует long bind с `selinux: z` и `create_host_path: false`. Опция `:z` устанавливает разделяемый контекст контейнера без отключения SELinux на хосте. Отсутствующий файл модели не создаёт директорию на хосте.

---

## 3. Сеть и изоляция

- **Сетевые обращения**: В сервисе инференса и клиенте генерации не настроено внешних вызовов, серверов fallback или загрузки моделей из сети. Сервер запускается с флагом `--offline`.
- **Ограничение изоляции**: Сетевая изоляция на уровне контейнера в Compose-файле принудительно не блокируется; отсутствие внешних запросов обеспечивается конфигурацией приложения и локальным монтированием модели.
- **Веса модели**: Файлы GGUF запрещено коммитить в git.
- **Первичная подготовка**: получение CUDA-образа требует интернета. После загрузки образа и размещения GGUF локально модель не нуждается во внешних загрузках. Перед первым запуском: `docker compose -p imba-llm -f docker-compose.llm.yml --env-file /path/to/external/.env.llm pull`. Порядок запуска llama.cpp основан на [официальной документации](https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md).

---

## 4. Конфигурация окружения

Файл `.env.llm` не входит в `.gitignore`. **Храните рабочую конфигурацию вне репозитория**; в примерах `/path/to/external` нужно заменить существующим каталогом.

Пример создания внешнего файла:
```bash
cp .env.llm.example /path/to/external/.env.llm
```

Основные параметры:
- `DDS_LLM_MODEL_PATH`: абсолютный путь к локальному файлу `Qwen3.5-9B-Q4_K_M.gguf` на хосте.
- `DDS_LLM_BASE_URL`: URL инференса (по умолчанию `http://127.0.0.1:8081/v1` для хоста). Проверяется до запроса: отклоняются отсутствующие host, учётные данные (`user:pass`), query-параметры, fragment и недопустимые порты.
- `DDS_LLM_MODEL`: псевдоним модели (`dds-qwen`).
- `DDS_LLM_TIMEOUT_SECONDS`: таймаут ожидания (по умолчанию 180 с).
- `DDS_LLM_MAX_INPUT_CHARS`: ориентировочный лимит размера JSON-снимка (24 000 символов).
- `DDS_LLM_MAX_TOKENS`: лимит токенов генерации (1200).

---

## 5. Запуск и управление сервисом

Команды управления Compose запускаются с явным именем проекта `-p imba-llm` и внешним env-файлом:

```bash
# Запуск инференс-сервера
docker compose -p imba-llm -f docker-compose.llm.yml --env-file /path/to/external/.env.llm up -d

# Проверка логов (CUDA-инициализация, VRAM ~5.4 GiB, выгрузка слоев)
docker compose -p imba-llm -f docker-compose.llm.yml --env-file /path/to/external/.env.llm logs -f

# Проверка здоровья с хоста
curl -f http://127.0.0.1:8081/health

# Остановка контейнера
docker compose -p imba-llm -f docker-compose.llm.yml --env-file /path/to/external/.env.llm down
```

Сетевые адреса:
- `http://127.0.0.1:8081/v1` — обращение к сервису с хоста.
- `http://llm:8080/v1` — только при объединении сервисов в единую Docker-сеть (интеграция в основной compose проекта не производится).

---

## 6. Пример вызова генерации отчёта (Python)

Запускайте из корня проекта с установленными зависимостями backend. Данные можно получить существующим авторизованным `GET /api/ai-analytics/lessons/{lesson_id}/data`. `--env-file` загружает настройки только в Compose; для Python их нужно отдельно экспортировать в окружение (по умолчанию используются значения выше).

```python
import asyncio
import json
from backend.core.dds_report_llm import generate_dds_lesson_report, DDSReportGenerationError

async def main():
    with open("/path/to/lesson_snapshot.json", "r", encoding="utf-8") as f:
        snapshot = json.load(f)

    try:
        report = await generate_dds_lesson_report(snapshot)
        print(f"Отчет по занятию {report['lesson_id']} (модель: {report['model_used']}):\n")
        print(report['analysis_text'])
    except DDSReportGenerationError as exc:
        print(f"Ошибка формирования отчета: {exc}")

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 7. Практические ограничения и особенности генерации

1. **Характер системного промпта**:
   - Инструкции в системном промпте задают структуру отчёта, лаконичный формат (до 200 слов на 4 раздела) и правила анализа (не оценивать речь/психологию, не пересчитывать баллы).
   - Инструкции и изоляция JSON-блока в `user`-сообщении не дают абсолютной гарантии защиты от некорректных выводов модели или намеренных инъекций. Сгенерированный отчёт является предварительной аналитической подсказкой и **обязательно требует проверки преподавателем**.
2. **Лимит входных данных и контекст**:
   - Параметр `DDS_LLM_MAX_INPUT_CHARS` (24 000 символов) служит лишь предварительным фильтром бюджета символов для отсечения заведомо избыточных данных до вызова модели; он не является точной границей токенов или контекстного окна.
   - Если объём токенов превысит лимит контекста сервера (`ctx-size 8192`), ошибка контекста от сервера инференса будет явно возвращена в виде `DDSReportGenerationError`.
3. **Условия генерации и отсечения**:
   - Статус занятия строго `COMPLETED`.
   - Занятия без завершённых сессий или без оценок и билетов отклоняются до вызова LLM.
   - Ответ принимается только при `finish_reason == 'stop'`. При исчерпании лимита `max_tokens` (`finish_reason == 'length'`), пустом ответе или только блоке reasoning возвращается `DDSReportGenerationError`.

## 8. Проверено 17.10.2026

- Реальный запуск Compose с выбранным GGUF на RTX 3060: `/health` вернул `ok`, CUDA0 доступна, процесс llama-server занял 5410 MiB VRAM.
- На одном явно синтетическом занятии (1 участник, 1 оценка) финальный сервис сформировал полный отчёт за 5,39 с. Это проверка работоспособности, не замер скорости для большой группы. Первоначальный многословный ответ достиг лимита; адаптер его отклонил, после чего в промпт добавлен краткий формат.
- 75 целевых тестов прошли на Python 3.14 хоста и Python 3.11 с зависимостями backend Docker-образа, на отдельных SQLite БД. Среди них 25 независимых проверок адаптера, 31 тест исполнителя, 10 проверок данных А-02 и 9 регрессий аналитики/авторизации.
- Тестовые контейнеры остановлены и удалены; рабочее демо не пересобиралось. Интеграция веб-интерфейса остаётся следующим этапом.

Команда проверки из корня проекта (нужны тестовые зависимости backend):

```bash
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 TESTING=true \
DATABASE_URL=sqlite+aiosqlite:////tmp/imba-dds-report-tests.sqlite \
SECRET_KEY=local-test-only \
python3 -m pytest -q tests/test_dds_report_llm_acceptance.py tests/test_dds_report_llm_unit.py tests/test_dds_report_data_acceptance.py tests/test_dds_report_data_unit.py tests/test_76_ai_analyzer.py tests/test_86_refine_ai_advice.py tests/test_auth_required.py
```
