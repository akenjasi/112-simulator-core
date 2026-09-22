# Домен: Движок Диалога v2 (Dialogue Engine)

Этот домен описывает **внутренний пайплайн** диалогового движка — слой между `ScenarioTicket` (домен 02)
и `ExamSession` (домен 03). Именно здесь живёт логика «говорящего бота-заявителя».

> **Статус:** Мигрирован в `backend/core/` и `backend/schemas/`. Полностью асинхронный, stateless, отвязан от файловой системы и тяжелых локальных библиотек инференса.

---

## Архитектура пайплайна (полная цепочка)

```
[Преподаватель задаёт параметры сценария]
          │
          ▼
┌─────────────────────────────────┐
│  1. factoids_llm.py             │  generate_factoids(request: FactoidGenerationRequest)
│  Внешняя LLM (Ollama/vLLM HTTP) │  Возвращает FactoidsResponse (SM1, SM2, SD1, SD2)
│  Вход: FactoidGenerationRequest │  Pydantic V2 валидация
└──────────────┬──────────────────┘
               │ 4 маркера (текст реплик заявителя)
               ▼
┌─────────────────────────────────┐
│  2. bricks_compiler.py          │  compile_ticket(request: CompileTicketRequest)
│  Чистая синхронная функция      │  Компилирует фактоиды + справочные фразы
│  → BricksMatrix (Pydantic V2)   │  в структурированный «каталог кирпичиков»
└──────────────┬──────────────────┘
               │ BricksMatrix (в памяти / сохраняется через API в БД)
               ▼
┌─────────────────────────────────┐
│  3. intent_classifier.py        │  classify_intent(operator_text: str) -> str
│  Внешняя SLM/LLM (HTTP async)   │  Классифицирует реплику оператора в Intent 0–9
└──────────────┬──────────────────┘
               │ intent_id (0–9)
               ▼
┌─────────────────────────────────┐
│  4. dialogue_router.py          │  process_turn(state, intent_id, matrix)
│  Чистая функция, иммутабельная  │  Выбирает реплику заявителя, управляет паникой
│  → (reply_text, SessionState)   │  и фиксирует повторы/штрафы
└──────────────┬──────────────────┘
               │ reply_text
               ▼
┌─────────────────────────────────┐
│  5. tts_engine.py               │  generate_audio(text: str) -> bytes
│  Внешний микросервис TTS (HTTP) │  Возвращает сырые аудиобайты (bytes)
│  Stateless (без I/O диска)      │  Фоновые задачи FastAPI стримят/сохраняют
└─────────────────────────────────┘
```

---

## JSON-контракты (Схемы данных)

### 1. Запрос на генерацию факторидов (FactoidGenerationRequest)

Отправляется фронтендом (или внутренним сервисом) на `POST /api/v2/generate_scenario_sse`.
Поля берутся из `ScenarioTicket.ground_truth` и `settings`.

```json
{
  "plot": "Горит кухня, сильный дым.",       // Фабула из ScenarioTicket (краткое описание)
  "extra_plot": "Жилец не может выйти",      // Дополнительная деталь (опционально)
  "okrug": "ЦАО",
  "rayon": "Тверской",
  "street": "Тверская",
  "house": "13",
  "corpus": "",
  "stroenie": "",
  "flat": "42",
  "podiezd": "2",
  "floor": "7",
  "domofon": "42Б",
  "fio": "Иванов Петр Сергеевич",
  "phone": "+79991234567",
  "ground_truth": { /* полный ground_truth из ScenarioTicket — опционально */ }
}
```

### 2. SSE-ответ LLM (поток событий)

Ответ генерируется стримом. Каждая строка — отдельное SSE-событие.

```
event: status
data: {"text": "Инициализация модели..."}

event: status
data: {"text": "Обработка промпта / Prefill..."}

event: factoid
data: {"marker": "SM1", "text": "У нас начался пожар в квартире, горит кухня."}

event: factoid
data: {"marker": "SM2", "text": "Кухня полыхает, всё в дыму, дышать нечем!"}

event: factoid
data: {"marker": "SD1", "text": "Дым уже пошёл в коридор, огонь на обои."}

event: factoid
data: {"marker": "SD2", "text": "Ничего не видно из-за дыма, вся мебель горит!"}
```

**Правила маркеров:**

| Маркер | Тон | Назначение |
|---|---|---|
| `SM1` | Спокойный | Описание ситуации (суть происшествия) |
| `SM2` | Паника | То же, но с эмоцией — перефраз SM1 |
| `SD1` | Спокойный | Детали обстановки, физические действия |
| `SD2` | Паника | То же, но с эмоцией — перефраз SD1 |

### 3. Промежуточный объект: BricksMatrix

