# ТЗ 02: Генерация аналитических отчетов (Evaluations)

## Контекст
Мы реализуем выгрузку PDF/CSV отчетов для преподавателей.
Выбранный стек: Jinja2 + HTML-to-PDF (например, `xhtml2pdf` или `weasyprint`). Выгрузка должна быть асинхронной.

## Разрешенные к редактированию файлы
- `backend/core/reports_engine.py` (Создать)
- `backend/schemas/reports.py` (Создать)
- `backend/api/router_reports.py` (Создать)
- `backend/templates/report_layout.html` (Создать)
- `backend/main.py` (Подключить роутер)

## Задача 1: Pydantic Схемы
В `backend/schemas/reports.py` создайте схемы метрик, включающие новые критичные параметры:
- `time_to_first_dispatch_sec`: время от начала звонка до первой отправки карточки.
- `over_dispatched_services`: список служб, которые курсант вызвал ошибочно (гипер-диспетчеризация).
- `missed_critical_factoids`: список критичных фактоидов (например, "запах газа"), которые заявил абонент, но курсант не занес в карточку.

## Задача 2: Core логика и метрики
В `backend/core/reports_engine.py` реализуйте:
1. `calculate_final_score(comm_metrics: dict, card_metrics: dict, sla_metrics: dict) -> tuple[int, dict]`:
   Функция собирает итоговый балл из 3 блоков и начисляет штрафы за:
   - Коммуникацию (приветствие, следование скрипту, слова-паразиты).
   - Заполнение карточки (полнота адреса, пропущенные фактоиды `missed_critical_factoids`, лишние службы `over_dispatched_services`).
   - SLA (штрафы за просрочку времени диспетчеризации и слишком долгий `time_to_first_dispatch_sec` > 60 сек).
2. `generate_pdf_from_html(html_content: str, output_path: str)`: Функция конвертации HTML в PDF.

## Задача 3: Jinja2 Шаблон
Создайте файл `backend/templates/report_layout.html`.
Сверстайте красивую структуру с таблицами: Имя курсанта, Билет, Балл за коммуникацию, Балл за карточку. **Обязательно** выделите отдельным красным блоком критические ошибки: Гипер-диспетчеризация (отправка лишних служб) и Потеря фактоидов.

## Задача 4: Асинхронное API (Router)
В `backend/api/router_reports.py` (prefix `/api/reports`, tags `["Reports"]`):
1. Простой in-memory словарь для отслеживания задач: `TASKS = {task_id: {"status": "processing", "file_path": None}}`.
2. `POST /generate` — принимает `group_id` или `session_ids`. Генерирует `task_id`, кладет задачу в `FastAPI.BackgroundTasks` и возвращает `{"task_id": task_id}`.
3. Фоновая задача собирает данные, прогоняет через `calculate_final_score`, рендерит Jinja2, сохраняет PDF в `/tmp/` и обновляет статус задачи на `ready`.
4. `GET /status/{task_id}` и `GET /download/{task_id}`.

## Ограничения
Тяжелая конвертация в PDF ни в коем случае не должна блокировать Event Loop (используйте `asyncio.to_thread`).
