# Домен: Управление Сценариями и Генерация (Scenario Management)

Этот домен описывает структуру эталонного билета (Scenario Ticket), который создается Преподавателем и используется Системой для тестирования курсанта.

## JSON-контракт: ScenarioTicket (Учебный Сценарий / Билет)
Максимально полная структура билета, объединяющая настройки преподавателя, сгенерированные алгоритмом адреса и сгенерированные LLM тексты.

```json
{
  "scenario_id": "uuid-v4",

  "workflow_state": {
    "status": "APPROVED",          // "DRAFT" | "EDITED" | "APPROVED" | "ARCHIVED"
                                   // DRAFT = только что сгенерирован / ещё не просмотрен преподавателем
                                   // EDITED = просмотрен, откорректирован, ожидает утверждения
                                   // APPROVED = утверждён, доступен для Assignment
                                   // ARCHIVED = снят с использования
    "preview_confirmed": false,   // true = преподаватель открыл и просмотрел DRAFT (предпросмотр пройден)
                                   // Простой флаг вместо отдельного статуса PREVIEW
    "created_by": "uuid-teacher",
    "created_at": "2026-09-22T12:00:00Z",
    "approved_by": "uuid-teacher",
    "approved_at": "2026-09-22T12:15:00Z",
    "grammar_checked": true,
    "source_type": "AI_GENERATED"  // "AI_GENERATED" | "TEACHER_CREATED" | "IMPORTED" | "CADET_CARD"
                                   // CADET_CARD — сценарий собран из карточек, заполненных курсантами (ТЗ сценарий 3)
  },

  "settings": {
    "event_category": "Пожары",                    // Верхний уровень классификатора ЕКП
    "incident_type": "Пожар мусора на улице",       // Конкретный тип из справочника ЕКП
    "ekp_code": "П-001-003",                        // Код из классификатора происшествий (ТЗ разд. 11)
    "location_type": "STREET",                      // "APARTMENT" | "STREET" | "HIGHWAY"
    "difficulty_level": "MEDIUM",                   // "LOW" | "MEDIUM" | "HIGH"
    "timing_limit_sec": 30,                         // Норматив заполнения (дефолт 30 сек, ТЗ разд. 8)
    "max_allowed_errors": 1,                        // Порог ошибок для успешной сдачи
    "syntax_strictness": false,                     // true = точное совпадение текста, false = семантический анализ
    "usable_in_card_pool": true                     // Разрешено использовать в режиме "действий с карточками" (сценарий 3)
  },

  "reference_material_ids": ["uuid-material-1"],   // Справочные материалы, рекомендованные для этого сценария

  "ground_truth": {
    "gt_okrug": "ЦАО",
    "gt_rayon": "Тверской",
    "gt_street": "Тверская",
    "gt_house": "13",
    "gt_corpus": null,
    "gt_stroenie": null,
    "gt_flat": null,
    "gt_podiezd": null,
    "gt_floor": null,
    "gt_domofon": null,
    "gt_caller_fio": "Иванов Петр Сергеевич",
    "gt_caller_phone": "+79991234567",
    "gt_has_victims": false,
    "gt_required_services": ["101"],               // Коды служб, которые курсант обязан назначить
    "gt_dispatcher_reply": "Бригада АЦ-40 выехала" // Эталонный текст ответа диспетчера (для режима действий)
  },

  "ai_content": {
    // Этот блок заполняется результатом работы factoid_generator.py (Qwen 9B, SSE-стрим).
    // После заполнения bricks_compiler.compile_ticket() создаёт BricksMatrix
    // и сохраняет её в data/modular_dialogue/bricks_ticket_{uuid}_sit_01.json
    // Подробнее — домен 05 (Dialogue Engine).

    "ai_fabula_prompt": "Пожар мусора на улице. Горит мусорный бак.", // Краткая фабула — вход в LLM
    "ai_correction_comment": "",  // Преподаватель пишет сюда при перегенерации (контекстное поле)

    // 4 реплики заявителя, сгенерированные Qwen 9B:
    "ai_factoids": {
      "SM1": "У нас горит мусорный бак на тротуаре.",        // Ситуация — спокойный тон
      "SM2": "Пожар! Помойка полыхает, огонь высокий!",      // Ситуация — паника
      "SD1": "Дым чёрный, рядом припаркованы автомобили.",   // Детали — спокойный тон
      "SD2": "Скорее приезжайте, на машины перекинется!"     // Детали — паника
    },

    // После компиляции bricks_compiler заполняется путь к BricksMatrix файлу:
    "bricks_file": "bricks_ticket_{uuid}_sit_01.json",  // null до компиляции

    // TTS-кеш управляется Silero TTS движком автоматически по MD5(text+speaker).
    // Ключи соответствуют audio_id из BricksMatrix (brk_fact_situation_01 и т.д.).
    // Прямое указание путей здесь не требуется — см. домен 05.
    "tts_compiled": false   // true = Silero уже синтезировал WAV для всех кирпичиков
  },

  "version_history": [
    {
      "version": 1,
      "changed_by": "uuid-teacher",
      "changed_at": "2026-09-22T12:05:00Z",
      "change_type": "AI_GENERATED",   // "AI_GENERATED" | "TEACHER_EDIT" | "GRAMMAR_CHECK" | "APPROVED"
      "comment": "Первичная генерация"
    },
    {
      "version": 2,
      "changed_by": "uuid-teacher",
      "changed_at": "2026-09-22T12:12:00Z",
      "change_type": "TEACHER_EDIT",
      "comment": "Скорректирован эталонный адрес"
    }
  ]
}
```

