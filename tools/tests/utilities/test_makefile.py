"""Exercise the public command surface without starting services or touching data."""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3]


class MakefileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="repository-make-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.project = self.base / "project with spaces"
        self.project.mkdir()
        self.other = self.base / "other working directory"
        self.other.mkdir()
        shutil.copyfile(ROOT / "Makefile", self.project / "Makefile")
        self.trace = self.base / "trace.jsonl"
        self.bin = self.base / "bin"
        self.bin.mkdir()
        self.venv = self.project / ".venv"
        (self.venv / "bin").mkdir(parents=True)
        # Executables record dispatch only; they never install or run an app.
        stub = (f"#!{sys.executable}\nimport json,os,sys\n"
                "with open(os.environ['MAKE_TRACE'],'a') as f:\n"
                " f.write(json.dumps({'command':os.path.basename(sys.argv[0]),'args':sys.argv[1:],'cwd':os.getcwd()})+'\\n')\n"
                "if os.getenv('FAIL_MODELS') and any('provision_models.py' in a for a in sys.argv): sys.exit(27)\n"
                "sys.exit(23 if os.getenv('FAIL_ACCEPTANCE') and sys.argv[1:3]==['-m','pytest'] else 0)\n")
        for path in [self.bin / "docker", self.bin / "npm", self.bin / "python3.11", self.venv / "bin/python", self.venv / "bin/python3"]:
            path.write_text(stub)
            path.chmod(0o755)
        self.envfile = self.base / "private settings.env"
        self.envfile.write_text("SYNTHETIC=1\n")
        # A parent `make test VENV=...` exports command-line overrides to children.
        # Disposable probes must never inherit them and run a real interpreter.
        inherited = {key: value for key, value in os.environ.items() if key not in {
            "MAKEFLAGS", "MFLAGS", "MAKELEVEL", "MAKEOVERRIDES", "MAKEFILES",
            "VENV", "PYTHON", "ENV_FILE", "PROJECT", "WITH_LLM", "LLM_ENV_FILE", "PORT"}}
        self.env = {**inherited, "PATH": f"{self.bin}:{os.environ['PATH']}", "MAKE_TRACE": str(self.trace)}

    def run_make(self, *arguments, **environment):
        command = ["make", "--no-print-directory", "-f", str(self.project / "Makefile"), *arguments]
        process = subprocess.Popen(command, cwd=self.other, env={**self.env, **environment},
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
        try:
            stdout, stderr = process.communicate(timeout=20)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.communicate(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.communicate()
            raise
        return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)

    def calls(self):
        return [json.loads(line) for line in self.trace.read_text().splitlines()] if self.trace.exists() else []

    def test_default_is_help_and_has_no_external_side_effects(self):
        result = self.run_make()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("make backend", result.stdout)
        self.assertEqual(self.calls(), [])

    def test_compose_keeps_explicit_root_env_project_and_volume_safety(self):
        for target, overlay in [("up", "dev.yml"), ("up-prod", "prod.yml"), ("down", "dev.yml"), ("logs", "dev.yml")]:
            result = self.run_make(target, f"ENV_FILE={self.envfile}", "PROJECT=existing_installation")
            self.assertEqual(result.returncode, 0, result.stderr)
            args = self.calls()[-1]["args"]
            self.assertEqual(args[args.index("--project-directory") + 1], str(self.project))
            self.assertEqual(args[args.index("--env-file") + 1], str(self.envfile))
            self.assertEqual(args[args.index("-p") + 1], "existing_installation")
            self.assertIn(str(self.project / f"docker/compose/{overlay}"), args)
            self.assertNotIn("-v", args)
            self.assertNotIn("--volumes", args)

    def test_llm_is_explicit_and_missing_env_stops_before_docker(self):
        self.assertNotEqual(self.run_make("up", "WITH_LLM=1").returncode, 0)
        self.assertEqual(self.calls(), [])
        result = self.run_make("up", "WITH_LLM=1", f"LLM_ENV_FILE={self.envfile}", f"ENV_FILE={self.envfile}")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("llm", self.calls()[-1]["args"])
        self.assertIn(str(self.project / "docker/compose/reports.yml"), self.calls()[-1]["args"])

    def test_models_are_prepared_before_up_and_failure_prevents_start(self):
        result = self.run_make("up", f"ENV_FILE={self.envfile}")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        prepare = next(i for i, c in enumerate(calls) if any("provision_models.py" in a for a in c["args"]))
        start = next(i for i, c in enumerate(calls) if c["command"] == "docker" and "up" in c["args"])
        self.assertLess(prepare, start)
        self.trace.unlink()
        result = self.run_make("up", f"ENV_FILE={self.envfile}", FAIL_MODELS="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(c["command"] == "docker" and "up" in c["args"] for c in self.calls()))

    def test_gpu_runtime_is_rejected_before_any_external_command(self):
        for target in ("up", "up-prod", "models", "llm-up"):
            result = self.run_make(target, "LLM_RUNTIME=gpu")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("GPU access is disabled", result.stderr)
            self.assertEqual(self.calls(), [])

    def test_production_does_not_download_models(self):
        result = self.run_make("up-prod", f"ENV_FILE={self.envfile}")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any(any("provision_models.py" in a for a in c["args"]) for c in self.calls()))

    def test_frontend_backup_and_build_dispatch_from_another_directory(self):
        (self.project / "frontend").mkdir()
        for target in ["frontend", "backup", "build"]:
            result = self.run_make(target)
            self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        self.assertTrue(any(c["command"] == "npm" and c["args"] == ["run", "dev"] and c["cwd"] == str(self.project / "frontend") for c in calls))
        self.assertTrue(any(c["args"] == ["-m", "backend.scripts.db.backup"] and c["cwd"] == str(self.project) for c in calls))
        self.assertEqual(len([c for c in calls if c["command"] == "docker" and c["args"][0] == "build"]), 2)

    def test_prepared_llm_config_follows_up_down_and_logs_without_extra_flags(self):
        local_config = self.project / ".env.llm"
        local_config.write_text("DDS_LLM_MODEL_PATH=/prepared/model.gguf\n")
        for target in ("up", "up-prod", "down", "logs"):
            result = self.run_make(target)
            self.assertEqual(result.returncode, 0, result.stderr)
            args = self.calls()[-1]["args"]
            self.assertIn(str(local_config), args)
            self.assertIn("--profile", args)
            self.assertIn("llm", args)
            self.assertIn(str(self.project / "docker/compose/llm-cpu.yml"), args)
            self.assertIn(str(self.project / "docker/compose/reports.yml"), args)
            self.assertNotIn("--volumes", args)

    def test_prepared_llm_config_can_be_explicitly_disabled(self):
        local_config = self.project / ".env.llm"
        local_config.write_text("DDS_LLM_MODEL_PATH=/prepared/model.gguf\n")
        result = self.run_make("up", "WITH_LLM=0")
        self.assertEqual(result.returncode, 0, result.stderr)
        args = self.calls()[-1]["args"]
        self.assertNotIn(str(local_config), args)
        self.assertNotIn("--profile", args)
        self.assertNotIn(str(self.project / "docker/compose/llm-cpu.yml"), args)

    def test_explicit_external_llm_file_enables_inference(self):
        result = self.run_make("up", f"LLM_ENV_FILE={self.envfile}")
        self.assertEqual(result.returncode, 0, result.stderr)
        args = self.calls()[-1]["args"]
        self.assertIn("llm", args)
        self.assertIn(str(self.project / "docker/compose/llm-cpu.yml"), args)

    def test_install_uses_locks_without_optional_speech_and_init_is_explicit(self):
        (self.project / "frontend").mkdir()
        for target in ["install", "init"]:
            result = self.run_make(target)
            self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        installs = [c["args"] for c in calls if c["args"][:3] == ["-m", "pip", "install"]]
        self.assertEqual(len(installs), 2)
        self.assertTrue(any("--require-hashes" in args and "backend/requirements/runtime.lock" in args for args in installs))
        self.assertFalse(any("speech.txt" in " ".join(args) or "torch" in " ".join(args) for args in installs))
        self.assertTrue(any(c["command"] == "npm" and c["args"] == ["ci", "--ignore-scripts"] for c in calls))
        self.assertTrue(any(c["args"] == [str(self.project / "tools/setup_env.py"), "--init"] for c in calls))

    def test_backend_launcher_resolves_root_without_starting_a_real_server(self):
        launcher = self.project / "backend/scripts/run.sh"
        launcher.parent.mkdir(parents=True)
        shutil.copyfile(ROOT / "backend/scripts/run.sh", launcher)
        result = self.run_make("backend", "PORT=8137")
        self.assertEqual(result.returncode, 0, result.stderr)
        invocation = next(c for c in self.calls() if "uvicorn" in c["args"])
        self.assertEqual(invocation["cwd"], str(self.project))
        self.assertEqual(invocation["args"][invocation["args"].index("--port") + 1], "8137")

    def test_failed_acceptance_does_not_hide_other_suites_or_become_success(self):
        runner = self.project / "tools/quality/verify.sh"
        runner.parent.mkdir(parents=True)
        runner.write_text("#!/bin/sh\nexit 0\n")
        result = self.run_make("test", FAIL_ACCEPTANCE="1")
        self.assertNotEqual(result.returncode, 0)
        calls = self.calls()
        self.assertTrue(any(c["args"][:2] == ["-m", "pytest"] for c in calls))
        discoveries = [c["args"] for c in calls if c["args"][:3] == ["-m", "unittest", "discover"]]
        self.assertEqual(len(discoveries), 2)
        self.assertTrue(any("docker/offline/tests" in args for args in discoveries))
        self.assertTrue(any("tools/tests/utilities" in args for args in discoveries))


if __name__ == "__main__":
    unittest.main()
