# ТЗ: Редактирование и Soft Delete сценариев
**Роль:** Backend Developer

## Контекст
В API для билетов/сценариев (вероятно `backend/api/router_tickets.py` или `router_scenarios.py`) отсутствуют методы `PATCH` (изменение) и `DELETE` (удаление). Удаление должно быть "мягким" (Soft Delete), чтобы не ломать историческую статистику (оценки и результаты курсантов, ссылающиеся на этот `scenario_id`).

## Задачи:
1. **База данных (`backend/models/domain_02.py`):**
   - Добавить поле `is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)` в модель `ScenarioTicket` (и, если необходимо, в `GeneratedTicket`). 
2. **API (`backend/api/router_tickets.py`):**
   - Добавить эндпоинт `PATCH /api/tickets/{scenario_id}` (или `/api/scenarios/{id}`) для частичного обновления полей (например `title`, `complexity`, `ground_truth`).
   - Добавить эндпоинт `DELETE /api/tickets/{scenario_id}`. При вызове поле `is_deleted` должно устанавливаться в `True` (Soft Delete).
   - Изменить эндпоинт получения списка `GET /api/tickets` (или `GET /api/scenarios`), чтобы он по умолчанию возвращал только те сценарии, у которых `is_deleted == False` (можно добавить query-параметр `?include_deleted=true` для админов).
3. **Frontend (Опционально):**
   - Если в интерфейсе преподавателя есть таблица сценариев/билетов, добавить туда кнопки "Редактировать" и "Удалить" (отправляющие соответствующие запросы). Если фронт слишком сложный, сосредоточиться только на Backend API.
4. Убедиться, что заглушечный тест `tests/test_84_scenarios_soft_delete.py` корректно проверяет логику.

## Ограничения
- Не использовать жесткий `session.delete(scenario)` — только Soft Delete!
- Сохранять совместимость со старыми записями в БД (у них `is_deleted` будет NULL, в коде обрабатывайте это как `False`).
