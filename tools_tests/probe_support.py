"""Disposable infrastructure probes; never execute application services."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]


def clean_env():
    env = os.environ.copy()
    for key in list(env):
        if key.startswith(("IMBA_", "PROBE_", "DDS_")) or key in {
            "DATABASE_URL", "SECRET_KEY", "TESTING", "PYTHONPATH", "PYTEST_ADDOPTS",
            "PYTEST_CURRENT_TEST", "VIRTUAL_ENV", "DOCKER_BUILD",
        }:
            env.pop(key, None)
    env.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", PYTEST_DISABLE_PLUGIN_AUTOLOAD="1")
    return env


def executable(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    path.chmod(0o755)


def copy_scripts(destination):
    if (ROOT / "scripts").exists():
        shutil.copytree(ROOT / "scripts", destination / "scripts",
                        ignore=shutil.ignore_patterns("__pycache__"))
    for path in (ROOT / "tests").rglob("*.py"):
        target = destination / path.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("# Placeholder in a disposable command-dispatch probe.\n")
    (destination / "frontend_react").mkdir(exist_ok=True)
    for name in ("package.json", "package-lock.json"):
        shutil.copy2(ROOT / "frontend_react" / name, destination / "frontend_react" / name)


def runner_project(tmp_path):
    project = tmp_path / "runner-project"
    project.mkdir()
    copy_scripts(project)
    trace = tmp_path / "dispatch.jsonl"
    reports = tmp_path / "reports"
    reports.mkdir()
    probe = tmp_path / "probe.py"
    controls = tmp_path / "probe-controls.json"
    probe.write_text(f"TRACE={str(trace)!r}\nCONTROLS={str(controls)!r}\n" + '''import json, os, pathlib, sys, time
stage = sys.argv[1]
settings = json.loads(pathlib.Path(CONTROLS).read_text()) if pathlib.Path(CONTROLS).exists() else {}
row = {"stage": stage, "argv": sys.argv[2:], "cwd": os.getcwd(), "pid": os.getpid(),
       "database_url": os.getenv("DATABASE_URL"), "secret_key": os.getenv("SECRET_KEY"),
       "testing": os.getenv("TESTING"), "hf_offline": os.getenv("HF_HUB_OFFLINE"),
       "transformers_offline": os.getenv("TRANSFORMERS_OFFLINE"), "docker_build": os.getenv("DOCKER_BUILD")}
with open(TRACE, "a") as f:
    f.write(json.dumps(row) + "\\n")
print("probe-stage:" + stage, flush=True)
if settings.get("sleep_stage", os.getenv("PROBE_SLEEP_STAGE")) == stage:
    time.sleep(30)
if settings.get("fail_stage", os.getenv("PROBE_FAIL_STAGE")) == stage:
    print("controlled-stage-failure:" + stage, file=sys.stderr)
    sys.exit(23)
''')
    bins = tmp_path / "bin"
    bins.mkdir()
    prefix = f"#!{sys.executable}\nimport os, sys\nREAL={sys.executable!r}\nPROBE={str(probe)!r}\n"
    dispatch = '''args=sys.argv[1:]
if args[:2] == ["-m", "pytest"]:
    kind="backend-all" if "tests" in args or "tests/" in args else "backend-core"
    os.execv(REAL, [REAL, PROBE, kind, *args])
os.execv(REAL, [REAL, *args])
'''
    for name in ("python", "python3"):
        executable(bins / name, prefix + dispatch)
    # Also intercept a helper using subprocess([sys.executable, '-m', 'pytest']).
    # The disposable project intentionally shadows pytest, not the real repo.
    (project / "pytest.py").write_text(
        "import os, sys\n" + f"REAL={sys.executable!r}\nPROBE={str(probe)!r}\n" +
        '''def console_main():
    args=sys.argv[1:]
    kind="backend-all" if "tests" in args or "tests/" in args else "backend-core"
    os.execv(REAL, [REAL, PROBE, kind, *args])
if __name__ == "__main__":
    console_main()
''')
    executable(bins / "pytest", prefix + '''args=sys.argv[1:]
kind="backend-all" if "tests" in args or "tests/" in args else "backend-core"
os.execv(REAL, [REAL, PROBE, kind, *args])
''')
    executable(bins / "npm", prefix + '''args=sys.argv[1:]
if not args:
    sys.exit(89)
name=args[1] if args[0]=="run" and len(args)>1 else args[0]
stage={"test":"frontend-tests", "typecheck":"typecheck", "build":"frontend-build"}.get(name)
if stage is None:
    print("Unexpected npm command in verification runner", file=sys.stderr)
    sys.exit(89)
os.execv(REAL, [REAL, PROBE, stage, *args])
''')
    executable(project / "frontend_react/node_modules/.bin/tsc", prefix +
               'os.execv(REAL, [REAL, PROBE, "typecheck", *sys.argv[1:]])\n')
    env = clean_env()
    env.update(PATH=str(bins) + os.pathsep + env["PATH"], PROBE_TRACE=str(trace),
               IMBA_VERIFY_REPORT_DIR=str(reports), SECRET_KEY="INHERITED_SECRET_MUST_NOT_BE_USED")
    return project, env, trace, reports


def rows(trace):
    return [json.loads(line) for line in trace.read_text().splitlines()] if trace.exists() else []


def run_runner(project, env, mode=None, cwd=None):
    (project.parent / "probe-controls.json").write_text(json.dumps({
        "fail_stage": env.get("PROBE_FAIL_STAGE"), "sleep_stage": env.get("PROBE_SLEEP_STAGE")}))
    command = ["bash", str(project / "scripts/verify_build.sh")]
    if mode is not None:
        command.append(mode)
    return subprocess.run(command, cwd=cwd or project, env=env, text=True,
                          capture_output=True, timeout=20)


def synthetic_backend_project(tmp_path):
    project = tmp_path / "direct-project"
    project.mkdir()
    copy_scripts(project)
    shutil.copy2(ROOT / "tests/conftest.py", project / "tests/conftest.py")
    # Production code is never imported, even if the guard is broken.
    modules = {
        "backend/__init__.py": "",
        "backend/core/__init__.py": "",
        "backend/models/__init__.py": "",
        "backend/main.py": "app = object()\n",
        "backend/models/base.py": "from sqlalchemy.orm import declarative_base\nBase=declarative_base()\n",
        "backend/models/domain_01.py": "class User: pass\n",
        "backend/core/security.py": "def create_access_token(*a, **k): return 'probe'\ndef hash_password(p): return p\n",
        "backend/database.py": '''import json, os
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
Path(os.environ["PROBE_IMPORT"]).write_text(json.dumps({
    "url":os.getenv("DATABASE_URL"), "key":os.getenv("SECRET_KEY"),
    "testing":os.getenv("TESTING"), "offline":os.getenv("HF_HUB_OFFLINE"),
    "transformers_offline":os.getenv("TRANSFORMERS_OFFLINE")}))
# In-memory only: a failed guard must not connect to the supplied address.
engine=create_async_engine("sqlite+aiosqlite:///:memory:")
AsyncSessionLocal=async_sessionmaker(engine)
''',
        "tests/test_probe.py": "def test_probe():\n    assert True\n",
        "pytest.ini": "[pytest]\npythonpath = .\nasyncio_mode = auto\n",
    }
    for name, source in modules.items():
        target = project / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(source)
    marker = tmp_path / "backend-import.json"
    env = clean_env()
    env.update(PROBE_IMPORT=str(marker), SECRET_KEY="DIRECT_INHERITED_SECRET")
    return project, env, marker


def direct_pytest(project, env, collect=False):
    cmd = [sys.executable, "-m", "pytest", "-p", "pytest_asyncio.plugin", "-q", "tests/test_probe.py"]
    if collect:
        cmd.append("--collect-only")
    return subprocess.run(cmd, cwd=project, env=env, text=True, capture_output=True, timeout=20)
