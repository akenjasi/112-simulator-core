# ТЗ 27: Автооценка и Апелляция (Сценарий 5)

**Статус:** Готово к выполнению воркером
**Расположение файлов:**
- `backend/core/evaluator.py` (Чистые функции оценки)
- `backend/schemas/domain_04.py` (Схемы результатов)

## Контекст
Реализуем Сценарий 5: Пост-аналитика и Экспертная оценка. Система должна автоматически сравнивать ответ курсанта с JSON-эталоном. При этом текстовые поля нужно нормализовать (чтобы "ул. Ленина" и "Ленина" считались совпадением). 
Кроме того, преподаватель может вручную изменить оценку (Апелляция). Важно: любые изменения преподавателя должны логироваться (у нас уже есть `audit_middleware` или таблица AuditLogs в `domain_01`).

## Задачи для воркера

1. **Создать схемы Pydantic (в `backend/schemas/domain_04.py`):**
   - `TicketEvaluationRequest`: поля `etalon_services` (list[str]), `etalon_fields` (dict), `student_services` (list[str]), `student_fields` (dict), `error_limit` (int).
   - `TicketEvaluationResult`: поля `is_passed` (bool), `errors_count` (int), `error_details` (dict вида `{"имя_поля": "причина ошибки"}`).
   - *Для Апелляции:* Добавить/Обновить схему для БД `TicketResultUpdate`, которая принимает `is_passed` (bool) и `teacher_comment` (str).

2. **Реализовать чистые функции в `backend/core/evaluator.py`:**
   - **`normalize_text(text: str) -> str`**:
     Приводит текст к нижнему регистру, удаляет все знаки препинания (оставляет только буквы и цифры), схлопывает множественные пробелы в один и делает `strip()`.
   - **`evaluate_ticket(req: TicketEvaluationRequest) -> TicketEvaluationResult`**:
     - *Службы:* Сравнивает множества (`set`) `etalon_services` и `student_services`. Если есть разница (не вызвал нужную или вызвал лишнюю) -> это 1 ошибка. В `error_details["services"]` пишем недостающие/лишние.
     - *Текстовые поля:* Проходится по всем ключам из `etalon_fields`. Для каждого ключа берет значение эталона и значение студента из `student_fields`. Прогоняет оба через `normalize_text`. Если нормализованный эталон НЕ содержится (`not in`) в нормализованном ответе студента -> это 1 ошибка. Пишем в `error_details[key]`.
     - Считает общее количество ошибок (`errors_count`).
     - `is_passed` = `True`, если `errors_count <= req.error_limit`, иначе `False`.

3. **Интеграция с БД (Модель `TicketResult`):**
   Убедитесь, что в модели `domain_04.TicketResult` есть поля `is_appealed` (Boolean, default=False) и `teacher_comment` (String, nullable=True). При роутинге апелляции, факт изменения должен записываться в `AuditLog` (или отлавливаться существующим middleware).

## Команда проверки
Запустите:
`pytest tests/test_27_evaluator.py -v`
Убедитесь, что все тесты проходят.
