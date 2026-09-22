import inspect
import httpx
from backend.schemas.bricks import Intent


async def classify_intent(operator_text: str) -> Intent:
    """
    Асинхронный классификатор намерений оператора 112 через LLM API.
    """
    prompt = (
        f"Классифицируй интент реплики оператора службы 112: '{operator_text}'.\n"
        "Возможные интенты (выбери ровно один):\n"
        "- intro\n"
        "- caller_id\n"
        "- address\n"
        "- situation\n"
        "- victims\n"
        "- outro\n\n"
        "Верни ТОЛЬКО ОДНО слово на английском языке из списка выше."
    )
    url = "http://localhost:11434/v1/chat/completions"
    payload = {
        "model": "qwen2.5:7b",
        "messages": [
            {"role": "user", "content": prompt}
        ],
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=60.0)
            data = response.json()
            if inspect.isawaitable(data):
                data = await data
            raw_content = data["choices"][0]["message"]["content"].strip().lower()
            for intent in Intent:
                if intent.value == raw_content:
                    return intent
            for intent in Intent:
                if intent.value in raw_content:
                    return intent
            return Intent.situation
    except (httpx.RequestError, ConnectionRefusedError, OSError):
        # Резервный поиск по ключевым словам, если сервис LLM недоступен (например, в офлайн-тестах)
        text = (operator_text or "").strip().lower()
        if "адрес" in text or "где вы" in text:
            return Intent.address
        if "пострадавш" in text or "ранен" in text or "жертв" in text:
            return Intent.victims
        if "кто говорит" in text or "ваше имя" in text or "зовут" in text or "представьтесь" in text:
            return Intent.caller_id
        if "здравствуйте" in text or "добрый день" in text:
            return Intent.intro
        if "выезжаем" in text or "выехали" in text or "до свидания" in text:
            return Intent.outro
        if "случилось" in text or "произошло" in text:
            return Intent.situation
        return Intent.situation
