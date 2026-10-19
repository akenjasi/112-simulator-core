"""P3: executable type/configuration probes and CI failure propagation.

Local workflow probes are not a GitHub Actions emulator. They deliberately
exercise the actual checked-in run commands with a failing disposable runner.
"""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

import pytest
import yaml

from tools.tests.acceptance.probe_support import ROOT, clean_env, executable


FRONTEND = ROOT / "frontend"
EXPECTED_MANIFEST = ROOT / "tools/tests/acceptance/acceptance-manifests/frontend-core.txt"


def manifest(path):
    return [line.strip() for line in path.read_text().splitlines()
            if line.strip() and not line.lstrip().startswith("#")]


def node_config(docker):
    env = clean_env()
    env["DOCKER_BUILD"] = "true" if docker else "false"
    result = subprocess.run(["node", "--input-type=module", "-e", '''
import config from './next.config.mjs';
console.log(JSON.stringify({output:config.output ?? null,
  ignored:config.typescript?.ignoreBuildErrors ?? false,
  strict:config.typescript?.tsconfigPath ?? null,
  rewrites:typeof config.rewrites === 'function' ? await config.rewrites() : null}));
'''], cwd=FRONTEND, env=env, capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stdout + result.stderr
    return json.loads(result.stdout.strip().splitlines()[-1])


@pytest.mark.parametrize("docker", [False, True])
def test_build_config_never_ignores_type_errors(docker):
    assert node_config(docker)["ignored"] is False


def test_static_export_and_development_api_proxy_are_both_preserved():
    production, development = node_config(True), node_config(False)
    assert production["output"] == "export" and production["rewrites"] is None
    assert development["output"] != "export"
    assert any(row["source"] == "/api/:path*" and row["destination"].endswith("/api/:path*")
               for row in development["rewrites"])


def test_real_project_types_are_clean_without_incremental_cache():
    tsc = FRONTEND / "node_modules/.bin/tsc"
    assert tsc.exists(), "Install frontend dependencies before independent P3 acceptance"
    result = subprocess.run([str(tsc), "--noEmit", "--incremental", "false"], cwd=FRONTEND,
                            env=clean_env(), capture_output=True, text=True, timeout=90)
    assert result.returncode == 0, (result.stdout + result.stderr)[-12000:]


@pytest.fixture
def frontend_copy(tmp_path):
    assert (FRONTEND / "node_modules").is_dir(), "Install frontend dependencies first"
    dest = tmp_path / "frontend"
    shutil.copytree(FRONTEND, dest, ignore=shutil.ignore_patterns(
        "node_modules", ".next", "out", "coverage", "*.tsbuildinfo", ".git"))
    (dest / "node_modules").symlink_to(FRONTEND / "node_modules", target_is_directory=True)
    return dest


def test_package_typecheck_script_catches_an_actual_type_error(frontend_copy):
    package = json.loads((frontend_copy / "package.json").read_text())
    assert package.get("scripts", {}).get("typecheck"), "Provide the documented npm run typecheck"
    # A fresh, guaranteed error in an existing included directory. No product file changes.
    probe = frontend_copy / "components/p3-type-error-probe.ts"
    probe.write_text('export const p3AcceptanceNumber: number = "P3_INTENTIONAL_TYPE_ERROR";\n')
    result = subprocess.run(["npm", "run", "typecheck"], cwd=frontend_copy, env=clean_env(),
                            text=True, capture_output=True, timeout=90)
    assert result.returncode != 0, "typecheck script ignored a real source error"
    assert "p3-type-error-probe.ts" in result.stdout + result.stderr, "Failure must come from the injected source"


@pytest.mark.parametrize("kind", ["assertion", "unhandled"])
def test_vitest_still_fails_for_assertions_and_unhandled_errors(frontend_copy, kind):
    target = frontend_copy / "tests/p3-gate-probe.test.ts"
    marker = "P3_INTENTIONAL_" + kind.upper()
    body = f"throw new Error('{marker}')" if kind == "assertion" else (
        f"Promise.reject(new Error('{marker}')); await new Promise(r=>setTimeout(r,40)); expect(true).toBe(true)")
    target.write_text("import {it,expect} from 'vitest';\nit('deliberate quality gate probe',async()=>{" + body + "});\n")
    result = subprocess.run(["npm", "test", "--", "tests/p3-gate-probe.test.ts"], cwd=frontend_copy,
                            env=clean_env(), capture_output=True, text=True, timeout=60)
    assert marker in result.stdout + result.stderr, "Vitest must execute the deliberate failing test"
    assert result.returncode != 0, "Vitest must not suppress this failure"


def test_frontend_manifest_does_not_drop_required_supported_contracts():
    actual = ROOT / "tools/quality/checks/frontend-core.txt"
    assert actual.exists(), "Define an explicit supported frontend manifest"
    assert set(manifest(EXPECTED_MANIFEST)) <= set(manifest(actual))
    assert all((FRONTEND / path.split("::")[0]).is_file() for path in manifest(actual))


def test_supported_frontend_contracts_pass_together():
    paths = manifest(EXPECTED_MANIFEST)
    result = subprocess.run(["npm", "test", "--", *paths], cwd=FRONTEND, env=clean_env(),
                            capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, (result.stdout + result.stderr)[-16000:]


def workflow():
    path = ROOT / ".github/workflows/quality.yml"
    assert path.exists(), "Add the actual quality workflow; a documentation-only CI is not enough"
    data = yaml.load(path.read_text(), Loader=yaml.BaseLoader)
    assert isinstance(data, dict) and isinstance(data.get("jobs"), dict)
    return data


def runner_steps(data):
    result = []
    for job_id, job in data["jobs"].items():
        for step in job.get("steps", []):
            command = step.get("run", "")
            if "tools/quality/verify.sh" in command:
                result.append((job_id, job, step))
    return result


def test_workflow_runs_for_pr_and_final_main_and_keeps_required_steps_blocking():
    data = workflow()
    events = data.get("on", {})
    assert "pull_request" in events and "push" in events
    assert "pull_request_target" not in events, "Do not run PR code in a privileged workflow"
    push = events["push"]
    if isinstance(push, dict) and "branches" in push:
        assert "main" in push["branches"]
    steps = runner_steps(data)
    assert steps, "Workflow must reuse P2 runner"
    commands = "\n".join(step["run"] for _, _, step in steps)
    assert re.search(r"verify\.sh[\"']?\s+(?:all|backend-core)\b", commands)
    assert re.search(r"verify\.sh[\"']?\s+(?:all|frontend)\b", commands)
    for _, job, step in steps:
        assert str(job.get("continue-on-error", "false")).lower() == "false"
        assert str(step.get("continue-on-error", "false")).lower() == "false"
        assert "if" not in job and "if" not in step, "Required checks must not be conditionally skipped on a supported event"
    all_commands = "\n".join(step.get("run", "") for job in data["jobs"].values() for step in job.get("steps", []))
    assert "tools/tests/acceptance" in all_commands, "Independent acceptance must be invoked explicitly outside tests/conftest"


def test_independent_acceptance_ci_step_also_propagates_failure(tmp_path):
    data = workflow()
    project = tmp_path / "independent-ci-probe"
    project.mkdir()
    bins = tmp_path / "bin"
    for name in ("python", "python3", "pytest"):
        executable(bins / name, '''#!/usr/bin/env bash
if [[ "${0##*/}" == "pytest" || ( "${1:-}" == "-m" && "${2:-}" == "pytest" ) ]]; then
  echo P3_INDEPENDENT_CONTROLLED_FAILURE >&2
  exit 23
fi
exit 0
''')
    env = clean_env()
    env.update(PATH=str(bins) + os.pathsep + env["PATH"], GITHUB_WORKSPACE=str(project), CI="true")
    candidates = [(job, step) for job in data["jobs"].values() for step in job.get("steps", [])
                  if "tools/tests/acceptance" in step.get("run", "") and re.search(r"\bpytest\b", step["run"])]
    assert candidates, "Independent acceptance needs an explicit blocking CI step"
    for job, step in candidates:
        assert str(job.get("continue-on-error", "false")).lower() == "false"
        assert str(step.get("continue-on-error", "false")).lower() == "false"
        assert "if" not in job and "if" not in step
        assert "${{" not in step["run"]
        result = subprocess.run(["bash", "-e", "-o", "pipefail", "-c", step["run"]], cwd=project,
                                env=env, capture_output=True, text=True, timeout=20)
        assert "P3_INDEPENDENT_CONTROLLED_FAILURE" in result.stdout + result.stderr
        assert result.returncode != 0, "CI masked failed independent acceptance"


@pytest.mark.parametrize("stage", ["backend-core", "backend-all", "frontend-tests", "typecheck", "frontend-build"])
def test_checked_in_ci_command_propagates_each_required_failure(tmp_path, stage):
    data = workflow()
    project = tmp_path / "workflow-probe"
    project.mkdir()
    marker = tmp_path / "ci-dispatch.jsonl"
    stub = f'''#!/usr/bin/env bash
set -euo pipefail
mode="${{1:-all}}"
echo "$mode" >> "$P3_CI_TRACE"
if [[ "$mode" == "all" || "$mode" == "$P3_FAILED_MODE" ]]; then
  echo "P3_CI_CONTROLLED_FAILURE" >&2
  exit 23
fi
exit 0
'''
    executable(project / "tools/quality/verify.sh", stub)
    env = clean_env()
    env.update(P3_CI_TRACE=str(marker), P3_FAILED_MODE=stage if stage in ("backend-core", "backend-all") else "frontend",
               GITHUB_WORKSPACE=str(project), RUNNER_TEMP=str(tmp_path), CI="true")
    candidates = []
    for _, job, step in runner_steps(data):
        command = step["run"]
        mode = re.search(r"verify\.sh[\"']?\s+(all|backend-core|backend-all|frontend)\b", command)
        if mode and mode[1] in {"all", env["P3_FAILED_MODE"]}:
            candidates.append((job, step))
    assert candidates, f"No mandatory CI invocation covers {stage}"
    for job, step in candidates:
        command = step["run"]
        assert "${{" not in command, "Keep runner invocation literal and reviewable; configure versions in setup steps"
        run_env = env.copy()
        for mapping in (data.get("env", {}), job.get("env", {}), step.get("env", {})):
            for key, value in mapping.items():
                if "${{" not in value:
                    run_env[key] = value
        result = subprocess.run(["bash", "-e", "-o", "pipefail", "-c", command], cwd=project,
                                env=run_env, capture_output=True, text=True, timeout=20)
        assert "P3_CI_CONTROLLED_FAILURE" in result.stdout + result.stderr, "Probe did not execute the actual CI runner command"
        assert result.returncode != 0, "CI shell command masked a failed required stage"
