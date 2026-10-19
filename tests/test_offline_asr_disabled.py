"""The offline DDS package must not load or invoke speech recognition."""
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import numpy as np
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.api import router_asr
from backend.main import app


@pytest.mark.asyncio
async def test_disabled_asr_skips_model_and_rejects_audio_before_processing(monkeypatch, tmp_path, db_session):
    monkeypatch.setenv("ASR_ENABLED", "false")
    model = Mock(side_effect=AssertionError("Disabled ASR must not load weights"))
    monkeypatch.setitem(sys.modules, "transcribe_cpp", SimpleNamespace(Model=model))
    service = router_asr.ASRService(model_path=str(tmp_path / "missing.gguf"))
    model.assert_not_called()
    assert service.enabled is False
    assert service.is_ready() is False
    monkeypatch.setattr(router_asr, "asr_service", service)
    decode = Mock(side_effect=AssertionError("Disabled ASR must not decode audio"))
    monkeypatch.setattr(router_asr, "convert_to_pcm16k", decode)
    fallback = AsyncMock(side_effect=AssertionError("Disabled ASR must not start CLI"))
    monkeypatch.setattr(service, "_transcribe_cli_pcm", fallback)
    from tests.conftest import create_user_and_token
    from backend.models.domain_03 import ExamSession
    user, _, headers = await create_user_and_token("CADET")
    session = ExamSession(cadet_id=user.user_id, session_type="CALL_SIMULATION", status="ACTIVE")
    db_session.add(session)
    await db_session.commit()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", headers=headers) as client:
        status = await client.get("/api/v2/asr/status")
        assert status.json()["status"] == "disabled"
        response = await client.post("/api/v2/asr/transcribe", files={"file": ("audio.webm", b"synthetic", "audio/webm")}, data={"session_id": session.session_id})
        assert response.status_code == 503
    decode.assert_not_called()
    with pytest.raises(RuntimeError, match="disabled"):
        await service.transcribe_pcm(np.zeros(16, dtype=np.float32))
    fallback.assert_not_called()


def test_disabled_asr_rejects_stream_without_accepting_recordings(monkeypatch):
    monkeypatch.setenv("ASR_ENABLED", "false")
    monkeypatch.setattr(router_asr, "asr_service", router_asr.ASRService())
    with pytest.raises(WebSocketDisconnect) as error:
        with TestClient(app).websocket_connect("/api/v2/asr/stream/disabled-probe"):
            pytest.fail("Disabled stream must not be accepted")
    assert error.value.code == 1008


def test_asr_still_loads_when_enabled_by_default(monkeypatch, tmp_path):
    monkeypatch.delenv("ASR_ENABLED", raising=False)
    weights = tmp_path / "model.gguf"
    weights.write_bytes(b"GGUFsynthetic")
    model = Mock()
    monkeypatch.setitem(sys.modules, "transcribe_cpp", SimpleNamespace(Model=model))
    service = router_asr.ASRService(model_path=str(weights))
    model.assert_called_once_with(str(weights))
    assert service.enabled is True
    assert service.is_ready() is True
