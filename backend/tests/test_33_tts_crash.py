import pytest
from backend.core.tts_v2 import tts_engine_v2

@pytest.mark.parametrize("text", ["7 9 1 7 4 5 4 1 9 9 7", "номер плюс семь, девятьсот семнадцать"])
def test_tts_disabled_never_fabricates_audio(monkeypatch, text):
    """Silero is retired: optional Qwen must fail explicitly when disabled."""
    monkeypatch.setenv("TTS_ENABLED", "false")
    with pytest.raises(RuntimeError, match="Speech synthesis is disabled"):
        tts_engine_v2.synthesize(text)


@pytest.mark.asyncio
async def test_ticket_audio_phone_prefix_in_endpoint():
    """
    Проверяем, что при формировании аудио для билета номер телефона
    передается с префиксом 'номер ', чтобы Silero TTS не падала.
    """
    from unittest.mock import patch, MagicMock, AsyncMock
    from backend.api.router_tickets import get_ticket_audio
    from backend.models.domain_02 import GeneratedTicket

    mock_ticket = MagicMock(spec=GeneratedTicket)
    mock_ticket.ticket_id = "test-uuid"
    mock_ticket.plot = "Пожар"
    mock_ticket.settings = None
    mock_ticket.ai_content = None
    mock_ticket.ground_truth = {
        "fio": "Иван Иванов",
        "phone": "+79174541997",
        "street": "Ленина",
        "house": "5",
    }

    mock_db = MagicMock()
    mock_db.get = AsyncMock(return_value=mock_ticket)

    with patch("backend.api.router_tickets.tts_engine_v2.concatenate_tts", return_value=b"fake-audio") as mock_concat:
        resp = await get_ticket_audio(ticket_id="test-uuid", db=mock_db)
        assert resp.status_code == 200
        assert resp.body == b"fake-audio"

        # Проверяем переданные в concatenate_tts тексты
        args, kwargs = mock_concat.call_args
        texts = args[0]
        assert any(t.startswith("номер плюс семь, девятьсот семнадцать, четыреста пятьдесят четыре, девятнадцать, девяносто семь") for t in texts)

