"""Real role-to-role knowledge flow against the isolated pytest DB and tmp disk."""
import io

import pytest
from httpx import AsyncClient

from backend.main import app


@pytest.mark.asyncio
async def test_teacher_material_is_listed_downloadable_and_removed_for_cadet(
    teacher_auth_client, cadet_auth_client, monkeypatch, tmp_path
):
    # Relative data/uploads writes stay in disposable storage, never the live data tree.
    monkeypatch.chdir(tmp_path)
    payload = b"%PDF-1.4\nTeacher uploaded reference, not a frontend fixture.\n%%EOF"
    uploaded = await teacher_auth_client.post(
        "/api/v1/knowledge/files",
        files={"file": ("teacher-cadet-sync.pdf", io.BytesIO(payload), "application/pdf")},
    )
    assert uploaded.status_code == 201, uploaded.text
    document = uploaded.json()

    listed = await cadet_auth_client.get("/api/v1/knowledge/files")
    assert listed.status_code == 200, listed.text
    shared = next(entry for entry in listed.json() if entry["id"] == document["id"])
    assert shared["name"] == "teacher-cadet-sync.pdf"
    assert shared["size_bytes"] == len(payload)
    assert shared["url"] == document["url"]
    downloaded = await cadet_auth_client.get(shared["url"])
    assert downloaded.status_code == 200, downloaded.text
    assert downloaded.content == payload
    assert downloaded.headers["content-type"].startswith("application/pdf")

    # Students read the common catalog but cannot upload or delete its contents.
    forbidden_upload = await cadet_auth_client.post(
        "/api/v1/knowledge/files",
        files={"file": ("cadet-upload.pdf", io.BytesIO(payload), "application/pdf")},
    )
    assert forbidden_upload.status_code == 403
    forbidden_delete = await cadet_auth_client.delete(f"/api/v1/knowledge/files/{document['id']}")
    assert forbidden_delete.status_code == 403

    async with AsyncClient(app=app, base_url="http://test") as anonymous:
        assert (await anonymous.get(document["url"])).status_code == 401

    removed = await teacher_auth_client.delete(f"/api/v1/knowledge/files/{document['id']}")
    assert removed.status_code == 200, removed.text
    after_delete = await cadet_auth_client.get("/api/v1/knowledge/files")
    assert document["id"] not in {entry["id"] for entry in after_delete.json()}
    assert (await cadet_auth_client.get(document["url"])).status_code == 404
