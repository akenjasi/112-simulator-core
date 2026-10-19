import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
sys.path.append(str(PROJECT_ROOT))
from backend.core.tts_v2 import tts_engine_v2

output_dir = PROJECT_ROOT / "frontend/public/audio/tts"
os.makedirs(output_dir, exist_ok=True)

phrases = {
    "fire_reply": ("Пожарная охрана, ... радиотелефонист Иванова Мария Сергеевна, ... слушаю.", "baya"),
    "fire_accepted": ("Информацию, ... приняла.", "baya"),
    "police_reply": ("Дежурная часть полиции, ... майор Смирнов Петр Алексеевич, ... слушаю.", "aidar"),
    "police_accepted": ("Информацию, ... принял.", "aidar"),
    "ambulance_reply": ("Станция скорой медицинской помощи, ... диспетчер Соколова Анна Юрьевна, ... слушаю.", "kseniya"),
    "ambulance_accepted": ("Информацию, ... приняла.", "kseniya"),
    "gas_reply": ("Аварийная служба газа, ... мастер Петров Иван Васильевич, ... слушаю.", "eugene"),
    "gas_accepted": ("Информацию, ... принял.", "eugene"),
    "generic_reply": ("Дежурный диспетчер, ... слушаю.", "baya"),
    "generic_accepted": ("Информацию, ... приняла.", "baya"),
}

for name, (text, speaker) in phrases.items():
    print(f"Generating {name}...")
    audio_bytes = tts_engine_v2.concatenate_tts([text], speaker=speaker)
    with open(f"{output_dir}/{name}.wav", "wb") as f:
        f.write(audio_bytes)
print("Done!")
