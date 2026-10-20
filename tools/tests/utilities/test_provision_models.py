"""Exercise transfers, locks and effective mount paths with small GGUF fixtures."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]


class ProvisionModelsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='provision-models-')
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.repo = self.base / 'project with spaces'
        (self.repo / 'tools').mkdir(parents=True)
        self.script = self.repo / 'tools/provision_models.py'
        shutil.copy(ROOT / 'tools/provision_models.py', self.script)
        self.manifest = json.loads((ROOT / 'tools/models.json').read_text())
        self.payloads = {}
        for spec in self.manifest.values():
            payload = b'GGUF' + spec['name'].encode()
            self.payloads[spec['name']] = payload
            spec.update(size=len(payload), sha256=hashlib.sha256(payload).hexdigest())
        (self.repo / 'tools/models.json').write_text(json.dumps(self.manifest))
        self.bin = self.base / 'bin'
        self.bin.mkdir()
        curl = self.bin / 'curl'
        curl.write_text(f'#!{sys.executable}\n' + '''
import json,os,pathlib,sys,time
a=sys.argv[1:]
with open(os.environ['MODEL_TRACE'],'a') as f: f.write(json.dumps(a)+'\\n')
time.sleep(.1)
p=pathlib.Path(a[a.index('--output')+1])
name=a[-1].rsplit('/',1)[1]
p.write_bytes(b'GGUF'+name.encode())
''')
        curl.chmod(0o755)
        self.trace = self.base / 'trace'
        self.env = {k: v for k, v in os.environ.items() if k not in ('DDS_LLM_MODEL_PATH', 'TTS_MODELS_DIR')}
        self.env.update(PATH=str(self.bin) + os.pathsep + os.environ['PATH'], MODEL_TRACE=str(self.trace))

    def run_loader(self, *args, config=None):
        return subprocess.run([sys.executable, str(self.script), *map(str, args)],
                              cwd=self.base, env=self.env, input=json.dumps(config) if config else None,
                              capture_output=True, text=True, timeout=20)

    def test_default_tts_downloads_once_and_validates_cached_files(self):
        result = self.run_loader()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.trace.read_text().splitlines()), 2)
        self.assertEqual(self.run_loader('--check').returncode, 0)
        self.assertEqual(self.run_loader().returncode, 0)
        self.assertEqual(len(self.trace.read_text().splitlines()), 2)
        for spec in (self.manifest['talker'], self.manifest['tokenizer']):
            self.assertEqual((self.repo / 'data/tts_models' / spec['name']).read_bytes(), self.payloads[spec['name']])

    def test_completed_part_is_promoted_without_network(self):
        tts = self.repo / 'data/tts_models'
        tts.mkdir(parents=True)
        for spec in (self.manifest['talker'], self.manifest['tokenizer']):
            (tts / (spec['name'] + '.part')).write_bytes(self.payloads[spec['name']])
        self.assertEqual(self.run_loader().returncode, 0)
        self.assertFalse(self.trace.exists())
        self.assertFalse(list(tts.glob('*.part')))

    def test_concurrent_loaders_share_one_transfer_per_model(self):
        processes = [subprocess.Popen([sys.executable, str(self.script)], cwd=self.base, env=self.env,
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for _ in range(2)]
        for process in processes:
            out, err = process.communicate(timeout=20)
            self.assertEqual(process.returncode, 0, out + err)
        self.assertEqual(len(self.trace.read_text().splitlines()), 2)

    def test_check_is_read_only_and_custom_missing_llm_never_downloads(self):
        for args in (('--check',), ('--no-download',), ('--llm-model', self.base / 'custom.gguf')):
            result = self.run_loader(*args)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(self.trace.exists())
            self.assertFalse((self.repo / 'data').exists())

    def test_corrupt_ready_file_is_preserved_without_downloading_other_weights(self):
        target = self.repo / 'data/tts_models' / self.manifest['tokenizer']['name']
        target.parent.mkdir(parents=True)
        target.write_bytes(b'GGUFbroken')
        result = self.run_loader()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(target.read_bytes(), b'GGUFbroken')
        self.assertFalse(self.trace.exists())

    def test_effective_compose_mounts_override_shell_paths(self):
        tts = self.base / 'chosen tts'
        report = self.base / 'custom report.gguf'
        report.write_bytes(b'GGUFcustom')
        config = {'services': {
            'backend': {'environment': {'TTS_MODELS_DIR': '/weights/tts'}, 'volumes': [
                {'type': 'bind', 'source': str(tts), 'target': '/weights/tts'}]},
            'llm': {'volumes': [{'type': 'bind', 'source': str(report), 'target': '/models/report.gguf'}]},
        }}
        self.env['TTS_MODELS_DIR'] = str(self.base / 'wrong')
        self.env['DDS_LLM_MODEL_PATH'] = str(self.base / 'wrong.gguf')
        result = self.run_loader('--compose', config=config)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(list(tts.glob('*.gguf'))), 2)
        self.assertFalse((self.base / 'wrong').exists())
        self.assertFalse((self.repo / 'data').exists())

    def test_standalone_llm_uses_only_default_4b_without_tts(self):
        config = {'services': {'llm': {'volumes': [{
            'type': 'bind', 'source': str(self.repo / 'models/llm' / self.manifest['report']['name']),
            'target': '/models/report.gguf',
        }]}}}
        result = self.run_loader('--compose', '--only-llm', config=config)
        self.assertEqual(result.returncode, 0, result.stderr)
        requests = self.trace.read_text().splitlines()
        self.assertEqual(len(requests), 1)
        self.assertIn('Qwen3.5-4B', requests[0])
        self.assertNotIn('9B', requests[0])
        self.assertFalse((self.repo / 'data').exists())


if __name__ == '__main__':
    unittest.main()
