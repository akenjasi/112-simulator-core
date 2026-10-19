"""Explicit CLI for the configured installation; does not run on import."""
from backend.core.backups import create_backup

if __name__ == "__main__":
    print(f"Backup created successfully: {create_backup()}")
