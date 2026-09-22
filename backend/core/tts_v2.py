import io
import os
import re
import hashlib
import torch
torch.set_num_threads(4)
import soundfile as sf
import numpy as np
from typing import Optional, List


class SileroTTSV2:
    def __init__(self, cache_dir: Optional[str] = None):
        self.device = torch.device('cpu')
        self.model = None
        if cache_dir is None:
            base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
            self.cache_dir = os.path.join(base_dir, "data", "tts_cache")
        else:
            self.cache_dir = cache_dir

        try:
            os.makedirs(self.cache_dir, exist_ok=True)
        except Exception as e:
            print(f"[SileroTTSV2] Warning: Could not create cache directory {self.cache_dir}: {e}")

    def load(self):
        if self.model is None:
            print("[SileroTTSV2] Loading v5_ru/v4_ru model via PyTorch Hub...")
            # Snakers4 standard signature for v4/v5 Russian
            self.model, _ = torch.hub.load(
                repo_or_dir='snakers4/silero-models',
                model='silero_tts',
                language='ru',
                speaker='v4_ru',
                trust_repo=True
            )
            self.model.to(self.device)
            # Warm up
            self.model.apply_tts(text="Тест", speaker='aidar', sample_rate=24000)
            print("[SileroTTSV2] Model loaded and warmed up.")

    def normalize_text(self, text: str) -> str:
        if not text:
            return ""
        text = re.sub(r'(?i)\bул\.(?=\S)', 'улица ', text)
        text = re.sub(r'(?i)\bул\.', 'улица', text)
        text = re.sub(r'(?i)\bд\.(?=\S)', 'дом ', text)
        text = re.sub(r'(?i)\bд\.', 'дом', text)
        return text

    def synthesize(self, text: str, speaker: str = 'aidar') -> bytes:
        # Calculate MD5 cache key
        cache_key = hashlib.md5((text + speaker).encode('utf-8')).hexdigest()
        cache_file = os.path.join(self.cache_dir, f"{cache_key}.wav")

        # Check cache
        try:
            if os.path.exists(cache_file):
                with open(cache_file, "rb") as f:
                    audio_bytes = f.read()
                if audio_bytes:
                    return audio_bytes
        except Exception as e:
            print(f"[SileroTTSV2] Error reading cache file {cache_file}: {e}, falling back to synthesis")

        # Fall back to synthesis
        if self.model is None:
            self.load()

        # Optional: Add SSML or clean up text
        text_clean = self.normalize_text(text).replace('\n', ' ')

        # apply_tts generates a 1D tensor
        audio_tensor = self.model.apply_tts(
            text=text_clean,
            speaker=speaker,
            sample_rate=24000
        )

        audio_np = audio_tensor.numpy()

        # --- ТЕЛЕФОННЫЙ ЭФФЕКТ (Маскировка под рацию/ДДС) ---
        try:
            from scipy.signal import butter, lfilter
            # 1. Bandpass filter 300 - 3400 Hz (стандартный телефонный канал)
            nyq = 0.5 * 24000
            b, a = butter(4, [300.0 / nyq, 3400.0 / nyq], btype='band')
            audio_np = lfilter(b, a, audio_np)

            # 2. Искажение (Перегруз сети / GSM артефакты)
            audio_np = np.tanh(audio_np * 3.0) * 0.7

            # 3. Легкий белый шум (радиоэфир)
            noise = np.random.normal(0, 0.015, len(audio_np))
            audio_np = audio_np + noise
        except ImportError:
            print("[SileroTTSV2] Scipy not installed, skipping DSP filters.")

        # Фикс перегруза (пиков/щелчков): нормализация
        max_amp = np.max(np.abs(audio_np))
        if max_amp > 1.0:
            audio_np = audio_np / max_amp
        audio_np = np.clip(audio_np, -1.0, 1.0)

        # Save to buffer
        buf = io.BytesIO()
        sf.write(buf, audio_np, 24000, format='WAV', subtype='PCM_16')
        audio_bytes = buf.getvalue()

        # Save to cache
        try:
            os.makedirs(self.cache_dir, exist_ok=True)
            with open(cache_file, "wb") as f:
                f.write(audio_bytes)
        except Exception as e:
            print(f"[SileroTTSV2] Error writing cache file {cache_file}: {e}")

        return audio_bytes

    def concatenate_tts(self, texts: list[str], speaker: str = 'aidar', silence_ms: int = 200) -> bytes:
        if not texts:
            buf = io.BytesIO()
            sf.write(buf, np.zeros(0, dtype=np.float32), 24000, format='WAV', subtype='PCM_16')
            return buf.getvalue()

        silence_samples = int(24000 * (max(0, silence_ms) / 1000.0))
        silence = np.zeros(silence_samples, dtype=np.float32)

        audio_pieces = []
        for text in texts:
            text_str = str(text).strip()
            if not text_str:
                continue
            wav_bytes = self.synthesize(text_str, speaker=speaker)
            with io.BytesIO(wav_bytes) as f:
                data, _ = sf.read(f, dtype='float32')
            if len(data) > 0:
                if audio_pieces and silence_samples > 0:
                    audio_pieces.append(silence)
                audio_pieces.append(data)

        if not audio_pieces:
            buf = io.BytesIO()
            sf.write(buf, np.zeros(0, dtype=np.float32), 24000, format='WAV', subtype='PCM_16')
            return buf.getvalue()

        final_audio = np.concatenate(audio_pieces)
        buf = io.BytesIO()
        sf.write(buf, final_audio, 24000, format='WAV', subtype='PCM_16')
        return buf.getvalue()


tts_engine_v2 = SileroTTSV2()
tts_engine = tts_engine_v2

__all__ = ["SileroTTSV2", "tts_engine_v2", "tts_engine"]
