#!/usr/bin/env python3
"""Prepare a private installation env or inspect explicitly supplied model paths."""
import argparse
import json
import os
from pathlib import Path
import secrets
import sys


def check_compose(stream):
    """Validate effective Compose settings without printing any credentials."""
    try:
        config = json.load(stream)
        values = config['services']['backend']['environment']
        if not isinstance(values, dict):
            raise ValueError('Expected resolved Compose environment')
    except (ValueError, KeyError, TypeError):
        raise SystemExit('Cannot read Compose configuration. Check ENV_FILE and run make init for a new installation.')
    errors = []
    secret = str(values.get('SECRET_KEY') or '')
    if len(secret) < 32 or secret.startswith(('change-me', 'dev-secret')):
        errors.append('SECRET_KEY must be a unique random value of at least 32 characters.')
    postgres = config.get('services', {}).get('postgres', {}).get('environment', {})
    for key in ('POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB'):
        if not postgres.get(key):
            errors.append(f'{key} must be set.')
    if errors:
        raise SystemExit('Invalid installation settings:\n' + '\n'.join(errors)
                         + '\nNew installation: make init. Existing database: preserve its actual PostgreSQL credentials; do not regenerate them.')
    if not values.get('INITIAL_ADMIN_PASSWORD'):
        print('INITIAL_ADMIN_PASSWORD is empty: no initial administrator will be created. Existing accounts remain available.', file=sys.stderr)
    print('Installation settings validated. Existing PostgreSQL volumes must use their original database credentials.')


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
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--init', action='store_true', help='Create a new .env with unique installation secrets; never overwrite')
    mode.add_argument('--check-compose', action='store_true', help='Validate resolved Compose JSON from stdin without displaying secrets')
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / '.env')
    parser.add_argument('--models-dir', type=Path, help='Override the model directory for all optional model checks')
    args = parser.parse_args()
    if args.check_compose:
        check_compose(sys.stdin)
        return
    if args.init:
        initialize(args.output)
        return
    for name, directory in [('Qwen3.5-4B-Q4_K_M.gguf', Path('models/llm')),
                            ('gigaam-v3-ctc-Q8_0.gguf', Path('data/models'))]:
        path = (args.models_dir or directory) / name
        print(f'{name}: {"present" if path.is_file() and path.stat().st_size else "missing (optional speech/LLM feature unavailable)"}')
    print('This check does not download models or validate their weights. See docs/operations/deployment.md.')


if __name__ == '__main__':
    main()
