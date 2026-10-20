"""Preserve the DDS workspace, including exact reviewed post-handoff updates."""
import re
import pytest
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


# Reconcile the frozen handoff with integrated work, not a blanket new baseline.
# The old hash map remains immutable; supplemental entries pin these exact files
# rather than allowing future arbitrary changes under a permanent allowlist.
REVIEWED_UPDATES = {
    # User-approved browser audit 2026-10-20: exact neutral database copy only.
    "app/admin/page.tsx",
    "app/admin/system/page.tsx",
    # Explicit user request 2026-10-20: repair teacher demo grading/protocol; pin the exact fix.
    'components/teacher/split-screen.tsx',
    # Explicit request 2026-10-20: show immediate GPU demo reports on lesson completion.
    # The exact implementation remains pinned; negative mutation probes still apply.
    'components/teacher/live-dashboard.tsx',
    # Explicit user-approved background reports; pinned by exact hash, not an allowlist.
    'components/teacher/dds-lesson-report.tsx',
    # User-approved DDS interface guide; exact hashes are pinned in approved_updates.
    'components/dispatcher/caller-panel.tsx',
    'components/dispatcher/incident-panel.tsx',
    'components/tutorial.tsx',
    'components/dds-help.tsx',
    'components/dispatcher/dds-interface-guide.tsx',
    'components/dispatcher/dds-workspace-content.tsx',
    'lib/dds-interface-help.ts',
    'components/student/student-review.tsx',
    'lib/student-review.ts',
    'app/admin/security/page.tsx',
    'app/dds/page.tsx',
    'app/globals.css',
    'app/layout.tsx',
    'app/login/page.tsx',
    'app/operator/page.tsx',
    'components/dispatcher/dds-protocol.tsx',
    'components/dispatcher/dds-training-phone.tsx',
    'components/dispatcher/dispatch-panel.tsx',
    'components/dispatcher/top-bar.tsx',
    'components/teacher/dds-exercise-editor.tsx',
    'components/teacher/dds-lesson-protocol.tsx',
    'hooks/useTelephony.ts',
    'package-lock.json',
    'package.json',
}
ORIGINAL_HASH_MAP_DIGEST = "ff9eaf593819935e5fb3620ebe5303728ad2fa3387dee022577eea36a8f08888"


def expected_files():
    manifest = json.loads(MANIFEST.read_text())
    original = manifest["sha256"]
    assert hashlib.sha256(json.dumps(original, sort_keys=True).encode()).hexdigest() == ORIGINAL_HASH_MAP_DIGEST
    updates = manifest["approved_updates"]
    assert set(updates) == REVIEWED_UPDATES
    for update in updates.values():
        assert re.fullmatch(r"[0-9a-f]{64}", update["sha256"])
        assert update["source_revision"] and update["reason"]
    expected = {name: digest for name, digest in original.items()
                if name not in TESTER_FIX_ALLOWLIST | TEACHER_UI_ALLOWLIST}
    expected.update({name: item["sha256"] for name, item in updates.items()})
    return expected


def scope_changes(expected, actual):
    changes = [f"removed: {name}" for name in expected.keys() - actual.keys()]
    changes.extend(f"added outside approved scope: {name}" for name in actual.keys() - expected.keys())
    changes.extend(f"changed: {name}" for name in actual.keys() & expected.keys()
                   if actual[name] != expected[name])
    return sorted(changes)


def test_only_approved_frontend_may_change():
    actual = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in product_files().items()}
    changes = scope_changes(expected_files(), actual)
    assert not changes, "Forbidden frontend changes outside the approved fixes:\n" + "\n".join(changes)


@pytest.mark.parametrize("mutation", ["changed", "removed", "added"])
def test_scope_guard_still_rejects_unreviewed_changes(mutation):
    expected = expected_files()
    actual = expected.copy()
    # Supplemental files are pinned, too: they are not a mutable allowlist.
    target = "hooks/useTelephony.ts"
    if mutation == "changed":
        actual[target] = "0" * 64
    elif mutation == "removed":
        del actual[target]
    else:
        actual["components/dispatcher/unreviewed.tsx"] = "0" * 64
    assert len(scope_changes(expected, actual)) == 1
