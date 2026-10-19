"""Prepare the bundled Russian phone recordings once, outside application startup.

Requires espeak-ng. Run: python -m backend.scripts.speech.generate_dds_phone_audio
Existing recordings are preserved unless --force is explicitly supplied.
"""
import argparse
import subprocess

from backend.core.dds_phone_catalog import AUDIO_DIR, recordings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    for filename, transcript in recordings().items():
        target = AUDIO_DIR / filename
        if target.exists() and not args.force:
            continue
        subprocess.run(["espeak-ng", "-v", "ru", "-s", "145", "-w", str(target), transcript], check=True)
        print(filename)


if __name__ == "__main__":
    main()
