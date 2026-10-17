"""Access control and ownership helpers for legacy AI analytics endpoints.

Enforces ownership boundaries:
- TEACHER only has access to groups where group.teacher_id == teacher.user_id.
- Ownerless groups (teacher_id is None) and foreign groups are forbidden.
- TEACHER can only access personal advice/analysis for students belonging to at least
  one of the teacher's owned groups (via cadet_ids or student_group_link).
- CADET can only access their own personal advice; group advice and refine are forbidden.
"""

from typing import List, Set
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.domain_01 import StudentGroup, student_group_link


def extract_cadet_ids_from_group(group: StudentGroup) -> Set[str]:
    """Extract cadet IDs from StudentGroup.cadet_ids JSON/list attribute.

    Handles string IDs, dicts containing 'user_id', and other stringifiable items.
    """
    cadet_ids: Set[str] = set()
    raw = getattr(group, "cadet_ids", None)
    if raw and isinstance(raw, list):
        for cid in raw:
            if isinstance(cid, str):
                cadet_ids.add(cid)
            elif isinstance(cid, dict) and "user_id" in cid and cid["user_id"] is not None:
                cadet_ids.add(str(cid["user_id"]))
            elif cid is not None:
                cadet_ids.add(str(cid))
    return cadet_ids


async def get_teacher_groups(
    db: AsyncSession, teacher_id: str
) -> List[StudentGroup]:
    """Retrieve all student groups owned by the teacher."""
    if not teacher_id:
        return []
    stmt = select(StudentGroup).where(StudentGroup.teacher_id == teacher_id)
    res = await db.scalars(stmt)
    return list(res.all())


async def get_teacher_cadet_ids(
    db: AsyncSession, teacher_id: str
) -> Set[str]:
    """Retrieve unique cadet IDs belonging to any group owned by the teacher.

    Considers both `cadet_ids` attribute and `student_group_link` secondary table.
    Ownerless groups (teacher_id is None) and foreign groups are never considered.
    """
    if not teacher_id:
        return set()

    teacher_groups = await get_teacher_groups(db, teacher_id)
    group_ids = [g.group_id for g in teacher_groups if g.group_id]
    cadet_ids: Set[str] = set()

    for g in teacher_groups:
        cadet_ids.update(extract_cadet_ids_from_group(g))

    if group_ids:
        links_stmt = select(student_group_link.c.user_id).where(
            student_group_link.c.group_id.in_(group_ids)
        )
        links_res = await db.execute(links_stmt)
        for row in links_res.all():
            if row[0]:
                cadet_ids.add(str(row[0]))

    return cadet_ids


async def is_cadet_accessible_to_teacher(
    db: AsyncSession, teacher_id: str, cadet_id: str
) -> bool:
    """Check if cadet belongs to at least one group owned by the teacher."""
    if not teacher_id or not cadet_id:
        return False
    teacher_cadet_ids = await get_teacher_cadet_ids(db, teacher_id)
    return str(cadet_id) in teacher_cadet_ids