Центральный файл диалогового движка. Создаётся `bricks_compiler.compile_ticket()`.
Хранится в `data/modular_dialogue/bricks_ticket_{uuid}_sit_01.json`.

```json
{
  "version": "2.1.0",
  "ticket_id": "uuid-v4",
  "question_id": 1,

  "metadata": {
    "title": "Каталог смысловых кирпичиков: Билет {uuid}",
    "character": {
      "name": "Иванов Петр Сергеевич",
      "phone": "+79991234567",
      "role": "Заявитель / Очевидец",
      "voice": "ru-RU-DmitryNeural",  // Зарезервировано; реально используется Silero aidar
      "initial_panic": 50             // 0–100, начальный уровень паники
    },
    "incident": {
      "category": "Пожар в квартире",
      "situation": "Горит кухня, сильный дым",
      "address": "Тверская, 13",
      "has_victims": false
    }
  },

  "total_bricks": 18,
  "roles_summary": {
    "INTRO_EMOTION": 7,         // Вступительные фразы (хардкод — нейтральные + панические)
    "CORE_FACT": 4,             // Смысловые факты из SM1/SM2/SD1/SD2
    "IRRITATION_MARKER": 4,    // Фразы раздражения (хардкод)
    "RELIEF": 4                 // Фразы облегчения / прощания (хардкод)
  },

  "dialog_matrix": {
    // Краткий словарь для быстрого поиска по intent
    "caller_id": ["Иванов Петр Сергеевич"],
    "address":   ["Тверская, 13"],
    "situation": ["У нас начался пожар в квартире, горит кухня.", "Кухня полыхает!"],
    "victims":   ["Пострадавших нет"]
  },

  "bricks": [
    // --- INTRO_EMOTION (вступление при поднятии трубки) ---
    {
      "audio_id": "brk_intro_neutral_01",
      "role": "INTRO_EMOTION",
      "category": "intro",
      "intent": "intro",
      "text": "Здравствуйте.",
      "emotion": "neutral",
      "intensity": 1,
      "duration_ms": 2000,
      "speech_rate": "normal",
      "subfolder": "bricks"
    },
    {
      "audio_id": "brk_intro_panic_01",
      "role": "INTRO_EMOTION",
      "category": "intro",
      "intent": "intro",
      "text": "Алло! Быстрее!",
      "emotion": "panic",
      "intensity": 3,
      "duration_ms": 2000,
      "speech_rate": "fast",
      "subfolder": "bricks"
    },

    // --- CORE_FACT (смысловые факты из LLM) ---
    {
      "audio_id": "brk_fact_situation_01",
      "role": "CORE_FACT",
      "category": "situation",
      "intent": "situation",
      "factoid_key": "SM1",             // Исходный маркер от LLM
      "text": "У нас начался пожар в квартире, горит кухня.",
      "emotion": "neutral",
      "intensity": 1,
      "duration_ms": 2500,
      "speech_rate": "normal",
      "subfolder": "bricks"
    },
    {
      "audio_id": "brk_fact_situation_02",
      "role": "CORE_FACT",
      "category": "situation",
      "intent": "situation",
      "factoid_key": "SM2",
      "text": "Кухня полыхает, всё в дыму, дышать нечем!",
      "emotion": "panic",
      "intensity": 3,
      "duration_ms": 2500,
      "speech_rate": "fast",
      "subfolder": "bricks"
    },

    // --- IRRITATION_MARKER (реакция на повторяющиеся вопросы) ---
    {
      "audio_id": "brk_irrit_01",
      "role": "IRRITATION_MARKER",
      "category": "irritation",
      "intent": "irritation",
      "text": "Да я же уже сказал:",
      "emotion": "angry",
      "intensity": 2,
      "duration_ms": 2000,
      "speech_rate": "fast",
      "subfolder": "bricks"
    },

    // --- RELIEF (завершение звонка) ---
    {
      "audio_id": "brk_relief_01",
      "role": "RELIEF",
      "category": "relief",
      "intent": "outro",
      "text": "Понял, жду.",
      "emotion": "neutral",
      "intensity": 1,
      "duration_ms": 2000,
      "speech_rate": "normal",
      "subfolder": "bricks"
    }
  ]
}
```

### 4. Классификация намерений оператора (Intent 0–9)

Qwen 0.8B (Q8_0) классифицирует каждую реплику оператора в одну из 10 категорий.
Возвращает **ровно одну цифру** как токен.

