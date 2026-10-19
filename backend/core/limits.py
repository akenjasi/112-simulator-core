"""Limits are enforced in the application even when Nginx is bypassed."""
from pathlib import Path
from fastapi import HTTPException

MAX_IMPORT_BYTES = 5 * 1024 * 1024
MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
MAX_AUDIO_BYTES = 64 * 1024 * 1024


async def read_upload(file, limit):
    content = await file.read(limit + 1)
    if len(content) > limit:
        raise HTTPException(413, "Uploaded file exceeds the configured size limit")
    return content


def stored_upload_path(relative):
    root = Path("data/uploads").resolve()
    target = (Path("data") / relative).resolve()
    if target == root or not target.is_relative_to(root) or Path(relative).is_absolute():
        raise HTTPException(400, "Invalid stored file path")
    return str(target)
