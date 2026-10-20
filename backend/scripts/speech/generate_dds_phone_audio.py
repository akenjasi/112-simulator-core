"""Prepare/check the 16 current DDS recordings with local Qwen, outside lessons.

Run make models first, then python -m backend.scripts.speech.generate_dds_phone_audio
--force to replace the previous set. --check needs neither models nor synthesis.
Legacy recordings are never changed. No database is opened.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import tempfile
import wave

from backend.core.dds_phone_catalog import AUDIO_DIR, STAGE_PHRASES, recordings
from backend.core.tts_v2 import QwenTTSV2

ROOT = Path(__file__).resolve().parents[3]
MANIFEST_NAME = "qwen-cycle2-manifest.json"
PLAYBACK_VERSION = "qwen-aidar-phone-v1"
SPEAKER = "aidar"
PAUSE_FRAMES = 1200  # 150 ms at 8 kHz between identity and the report stage.


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def file_digest(path):
    with Path(path).open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def current_recordings():
    return {name: text for name, text in recordings().items() if "_cycle2_" in name}


def check_wav(payload, *, minimum_duration=2):
    with wave.open(io.BytesIO(payload), "rb") as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype()) != (1, 2, 8000, "NONE"):
            raise ValueError("Expected PCM16 mono WAV at 8000 Hz")
        duration = wav.getnframes() / wav.getframerate()
        frames = wav.readframes(wav.getnframes())
        if duration <= minimum_duration or len(frames) != wav.getnframes() * 2 or not any(frames):
            raise ValueError("DDS recording is empty or too short")
        return duration


def synthesis_parts(filename, transcript):
    stage = STAGE_PHRASES[int(filename.rsplit("_", 1)[1].removesuffix(".wav"))]
    if not transcript.endswith(stage):
        raise ValueError(f"Unexpected DDS transcript: {filename}")
    return [transcript.removesuffix(stage).strip(), stage]


def compose(parts):
    """One consistent identity per brigade; no words changed or synthesized twice."""
    result = io.BytesIO()
    metadata = []
    with wave.open(result, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(8000)
        for index, (text, payload) in enumerate(parts):
            check_wav(payload, minimum_duration=0.05)
            with wave.open(io.BytesIO(payload), "rb") as source:
                frames = source.readframes(source.getnframes())
            if index:
                output.writeframes(b"\0\0" * PAUSE_FRAMES)
            output.writeframes(frames)
            metadata.append({"transcript_sha256": digest(text.encode()), "pcm_sha256": digest(frames), "frames": len(frames) // 2})
    return result.getvalue(), metadata


def check_bundle(directory=AUDIO_DIR):
    directory = Path(directory)
    manifest = json.loads((directory / MANIFEST_NAME).read_text())
    if (manifest.get("version"), manifest.get("engine"), manifest.get("speaker"), manifest.get("playback_version")) != (
            1, "qwen-tts", SPEAKER, PLAYBACK_VERSION):
        raise ValueError("Unexpected DDS recording provenance")
    expected_models = json.loads((ROOT / "tools/models.json").read_text())
    if manifest["models"] != {key: expected_models[key] for key in ("talker", "tokenizer")}:
        raise ValueError("DDS recordings must use the pinned Qwen TTS models")
    expected = current_recordings()
    if set(manifest["recordings"]) != set(expected):
        raise ValueError("Incomplete DDS Qwen recording set")
    for filename, transcript in expected.items():
        payload = (directory / filename).read_bytes()
        item = manifest["recordings"][filename]
        if (item["sha256"], item["transcript_sha256"]) != (digest(payload), digest(transcript.encode())):
            raise ValueError(f"DDS audio/transcript mismatch: {filename}")
        duration = check_wav(payload)
        if abs(duration - item["duration_seconds"]) > 0.001:
            raise ValueError(f"DDS audio duration mismatch: {filename}")
        with wave.open(io.BytesIO(payload), "rb") as wav:
            frames = wav.readframes(wav.getnframes())
        offset = 0
        parts = synthesis_parts(filename, transcript)
        if len(item["parts"]) != len(parts):
            raise ValueError(f"Incomplete DDS speech parts: {filename}")
        for index, (text, part) in enumerate(zip(parts, item["parts"])):
            if index:
                if frames[offset:offset + PAUSE_FRAMES * 2] != b"\0\0" * PAUSE_FRAMES:
                    raise ValueError(f"DDS speech pause mismatch: {filename}")
                offset += PAUSE_FRAMES * 2
            end = offset + part["frames"] * 2
            if part["transcript_sha256"] != digest(text.encode()) or part["pcm_sha256"] != digest(frames[offset:end]):
                raise ValueError(f"DDS speech part mismatch: {filename}")
            offset = end
        if offset != len(frames):
            raise ValueError(f"DDS speech part length mismatch: {filename}")
    return manifest


def provenance(engine):
    models = json.loads((ROOT / "tools/models.json").read_text())
    for key, path in (("talker", engine.model_path), ("tokenizer", engine.tokenizer_path)):
        if path.stat().st_size != models[key]["size"] or file_digest(path) != models[key]["sha256"]:
            raise ValueError(f"TTS model differs from pinned Qwen weights: {path}")
    voice = engine.voices_dir / engine.speaker_map[SPEAKER]
    return {
        "version": 1, "engine": "qwen-tts", "speaker": SPEAKER,
        "playback_version": PLAYBACK_VERSION,
        "models": {key: models[key] for key in ("talker", "tokenizer")},
        "voice_reference": {"name": voice.name, "sha256": file_digest(voice)},
        "binary": {"name": engine.bin_path.name, "sha256": file_digest(engine.bin_path)},
        "processing": {
            "version": "normalize-v2-phone-v1-header-stage-v1", "sample_rate": 8000, "channels": 1, "sample_width": 2,
            "identity_stage_pause_frames": PAUSE_FRAMES,
            "tts_source_sha256": file_digest(ROOT / "backend/core/tts_v2.py"),
            "filters": "highpass300-lowpass3400-compressor-pinknoise-pcm16",
        },
        "recordings": {},
    }


def generate(directory=AUDIO_DIR, *, force=False):
    directory = Path(directory)
    expected = current_recordings()
    if not force:
        if (directory / MANIFEST_NAME).is_file():
            check_bundle(directory)
            print("Verified existing Qwen DDS recordings; nothing regenerated.")
            return
        if any((directory / name).exists() for name in expected):
            raise ValueError("Existing DDS audio has no Qwen manifest; use --force to replace the full set")
    directory.parent.mkdir(parents=True, exist_ok=True)
    # Both inference cache and output are private and empty; never reuse legacy audio.
    with tempfile.TemporaryDirectory(prefix=".dds-qwen-", dir=directory.parent) as temporary:
        staging = Path(temporary) / "recordings"
        staging.mkdir()
        engine = QwenTTSV2(cache_dir=Path(temporary) / "cache")
        manifest = provenance(engine)
        speech = {}
        for filename, transcript in expected.items():
            print(f"Generating {filename}", flush=True)
            parts = synthesis_parts(filename, transcript)
            for text in parts:
                if text not in speech:
                    speech[text] = engine.synthesize(text, speaker=SPEAKER)
            payload, metadata = compose([(text, speech[text]) for text in parts])
            duration = check_wav(payload)
            (staging / filename).write_bytes(payload)
            manifest["recordings"][filename] = {
                "sha256": digest(payload), "transcript_sha256": digest(transcript.encode()),
                "duration_seconds": duration,
                "parts": metadata,
            }
        (staging / MANIFEST_NAME).write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
        check_bundle(staging)
        # Nothing is replaced until every generated recording passes validation.
        directory.mkdir(exist_ok=True)
        names = [*expected, MANIFEST_NAME]
        previous = {name: (directory / name).read_bytes() if (directory / name).exists() else None for name in names}
        published = []
        try:
            for name in names:
                (staging / name).chmod(0o644)
                (staging / name).replace(directory / name)
                published.append(name)
        except OSError:
            for name in published:
                if previous[name] is None:
                    (directory / name).unlink()
                else:
                    (directory / name).write_bytes(previous[name])
            raise
    print(f"Published {len(expected)} Qwen recordings in {directory}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="Regenerate and replace the whole current set")
    parser.add_argument("--check", action="store_true", help="Validate bundled WAVs and provenance; no inference")
    parser.add_argument("--output-dir", type=Path, default=AUDIO_DIR)
    args = parser.parse_args()
    try:
        if args.check:
            check_bundle(args.output_dir)
            print("Verified all 16 Qwen DDS recordings and their provenance.")
        else:
            generate(args.output_dir, force=args.force)
    except (ValueError, KeyError, OSError, wave.Error) as error:
        parser.exit(1, f"DDS audio: {error}\n")


if __name__ == "__main__":
    main()
