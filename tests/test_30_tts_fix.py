import re
from backend.core.tts_v2 import SileroTTSV2, tts_engine_v2


def test_tts_text_sanitization():
    """
    Проверка регулярного выражения, которое должно очищать текст перед отправкой в Silero TTS.
    Silero падает (ValueError) на символах типа '+', английских буквах и спецсимволах.
    """
    raw_texts = [
        "+79443759255",
        "Hello! Утечка газа.",
        "Адрес: ул. Ленина, д. 15 (подъезд 2)",
    ]
    
    # Ожидаемое поведение: оставляем только русские буквы, цифры, пробелы и базовую пунктуацию
    def sanitize(text: str) -> str:
        # Заменяем + на 'плюс ' (опционально, можно просто удалять, но для телефона лучше озвучить или убрать)
        text = text.replace('+', 'плюс ')
        # Удаляем все кроме русского алфавита, цифр и базовой пунктуации
        return re.sub(r'[^а-яА-ЯёЁ0-9\s.,!?-]', '', text)

    assert sanitize(raw_texts[0]) == "плюс 79443759255"
    # Восклицательный знак входит в список разрешенных знаков (.,!?-), английские буквы убираются
    assert sanitize(raw_texts[1]) == "! Утечка газа."
    assert sanitize(raw_texts[2]) == "Адрес ул. Ленина, д. 15 подъезд 2"

    # Проверка метода движка SileroTTSV2
    assert SileroTTSV2.sanitize_text(raw_texts[0]) == "плюс 79443759255"
    assert SileroTTSV2.sanitize_text(raw_texts[1]) == "! Утечка газа."
    assert SileroTTSV2.sanitize_text(raw_texts[2]) == "Адрес ул. Ленина, д. 15 подъезд 2"


def test_tts_empty_and_latin_only_string():
    """
    Если после санитизации строка пустая (например, состояла только из латиницы),
    функция synthesize должна вернуть пустой bytes().
    """
    tts = SileroTTSV2()
    assert tts.synthesize("") == bytes()
    assert tts.synthesize("   ") == bytes()
    assert tts.synthesize("OnlyEnglishLetters") == bytes()
    assert tts.synthesize("Hello world") == bytes()

