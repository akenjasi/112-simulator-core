"""
File integrity verification module for 112 Simulator backend.
Generates SHA-256 manifests during Docker image builds and verifies runtime file integrity.
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# Controlled scope rules
EXCLUDED_DIR_NAMES: Set[str] = {
    "__pycache__",
    ".pytest_cache",
    ".git",
    ".cache",
    "data",
    "models",
    "uploads",
    "backups",
    "preseeded_tts_cache",
    "frontend_react",
    "node_modules",
    "out",
    "certs",
    ".venv",
    "venv",
    "dist",
    "build",
}

EXCLUDED_EXTENSIONS: Set[str] = {
    ".pyc",
    ".pyo",
    ".pyd",
    ".log",
    ".tmp",
    ".swp",
}

SUPPORTED_SCHEMA_VERSIONS: Set[str] = {"1.0", "1"}
SUPPORTED_ALGORITHMS: Set[str] = {"sha256"}
MANDATORY_ENTRYPOINTS: List[str] = [
    "backend/main.py",
    "backend/core/integrity.py",
    "scripts/init.sh",
    "backend/bin/transcribe-cli",
    "backend/core/qwen_tts/qwen-tts",
]

SCOPE_SUMMARY = (
    "Python-файлы backend, скрипты запуска (scripts/init.sh), "
    "нативные библиотеки и бинарные файлы (backend/bin/, qwen-tts)"
)


def hash_file_sha256(path: Path | str, chunk_size: int = 65536) -> str:
    """Compute SHA-256 hash of a file reading in chunks of 64 KB."""
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(chunk_size):
            hasher.update(chunk)
    return hasher.hexdigest()


def is_safe_relative_path(path_str: str) -> bool:
    """Validate that a relative path is canonical, not absolute, and does not escape root."""
    if not isinstance(path_str, str) or not path_str.strip():
        return False
    norm = path_str.replace("\\", "/").strip()
    if norm.startswith("/") or os.path.isabs(norm) or (len(norm) >= 2 and norm[1] == ":"):
        return False
    parts = Path(norm).parts
    if any(p in {"..", "."} for p in parts):
        return False
    return True


def check_parent_dirs_safe(root: Path, rel_path: str) -> Tuple[bool, Optional[str]]:
    """
    Check every parent directory from root to the file.
    Directory symlinks are strictly forbidden to prevent traversing outside root or spoofing directories.
    """
    parts = Path(rel_path).parts
    curr = root
    for part in parts[:-1]:
        curr = curr / part
        if os.path.islink(curr):
            try:
                resolved = curr.resolve()
                if not resolved.is_relative_to(root):
                    return False, f"Каталог '{curr.relative_to(root)}' является символической ссылкой за пределы корня"
                return False, f"Каталог '{curr.relative_to(root)}' является символической ссылкой"
            except Exception:
                return False, f"Каталог '{curr.relative_to(root)}' является некорректной символической ссылкой"
        if not curr.is_dir():
            return False, f"Каталог '{curr.relative_to(root)}' отсутствует или не является директорией"
    return True, None


def is_path_in_scope(rel_path: str) -> bool:
    """Determine whether a relative path is within the controlled integrity scope."""
    if not is_safe_relative_path(rel_path):
        return False

    norm_path = rel_path.replace("\\", "/").strip("/")
    parts = norm_path.split("/")

    # Exclude if any directory part is in excluded directories
    for part in parts[:-1]:
        if part in EXCLUDED_DIR_NAMES:
            return False

    # Also exclude if current item is an excluded directory
    if parts[-1] in EXCLUDED_DIR_NAMES:
        return False

    # Check file extension
    ext = os.path.splitext(parts[-1])[1].lower()
    if ext in EXCLUDED_EXTENSIONS:
        return False

    # Exclude manifest file itself
    if parts[-1] == "backend_manifest.json":
        return False

    # 1. Python files under backend/
    if norm_path.startswith("backend/") and ext == ".py":
        return True

    # 2. Alembic migrations if any
    if norm_path.startswith("alembic/") and ext == ".py":
        return True

    # 3. Scripts: scripts/init.sh, scripts/*.sh, scripts/*.py
    if norm_path.startswith("scripts/") and ext in {".sh", ".py"}:
        return True

    # 4. Binaries and native libraries in backend/bin/
    if norm_path.startswith("backend/bin/"):
        return True

    # 5. Native binary backend/core/qwen_tts/qwen-tts
    if norm_path == "backend/core/qwen_tts/qwen-tts":
        return True

    return False


def scan_scope_files(root_dir: Path | str) -> List[Tuple[str, Path]]:
    """
    Scan root_dir recursively and return sorted [(rel_path, full_path)] for files in scope.
    Does not follow symlinks to directories.
    """
    root = Path(root_dir).resolve()
    matched_entries: List[Tuple[str, Path]] = []

    for current_dir, dirs, files in os.walk(root, followlinks=False):
        # Filter directories in-place to prevent descending into excluded dirs
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIR_NAMES]

        rel_dir = os.path.relpath(current_dir, root)

        for fname in files:
            rel_file = fname if rel_dir == "." else os.path.join(rel_dir, fname)
            rel_path_str = rel_file.replace("\\", "/")

            if is_path_in_scope(rel_path_str):
                full_path = Path(current_dir) / fname
                matched_entries.append((rel_path_str, full_path))

    matched_entries.sort(key=lambda x: x[0])
    return matched_entries


def generate_manifest(root_dir: Path | str, output_path: Path | str) -> Dict[str, Any]:
    """
    Generate SHA-256 integrity manifest for all files within the controlled scope.
    Validates presence of mandatory entry points and enforces symlink policy.
    """
    root = Path(root_dir).resolve()
    out_file = Path(output_path).resolve()

    if not root.exists() or not root.is_dir():
        raise FileNotFoundError(f"Корневая директория не существует: {root}")

    files_list: List[Dict[str, Any]] = []

    for rel_path, full_path in scan_scope_files(root):
        if full_path.resolve() == out_file:
            continue

        safe_parents, parent_err = check_parent_dirs_safe(root, rel_path)
        if not safe_parents:
            raise ValueError(f"Небезопасная структура директорий для {rel_path}: {parent_err}")

        if full_path.is_symlink():
            link_target = os.readlink(full_path)

            if os.path.isabs(link_target):
                raise ValueError(
                    f"Absolute symlink forbidden in integrity scope: {rel_path} -> {link_target}"
                )

            # Resolve link target relative to symlink's parent directory
            resolved_target = (full_path.parent / link_target).resolve()

            # Symlink policy: must resolve strictly inside root
            try:
                resolved_target.relative_to(root)
            except ValueError:
                raise ValueError(
                    f"Symlink path traversal forbidden: {rel_path} points outside root ({link_target})"
                )

            if not resolved_target.is_file():
                raise FileNotFoundError(
                    f"Symlink target missing or not a file: {rel_path} -> {link_target}"
                )

            target_size = resolved_target.stat().st_size
            target_hash = hash_file_sha256(resolved_target)

            files_list.append({
                "path": rel_path,
                "type": "symlink",
                "link_target": link_target,
                "size": target_size,
                "sha256": target_hash,
            })
        else:
            file_size = full_path.stat().st_size
            file_hash = hash_file_sha256(full_path)

            files_list.append({
                "path": rel_path,
                "type": "file",
                "size": file_size,
                "sha256": file_hash,
            })

    if len(files_list) == 0:
        raise ValueError("Cannot generate manifest: no files found in controlled scope")

    generated_paths = {entry["path"] for entry in files_list}
    for entrypoint in MANDATORY_ENTRYPOINTS:
        if entrypoint not in generated_paths:
            raise FileNotFoundError(f"Обязательная точка входа отсутствует: {entrypoint}")

    manifest = {
        "schema_version": "1.0",
        "algorithm": "sha256",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope_summary": SCOPE_SUMMARY,
        "files": files_list,
    }

    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    return manifest


def verify_integrity(
    root_dir: Path | str,
    manifest_path: Optional[Path | str] = None,
) -> Dict[str, Any]:
    """
    Verify on-disk files against the SHA-256 manifest.
    Returns dictionary with status ('ok', 'deviation', 'unavailable'),
    checked_files_count, manifest_digest, and list of deviations.
    """
    root = Path(root_dir).resolve()

    if manifest_path is None:
        env_manifest = os.environ.get("INTEGRITY_MANIFEST_PATH")
        if env_manifest:
            manifest_file = Path(env_manifest).resolve()
        else:
            manifest_file = root / "backend_manifest.json"
    else:
        manifest_file = Path(manifest_path).resolve()

    checked_at = datetime.now(timezone.utc).isoformat()

    if not manifest_file.is_file():
        return {
            "status": "unavailable",
            "checked_at": checked_at,
            "manifest_digest": None,
            "checked_files_count": 0,
            "deviations": [],
            "scope_summary": SCOPE_SUMMARY,
            "error": "Манифест отсутствует (создаётся при сборке Docker-образа)",
        }

    try:
        manifest_bytes = manifest_file.read_bytes()
        manifest_digest = hashlib.sha256(manifest_bytes).hexdigest()
        manifest_data = json.loads(manifest_bytes.decode("utf-8"))

        if not isinstance(manifest_data, dict):
            raise ValueError("Manifest format invalid: root must be a JSON object")

        schema_ver = str(manifest_data.get("schema_version", "")).strip()
        if schema_ver not in SUPPORTED_SCHEMA_VERSIONS:
            raise ValueError(f"Неподдерживаемая версия схемы манифеста: {schema_ver}")

        algo = str(manifest_data.get("algorithm", "")).lower().strip()
        if algo not in SUPPORTED_ALGORITHMS:
            raise ValueError(f"Неподдерживаемый алгоритм хеширования: {algo}")

        entries = manifest_data.get("files")
        if not isinstance(entries, list) or len(entries) == 0:
            raise ValueError("Список контролируемых файлов пуст или некорректен")

        # Validate entries schema and paths BEFORE any file operations
        expected_paths: Set[str] = set()
        for idx, entry in enumerate(entries):
            if not isinstance(entry, dict):
                raise ValueError(f"Элемент files[{idx}] не является объектом")

            rel_path = entry.get("path")
            if not is_safe_relative_path(rel_path):
                raise ValueError(f"Небезопасный или некорректный путь в манифесте: {rel_path}")

            if not is_path_in_scope(rel_path):
                raise ValueError(f"Путь вне области контроля целостности: {rel_path}")

            if rel_path in expected_paths:
                raise ValueError(f"Дублирующаяся запись в манифесте: {rel_path}")
            expected_paths.add(rel_path)

            entry_type = entry.get("type", "file")
            if entry_type not in {"file", "symlink"}:
                raise ValueError(f"Неизвестный тип файла в манифесте для {rel_path}: {entry_type}")

            entry_size = entry.get("size")
            if not isinstance(entry_size, int) or entry_size < 0:
                raise ValueError(f"Некорректный размер файла в манифесте для {rel_path}")

            entry_hash = entry.get("sha256")
            if not isinstance(entry_hash, str) or len(entry_hash) != 64 or not all(c in "0123456789abcdefABCDEF" for c in entry_hash):
                raise ValueError(f"Некорректный формат SHA-256 в манифесте для {rel_path}")

            if entry_type == "symlink":
                link_target = entry.get("link_target")
                if not isinstance(link_target, str) or not link_target.strip():
                    raise ValueError(f"Отсутствует link_target для символической ссылки {rel_path}")

        # Check mandatory entrypoints in manifest
        for ep in MANDATORY_ENTRYPOINTS:
            if ep not in expected_paths:
                raise ValueError(f"В манифесте отсутствует обязательная точка входа: {ep}")

    except Exception as e:
        raw_digest = None
        if "manifest_bytes" in locals():
            raw_digest = hashlib.sha256(manifest_bytes).hexdigest()
        return {
            "status": "unavailable",
            "checked_at": checked_at,
            "manifest_digest": raw_digest,
            "checked_files_count": 0,
            "deviations": [],
            "scope_summary": SCOPE_SUMMARY,
            "error": f"Файл манифеста повреждён или некорректен: {e}",
        }

    deviations: List[Dict[str, Any]] = []
    checked_count = 0

    for entry in entries:
        rel_path = entry.get("path")
        checked_count += 1
        full_path = root / rel_path

        # Check parent directories for symlinks or missing dirs before touching target
        safe_parents, parent_err = check_parent_dirs_safe(root, rel_path)
        if not safe_parents:
            deviations.append({
                "path": rel_path,
                "reason": "modified",
                "details": parent_err,
            })
            continue

        # Use lexists because os.path.exists returns False for broken symlinks
        if not os.path.lexists(full_path):
            deviations.append({
                "path": rel_path,
                "reason": "missing",
                "details": "Файл отсутствует на диске",
            })
            continue

        entry_type = entry.get("type", "file")

        if entry_type == "symlink":
            if not full_path.is_symlink():
                deviations.append({
                    "path": rel_path,
                    "reason": "modified",
                    "details": "Ожидалась символическая ссылка, но обнаружен обычный файл",
                })
                continue

            current_target = os.readlink(full_path)
            expected_target = entry.get("link_target")

            if current_target != expected_target:
                deviations.append({
                    "path": rel_path,
                    "reason": "modified",
                    "details": f"Цель ссылки изменена: ожидалось '{expected_target}', получено '{current_target}'",
                })
                continue

            if os.path.isabs(current_target):
                deviations.append({
                    "path": rel_path,
                    "reason": "unreadable",
                    "details": "Абсолютная цель ссылки запрещена политикой безопасности",
                })
                continue

            try:
                resolved = (full_path.parent / current_target).resolve()
                resolved.relative_to(root)
            except (ValueError, RuntimeError) as e:
                deviations.append({
                    "path": rel_path,
                    "reason": "unreadable",
                    "details": f"Символическая ссылка выходит за пределы корневой директории: {e}",
                })
                continue

            if not resolved.is_file():
                deviations.append({
                    "path": rel_path,
                    "reason": "missing",
                    "details": f"Целевой файл ссылки отсутствует: {current_target}",
                })
                continue

            try:
                current_hash = hash_file_sha256(resolved)
                if current_hash != entry.get("sha256"):
                    deviations.append({
                        "path": rel_path,
                        "reason": "modified",
                        "details": "Содержимое целевого файла ссылки изменено",
                    })
            except Exception as e:
                deviations.append({
                    "path": rel_path,
                    "reason": "unreadable",
                    "details": f"Ошибка чтения целевого файла ссылки: {e}",
                })

        else:
            # Regular file expected
            if full_path.is_symlink():
                deviations.append({
                    "path": rel_path,
                    "reason": "modified",
                    "details": "Ожидался обычный файл, но обнаружена символическая ссылка",
                })
                continue

            try:
                current_hash = hash_file_sha256(full_path)
                if current_hash != entry.get("sha256"):
                    deviations.append({
                        "path": rel_path,
                        "reason": "modified",
                        "details": f"Хэш SHA-256 не совпадает (ожидался {entry.get('sha256')[:12]}..., получен {current_hash[:12]}...)",
                    })
            except PermissionError:
                deviations.append({
                    "path": rel_path,
                    "reason": "unreadable",
                    "details": "Отказано в доступе при чтении файла",
                })
            except Exception as e:
                deviations.append({
                    "path": rel_path,
                    "reason": "unreadable",
                    "details": f"Ошибка чтения файла: {e}",
                })

    # Detect unexpected new files in scope
    try:
        disk_files = scan_scope_files(root)
        for rel, path in disk_files:
            if path.resolve() == manifest_file:
                continue
            if rel not in expected_paths:
                deviations.append({
                    "path": rel,
                    "reason": "unexpected",
                    "details": "Файл присутствует на диске, но отсутствует в манифесте сборки",
                })
    except Exception as e:
        deviations.append({
            "path": "<scan>",
            "reason": "unreadable",
            "details": f"Ошибка сканирования директорий: {e}",
        })

    status = "ok" if len(deviations) == 0 else "deviation"

    return {
        "status": status,
        "checked_at": checked_at,
        "manifest_digest": manifest_digest,
        "checked_files_count": checked_count,
        "deviations": deviations,
        "scope_summary": manifest_data.get("scope_summary", SCOPE_SUMMARY),
        "error": None,
    }


def main():
    """CLI entrypoint for generating or verifying the integrity manifest."""
    parser = argparse.ArgumentParser(
        description="Backend file integrity manifest generator and verifier."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # generate command
    gen_parser = subparsers.add_parser("generate", help="Generate backend integrity manifest.")
    gen_parser.add_argument(
        "--root",
        default=".",
        help="Root directory of the application (default: current directory).",
    )
    gen_parser.add_argument(
        "--output",
        default="backend_manifest.json",
        help="Path for generated manifest JSON (default: backend_manifest.json).",
    )

    # verify command
    ver_parser = subparsers.add_parser("verify", help="Verify backend files against manifest.")
    ver_parser.add_argument(
        "--root",
        default=".",
        help="Root directory of the application (default: current directory).",
    )
    ver_parser.add_argument(
        "--manifest",
        default=None,
        help="Path to manifest JSON file (default: <root>/backend_manifest.json).",
    )

    args = parser.parse_args()

    if args.command == "generate":
        print(f"Generating manifest for root='{args.root}' -> output='{args.output}'...")
        manifest = generate_manifest(args.root, args.output)
        count = len(manifest.get("files", []))
        print(f"Manifest successfully generated with {count} files.")
        sys.exit(0)

    elif args.command == "verify":
        res = verify_integrity(args.root, args.manifest)
        print(json.dumps(res, indent=2, ensure_ascii=False))
        if res["status"] != "ok":
            sys.exit(1)
        sys.exit(0)


if __name__ == "__main__":
    main()
