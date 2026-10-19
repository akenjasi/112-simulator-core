"""Preserve the DDS workspace, with explicit exceptions for user-approved fixes."""
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
FRONTEND = ROOT / "frontend"
MANIFEST = ROOT / "docs" / "dds-workflow-frontend-baseline.json"
LOBBY_ALLOWLIST = {
    "app/student/lobby/page.tsx",
    "components/dispatcher/dds-assignments.tsx",
    "components/dispatcher/dds-self-training.tsx",
    "lib/dds-lobby.ts",
}
# The subsequent tester request explicitly authorizes these screens: remove the
# heatmap/radar, hide past lessons, and add bulk ticket approval. Keep the old
# hashes for every other file rather than silently taking a new baseline.
TESTER_FIX_ALLOWLIST = {
    "app/teacher/analytics/page.tsx",
    "app/student/profile/page.tsx",
    "app/teacher/tickets/page.tsx",
    "app/admin/users/page.tsx",
    "app/teacher/sessions/new/page.tsx",
    "lib/dds-cycle.ts",
    "components/dispatcher/dds-assigned-console.tsx",
    "components/dispatcher/services-bar.tsx",
}
# The user subsequently requested the six teacher sections and their shared
# navigation to be restyled. The student/DDS workspace remains frozen.
TEACHER_UI_ALLOWLIST = {
    "app/teacher/layout.tsx",
    "app/teacher/teacher-workspace.module.css",
    "app/teacher/page.tsx",
    "app/teacher/groups/page.tsx",
    "app/teacher/knowledge/page.tsx",
    "app/teacher/tickets/page.tsx",
    "app/teacher/sessions/new/page.tsx",
    "components/teacher/analytics-page.tsx",
}
PRODUCT_DIRS = ("app", "components", "hooks", "lib", "store", "public")
PRODUCT_FILES = ("package.json", "package-lock.json", "next.config.mjs", "postcss.config.mjs", "tsconfig.json", "next-env.d.ts")


def product_files():
    files = {path for directory in PRODUCT_DIRS for path in (FRONTEND / directory).rglob("*") if path.is_file()}
    files.update(FRONTEND / name for name in PRODUCT_FILES if (FRONTEND / name).is_file())
    return {path.relative_to(FRONTEND).as_posix(): path for path in files
            if path.relative_to(FRONTEND).as_posix() not in LOBBY_ALLOWLIST | TESTER_FIX_ALLOWLIST | TEACHER_UI_ALLOWLIST}


def test_only_lobby_frontend_may_change():
    expected = {name: digest for name, digest in json.loads(MANIFEST.read_text())["sha256"].items()
                if name not in TESTER_FIX_ALLOWLIST | TEACHER_UI_ALLOWLIST}
    files = product_files()
    changes = [f"removed: {name}" for name in expected.keys() - files.keys()]
    changes.extend(f"added outside lobby: {name}" for name in files.keys() - expected.keys())
    changes.extend(f"changed: {name}" for name in files.keys() & expected.keys()
                   if hashlib.sha256(files[name].read_bytes()).hexdigest() != expected[name])
    assert not changes, "Forbidden frontend changes outside the approved fixes:\n" + "\n".join(sorted(changes))
