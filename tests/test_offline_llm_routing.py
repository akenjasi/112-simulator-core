"""Offline text generation uses the shared local CPU service, not host Ollama."""
from unittest.mock import AsyncMock, Mock, patch

import pytest

from backend.core.factoids_llm import call_llm_api


@pytest.mark.asyncio
@pytest.mark.parametrize("configured", [False, True])
async def test_factoid_llm_route_preserves_default_and_supports_offline_cpu(monkeypatch, configured):
    for key in ("FACTOIDS_LLM_BASE_URL", "FACTOIDS_LLM_MODEL", "FACTOIDS_LLM_TIMEOUT_SECONDS"):
        monkeypatch.delenv(key, raising=False)
    if configured:
        monkeypatch.setenv("FACTOIDS_LLM_BASE_URL", "http://llm:8080/v1/")
        monkeypatch.setenv("FACTOIDS_LLM_MODEL", "dds-qwen")
        monkeypatch.setenv("FACTOIDS_LLM_TIMEOUT_SECONDS", "900")
    response = Mock()
    response.json.return_value = {"choices": [{"message": {"content": "SM1: Учебный ответ"}}]}
    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=response) as post:
        text = await call_llm_api("Синтетический запрос")
    assert text == "SM1: Учебный ответ"
    assert post.call_args.args[0] == (
        "http://llm:8080/v1/chat/completions" if configured else "http://localhost:11434/v1/chat/completions"
    )
    assert post.call_args.kwargs["json"]["model"] == ("dds-qwen" if configured else "qwen2.5:7b")
    assert post.call_args.kwargs["timeout"] == (900 if configured else 60)
    if configured:
        assert post.call_args.kwargs["json"]["max_tokens"] == 1200
        assert post.call_args.kwargs["json"]["chat_template_kwargs"] == {"enable_thinking": False}
