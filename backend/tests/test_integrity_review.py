"""Independent checks of malformed manifests and directory symlink boundaries."""
import copy
import json
import shutil

import pytest

from backend.core import integrity


@pytest.fixture
def tree(tmp_path):
    root = tmp_path / "app"
    for name in ["backend/main.py", "backend/core/integrity.py", "docker/scripts/init.sh",
                 "backend/bin/transcribe-cli", "backend/bin/libggml.so",
                 "backend/core/qwen_tts/qwen-tts", "backend/api/example.py"]:
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("original contents")
    path = root / "backend_manifest.json"
    manifest = integrity.generate_manifest(root, path)
    return root, path, manifest


@pytest.mark.parametrize("damage", ["version", "algorithm", "empty", "duplicate", "hash"])
def test_invalid_manifest_is_unavailable(tree, damage):
    root, path, manifest = tree
    manifest = copy.deepcopy(manifest)
    if damage == "version":
        manifest["schema_version"] = "unsupported"
    elif damage == "algorithm":
        manifest["algorithm"] = "md5"
    elif damage == "empty":
        manifest["files"] = []
    elif damage == "duplicate":
        manifest["files"].append(copy.deepcopy(manifest["files"][0]))
    elif damage == "hash":
        manifest["files"][0]["sha256"] = "invalid hash"
    path.write_text(json.dumps(manifest))
    assert integrity.verify_integrity(root, path)["status"] == "unavailable"


def test_truncated_manifest_cannot_hide_a_missing_entrypoint(tree):
    root, path, manifest = tree
    manifest["files"] = [entry for entry in manifest["files"] if entry["path"] != "backend/main.py"]
    (root / "backend/main.py").unlink()
    path.write_text(json.dumps(manifest))
    assert integrity.verify_integrity(root, path)["status"] == "unavailable"


@pytest.mark.parametrize("entrypoint", [
    "docker/scripts/init.sh", "backend/core/integrity.py", "backend/bin/transcribe-cli",
    "backend/core/qwen_tts/qwen-tts",
])
def test_truncated_manifest_cannot_hide_other_required_components(tree, entrypoint):
    root, path, manifest = tree
    manifest["files"] = [entry for entry in manifest["files"] if entry["path"] != entrypoint]
    (root / entrypoint).unlink()
    path.write_text(json.dumps(manifest))
    assert integrity.verify_integrity(root, path)["status"] == "unavailable"


@pytest.mark.parametrize("entrypoint", integrity.MANDATORY_ENTRYPOINTS)
def test_build_rejects_missing_required_component(tree, entrypoint):
    root, path, _ = tree
    (root / entrypoint).unlink()
    with pytest.raises(FileNotFoundError):
        integrity.generate_manifest(root, path)


def test_traversal_manifest_is_rejected_before_reading_outside_root(tree, monkeypatch):
    root, path, manifest = tree
    outside = root.parent / "outside.txt"
    outside.write_text("external contents")
    manifest["files"].append({"path": "../outside.txt", "type": "file", "size": outside.stat().st_size,
                              "sha256": integrity.hash_file_sha256(outside)})
    path.write_text(json.dumps(manifest))
    original = integrity.hash_file_sha256
    reads = []

    def track(target, *args, **kwargs):
        reads.append(target.resolve())
        return original(target, *args, **kwargs)

    monkeypatch.setattr(integrity, "hash_file_sha256", track)
    result = integrity.verify_integrity(root, path)
    assert outside.resolve() not in reads
    assert result["status"] == "unavailable"


def test_parent_directory_symlink_is_not_followed_outside_root(tree, monkeypatch):
    root, path, _ = tree
    outside_dir = root.parent / "external-api"
    shutil.move(str(root / "backend/api"), outside_dir)
    (root / "backend/api").symlink_to(outside_dir, target_is_directory=True)
    original = integrity.hash_file_sha256
    reads = []

    def track(target, *args, **kwargs):
        reads.append(target.resolve())
        return original(target, *args, **kwargs)

    monkeypatch.setattr(integrity, "hash_file_sha256", track)
    result = integrity.verify_integrity(root, path)
    assert not any(target.is_relative_to(outside_dir) for target in reads)
    assert result["status"] != "ok"


def test_empty_tree_cannot_be_used_as_a_build_baseline(tmp_path):
    with pytest.raises((ValueError, FileNotFoundError)):
        integrity.generate_manifest(tmp_path, tmp_path / "backend_manifest.json")
