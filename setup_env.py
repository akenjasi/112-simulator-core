#!/usr/bin/env python3
import os
import shutil
from pathlib import Path

def setup_models():
    project_root = Path(__file__).resolve().parent
    models_dir = project_root / 'data' / 'models'
    
    # Create models directory
    models_dir.mkdir(parents=True, exist_ok=True)
    
    models_needed = {
        'Qwen3.5-9B-Q4_K_M.gguf': Path('/home/orborus/Downloads/Qwen3.5-9B-Q4_K_M.gguf'),
        'gigaam-v3-ctc-Q8_0.gguf': Path('/home/orborus/Desktop/A_vibecoding/models/gigaam-v3-ctc-Q8_0.gguf')
    }
    
    missing_models = []
    
    print(f"Checking models in {models_dir}...")
    for model_name, user_path in models_needed.items():
        target_path = models_dir / model_name
        if target_path.exists():
            print(f"✅ Model {model_name} already exists in data/models/.")
            continue
            
        if user_path.exists():
            print(f"Copying {model_name} from {user_path} to {target_path}...")
            shutil.copy2(user_path, target_path)
            print(f"✅ Done copying {model_name}.")
        else:
            missing_models.append(model_name)
            
    if missing_models:
        print("\n❌ Some models are missing:")
        for m in missing_models:
            print(f"- {m}")
        print("\nPlease download them to data/models/ manually.")
        print("Download links:")
        if 'Qwen3.5-9B-Q4_K_M.gguf' in missing_models:
            print("- Qwen3.5-9B-Q4_K_M.gguf: https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf?download=true")
        if 'gigaam-v3-ctc-Q8_0.gguf' in missing_models:
            print("- gigaam-v3-ctc-Q8_0.gguf: https://huggingface.co/salute-developers/GigaAM/resolve/main/gigaam-v3-ctc-Q8_0.gguf?download=true")

if __name__ == "__main__":
    setup_models()
