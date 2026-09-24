"""Knowledge base API router: file upload and retrieval for teacher workspace."""

import asyncio
import os
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.domain_03 import KnowledgeFile
from backend.core.file_storage import generate_safe_filename, get_relative_path

knowledge_router = APIRouter(
    prefix="/api/v1/knowledge",
    tags=["Knowledge Base"],
)

UPLOAD_DIR = os.path.join("data", "uploads")
ALLOWED_EXTENSIONS = {".pdf", ".docx"}


class KnowledgeFileResponse(BaseModel):
    id: str
    name: str
    size: int
    size_bytes: int
    content_type: str
    uploaded_at: str
    url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


def _to_response(file_record: KnowledgeFile) -> KnowledgeFileResponse:
    return KnowledgeFileResponse(
        id=file_record.file_id,
        name=file_record.name,
        size=file_record.size_bytes,
        size_bytes=file_record.size_bytes,
        content_type=file_record.content_type,
        uploaded_at=file_record.uploaded_at.isoformat() if file_record.uploaded_at else datetime.now(timezone.utc).isoformat(),
        url=f"/api/v1/knowledge/files/{file_record.file_id}/download",
    )


def _write_file_sync(file_path: str, content: bytes) -> None:
    with open(file_path, "wb") as f:
        f.write(content)


@knowledge_router.get("/files", response_model=list[KnowledgeFileResponse])
@knowledge_router.get("/files/", response_model=list[KnowledgeFileResponse], include_in_schema=False)
async def list_knowledge_files(db: AsyncSession = Depends(get_db)):
    """Retrieve all uploaded regulations and documents in the knowledge base."""
    stmt = select(KnowledgeFile).order_by(KnowledgeFile.uploaded_at.desc())
    result = await db.execute(stmt)
    files = result.scalars().all()
    return [_to_response(f) for f in files]


@knowledge_router.post("/files", response_model=KnowledgeFileResponse, status_code=status.HTTP_201_CREATED)
@knowledge_router.post("/files/", response_model=KnowledgeFileResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def upload_knowledge_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a PDF or DOCX file to the knowledge base."""
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Имя файла не указано",
        )

    _, ext = os.path.splitext(file.filename.lower())
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Недопустимый формат файла '{ext}'. Поддерживаются только форматы PDF и DOCX.",
        )

    # Ensure uploads directory exists
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    safe_name = generate_safe_filename(file.filename)
    rel_path = get_relative_path(safe_name)
    full_path = os.path.join("data", rel_path)

    # Read and write content
    content = await file.read()
    file_size = len(content)

    await asyncio.to_thread(_write_file_sync, full_path, content)

    # Create record in DB
    knowledge_file = KnowledgeFile(
        name=file.filename,
        file_path=rel_path,
        size_bytes=file_size,
        content_type=file.content_type or ("application/pdf" if ext == ".pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        uploaded_at=datetime.now(timezone.utc),
    )
    db.add(knowledge_file)
    await db.commit()
    await db.refresh(knowledge_file)

    return _to_response(knowledge_file)


@knowledge_router.get("/files/{file_id}/download")
async def download_knowledge_file(file_id: str, db: AsyncSession = Depends(get_db)):
    """Download a file by ID."""
    stmt = select(KnowledgeFile).where(KnowledgeFile.file_id == file_id)
    result = await db.execute(stmt)
    knowledge_file = result.scalar_one_or_none()
    if not knowledge_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Файл не найден")

    full_path = os.path.join("data", knowledge_file.file_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Файл отсутствует на диске")

    return FileResponse(
        path=full_path,
        filename=knowledge_file.name,
        media_type=knowledge_file.content_type,
    )


@knowledge_router.delete("/files/{file_id}")
async def delete_knowledge_file(file_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a document from the knowledge base."""
    stmt = select(KnowledgeFile).where(KnowledgeFile.file_id == file_id)
    result = await db.execute(stmt)
    knowledge_file = result.scalar_one_or_none()
    if not knowledge_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Файл не найден")

    full_path = os.path.join("data", knowledge_file.file_path)
    if os.path.exists(full_path):
        try:
            os.remove(full_path)
        except OSError:
            pass

    await db.delete(knowledge_file)
    await db.commit()
    return {"status": "ok", "deleted_file_id": file_id}
