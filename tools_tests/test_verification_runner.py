"""P2 acceptance in disposable projects; no app database or ML imports."""
import concurrent.futures
import json
import os
from pathlib import Path
import signal
import sqlite3
import subprocess
import time

import pytest

from tools_tests.probe_support import (ROOT, direct_pytest, rows, run_runner,
                                      runner_project, synthetic_backend_project)


FRONTEND_STAGES = {"frontend-tests", "typecheck", "frontend-build"}


def private_database(row):
    url = row.get("database_url") or row.get("url")
    assert url and url.startswith("sqlite+aiosqlite:////"), f"Expected explicit absolute private SQLite, got {url!r}"
    path = Path(url.removeprefix("sqlite+aiosqlite:///"))
    assert path.is_absolute() and ".." not in path.parts
    assert path.resolve() != (ROOT / "112_simulator.db").resolve()
    assert row.get("secret_key", row.get("key")) not in (None, "", "INHERITED_SECRET_MUST_NOT_BE_USED", "DIRECT_INHERITED_SECRET")
    assert str(row.get("testing", "")).lower() == "true"
    assert row.get("hf_offline", row.get("offline")) == "1"
    assert row.get("transformers_offline") == "1"
    return path


def summary(reports):
    path = reports / "summary.json"
    assert path.exists(), "Runner must preserve IMBA_VERIFY_REPORT_DIR/summary.json"
    result = json.loads(path.read_text())
    assert isinstance(result.get("stages"), list)
    assert result["status"] in {"passed", "failed"}
    assert list(reports.rglob("*.log")), "Stage logs must survive cleanup"
    return result


@pytest.mark.parametrize("mode,expected", [
    ("backend-core", {"backend-core"}), ("backend-all", {"backend-all"}),
    ("frontend", FRONTEND_STAGES), ("all", FRONTEND_STAGES | {"backend-core"}),
    (None, FRONTEND_STAGES | {"backend-core"}),
])
def test_modes_dispatch_only_the_documented_stages(tmp_path, mode, expected):
    project, env, trace, reports = runner_project(tmp_path)
    response = run_runner(project, env, mode)
    assert response.returncode == 0, response.stdout + response.stderr
    observed = rows(trace)
    assert {row["stage"] for row in observed} == expected
    for row in observed:
        if row["stage"].startswith("backend"):
            private_database(row)
            assert row["transformers_offline"] == "1"
        if row["stage"] == "frontend-build":
            assert row["docker_build"] == "true", "Verify the actual Docker static-export mode"
    result = summary(reports)
    assert result["mode"] == (mode or "all") and result["status"] == "passed"
    assert {s["name"] for s in result["stages"] if s["status"] == "passed"} == expected


@pytest.mark.parametrize("stage", ["backend-core", "frontend-tests", "typecheck", "frontend-build"])
def test_any_required_stage_failure_is_nonzero_and_recorded(tmp_path, stage):
    project, env, trace, reports = runner_project(tmp_path)
    env["PROBE_FAIL_STAGE"] = stage
    response = run_runner(project, env, "all")
    assert response.returncode != 0, "A failed check must not produce a successful runner"
    assert any(row["stage"] == stage for row in rows(trace)), "Required failing stage was not run"
    result = summary(reports)
    assert result["status"] == "failed"
    assert any(s["name"] == stage and s["status"] == "failed" and s["exit_code"] != 0 for s in result["stages"])


def test_unknown_mode_fails_before_running_checks(tmp_path):
    project, env, trace, _ = runner_project(tmp_path)
    response = run_runner(project, env, "silently-skip-everything")
    assert response.returncode != 0
    assert not rows(trace)


def test_runner_works_from_another_cwd_and_does_not_print_secrets(tmp_path):
    project, env, trace, reports = runner_project(tmp_path)
    response = run_runner(project, env, "backend-core", cwd=tmp_path)
    assert response.returncode == 0, response.stdout + response.stderr
    observed = rows(trace)
    assert observed and all(row["stage"] == "backend-core" for row in observed)
    for row in observed:
        path = private_database(row)
        assert not path.exists(), "Owned DB must be cleaned after the process finishes"
        assert not path.parent.exists(), "Owned temporary run directory must be cleaned"
    output = response.stdout + response.stderr + "".join(p.read_text() for p in reports.rglob("*") if p.is_file())
    assert "INHERITED_SECRET_MUST_NOT_BE_USED" not in output
    for row in observed:
        assert row["secret_key"] not in output


def test_sequential_runs_allocate_different_database_and_secret(tmp_path):
    project, env, trace, _ = runner_project(tmp_path)
    first = run_runner(project, env, "backend-core")
    assert first.returncode == 0, first.stdout + first.stderr
    first_rows = rows(trace)
    assert first_rows
    trace.unlink()
    second = run_runner(project, env, "backend-core")
    assert second.returncode == 0, second.stdout + second.stderr
    second_rows = rows(trace)
    assert second_rows
    assert private_database(first_rows[0]) != private_database(second_rows[0])
    assert first_rows[0]["secret_key"] != second_rows[0]["secret_key"]