| Intent № | Ключ | Реплика оператора (пример) |
|---|---|---|
| `0` | `greeting` | «Это 112, слушаю» |
| `1` | `address` | «Назовите адрес, улицу и дом» |
| `2` | `address_details` | «Квартира, подъезд, этаж?» |
| `3` | `situation` | «Что именно случилось?» |
| `4` | `victims` | «Есть пострадавшие?» |
| `5` | `caller_id` | «Как вас зовут?» |
| `6` | `phone` | «Ваш номер телефона?» |
| `7` | `repeat` | «Повторите, не слышу» |
| `8` | `bureaucracy` | «Когда это произошло?» *(лишний вопрос)* |
| `9` | `outro` | «Службы выехали, до свидания» |

> **Intent 8 (bureaucracy)** → засчитывается как `cliche_violation` и повышает `panic_level` бота.

### 5. Ответ рантайм-сессии (V2ApplicantSession.process_message)

Возвращается фронтенду после каждой реплики оператора.

```json
{
  "reply": "Кухня полыхает, всё в дыму, дышать нечем!",
  "state": "panic",               // "grounded" | "panic" | "раздражение"
  "panic_level": 75,              // 0–100, растёт при повторах и 8-intent
  "emotion": "panic",             // "neutral" | "panic" | "angry"
  "category": "3",               // Классифицированный intent (0–9)
  "intent": "situation",          // Текстовый ключ intent
  "event": "details_revealed",   // Семантическое событие для фронтенда
  "semantic_event": "DIALOGUE",  // "DIALOGUE" | "IRRITATION" | "CLICHE_RAGE"
  "marker": "",                  // "IRRITATION" если был повтор
  "audio_id": "brk_fact_situation_02", // ID кирпичика для воспроизведения
  "tts_texts": ["Кухня полыхает, всё в дыму, дышать нечем!"], // Тексты для TTS
  "execution_path": "slm",       // Всегда "slm" (Small Language Model)
  "breath_pause_ms": 180,        // Пауза перед воспроизведением (180 при панике, 120 иначе)
  "latency_ms": 0.0,
  "revealed": {                  // Что уже выяснил оператор
    "address": false,
    "victims": false,
    "details": true,
    "name": false
  },
  "penalty": null                // Текст штрафа при intent=8, иначе null
}
```

### 6. TTS-модуль (`backend/core/tts_engine.py`)

Озвучка вынесена во внешний асинхронный микросервис (или стороннее API):
- `async def generate_audio(text: str) -> bytes`: чистый интерфейс, принимающий текст реплики и возвращающий сырые аудиобайты (`bytes`).
- Модуль ядра полностью stateless: не выполняет локальный тяжелый инференс (Torch / Silero) и не сохраняет файлы напрямую на диск.
- Сохранением и стримингом аудио занимается фоновая таска FastAPI (`BackgroundTasks`) на уровне API.

```python
# Интерфейс вызова:
audio_bytes = await generate_audio(reply_text)
```

---

## Связи с другими доменами

```
ScenarioTicket (домен 02)
  └─ ground_truth + ai_content.ai_factoids (SM1/SM2/SD1/SD2)
       │
       ▼ compile_ticket()
  BricksMatrix (домен 05)  ←── ЭТОТ ФАЙЛ
  data/modular_dialogue/bricks_ticket_{uuid}_sit_01.json
       │
       ▼ V2ApplicantSession(scenario, session_id)
  ExamSession (домен 03)
  └─ dialogue_log[] — лог каждого хода диалога
  └─ dynamic_state.current_panic_level ← V2ApplicantSession.panic_level
  └─ dynamic_state.asked_intents ← V2ApplicantSession.asked_intents
  └─ dynamic_state.cliche_violations ← V2ApplicantSession.cliche_violations
       │
       ▼ session COMPLETED
  EvaluationResult (домен 04)
```

---

## Поведение при повторяющихся вопросах

Если оператор задаёт вопрос по той же категории, что уже была задана:

```
asked_intents уже содержит category → is_repeated = True
  │
  ├─ reply = IRRITATION_MARKER.text + " " + base_reply
  ├─ emotion = "angry"
  ├─ panic_level = min(100, max(panic_level + 15, 75))
  ├─ state = "раздражение"
  └─ event = "fact_repeated"
```

---

## Граничные случаи и фолбеки

| Ситуация | Поведение |
|---|---|
| BricksMatrix файл не найден | `V2ApplicantSession` использует поля `scenario` напрямую (address, situation, etc.) |
| Qwen 0.8B не инициализирован | `MockLlamaFallback` возвращает всегда `"7"` (переспрашивание) |
| LLM вернул не цифру | Парсится первый символ; если не 0–9, fallback → `"7"` |
| SM1/SM2/SD1/SD2 не все четыре пришли | `bricks_compiler` подставляет fallback из `ground_truth` (адрес, has_victims, plot) |
| TTS текст уже в кеше | Silero не вызывается, WAV читается из `data/tts_cache/` |
