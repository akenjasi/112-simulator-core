# ТЗ 31: Полировка Билетов (Удаление, Голоса, Озвучка Телефона)

**Статус:** Готово к выполнению (Fullstack)

## Задачи для Backend-воркера

1. **Добавление пола и спикера (Male/Female):**
   - В `backend/schemas/generator.py` добавьте поле `gender: str = ""` в схему `GeneratedPerson`.
   - В `backend/core/faker.py` в `generate_person` передавайте `gender=gender` при возврате `GeneratedPerson`.
   - В `backend/core/ticket_generator.py` извлекайте пол `gender = getattr(person, "gender", "male")`. 
   - Выберите спикера: если `"female"`, то `speaker = "xenia"` (или `"baya"`), иначе `"aidar"`. 
   - Сохраняйте `speaker` в `ticket.ground_truth["speaker"]`.
   - В `backend/api/router_tickets.py` в функции `get_ticket_audio` извлекайте `speaker = gt.get("speaker", "aidar")` и передавайте его в `tts_engine_v2.concatenate_tts(texts, speaker=speaker)`.

2. **Синхронизация текста "Алло, слушайте...":**
   - В `backend/core/ticket_generator.py` при формировании фабулы жестко добавляйте приветствие в начало: `plot = f"Алло, слушайте... {template_text}"`.
   - В `backend/api/router_tickets.py` (`get_ticket_audio`) УДАЛИТЕ ручное добавление `["Алло, слушайте..."]` в массив `texts`, так как оно теперь уже есть внутри `plot`.

3. **Исправление нечитаемых номеров телефонов (TTS):**
   - Номера вида `+79443759255` нейросеть Silero проглатывает или падает на плюсе.
   - В `backend/core/tts_v2.py` (или прямо в `get_ticket_audio` перед отправкой) добавьте пробелы между цифрами для телефона. Например, простая регулярка для разделения цифр: `text_clean = re.sub(r'(?<=\d)(?=\d)', ' ', text_clean)`. Это заставит нейросеть читать цифры по одной ("семь девять четыре..."), что идеально для диктовки номера. Плюс заменяйте на "плюс ".

4. **Удаление билетов (API):**
   - В `backend/api/router_tickets.py` создайте эндпоинт `DELETE /api/tickets/{ticket_id}`.
   - Он должен находить билет в `GeneratedTicket` (или `ScenarioTicket`) и удалять его `await session.delete(ticket)`.

## Задачи для Frontend-воркера

1. **Удаление билетов (UI):**
   - В таблице "База билетов" в колонке "Действия" добавьте иконку корзины (Удалить).
   - При нажатии спрашивать подтверждение (опционально) и отправлять `DELETE /api/tickets/{id}`.
   - После успешного удаления обновлять список билетов в таблице.

Для проверки бэкенда запустите: `pytest tests/test_31_ticket_polish.py`
