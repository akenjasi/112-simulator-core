"""Current Qwen normalization and empty-input contract; no native weights needed."""
from backend.core.tts_v2 import QwenTTSV2, normalize_text_v2
from pathlib import Path
import pytest


def test_tts_relative_models_resolve_from_project_in_another_cwd(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv('TTS_MODELS_DIR', './data/tts_models')
    engine = QwenTTSV2(cache_dir=tmp_path / 'cache')
    project = Path(__file__).resolve().parents[2]
    assert engine.model_path.parent == project / 'data/tts_models'


def test_tts_enabled_reports_missing_weights_before_launch(monkeypatch, tmp_path):
    monkeypatch.setenv('TTS_ENABLED', 'true')
    monkeypatch.setenv('TTS_MODELS_DIR', str(tmp_path / 'missing'))
    engine = QwenTTSV2(cache_dir=tmp_path / 'cache')
    with pytest.raises(RuntimeError, match='run make models'):
        engine.synthesize('Проверка связи.')

def test_current_tts_normalizes_address_and_phone():
    result = normalize_text_v2("ул. Ленина, д. 15, +79443759255")
    assert "улица" in result and "дом" in result and "плюс семь" in result
    assert "+79443759255" not in result

def test_empty_input_never_runs_native_inference(tmp_path):
    engine = QwenTTSV2(cache_dir=tmp_path)
    assert engine.synthesize("") == b""
    assert engine.synthesize("   ") == b""
