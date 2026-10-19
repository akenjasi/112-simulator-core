"""Canonical local paths; existing explicit environment values take precedence."""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def local_database_path(root=PROJECT_ROOT):
    """Use data/ for new installs; keep an existing legacy DB visible until migrated."""
    root = Path(root)
    canonical = root / "data" / "112_simulator.db"
    legacy = root / "112_simulator.db"
    if not canonical.exists() and legacy.is_file():
        return legacy
    return canonical
