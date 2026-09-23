# ТЗ: Реализация Консоли ДДС и SLA-мониторинга

## Контекст
Мы переносим функционал консоли ДДС (диспетчерских служб) из старой версии приложения в архитектуру V2.
Используется паттерн "Functional Core, Imperative Shell". Логика расчетов SLA должна быть строго изолирована от API и БД.

## Разрешенные к редактированию файлы
- `backend/core/sla_monitor.py` (Создать)
- `backend/schemas/dds.py` (Создать)
- `backend/api/router_dds.py` (Создать)
- `backend/main.py` (Редактировать: только подключить `router_dds`)

## Запрещенные к редактированию файлы
- `backend/models/domain_*.py` (Используем уже существующую модель `IncidentCard` из `domain_04.py`)
- Любые другие файлы проекта.

## Задача 1: Чистая логика (Core)
В `backend/core/sla_monitor.py` реализуйте функции (ориентируйтесь на тесты в `tests/test_sla_monitor.py`):
1. `calculate_sla_status(services: dict, current_time: datetime, timeout_sec: int = 30) -> dict`
   Проходит по всем службам. Если статус равен "Добавлена" и с момента `dispatched_at` прошло больше `timeout_sec`, ставит `is_overdue = True`. Возвращает новый словарь (иммутабельность).
2. `update_service_status(services: dict, service_name: str, new_status: str, comment: str, current_time: datetime) -> dict`
   Меняет статус указанной службы, добавляет запись в массив `history` с указанием времени и комментария. Возвращает новый словарь.

## Задача 2: Pydantic Схемы (Schemas)
В `backend/schemas/dds.py` создать строгие схемы (Pydantic V2):
- `DDSActionRequest` (поля: `service_name`, `status`, `comment`, `user_name`)
- `DDSCardResponse` (схема карточки, выдаваемой на фронт)

## Задача 3: API Контроллер (API)
В `backend/api/router_dds.py` создать роутер (prefix `/api/dds`, tags `["DDS"]`):
1. `GET /cards`
   Достает из БД `IncidentCard` (через AsyncSession), у которых статус не равен "Отработана".
   Прогоняет `card.assigned_services` через `calculate_sla_status`. Отдает список на фронт.
2. `POST /cards/{card_id}/action`
   Принимает `DDSActionRequest`.
   Находит карточку в БД. Прогоняет её `assigned_services` через `update_service_status`.
   Обновляет `card.assigned_services` и сохраняет в БД (используйте `flag_modified(card, "assigned_services")` из SQLAlchemy, т.к. это JSON).
   Если новый статус — "Работы завершены" или "Не принята", проверьте, завершили ли работу все остальные службы, и если да — поменяйте `card.status = 'Отработана'`.

## Задача 4: Подключение
В `backend/main.py` импортируйте и подключите созданный `router_dds`.
