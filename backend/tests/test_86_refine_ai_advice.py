import pytest
import uuid
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from backend.models.domain_03 import AIStudentAdvice
from backend.models.domain_01 import User
from backend.core.security import hash_password

@pytest.mark.asyncio
async def test_refine_ai_advice(auth_client: AsyncClient, cadet_auth_client: AsyncClient, db_session: AsyncSession):
    # 1. Create a cadet user
    cadet_id = str(uuid.uuid4())
    cadet = User(
        user_id=cadet_id,
        username=f"test_cadet_refine_{uuid.uuid4().hex[:8]}",
        password_hash=hash_password("test_pass_123"),
        role="CADET"
    )
    db_session.add(cadet)
    await db_session.commit()

    # 2. Create a dummy AIStudentAdvice record
    advice_id = str(uuid.uuid4())
    advice = AIStudentAdvice(
        advice_id=advice_id,
        cadet_id=cadet_id,
        analysis_text="Original analysis text.",
        date=datetime.now(timezone.utc),
        is_read=False,
        model_used="test-model"
    )
    db_session.add(advice)
    await db_session.commit()

    # 3. Call the refine endpoint as an instructor (admin auth_client)
    correction = "ИИ, ты не прав, студент молодец"
    response = await auth_client.post(
        f"/api/ai-analytics/student/{advice_id}/refine",
        json={"correction_comment": correction}
    )

    assert response.status_code == 200
    data = response.json()
    assert "Перегенерировано ИИ с учетом: ИИ, ты не прав, студент молодец" in data["analysis_text"]
    assert data["advice_id"] == advice_id

    # 4. Verify cadet cannot refine
    response_cadet = await cadet_auth_client.post(
        f"/api/ai-analytics/student/{advice_id}/refine",
        json={"correction_comment": "try to hack"}
    )
    assert response_cadet.status_code == 403

