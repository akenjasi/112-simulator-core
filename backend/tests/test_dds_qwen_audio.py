"""Current phone assets are verified Qwen recordings; preparation is all-or-nothing."""
from copy import deepcopy
import io
import json
from pathlib import Path
import wave

import pytest

from backend.scripts.speech import generate_dds_phone_audio as preparation


def wav_bytes():
    target = io.BytesIO()
    with wave.open(target, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(8000)
        wav.writeframes(b"\x10\x00" * 24000)
    return target.getvalue()


@pytest.fixture
def native(monkeypatch):
    calls = []
    caches = []

    class Engine:
        def __init__(self, *, cache_dir):
            cache = Path(cache_dir)
            assert not cache.exists()  # The real engine creates a fresh directory.
            cache.mkdir()
            caches.append(cache)

        def synthesize(self, text, *, speaker):
            assert speaker == "aidar"
            calls.append(text)
            return wav_bytes()

    models = json.loads((preparation.ROOT / "tools/models.json").read_text())
    metadata = {
        "version": 1, "engine": "qwen-tts", "speaker": "aidar",
        "playback_version": preparation.PLAYBACK_VERSION,
        "models": {key: models[key] for key in ("talker", "tokenizer")},
        "recordings": {},
    }
    monkeypatch.setattr(preparation, "QwenTTSV2", Engine)
    monkeypatch.setattr(preparation, "provenance", lambda _: deepcopy(metadata))
    return calls, caches


def test_complete_current_bundle_uses_pinned_qwen_and_exact_transcripts():
    manifest = preparation.check_bundle()
    assert len(manifest["recordings"]) == 16
    assert manifest["voice_reference"]["name"] == "male_1_dmitri.wav"
    root = preparation.ROOT
    assert manifest["voice_reference"]["sha256"] == preparation.file_digest(
        root / "backend/core/qwen_tts/voices/references/male_1_dmitri.wav")
    assert manifest["binary"]["sha256"] == preparation.file_digest(root / "backend/core/qwen_tts/qwen-tts")
    assert manifest["processing"]["tts_source_sha256"] == preparation.file_digest(root / "backend/core/tts_v2.py")
    # All four stages reuse the same clearly spoken identity, byte for byte.
    for person in ("ivanov", "petrov", "sidorov", "smirnov"):
        identities = [manifest["recordings"][f"dds_{person}_cycle2_{i}.wav"]["parts"][0]["pcm_sha256"] for i in range(4)]
        assert len(set(identities)) == 1
    player = (root / "frontend/components/dispatcher/dds-training-phone.tsx").read_text()
    assert f"?v={manifest['playback_version']}" in player


def test_generation_replaces_only_current_assets_after_full_validation(tmp_path, native):
    output = tmp_path / "audio"
    output.mkdir()
    legacy = output / "dds_ivanov_0.wav"
    legacy.write_bytes(b"historical recording")
    old = output / next(iter(preparation.current_recordings()))
    old.write_bytes(b"old espeak recording")
    with pytest.raises(ValueError, match="use --force"):
        preparation.generate(output)
    assert native[0] == []
    preparation.generate(output, force=True)
    manifest = preparation.check_bundle(output)
    parts = [part for name, text in preparation.current_recordings().items() for part in preparation.synthesis_parts(name, text)]
    assert list(native[0]) == list(dict.fromkeys(parts))
    assert len(manifest["recordings"]) == 16
    assert legacy.read_bytes() == b"historical recording"
    assert all(not cache.exists() for cache in native[1])
    preparation.generate(output)
    assert len(native[0]) == 8  # Four identities and four stages, only once each.


def test_failed_synthesis_never_publishes_partial_set(tmp_path, native, monkeypatch):
    output = tmp_path / "audio"
    output.mkdir()
    original = {name: b"previous set" for name in preparation.current_recordings()}
    original[preparation.MANIFEST_NAME] = b"previous manifest"
    for name, payload in original.items():
        (output / name).write_bytes(payload)
    engine = preparation.QwenTTSV2
    synthesize = engine.synthesize

    def fail(self, text, *, speaker):
        if len(native[0]) == 5:
            raise RuntimeError("native generation failed")
        return synthesize(self, text, speaker=speaker)

    monkeypatch.setattr(engine, "synthesize", fail)
    with pytest.raises(RuntimeError, match="generation failed"):
        preparation.generate(output, force=True)
    assert {p.name: p.read_bytes() for p in output.iterdir()} == original
    assert not list(tmp_path.glob(".dds-qwen-*"))


@pytest.mark.parametrize("invalid", [b"not a WAV", wav_bytes()[:-20]])
def test_invalid_native_wav_never_replaces_ready_files(tmp_path, native, monkeypatch, invalid):
    output = tmp_path / "audio"
    output.mkdir()
    name = next(iter(preparation.current_recordings()))
    (output / name).write_bytes(b"old audio")
    monkeypatch.setattr(preparation.QwenTTSV2, "synthesize", lambda *a, **kw: invalid)
    with pytest.raises((ValueError, wave.Error)):
        preparation.generate(output, force=True)
    assert (output / name).read_bytes() == b"old audio"
    assert not (output / preparation.MANIFEST_NAME).exists()


def test_publication_error_restores_the_previous_set(tmp_path, native, monkeypatch):
    output = tmp_path / "audio"
    output.mkdir()
    original = {name: b"previous set" for name in preparation.current_recordings()}
    for name, payload in original.items():
        (output / name).write_bytes(payload)
    replace = Path.replace
    calls = []

    def fail_second(source, target):
        calls.append(target)
        if len(calls) == 2:
            raise OSError("publication failed")
        return replace(source, target)

    monkeypatch.setattr(Path, "replace", fail_second)
    with pytest.raises(OSError, match="publication failed"):
        preparation.generate(output, force=True)
    assert {p.name: p.read_bytes() for p in output.iterdir()} == original


@pytest.mark.parametrize("change", ["wav", "transcript", "model", "missing"])
def test_check_rejects_a_stale_or_incomplete_bundle(tmp_path, native, change):
    preparation.generate(tmp_path)
    manifest_path = tmp_path / preparation.MANIFEST_NAME
    manifest = json.loads(manifest_path.read_text())
    name = next(iter(manifest["recordings"]))
    if change == "wav":
        (tmp_path / name).write_bytes(b"different audio")
    elif change == "missing":
        (tmp_path / name).unlink()
    elif change == "transcript":
        manifest["recordings"][name]["transcript_sha256"] = "0" * 64
        manifest_path.write_text(json.dumps(manifest))
    else:
        manifest["models"]["talker"]["sha256"] = "0" * 64
        manifest_path.write_text(json.dumps(manifest))
    with pytest.raises((ValueError, FileNotFoundError)):
        preparation.check_bundle(tmp_path)


@pytest.mark.asyncio
async def test_actual_audio_api_serves_all_versioned_wavs_without_native_inference(monkeypatch):
    from backend.tests.test_dds_cycle_acceptance import request

    def forbidden(*args, **kwargs):
        raise AssertionError("Playing a prepared recording must not synthesize speech")

    monkeypatch.setattr(preparation.QwenTTSV2, "synthesize", forbidden)
    manifest = preparation.check_bundle()
    for name, entry in manifest["recordings"].items():
        response = await request("GET", f"/api/dds/audio/{name}?v={preparation.PLAYBACK_VERSION}", None)
        assert response.status_code == 200
        assert response.headers["content-type"] == "audio/wav"
        assert preparation.digest(response.content) == entry["sha256"]
        preparation.check_wav(response.content)


@pytest.mark.parametrize("services", [
    ["Гор. Хозяйство", "Управа района / Префектура"],
    ["Мосводоканал", "Гор. Хозяйство"],
    ["Мослифт", "01 Пожарные", "03 Скорая"],
    ["04 Газ", "01 Пожарные"],
])
def test_four_prepared_ticket_plans_reference_only_the_verified_set(services):
    from backend.core.dds_phone_catalog import default_phone_plan

    manifest = preparation.check_bundle()
    plan = default_phone_plan(services)
    for item in [*plan["contacts"], *plan["reports"]]:
        assert item["audio"].rsplit("/", 1)[-1] in manifest["recordings"]
    for contact in plan["contacts"]:
        first = next(r for r in plan["reports"] if r["contact_id"] == contact["id"])
        assert first["audio"] == contact["audio"]
