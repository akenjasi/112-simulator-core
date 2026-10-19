"""Current Qwen normalization and empty-input contract; no native weights needed."""
from backend.core.tts_v2 import QwenTTSV2, normalize_text_v2

def test_current_tts_normalizes_address_and_phone():
    result = normalize_text_v2("ул. Ленина, д. 15, +79443759255")
    assert "улица" in result and "дом" in result and "плюс семь" in result
    assert "+79443759255" not in result

def test_empty_input_never_runs_native_inference(tmp_path):
    engine = QwenTTSV2(cache_dir=tmp_path)
    assert engine.synthesize("") == b""
    assert engine.synthesize("   ") == b""
