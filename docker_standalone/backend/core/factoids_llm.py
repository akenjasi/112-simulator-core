import inspect
import re
import httpx
from typing import List

from backend.schemas.factoids import Factoid, FactoidGenerationRequest, FactoidsResponse

SYSTEM_PROMPT = """Ты — профессиональный генератор реплик для тренажера операторов Системы-112. 
Твоя задача: на основе переданных строгих данных и фабулы сгенерировать 4 речевые реплики (фактоида) заявителя: SM1, SM2, SD1, SD2. Нам нужны только эти 4 строки.

КРИТИЧЕСКОЕ ПРАВИЛО: ОТВЕЧАЙ СРАЗУ. ТЕБЕ СТРОГО ЗАПРЕЩЕНО ИСПОЛЬЗОВАТЬ ТЕГИ <think> ИЛИ ВЕСТИ ВНУТРЕННИЙ МОНОЛОГ. СТРОГО ЗАПРЕЩЕНО РАССУЖДАТЬ И АНАЛИЗИРОВАТЬ. ВЫВОДИ ТОЛЬКО 4 СТРОКИ МАРКЕРОВ (SM1, SM2, SD1, SD2). НАМ НУЖНЫ ТОЛЬКО ЭТИ 4 СТРОКИ.

ПРАВИЛА ГЕНЕРАЦИИ:
1. Реплики с индексом "1" (SM1, SD1) — спокойные, четкие ответы.
2. Реплики с индексом "2" (SM2, SD2) — паникующие, раздраженные, просторечные.
3. Ты ОБЯЗАН вывести ровно 4 строки, начиная с маркера и двоеточия (SM1, SM2, SD1, SD2). Запрещены вводные слова, пустые строки и любые другие маркеры. Нам нужны только эти 4 строки.
4. Для маркера SM (Описание ситуации): обязательно пиши суть из фабулы происшествия.
5. Для маркера SD (Детали обстановки): указывай специфичные детали происходящего на месте, описывай физические действия и обстановку. СТРОГО ЗАПРЕЩЕНЫ фразы "я жду указаний" и "на связи".

СПИСОК МАРКЕРОВ:
SM1: Описание ситуации 1 (суть из фабулы)
SM2: Описание ситуации 2 (паника, суть из фабулы)
SD1: Детали обстановки 1 (специфичные детали, физические действия)
SD2: Детали обстановки 2 (паника, специфичные детали, запрещены "я жду указаний" и "на связи")

Пример ВВОДА:
[КЛАССИФИКАТОР]: Пожар в квартире
[УЛИЦА]: Ленина
[ДОМ]: 45
[КВАРТИРА]: 12
[ФИО]: Смирнова Анна
[ТЕЛЕФОН]: 89991112233
[ФАБУЛА]: Горит кухня, сильный дым. В квартире остался кот.

Пример ВЫВОДА:
SM1: У нас начался пожар в квартире, горит кухня.
SM2: Кухня полыхает, всё в дыму, дышать нечем!
SD1: Дым уже пошел в коридор, огонь перекидывается на обои.
SD2: Ничего не видно из-за дыма, там уже вся мебель горит!"""


def build_prompt(request: FactoidGenerationRequest) -> str:
    data = request.model_dump()
    gt = data.get("ground_truth") or {}

    def val(key: str) -> str:
        return str(data.get(key) or gt.get(key) or "").strip()

    okrug = val("okrug")
    rayon = val("rayon")
    street = val("street")
    house = val("house")
    corpus = val("corpus")
    stroenie = val("stroenie")
    flat = val("flat")
    podiezd = val("podiezd")
    floor = val("floor")
    domofon = val("domofon")
    fio = val("fio")
    phone = val("phone")
    plot = val("extra_plot") or val("plot")

    lines = [
        SYSTEM_PROMPT,
        "",
        "ВХОДНЫЕ СТРОГИЕ ДАННЫЕ (ЭТАЛОН / GROUND TRUTH):",
        f"- Округ: {okrug or 'Не указан'}",
        f"- Район: {rayon or 'Не указан'}",
        f"- Улица: {street or 'Не указана'}",
        f"- Дом: {house or 'Не указан'}",
        f"- Корпус: {corpus or 'Не указан'}",
        f"- Строение: {stroenie or 'Не указано'}",
        f"- Квартира: {flat or 'Не указана'}",
        f"- Подъезд: {podiezd or 'Не указан'}",
        f"- Этаж: {floor or 'Не указан'}",
        f"- Домофон: {domofon or 'Не указан'}",
        f"- ФИО: {fio or 'Не указано'}",
        f"- Телефон: {phone or 'Не указан'}",
        f"- Фабула / Доп. Фабула: {plot or 'Не указана'}",
    ]
    return "\n".join(lines)


async def call_llm_api(prompt: str) -> str:
    """
    Вызов LLM API через httpx.AsyncClient (формат OpenAI API).
    """
    url = "http://localhost:11434/v1/chat/completions"
    payload = {
        "model": "qwen2.5:7b",
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, timeout=60.0)
        data = response.json()
        if inspect.isawaitable(data):
            data = await data
        return data["choices"][0]["message"]["content"]


async def generate_factoids(request: FactoidGenerationRequest) -> FactoidsResponse:
    """
    Формирует промпт, вызывает LLM API и парсит маркеры фактоидов.
    """
    prompt = build_prompt(request)
    raw_response = await call_llm_api(prompt)

    factoids: List[Factoid] = []
    for line in raw_response.splitlines():
        line = line.strip()
        if not line:
            continue
        if ":" in line:
            marker, text = line.split(":", 1)
            factoids.append(Factoid(marker=marker.strip(), text=text.strip()))

    return FactoidsResponse(factoids=factoids)
