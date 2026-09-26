import io
import os
import re
import uuid
import hashlib
import tempfile
import subprocess
import num2words
from pathlib import Path
from typing import Optional, List


def normalize_phone_number(match):
    digits = re.sub(r"\D", "", match.group(0))
    if len(digits) == 11 and digits.startswith(("7", "8")):
        code = digits[1:4]
        part1 = digits[4:7]
        part2 = digits[7:9]
        part3 = digits[9:11]
        
        c_words = num2words.num2words(int(code), lang='ru')
        p1_words = num2words.num2words(int(part1), lang='ru')
        p2_words = num2words.num2words(int(part2), lang='ru')
        p3_words = num2words.num2words(int(part3), lang='ru') if int(part3) >= 10 else f"ноль {num2words.num2words(int(part3), lang='ru')}"
        
        return f"плюс семь, {c_words}, {p1_words}, {p2_words}, {p3_words}"
    return match.group(0)


def normalize_text_v2(text: str) -> str:
    # 1. Адреса и сокращения
    replacements = [
        (r"\bш\.", "шоссе"),
        (r"\bул\.", "улица"),
        (r"\bпр-кт\b|\bпросп\.", "проспект"),
        (r"\bпер\.", "переулок"),
        (r"\bд\.\s*", "дом "),
        (r"\bкорп\.\s*", "корпус "),
        (r"\bстр\.\s*", "строение "),
        (r"\bпод\.\s*", "подъезд "),
        (r"\bэт\.\s*", "этаж "),
        (r"\bкв\.\s*", "квартира "),
    ]
    for pattern, repl in replacements:
        text = re.sub(pattern, repl, text, flags=re.IGNORECASE)

    # Дробные дома
    def replace_fraction(m):
        n1 = num2words.num2words(int(m.group(1)), lang='ru')
        n2 = num2words.num2words(int(m.group(2)), lang='ru')
        return f"{n1}, дробь {n2}"
    text = re.sub(r"\b(\d+)/(\d+)\b", replace_fraction, text)

    # Одиночные числа в адресах
    def replace_nums(m):
        prefix = m.group(1)
        num = int(m.group(2))
        return f"{prefix} {num2words.num2words(num, lang='ru')}"
    text = re.sub(r"(дом|корпус|строение|подъезд|этаж|квартира)\s+(\d+)", replace_nums, text, flags=re.IGNORECASE)

    # Телефоны
    phone_pattern = r"(\+?[78][\s\-\(]*\d{3}[\s\-\)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2})"
    text = re.sub(phone_pattern, normalize_phone_number, text)

    # 2. Ударение через акут ˊ (U+02CA)
    acute_mod = "\u02ca"
    text = re.sub(r"\bзамок\b", f"замо{acute_mod}к", text, flags=re.IGNORECASE)

    return text


class QwenTTSV2:
    def __init__(self, cache_dir: Optional[str] = None):
        base_dir = Path(__file__).parent.parent.parent
        if cache_dir is None:
            self.cache_dir = base_dir / "data" / "tts_cache"
        else:
            self.cache_dir = Path(cache_dir)
            
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Paths for Qwen TTS
        self.qwen_dir = Path(__file__).parent / "qwen_tts"
        self.bin_path = self.qwen_dir / "qwen-tts"
        self.tokenizer_path = self.qwen_dir / "models" / "qwen-tokenizer-12hz-Q4_K_M.gguf"
        self.model_path = self.qwen_dir / "models" / "qwen-talker-0.6b-base-Q4_K_M.gguf"
        self.voices_dir = self.qwen_dir / "voices" / "references"
        
        # Speaker mapping (silero names to our references)
        self.speaker_map = {
            "aidar": "male_1_dmitri.wav",
            "baya": "female_1_irina.wav",
            "xenia": "female_3_jenny.wav",
            "kseniya": "female_3_jenny.wav",
            "eugene": "male_2_denis.wav"
        }
        self.default_speaker = "female_1_irina.wav"

    def synthesize(self, text: str, speaker: str = 'aidar') -> bytes:
        if not text.strip():
            return bytes()
            
        text_clean = normalize_text_v2(text)
        
        if not text_clean.strip():
            return bytes()
            
        # Get voice ref
        ref_file = self.speaker_map.get(speaker, self.default_speaker)
        ref_path = self.voices_dir / ref_file
        if not ref_path.exists():
            ref_path = self.voices_dir / self.default_speaker

        cache_key = hashlib.md5((text_clean + str(ref_path.name)).encode('utf-8')).hexdigest()
        cache_file = self.cache_dir / f"{cache_key}_112.wav"
        
        try:
            if cache_file.exists():
                return cache_file.read_bytes()
        except Exception:
            pass
            
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_dir_path = Path(temp_dir)
            raw_wav = temp_dir_path / "raw.wav"
            processed_wav = temp_dir_path / "processed.wav"
            
            env = os.environ.copy()
            env["OMP_NUM_THREADS"] = str(os.environ.get("TTS_THREADS", os.cpu_count()))
            
            cmd_tts = [
                str(self.bin_path),
                "--model", str(self.model_path),
                "--codec", str(self.tokenizer_path),
                "--lang", "Russian",
                "--ref-wav", str(ref_path),
                "-o", str(raw_wav)
            ]
            
            subprocess.run(cmd_tts, input=text_clean, text=True, check=True, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            # Apply phone fx
            noise_level = 0.0035
            cutoff_low = 300
            cutoff_high = 3400
            sample_rate = 8000
            
            filter_complex = (
                f"[0:a]highpass=f={cutoff_low},lowpass=f={cutoff_high},"
                f"acompressor=threshold=-18dB:ratio=4:attack=5:release=50[voice]; "
                f"anoisesrc=d=60:c=pink:r=24000:a={noise_level},"
                f"highpass=f={cutoff_low},lowpass=f={cutoff_high}[noise]; "
                f"[voice][noise]amix=inputs=2:duration=first:weights=1 0.4[out]"
            )
            
            cmd_ffmpeg = [
                "ffmpeg", "-y",
                "-i", str(raw_wav),
                "-filter_complex", filter_complex,
                "-map", "[out]",
                "-ar", str(sample_rate),
                "-ac", "1",
                "-c:a", "pcm_alaw",
                str(processed_wav)
            ]
            
            subprocess.run(cmd_ffmpeg, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            audio_bytes = processed_wav.read_bytes()
            
            try:
                cache_file.write_bytes(audio_bytes)
            except Exception:
                pass
                
            return audio_bytes

    def concatenate_tts(self, texts: list[str], speaker: str = 'aidar', silence_ms: int = 200) -> bytes:
        if not texts:
            return bytes()
            
        full_text = " ".join(t.strip() for t in texts if t.strip())
        if not full_text:
            return bytes()
            
        return self.synthesize(full_text, speaker=speaker)

tts_engine_v2 = QwenTTSV2()
tts_engine = tts_engine_v2

__all__ = ["QwenTTSV2", "tts_engine_v2", "tts_engine"]