## Алгоритм Генерации Эталонных Данных (Без LLM)
Функция Python, которая заполняет блок `ground_truth` за 1 мс при создании черновика:
1. Читает `location_type`.
2. Если `APARTMENT`: Рандомизирует все поля от `gt_okrug` до `gt_domofon`.
3. Если `STREET`: Рандомизирует только `okrug`, `rayon`, `street`, `house`. Остальное `null`.
4. Если `HIGHWAY`: Выдает трассу (МКАД) и километр в поле `street`, остальное `null`.

## Пояснения к полям

### `source_type`
| Значение | Описание |
|---|---|
| `AI_GENERATED` | Полностью сгенерирован нейросетью |
| `TEACHER_CREATED` | Создан преподавателем вручную |
| `IMPORTED` | Загружен пакетным импортом (ТЗ разд. 6 — опциональный модуль) |
| `CADET_CARD` | Собран из карточек, заполненных курсантами (для режима «действий с карточками») |

### `usable_in_card_pool`
Флаг разрешает использование сценария в режиме **«Действия с карточками»** (Сценарий 3 по ТЗ).
Преподаватель формирует пул из карточек трёх типов на выбор: AI-сгенерированные, сформированные курсантами, смешанный.

---

## Формат пакетного импорта сценариев

**ТЗ раздел 6 (опциональный модуль):** *«механизм импорта обновлений — инструмент для пакетного обновления учебных материалов и сценариев (в ручном режиме)»*.

Файл импорта — JSON-массив объектов. Каждый объект — минимально необходимый `ScenarioTicket`.

`POST /api/v2/scenarios/import` принимает этот файл, создаёт `ImportJob`, обрабатывает асинхронно.

```json
// import_scenarios_batch.json — пример файла загрузки
{
  "import_meta": {
    "format_version": "1.0",
    "source": "Методический отдел ГБУ Система-112",
    "author": "Глущенко О.И.",
    "created_at": "2026-09-22T10:00:00Z",
    "total_count": 2
  },
  "scenarios": [
    {
      // Обязательные поля — минимум для создания рабочего билета:
      "settings": {
        "event_category": "Пожары",
        "sub_category": "Пожар в здании",
        "final_type": "Пожар жилого дома",
        "location_type": "APARTMENT",
        "difficulty": "medium",
        "timing_limit_sec": 30
      },
      "ground_truth": {
        "gt_okrug": "ЦАО",
        "gt_rayon": "Тверской",
        "gt_street": "Тверская",
        "gt_house": "13",
        "gt_corpus": null,
        "gt_flat": "42",
        "gt_podiezd": "2",
        "gt_floor": "7",
        "gt_domofon": "42Б",
        "gt_has_victims": false,
        "gt_required_services": ["101"],
        "gt_ekp_code": "П-001-001",
        "gt_fio": "Иванов Петр Сергеевич",
        "gt_phone": "+79991234567"
      },
      // Опционально: если есть готовые реплики — LLM-генерация не запускается
      "ai_content": {
        "ai_fabula_prompt": "Горит кухня в квартире, сильный дым",
        "ai_factoids": {
          "SM1": "У нас пожар, горит кухня.",
          "SM2": "Кухня полыхает, всё в дыму!",
          "SD1": "Дым чёрный, дышать невозможно.",
          "SD2": "Огонь перекинулся на шторы!"
        }
        // Если ai_factoids не заполнены — система запустит генерацию через Qwen 9B
      },
      // Исходный тип — всегда IMPORTED для пакетного ввода:
      "source_type": "IMPORTED"
    },
    {
      "settings": {
        "event_category": "Происшествия с людьми",
        "sub_category": "Медицинская помощь",
        "final_type": "Плохо человеку (острая боль)",
        "location_type": "APARTMENT",
        "difficulty": "easy",
        "timing_limit_sec": 30
      },
      "ground_truth": {
        "gt_okrug": "САО",
        "gt_rayon": "Войковский",
        "gt_street": "Ленинградское шоссе",
        "gt_house": "25",
        "gt_corpus": "1",
        "gt_flat": "18",
        "gt_podiezd": "1",
        "gt_floor": "4",
        "gt_domofon": null,
        "gt_has_victims": true,
        "gt_victims_count": 1,
        "gt_required_services": ["103"],
        "gt_ekp_code": "М-002-001",
        "gt_fio": "Петрова Анна Ивановна",
        "gt_phone": "+79261234567"
      },
      "ai_content": {
        "ai_fabula_prompt": "Пожилой человек потерял сознание"
        // ai_factoids пустые — будет запущена LLM-генерация после импорта
      },
      "source_type": "IMPORTED"
    }
  ]
}
```

### Ответ на импорт

```json
// POST /api/v2/scenarios/import → 202 Accepted
{
  "job_id": "uuid-import-job",
  "status": "PENDING",
  "total_count": 2,
  "message": "Импорт запущен. Проверьте статус через GET /api/v2/import-jobs/{job_id}"
}

// GET /api/v2/import-jobs/{job_id} → после обработки
{
  "job_id": "uuid-import-job",
  "status": "DONE",           // "PENDING" | "PROCESSING" | "DONE" | "FAILED"
  "imported_count": 2,
  "failed_count": 0,
  "errors": [],               // Список ошибок по строкам если failed_count > 0
  "created_scenario_ids": ["uuid-s1", "uuid-s2"],
  "finished_at": "2026-09-22T10:00:05Z"
}
```

### Правила обработки импорта
- Каждый объект без `ai_factoids` → постановка в очередь LLM-генерации
- Каждый объект с `ai_factoids` → сразу `compile_ticket()`, статус `DRAFT`
- Дубликаты (одинаковые `ground_truth` + `final_type`) → предупреждение, не ошибка
- Один сбойный объект не отменяет весь пакет — `failed_count` растёт, остальные обрабатываются
