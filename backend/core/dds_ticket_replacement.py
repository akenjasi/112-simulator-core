"""Transactional catalog replacement. Old rows are tombstones for historical FK references."""
from copy import deepcopy
import uuid
from sqlalchemy import select

from backend.core.dds_cycle import incoming_card_from_ticket, build_incoming_card, sanitize_incoming_card
from backend.core.dds_exercise import validated_plan
from backend.core.dds_phone_catalog import default_phone_plan, AUDIO_DIR
from backend.models.domain_02 import ScenarioTicket, GeneratedTicket
from backend.models.domain_03 import Assignment, ExamSession


async def replace_catalog(db, *, ticket_ids=None):
    """Caller owns the transaction. Build and validate everything before hiding any source."""
    scenarios = list((await db.scalars(select(ScenarioTicket).with_for_update())).all())
    generated = list((await db.scalars(select(GeneratedTicket).with_for_update())).all())
    originals = {t.scenario_id: t for t in scenarios}
    mirrors = {t.id: t for t in generated}
    ids = list(dict.fromkeys([t.scenario_id for t in scenarios if not t.is_deleted] +
                             [t.id for t in generated if not t.is_deleted]))
    if ticket_ids is not None:
        if not set(ticket_ids) <= set(ids):
            raise ValueError('Replacement target is not in the active catalog')
        ids = [i for i in ids if i in ticket_ids]
    prepared = []
    for old_id in ids:
        source, mirror = originals.get(old_id), mirrors.get(old_id)
        if source and (source.content or {}).get('dds_exercise', {}).get('version') == 2:
            continue
        if source:
            card = incoming_card_from_ticket(source)
        else:
            card = build_incoming_card(category=mirror.category, subcategory=mirror.subcategory,
                                       plot=mirror.plot, ground_truth=mirror.ground_truth,
                                       etalon_services=mirror.etalon_services, seq=mirror.sequence_number)
        card = sanitize_incoming_card({'incoming_card': card})
        services = [s['name'] for s in card['services']]
        plan = validated_plan(default_phone_plan(services), services)
        for item in [*plan['contacts'], *plan['reports']]:
            if not (AUDIO_DIR / item['audio'].rsplit('/', 1)[-1]).is_file():
                raise ValueError('Missing bundled recording; catalog left unchanged')
        new_id = str(uuid.uuid4())
        content = deepcopy(source.content or {}) if source else {}
        content.update(incoming_card=card, dds_exercise=plan)
        settings = deepcopy(source.settings or {}) if source else {}
        settings.update(replaces_ticket_id=old_id, etalon_services=services)
        category = (source.category if source else mirror.category) or card['classification']['section']
        complexity = (source.complexity if source else mirror.complexity) or 1
        workflow = deepcopy(source.workflow_state or {}) if source else {'status': mirror.status or 'DRAFT'}
        new = ScenarioTicket(scenario_id=new_id, title=(source.title if source else mirror.subcategory) or category,
                             category=category, complexity=complexity, content=content, settings=settings,
                             workflow_state=workflow, ground_truth=deepcopy(source.ground_truth if source else mirror.ground_truth),
                             ai_content=deepcopy(source.ai_content or {}) if source else {},
                             reference_material_ids=deepcopy(source.reference_material_ids or []) if source else [])
        new_mirror = GeneratedTicket(id=new_id, category=category, complexity=complexity,
                                    subcategory=card['classification']['title'], plot=card['description'],
                                    ground_truth=deepcopy(new.ground_truth), etalon_services=services,
                                    status=workflow.get('status', 'DRAFT'),
                                    factoids=deepcopy(mirror.factoids or {}) if mirror else {})
        prepared.append((old_id, new, new_mirror))
    mapping = {old: new.scenario_id for old, new, _ in prepared}
    for _, new, mirror in prepared:
        db.add_all([new, mirror])
    await db.flush()
    # Preserve independent grading evidence before withdrawing the original catalog entries.
    sessions = list((await db.scalars(select(ExamSession).with_for_update())).all())
    for session in sessions:
        state = deepcopy(session.dynamic_state or {})
        snapshots = state.setdefault('_gradebook_snapshots', {})
        referenced = {session.ticket_id, *[q.get('ticket_id') for q in state.get('dds', {}).get('queue', [])]}
        changed = False
        for old_id in referenced & mapping.keys():
            if old_id not in snapshots:
                source = originals.get(old_id)
                if source:
                    snapshots[old_id] = {'ticket_id': old_id, 'title': source.title,
                                         'etalon': deepcopy(source.ground_truth or {}),
                                         'incoming_card': incoming_card_from_ticket(source)}
                    changed = True
        if changed:
            session.dynamic_state = state
    for lesson in (await db.scalars(select(Assignment).with_for_update())).all():
        if lesson.status != 'WAITING':
            continue
        if lesson.scenario_id in mapping:
            lesson.scenario_id = mapping[lesson.scenario_id]
        lesson.card_pool_ids = [mapping.get(i, i) for i in lesson.card_pool_ids or []]
    for old_id in mapping:
        if old_id in originals:
            originals[old_id].is_deleted = True
        if old_id in mirrors:
            mirrors[old_id].is_deleted = True
    await db.flush()
    return mapping
