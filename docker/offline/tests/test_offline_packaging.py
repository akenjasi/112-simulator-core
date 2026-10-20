"""Packaging contracts with a recording Docker fake; no images, models or live DB.

Run directly: python3 -m unittest discover -s docker/offline/tests -v
These checks do not claim to execute CPU inference.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3]
FAKE_DOCKER = r'''#!/usr/bin/env python3
import json, os, pathlib, subprocess, sys
a=sys.argv[1:]
with open(os.environ['DOCKER_TRACE'],'a') as f: f.write(json.dumps(a)+'\n')
if a[:2]==['compose','version']: print('Docker Compose version v2.30.0')
elif a[:1]==['info']:
    if '--format' in a: print('linux/x86_64')
elif a[:1]==['build']:
    context=pathlib.Path(a[-1])
    assert (context/'.dockerignore').is_file()
    assert not (context/'.env').exists()
    assert not (context/'data/certs').exists()
    assert not (context/'data/uploads/private.txt').exists()
    assert (context/'models/classifier/model.safetensors').is_file()
    for path in (context/'backend', context/'backend/core', context/'models/classifier'):
        assert path.stat().st_mode & 0o005 == 0o005, 'Container UID cannot traverse source directories'
    assert (context/'backend/main.py').stat().st_mode & 0o004, 'Container UID cannot read source'
    assert (context/'models/classifier/model.safetensors').stat().st_mode & 0o004, 'Container UID cannot read classifier'
    if os.getenv('FAIL_BUILD'): sys.exit(19)
elif a[:2]==['image','inspect']:
    print(os.getenv('FAKE_PLATFORM','linux/amd64') if '{{.Os}}' in ' '.join(a) else 'sha256:synthetic-image')
elif a[:2]==['image','save']:
    pathlib.Path(a[a.index('-o')+1]).write_bytes(b'synthetic Docker image archive')
elif a[:1]==['run'] and '--entrypoint' in a:
    entry=a[a.index('--entrypoint')+1]
    if entry=='python' and 'import secrets' in a[-1]:
        subprocess.run([sys.executable,'-c',a[-1]],check=True)
    elif entry=='python' and 'backend.scripts.speech.check_tts' in a:
        assert a[a.index('--network')+1]=='none'
        assert 'TTS_ENABLED=true' in a
        if os.getenv('FAIL_TTS_RUNTIME'): sys.exit(21)
    elif entry=='openssl':
        mount=a[a.index('--mount')+1]
        source=next(p.removeprefix('source=') for p in mount.split(',') if p.startswith('source='))
        for name in ['server.crt','server.key']: (pathlib.Path(source)/name).write_text('synthetic TLS fixture')
elif a[:1]==['compose'] and 'exec' in a:
    code=a[-1]
    if 'pg_dump' in code: print('-- synthetic read-only SQL dump')
    elif 'SELECT count(*)' in code: print(os.getenv('EXISTING_TABLES','0'))
    elif 'tar' in a: sys.stdout.buffer.write(b'synthetic application data tar')
'''

FAKE_CURL = r'''#!/usr/bin/env python3
import os, pathlib, sys
args=sys.argv[1:]
with open(os.environ['CURL_TRACE'],'a') as f: f.write(repr(args)+'\n')
out=pathlib.Path(args[args.index('--output')+1])
if os.getenv('SSL_EOF_ONCE'):
    marker=pathlib.Path(os.environ['SSL_EOF_ONCE'])
    if not marker.exists():
        marker.touch()
        out.write_bytes(b'GGUFinterrupted')
        sys.exit(56)
    assert out.read_bytes()==b'GGUFinterrupted', 'Retry discarded saved bytes'
if os.getenv('FAIL_DOWNLOAD'):
    out.write_bytes(b'GGUFinterrupted')
    sys.exit(18)
if os.getenv('EXPECT_RESUME'): assert out.read_bytes()==b'GGUFinterrupted'
data=b'GGUFsynthetic pinned Qwen'
out.write_bytes(b'GGUF'+b'X'*(len(data)-4) if os.getenv('CORRUPT_DOWNLOAD') else data)
'''


class OfflinePackagingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="offline-package-tests-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.repo = self.base / "project with spaces"
        self.repo.mkdir()
        self.download_bytes = b"GGUFsynthetic pinned Qwen"
        shutil.copy(ROOT / ".gitignore", self.repo)
        shutil.copy(ROOT / ".dockerignore", self.repo)
        shutil.copytree(ROOT / "docker/offline", self.repo / "docker/offline")
        (self.repo / "tools").mkdir()
        shutil.copy(ROOT / "tools/provision_models.py", self.repo / "tools/provision_models.py")
        manifest = json.loads((ROOT / "tools/models.json").read_text())
        for spec in manifest.values():
            spec.update(size=len(self.download_bytes), sha256=hashlib.sha256(self.download_bytes).hexdigest())
        (self.repo / "tools/models.json").write_text(json.dumps(manifest))
        for key in ("talker", "tokenizer"):
            dest = self.repo / "data/tts_models" / manifest[key]["name"]
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(self.download_bytes)
        for name in ("backend/core/qwen_tts/qwen-tts", "backend/bin/libggml.so.0",
                     "backend/bin/libggml-base.so.0", "backend/bin/libggml-cpu.so.0",
                     *["backend/core/qwen_tts/voices/references/" + name + ".wav" for name in
                       ("male_1_dmitri", "female_1_irina", "female_3_jenny", "male_2_denis")]):
            dest = self.repo / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text("synthetic runtime")
        (self.repo / "docker/scripts").mkdir()
        shutil.copy(ROOT / "docker/scripts/pack_release.sh", self.repo / "docker/scripts/pack_release.sh")
        for name in ("docker/images/backend.Dockerfile", "docker/images/frontend.Dockerfile", "docker/compose/base.yml", "docker/compose/dev.yml"):
            (self.repo / name).parent.mkdir(parents=True, exist_ok=True)
            (self.repo / name).write_text("# synthetic source\n")
        for name in ("backend/main.py", "backend/scripts/speech/check_tts.py", "models/classifier/inference.py", "assets/reference/moscow_112_addresses.json",
                     ".env", "data/certs/server.key", "data/uploads/private.txt"):
            file = self.repo / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text("DO_NOT_EXPORT_LOCAL_SECRET" if name.startswith((".env", "data/certs", "data/uploads")) else "fixture")
        self.git("init", "-q")
        self.git("add", ".")
        self.git("-c", "user.name=Tests", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture")
        # Provisioned classifier weights are deliberately outside Git.
        for name in ("config.json", "model.safetensors", "tokenizer.json", "tokenizer_config.json"):
            (self.repo / "models/classifier" / name).write_text("fixture")
        (self.repo / "models/llm").mkdir()
        self.llm = self.base / "report weights.gguf"
        self.llm.write_bytes(b"GGUFsynthetic report weights")
        self.bin = self.base / "bin"
        self.bin.mkdir()
        (self.bin / "docker").write_text(FAKE_DOCKER)
        (self.bin / "docker").chmod(0o755)
        (self.bin / "curl").write_text(FAKE_CURL)
        (self.bin / "curl").chmod(0o755)
        (self.bin / "sleep").write_text("#!/bin/sh\nexit 0\n")
        (self.bin / "sleep").chmod(0o755)
        self.curl_trace = self.base / "curl.txt"
        self.trace = self.base / "docker.jsonl"
        self.output = self.base / "offline.tar.gz"
        self.work = self.base / "work"
        self.env = {**os.environ, "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
                    "DOCKER_TRACE": str(self.trace), "CURL_TRACE": str(self.curl_trace)}
        self.env.pop("DDS_LLM_MODEL_PATH", None)

    def git(self, *args):
        subprocess.run(["git", *args], cwd=self.repo, check=True, capture_output=True)

    def run_pack(self, *args, env=None, default_model=False, default_work_dir=False):
        model_args = [] if default_model else ["--llm-model", str(self.llm)]
        work_args = [] if default_work_dir else ["--work-dir", str(self.work)]
        return subprocess.run(["bash", str(self.repo / "docker/offline/package.sh"), *model_args,
            "--version", "test-release", "--output", str(self.output),
            *work_args, *args], env=env or self.env, capture_output=True, text=True, timeout=30)

    def calls(self):
        return [json.loads(line) for line in self.trace.read_text().splitlines()] if self.trace.exists() else []

    def unpack(self):
        dest = self.base / "unpacked"
        with tarfile.open(self.output) as archive:
            archive.extractall(dest, filter="data")
        return dest / "simulator112-offline"

    def test_missing_weights_stop_before_docker_or_partial_archive(self):
        self.llm.unlink()
        result = self.run_pack()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Missing model", result.stderr)
        self.assertFalse(any(c[0] in {"build", "pull", "image"} for c in self.calls()))
        self.assertFalse(self.curl_trace.exists())
        self.assertFalse(self.output.exists())

    def test_default_download_is_verified_cached_ignored_and_included(self):
        result = self.run_pack(default_model=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        cached = self.repo / "models/llm/Qwen3.5-4B-Q4_K_M.gguf"
        self.assertEqual(cached.read_bytes(), self.download_bytes)
        self.assertEqual((self.unpack() / "models/report.gguf").read_bytes(), self.download_bytes)
        self.assertIn('/resolve/e87f176479d0855a907a41277aca2f8ee7a09523/', self.curl_trace.read_text())
        checked = self.run_pack("--check", "--output", str(self.base / "unused.tar.gz"), default_model=True)
        self.assertEqual(checked.returncode, 0, checked.stderr)
        self.assertEqual(len(self.curl_trace.read_text().splitlines()), 1)
        for suffix in ("", ".part", ".lock"):
            self.git("check-ignore", str(cached) + suffix)

    def test_interrupted_transfer_resumes_without_creating_archive(self):
        failed = self.run_pack(default_model=True, env={**self.env, "FAIL_DOWNLOAD": "1"})
        self.assertNotEqual(failed.returncode, 0)
        self.assertFalse(self.output.exists())
        self.assertFalse(any(c[0] == "build" for c in self.calls()))
        result = self.run_pack(default_model=True, env={**self.env, "EXPECT_RESUME": "1"})
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("--continue-at", self.curl_trace.read_text())

    def test_corrupt_download_never_enters_cache_or_bundle(self):
        result = self.run_pack(default_model=True, env={**self.env, "CORRUPT_DOWNLOAD": "1"})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SHA-256", result.stderr)
        self.assertFalse(self.output.exists())
        self.assertFalse(list((self.repo / "models").rglob("*.gguf*part")))
        self.assertFalse(any(c[0] == "build" for c in self.calls()))

    def test_ssl_eof_automatically_resumes_with_new_curl_invocation(self):
        result = self.run_pack(default_model=True,
                               env={**self.env, "SSL_EOF_ONCE": str(self.base / "ssl-failed")})
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("curl 56", result.stdout)
        self.assertEqual(len(self.curl_trace.read_text().splitlines()), 2)
        self.assertEqual((self.unpack() / "models/report.gguf").read_bytes(), self.download_bytes)

    def test_completed_partial_is_verified_without_requesting_invalid_range(self):
        part = self.repo / "models/llm/Qwen3.5-4B-Q4_K_M.gguf.part"
        part.parent.mkdir(parents=True, exist_ok=True)
        part.write_bytes(self.download_bytes)
        result = self.run_pack(default_model=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse(self.curl_trace.exists())
        self.assertEqual((self.unpack() / "models/report.gguf").read_bytes(), self.download_bytes)

    def test_check_and_no_download_do_not_fetch_missing_default(self):
        for option in ("--check", "--no-download"):
            result = self.run_pack(option, default_model=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(self.curl_trace.exists())
            self.assertFalse(self.output.exists())

    def test_damaged_cached_default_is_rejected_without_overwriting(self):
        cached = self.repo / "models/llm/Qwen3.5-4B-Q4_K_M.gguf"
        cached.parent.mkdir(parents=True, exist_ok=True)
        cached.write_bytes(b"GGUFdamaged cache")
        result = self.run_pack(default_model=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SHA-256 mismatch", result.stderr)
        self.assertEqual(cached.read_bytes(), b"GGUFdamaged cache")
        self.assertFalse(self.curl_trace.exists())

    def test_check_does_not_build_pull_or_save(self):
        result = self.run_pack("--check")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse(self.output.exists())
        self.assertEqual([c[0] for c in self.calls()], ["info", "compose"])

    def test_default_staging_uses_output_disk_instead_of_tmpdir(self):
        small_tmp = self.base / "small-ram-filesystem"
        result = self.run_pack(default_work_dir=True, env={**self.env, "TMPDIR": str(small_tmp)})
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        builds = [c for c in self.calls() if c[0] == "build"]
        self.assertEqual(len(builds), 2)
        for build in builds:
            self.assertTrue(Path(build[-1]).is_relative_to(self.output.parent / ".work"))
        self.assertFalse(small_tmp.exists())
        self.assertEqual(list((self.output.parent / ".work").iterdir()), [])

    def test_bundle_contains_all_cpu_services_models_and_valid_checksums(self):
        result = self.run_pack()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        bundle = self.unpack()
        self.assertEqual((bundle / "models/report.gguf").read_bytes(), self.llm.read_bytes())
        self.assertFalse((bundle / "models/asr.gguf").exists())
        for name in ("qwen-talker-0.6b-base-Q4_K_M.gguf", "qwen-tokenizer-12hz-Q4_K_M.gguf"):
            self.assertEqual((bundle / "models/tts" / name).read_bytes(), self.download_bytes)
            self.assertEqual((bundle / "models/tts" / name).stat().st_mode & 0o777, 0o644)
        self.assertEqual((bundle / "models/tts").stat().st_mode & 0o777, 0o755)
        self.assertIn('TTS_ENABLED: "${TTS_ENABLED:-true}"', (bundle / "compose.yml").read_text())
        self.assertIn('backend.scripts.speech.check_tts', (bundle / "verify.sh").read_text())
        for line in (bundle / "SHA256SUMS").read_text().splitlines():
            digest, name = line.split("  ", 1)
            self.assertEqual(hashlib.sha256((bundle / name).read_bytes()).hexdigest(), digest)
        self.assertFalse((bundle / ".env").exists())
        self.assertFalse((bundle / "certs").exists())
        self.assertFalse((bundle / "backup").exists())
        compose = (bundle / "compose.yml").read_text()
        self.assertIn('--n-gpu-layers, "0"', compose)
        self.assertNotIn("nvidia", compose)
        self.assertNotIn("build:", compose)
        self.assertIn('ASR_ENABLED: "false"', compose)
        self.assertNotIn("GIGAAM_MODEL_PATH", compose)
        self.assertNotIn("/api/v2/asr", (bundle / "verify.sh").read_text())
        self.assertIn("networks: [ingress, local]", compose)
        saved = next(c for c in self.calls() if c[:2] == ["image", "save"])
        self.assertEqual(saved[-4:], [f"simulator112/{name}:test-release" for name in ["backend", "frontend", "postgres", "llm-cpu"]])
        self.assertTrue((self.output.with_name(self.output.name + ".sha256")).is_file())
        checked = subprocess.run(["sha256sum", "-c", self.output.name + ".sha256"],
            cwd=self.output.parent, capture_output=True, text=True)
        self.assertEqual(checked.returncode, 0, checked.stderr)

    def test_missing_tts_is_downloaded_and_required_even_with_custom_llm(self):
        shutil.rmtree(self.repo / "data/tts_models")
        result = self.run_pack()
        self.assertEqual(result.returncode, 0, result.stderr)
        bundle = self.unpack()
        self.assertEqual(len(list((bundle / "models/tts").glob("*.gguf"))), 2)
        self.assertEqual(len(self.curl_trace.read_text().splitlines()), 2)

    def test_check_and_no_download_require_tts_without_writes_or_network(self):
        shutil.rmtree(self.repo / "data/tts_models")
        for option in ("--check", "--no-download"):
            result = self.run_pack(option)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(self.curl_trace.exists())
            self.assertFalse((self.repo / "data/tts_models").exists())
            self.assertFalse(self.output.exists())

    def test_missing_tts_binary_stops_before_download_and_build(self):
        (self.repo / "backend/core/qwen_tts/qwen-tts").unlink()
        result = self.run_pack()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Missing TTS runtime resource", result.stderr)
        self.assertFalse(self.curl_trace.exists())
        self.assertFalse(any(c[0] == "build" for c in self.calls()))

    def test_failed_native_tts_never_yields_a_ready_archive(self):
        result = self.run_pack(env={**self.env, "FAIL_TTS_RUNTIME": "1"})
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.output.exists())
        self.assertFalse(any(c[:2] == ["image", "save"] for c in self.calls()))

    def test_legacy_release_creates_the_same_complete_archive(self):
        result = subprocess.run(["bash", str(self.repo / "docker/scripts/pack_release.sh"),
                                "--llm-model", str(self.llm), "--version", "legacy", "--output", str(self.output)],
                               env={**self.env, "RELEASE_DIR": str(self.base / "release")},
                               capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        bundle = self.unpack()
        self.assertEqual(len(list((bundle / "models/tts").glob("*.gguf"))), 2)
        self.assertTrue((bundle / "models/report.gguf").is_file())
        self.assertTrue(Path(str(self.output) + ".sha256").is_file())

    def test_live_data_export_is_opt_in_and_read_only(self):
        result = self.run_pack("--with-data", "--source-project", "source_stack")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        bundle = self.unpack()
        self.assertIn("synthetic", (bundle / "backup/database.sql").read_text())
        self.assertTrue((bundle / "backup/app-data.tar").is_file())
        exports = [c for c in self.calls() if c[0] == "compose" and "exec" in c]
        self.assertEqual(len(exports), 2)
        self.assertTrue(all("source_stack" in c for c in exports))
        self.assertFalse(any("stop" in c or "down" in c for c in self.calls()))

    def test_failed_build_cleans_temp_and_never_creates_success_archive(self):
        result = self.run_pack(env={**self.env, "FAIL_BUILD": "1"})
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.output.exists())
        self.assertEqual(list(self.work.iterdir()), [])

    def test_existing_output_is_never_overwritten(self):
        self.output.write_bytes(b"KEEP")
        self.assertNotEqual(self.run_pack().returncode, 0)
        self.assertEqual(self.output.read_bytes(), b"KEEP")
        self.assertEqual(self.calls(), [])

    def test_wrong_image_architecture_is_rejected(self):
        result = self.run_pack(env={**self.env, "FAKE_PLATFORM": "linux/arm64"})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Wrong image platform", result.stderr)
        self.assertFalse(self.output.exists())

    def test_installer_generates_secrets_once_and_does_not_pull_or_build(self):
        result = self.run_pack()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        bundle = self.unpack()
        for _ in range(2):
            installed = subprocess.run(["bash", str(bundle / "install.sh")], env=self.env,
                capture_output=True, text=True, timeout=30)
            self.assertEqual(installed.returncode, 0, installed.stdout + installed.stderr)
            content = (bundle / ".env").read_bytes()
            if _ == 0:
                original = content
            else:
                self.assertEqual(content, original)
        self.assertIn(b"INITIAL_ADMIN_PASSWORD=", content)
        self.assertNotIn(b"DO_NOT_EXPORT_LOCAL_SECRET", content)
        up = [c for c in self.calls() if c[0] == "compose" and "up" in c]
        self.assertTrue(all("--no-build" in c and c[c.index("--pull") + 1] == "never" for c in up))

    def test_installer_rejects_corrupt_weights_before_loading_images(self):
        self.assertEqual(self.run_pack().returncode, 0)
        bundle = self.unpack()
        (bundle / "models/report.gguf").write_bytes(b"CORRUPTED")
        before = len(self.calls())
        installed = subprocess.run(["bash", str(bundle / "install.sh")], env=self.env,
            capture_output=True, text=True, timeout=30)
        self.assertNotEqual(installed.returncode, 0)
        self.assertFalse(any(c[:2] == ["image", "load"] for c in self.calls()[before:]))

    def test_restore_refuses_existing_database_before_writing_any_data(self):
        self.assertEqual(self.run_pack("--with-data", "--source-project", "source_stack").returncode, 0)
        bundle = self.unpack()
        before = len(self.calls())
        installed = subprocess.run(["bash", str(bundle / "install.sh"), "--restore"],
            env={**self.env, "EXISTING_TABLES": "12"}, capture_output=True, text=True, timeout=30)
        self.assertNotEqual(installed.returncode, 0)
        self.assertIn("Refusing to overwrite", installed.stderr)
        calls = self.calls()[before:]
        self.assertFalse(any("ON_ERROR_STOP=1" in " ".join(c) for c in calls))
        self.assertFalse(any(c[0] == "run" and "tar" in c for c in calls))


if __name__ == "__main__":
    unittest.main()
