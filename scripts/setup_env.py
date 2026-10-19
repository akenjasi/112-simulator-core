#!/usr/bin/env python3
"""Prepare a private installation env or inspect explicitly supplied model paths."""
import argparse
import os
from pathlib import Path
import secrets


def initialize(path):
    template = Path(__file__).resolve().parents[1] / '.env.example'
    values = {'SECRET_KEY': secrets.token_hex(32), 'POSTGRES_PASSWORD': secrets.token_hex(24),
              'INITIAL_ADMIN_PASSWORD': secrets.token_urlsafe(24)}
    lines = []
    for line in template.read_text(encoding='utf-8').splitlines():
        key = line.partition('=')[0]
        lines.append(f'{key}={values[key]}' if key in values else line)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
        output.write('\n'.join(lines) + '\n')
    print(f'Private configuration created: {path}. Credentials are stored only in this file.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--init', action='store_true', help='Create a new .env with unique installation secrets; never overwrite')
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / '.env')
    parser.add_argument('--models-dir', type=Path, default=Path('data/models'))
    args = parser.parse_args()
    if args.init:
        initialize(args.output)
        return
    for name in ['Qwen3.5-9B-Q4_K_M.gguf', 'gigaam-v3-ctc-Q8_0.gguf']:
        path = args.models_dir / name
        print(f'{name}: {"present" if path.is_file() and path.stat().st_size else "missing (optional speech/LLM feature unavailable)"}')
    print('This check does not download models or validate their weights. See docs/operations/deployment.md.')


if __name__ == '__main__':
    main()
