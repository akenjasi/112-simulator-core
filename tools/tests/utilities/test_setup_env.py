"""Fail before image builds on invalid effective settings; never disclose secrets."""
from copy import deepcopy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3]


class ComposeSettingsTests(unittest.TestCase):
    def setUp(self):
        self.config = {'services': {
            'backend': {'environment': {
                'SECRET_KEY': 'synthetic-unique-value-' + 'a' * 40,
                'INITIAL_ADMIN_PASSWORD': 'synthetic-admin-password',
            }},
            'postgres': {'environment': {
                'POSTGRES_USER': 'admin', 'POSTGRES_PASSWORD': 'synthetic-db-password',
                'POSTGRES_DB': 'existing_database',
            }},
        }}

    def check(self, config):
        return subprocess.run([sys.executable, str(ROOT / 'tools/setup_env.py'), '--check-compose'],
                              input=json.dumps(config), text=True, capture_output=True, timeout=10)

    def test_valid_existing_installation_keeps_legacy_role_and_hides_secrets(self):
        result = self.check(self.config)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('synthetic-', result.stdout + result.stderr)

    def test_invalid_secret_is_rejected_without_echoing_its_value(self):
        for secret in ('', 'too-short', 'change-me-' + 'a' * 40, 'dev-secret-' + 'a' * 40):
            with self.subTest(secret=secret):
                config = deepcopy(self.config)
                config['services']['backend']['environment']['SECRET_KEY'] = secret
                result = self.check(config)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('SECRET_KEY', result.stderr)
                if secret:
                    self.assertNotIn(secret, result.stdout + result.stderr)

    def test_missing_passwords_are_reported_before_startup(self):
        self.config['services']['backend']['environment']['INITIAL_ADMIN_PASSWORD'] = ''
        self.config['services']['postgres']['environment']['POSTGRES_PASSWORD'] = ''
        result = self.check(self.config)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('POSTGRES_PASSWORD', result.stderr)

    def test_existing_accounts_do_not_require_bootstrap_password(self):
        self.config['services']['backend']['environment']['INITIAL_ADMIN_PASSWORD'] = ''
        result = self.check(self.config)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('no initial administrator will be created', result.stderr)

    def test_missing_compose_config_is_not_treated_as_success(self):
        result = self.check({})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Cannot read Compose configuration', result.stderr)

    def run_make(self, directory, target, config):
        root = Path(directory)
        (root / 'tools').mkdir(exist_ok=True)
        shutil.copyfile(ROOT / 'Makefile', root / 'Makefile')
        shutil.copyfile(ROOT / 'tools/setup_env.py', root / 'tools/setup_env.py')
        binary = root / 'bin'
        binary.mkdir(exist_ok=True)
        docker = binary / 'docker'
        docker.write_text(
            f'#!{sys.executable}\nimport json,os,sys\n'
            'with open(os.environ["DOCKER_TRACE"],"a") as f: f.write(json.dumps(sys.argv[1:])+"\\n")\n'
            'if "config" in sys.argv: print(os.environ["COMPOSE_FIXTURE"])\n')
        docker.chmod(0o755)
        env = {k: v for k, v in os.environ.items() if k not in {
            'MAKEFLAGS', 'MFLAGS', 'MAKELEVEL', 'MAKEOVERRIDES', 'MAKEFILES',
            'WITH_LLM', 'LLM_ENV_FILE', 'VENV', 'ENV_FILE', 'PROJECT'}}
        env.update(PATH=str(binary) + os.pathsep + env['PATH'],
                   DOCKER_TRACE=str(root / 'trace.jsonl'), COMPOSE_FIXTURE=json.dumps(config))
        result = subprocess.run(['make', '--no-print-directory', '-f', str(root / 'Makefile'), target],
                                cwd=root, env=env, text=True, capture_output=True, timeout=15)
        calls = [json.loads(line) for line in (root / 'trace.jsonl').read_text().splitlines()]
        return result, calls

    def test_make_refuses_invalid_settings_before_build_or_start(self):
        self.config['services']['backend']['environment']['SECRET_KEY'] = 'invalid'
        for target in ('up', 'up-prod'):
            with self.subTest(target=target), tempfile.TemporaryDirectory(prefix='env-check-') as directory:
                result, calls = self.run_make(directory, target, self.config)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('SECRET_KEY', result.stderr)
                self.assertTrue(all('up' not in args and 'build' not in args for args in calls))

    def test_make_checks_the_matching_overlay_before_starting(self):
        for target, overlay in (('up', 'dev.yml'), ('up-prod', 'prod.yml')):
            with self.subTest(target=target), tempfile.TemporaryDirectory(prefix='env-check-') as directory:
                result, calls = self.run_make(directory, target, self.config)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(len(calls), 2)
                self.assertIn('config', calls[0])
                self.assertIn('up', calls[1])
                self.assertTrue(all(any(arg.endswith('/' + overlay) for arg in call) for call in calls))


if __name__ == '__main__':
    unittest.main()
