"""Check uncached native synthesis without network, database or lesson data."""
import io
import os
import tempfile
import wave

from backend.core.tts_v2 import QwenTTSV2


def main():
    if os.getenv('TTS_ENABLED', 'true').strip().lower() not in {'true', '1', 'yes', 'on'}:
        print('TTS explicitly disabled; synthesis check skipped.')
        return
    with tempfile.TemporaryDirectory() as cache:
        audio = QwenTTSV2(cache_dir=cache).synthesize('Проверка связи.')
        with wave.open(io.BytesIO(audio), 'rb') as wav:
            if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, 8000):
                raise RuntimeError('TTS must produce PCM16 mono WAV at 8000 Hz')
            if wav.getnframes() <= 0:
                raise RuntimeError('TTS produced an empty WAV')
    print('Qwen TTS passed: PCM16, mono, 8000 Hz; no lesson data was used.')


if __name__ == '__main__':
    main()
