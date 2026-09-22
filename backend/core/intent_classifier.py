from backend.schemas.bricks import Intent


async def classify_intent(operator_text: str) -> Intent:
    """
    Асинхронный классификатор намерений оператора 112.
    В текущей версии реализована заглушка на основе ключевых слов.
    В дальнейшем будет подключен HTTP-запрос к микросервису LLM.
    """
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