def test_two_simultaneous_runs_do_not_share_database(tmp_path):
    contexts = []
    for name in ("first", "second"):
        path = tmp_path / name
        path.mkdir()
        contexts.append(runner_project(path))
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda c: run_runner(c[0], c[1], "backend-core"), contexts))
    assert all(r.returncode == 0 for r in results)
    observed = [rows(context[2]) for context in contexts]
    assert all(observed)
    assert private_database(observed[0][0]) != private_database(observed[1][0])


@pytest.mark.parametrize("through_runner", [False, True])
@pytest.mark.parametrize("kind", ["sqlite", "postgres"])
def test_external_database_is_rejected_before_backend_import_or_dispatch(tmp_path, through_runner, kind):
    control = tmp_path / "production-control.sqlite"
    with sqlite3.connect(control) as db:
        db.execute("CREATE TABLE control (value TEXT)")
        db.execute("INSERT INTO control VALUES ('DO_NOT_TOUCH')")
    before = control.read_bytes()
    address = "sqlite+aiosqlite:///" + str(control) if kind == "sqlite" else "postgresql+asyncpg://owner:NEVER_PRINT_THIS@127.0.0.1:1/production"
    if through_runner:
        project, env, trace, _ = runner_project(tmp_path)
        env["DATABASE_URL"] = address
        response = run_runner(project, env, "backend-core")
        assert not rows(trace), "External DB must be refused before launching test commands"
    else:
        project, env, marker = synthetic_backend_project(tmp_path)
        env["DATABASE_URL"] = address
        response = direct_pytest(project, env, collect=True)
        assert not marker.exists(), "Guard must run before backend.database is imported"
    assert response.returncode != 0
    assert control.read_bytes() == before
    assert "NEVER_PRINT_THIS" not in response.stdout + response.stderr


def test_direct_pytest_also_initializes_private_environment(tmp_path):
    project, env, marker = synthetic_backend_project(tmp_path)
    response = direct_pytest(project, env)
    assert response.returncode == 0, response.stdout + response.stderr
    assert marker.exists()
    private_database(json.loads(marker.read_text()))


def test_failure_cleanup_never_removes_an_external_symlink_target(tmp_path):
    project, env, trace, _ = runner_project(tmp_path)
    keep = tmp_path / "keep-me"
    keep.mkdir()
    marker = keep / "marker"
    marker.write_text("unchanged")
    outside_link = tmp_path / "inherited-temp-link"
    outside_link.symlink_to(keep, target_is_directory=True)
    env.update(TMPDIR=str(outside_link), PROBE_FAIL_STAGE="backend-core")
    response = run_runner(project, env, "backend-core")
    assert response.returncode != 0
    assert marker.read_text() == "unchanged" and outside_link.is_symlink()
    for row in rows(trace):
        path = private_database(row)
        assert not path.parent.exists()


@pytest.mark.parametrize("interrupt", [signal.SIGTERM, signal.SIGINT])
def test_signal_cleans_only_its_own_directory_and_stops_child(tmp_path, interrupt):
    project, env, trace, _ = runner_project(tmp_path)
    env["PROBE_SLEEP_STAGE"] = "backend-core"
    (project.parent / "probe-controls.json").write_text(json.dumps({"sleep_stage": "backend-core"}))
    process = subprocess.Popen(["bash", str(project / "scripts/verify_build.sh"), "backend-core"],
                               cwd=project, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, start_new_session=True)
    try:
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline and not rows(trace) and process.poll() is None:
            time.sleep(0.05)
        observed = rows(trace)
        assert observed, "Backend child must have started"
        path = private_database(observed[0])
        process.send_signal(interrupt)
        process.communicate(timeout=8)
        assert process.returncode != 0
        assert not path.parent.exists()
    finally:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.communicate(timeout=5)


def test_core_manifest_contains_all_required_regressions():
    expected = ROOT / "tools_tests/acceptance-manifests/backend-core.txt"
    actual = ROOT / "scripts/checks/backend-core.txt"
    assert actual.exists(), "Create the documented core manifest, do not silently select a tiny subset"
    parse = lambda p: {line.strip() for line in p.read_text().splitlines() if line.strip() and not line.lstrip().startswith("#")}
    assert parse(expected) <= parse(actual)
    assert all((ROOT / entry.split("::")[0]).is_file() for entry in parse(actual))


def test_missing_manifest_entry_fails_before_pytest_dispatch(tmp_path):
    project, env, trace, _ = runner_project(tmp_path)
    manifest = project / "scripts/checks/backend-core.txt"
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text("tests/this_required_test_is_missing.py\n")
    response = run_runner(project, env, "backend-core")
    assert response.returncode != 0
    assert not rows(trace), "Missing tests must be a configuration error, not omitted"
