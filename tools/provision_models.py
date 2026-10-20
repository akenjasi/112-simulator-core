#!/usr/bin/env python3
"""Provision pinned local models before launch/packaging; never called by the app."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads(Path(__file__).with_name('models.json').read_text())
DEFAULT_LLM = ROOT / 'models' / 'llm' / MANIFEST['report']['name']
DEFAULT_TTS = ROOT / 'data' / 'tts_models'


def rooted(value):
    path = Path(value).expanduser()
    return (ROOT / path).resolve() if not path.is_absolute() else path.resolve()


def validate(path, spec=None):
    if not path.is_file():
        raise ValueError(f'Missing model: {path}')
    with path.open('rb') as stream:
        if stream.read(4) != b'GGUF':
            raise ValueError(f'Not a GGUF file: {path}')
        if spec:
            stream.seek(0)
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
            if path.stat().st_size != spec['size'] or digest != spec['sha256']:
                raise ValueError(f'Size/SHA-256 mismatch: {path}; file preserved, replace it explicitly.')
    if '-of-' in path.name:
        raise ValueError(f'Use a merged, single-file GGUF: {path}')


def ensure(path, spec, download=True):
    if path.exists() or not download or spec is None:
        validate(path, spec)
        print(f'Verified {path}', flush=True)
        return
    new_directory = not path.parent.exists()
    path.parent.mkdir(parents=True, exist_ok=True)
    if new_directory:
        # Packaging runs with umask 077; the container UID must read model binds.
        path.parent.chmod(0o755)
    with Path(str(path) + '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if path.exists():
            validate(path, spec)
            return
        part = Path(str(path) + '.part')
        print(f'Downloading {path.name} ({spec["size"]:,} bytes)', flush=True)
        for attempt in range(6):
            if part.exists() and part.stat().st_size == spec['size']:
                break
            result = subprocess.run([
                'curl', '--fail', '--location', '--show-error', '--progress-bar',
                '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '30',
                '--speed-time', '120', '--speed-limit', '1024', '--continue-at', '-',
                '--output', str(part), spec['url'],
            ])
            if result.returncode == 0:
                break
            if result.returncode not in {5, 6, 7, 16, 18, 22, 28, 35, 52, 55, 56, 92, 95} or attempt == 5:
                raise ValueError(f'Download failed (curl {result.returncode}); saved bytes remain in {part}; rerun to resume.')
            print(f'Download interrupted (curl {result.returncode}); resuming saved bytes, retry {attempt + 1}/5', flush=True)
            time.sleep(2)
        try:
            validate(part, spec)
        except ValueError:
            # This is our invalid transfer, never an operator-supplied ready file.
            part.unlink(missing_ok=True)
            raise
        part.chmod(0o644)
        part.replace(path)
        print(f'Verified {path}', flush=True)


def bind_source(service, target):
    for mount in service.get('volumes', []):
        if isinstance(mount, dict) and mount.get('type') == 'bind' and mount.get('target') == target:
            return rooted(mount['source'])
    raise ValueError(f'No host bind mount for model path {target}')


def provision(args):
    tts_dir = rooted(args.tts_dir)
    llm = rooted(args.llm_model) if args.llm_model else None
    if args.compose:
        llm = None  # Only provision services present in the effective configuration.
        try:
            services = json.load(sys.stdin)['services']
            if not args.only_llm:
                backend = services['backend']
                target = backend.get('environment', {}).get('TTS_MODELS_DIR', '/app/backend/core/qwen_tts/models')
                tts_dir = bind_source(backend, target)
            if 'llm' in services:
                llm = bind_source(services['llm'], '/models/report.gguf')
            elif args.only_llm:
                raise ValueError('No llm service in Compose configuration')
        except (KeyError, TypeError, json.JSONDecodeError):
            raise ValueError('Cannot read resolved Compose model settings; no files downloaded.') from None
    # Preflight every supplied ready file before any network request.
    wanted = [] if args.only_llm else [(tts_dir / MANIFEST[k]['name'], MANIFEST[k]) for k in ('talker', 'tokenizer')]
    if llm:
        wanted.insert(0, (llm, MANIFEST['report'] if llm == DEFAULT_LLM.resolve() else None))
    elif args.only_llm:
        wanted.append((DEFAULT_LLM, MANIFEST['report']))
    for path, spec in wanted:
        if path.exists() or spec is None or args.check or args.no_download:
            validate(path, spec)
    for path, spec in wanted:
        ensure(path, spec, download=not (args.check or args.no_download))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tts-dir', default=os.getenv('TTS_MODELS_DIR') or str(DEFAULT_TTS))
    parser.add_argument('--llm-model', nargs='?', const=str(DEFAULT_LLM))
    parser.add_argument('--only-llm', action='store_true')
    parser.add_argument('--compose', action='store_true', help='Read resolved Compose JSON from stdin')
    parser.add_argument('--check', action='store_true', help='Validate only; no downloads or filesystem writes')
    parser.add_argument('--no-download', action='store_true')
    args = parser.parse_args()
    try:
        provision(args)
    except (ValueError, OSError) as exc:
        parser.exit(1, f'ERROR: {exc}\n')


if __name__ == '__main__':
    main()
