import pytest
from sqlalchemy.exc import IntegrityError
from backend.models.domain_01 import User, StudentGroup, UserActionLog
import uuid

pytestmark = pytest.mark.asyncio

async def test_user_uuid_generation():
    user = User(username="test_uuid", password_hash="hash", role="CADET")
    assert user.user_id is not None
    assert isinstance(user.user_id, str)
    # Validate it's a UUID
    uuid_obj = uuid.UUID(user.user_id)
    assert str(uuid_obj) == user.user_id

async def test_role_check_constraint(db_session):
    user = User(username="hacker_user", password_hash="hash", role="HACKER")
    db_session.add(user)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()

async def test_json_array_serialization(db_session):
    group_ids = [str(uuid.uuid4()), str(uuid.uuid4())]
    user = User(username="json_user", password_hash="hash", role="CADET", group_ids=group_ids)
    db_session.add(user)
    await db_session.commit()
    
    # Fetch back
    fetched_user = await db_session.get(User, user.user_id)
    assert fetched_user.group_ids == group_ids
    assert isinstance(fetched_user.group_ids, list)

async def test_student_group_json_array(db_session):
    cadet_ids = [str(uuid.uuid4()), str(uuid.uuid4())]
    group = StudentGroup(group_name="Alpha", cadet_ids=cadet_ids)
    db_session.add(group)
    await db_session.commit()
    
    fetched_group = await db_session.get(StudentGroup, group.group_id)
    assert fetched_group.cadet_ids == cadet_ids
    assert isinstance(fetched_group.cadet_ids, list)

async def test_user_action_log(db_session):
    user = User(username="log_user", password_hash="hash", role="ADMIN")
    db_session.add(user)
    await db_session.commit()
    
    log = UserActionLog(user_id=user.user_id, role="ADMIN", action="LOGIN", target_entity="users", target_id=user.user_id)
    db_session.add(log)
    await db_session.commit()
    
    fetched_log = await db_session.get(UserActionLog, log.log_id)
    assert fetched_log.action == "LOGIN"
    assert fetched_log.user_id == user.user_id
