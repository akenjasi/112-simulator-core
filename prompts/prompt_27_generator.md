# ТЗ 27: Генератор билетов (Псевдо-ИИ) - Сценарий 2

**Статус:** Готово к выполнению воркером
**Расположение файлов:**
- `backend/core/ticket_generator.py` (Основная логика)
- `backend/schemas/generator.py` (Схемы генератора)

## Контекст
Реализуем Сценарий 2: Генерация учебных материалов (билетов). Нам нужна чистая функция `generate_tickets`, которая на основе строки из Классификатора (типа инцидента и массива текстовых шаблонов) и генератора фейковых данных (FakeDataGenerator) выдает пакет готовых билетов (TicketData).
Этот `TicketData` идеально ложится в уже существующий `bricks_compiler.py` для построения диалогов.

## Задачи для воркера

1. **Создать схемы Pydantic (в файле `backend/schemas/generator.py`):**
   - `ClassifierRow`: поля `code` (str), `incident_name` (str), `services` (list[str]), `markers` (list[str]), `templates` (list[str]).
   - `TicketData` (расширяет структуру из `bricks.py`, чтобы включить поля для оценки):
     поля `ticket_id` (str - генерировать через uuid4), `complexity` (int), `plot` (str - полный сгенерированный текст), `factoids` (dict), `ground_truth` (dict), `etalon_services` (list[str]).

2. **Реализовать чистую функцию `generate_tickets`:**
   Создать файл `backend/core/ticket_generator.py`.
   Импортировать функцию `calculate_complexity` из `backend/core/complexity.py`.
   
   Реализовать функцию:
   ```python
   def generate_tickets(classifier_row: ClassifierRow, count: int, faker) -> list[TicketData]:
       # faker - это инстанс FakeDataGenerator (или его мок)
       pass
   ```
   
   **Логика внутри функции:**
   - В цикле (от 0 до `count`) генерируем фейковые данные: человека (`generate_person()`), адрес (`generate_address()`), телефон (`generate_phone()`), роль (`generate_role()`).
   - Выбираем один случайный шаблон из `classifier_row.templates` с помощью `faker.random.choice`.
   - Используем `str.format()` для подстановки сгенерированных данных в шаблон. Допустимые ключи: `{role}`, `{incident_name}`, `{first_name}`, `{last_name}`, `{middle_name}`, `{street}`, `{house}`, `{phone}`.
   - Вычисляем сложность с помощью `calculate_complexity(len(classifier_row.services), classifier_row.markers)`.
   - **Формируем TicketData:**
     - `ticket_id` = `str(uuid.uuid4())`
     - `complexity` = вычисленная сложность
     - `plot` = сгенерированный текст шаблона
     - `etalon_services` = `classifier_row.services`
     - `factoids` = словарь вида `{"situation_1": plot}` (строка с текстом инцидента, чтобы `bricks_compiler` мог сделать из неё "кирпичик" фабулы).
     - `ground_truth` = словарь с эталонными данными абонента для автопроверки: `{"fio": "Фамилия Имя Отчество", "phone": phone, "street": address.street, "house": address.house}`.
   - Возвращаем список объектов `TicketData`.

3. **Ограничения:**
   - Логика должна быть полностью отвязана от БД и HTTP-запросов (только чистые функции).

## Команда проверки
Запустите:
`pytest tests/test_27_generator.py -v`
Убедитесь, что все тесты проходят.
