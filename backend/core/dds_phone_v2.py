"""Independent service progress with one active phone report, persisted in the snapshot."""
from copy import deepcopy
from datetime import timedelta

from backend.core import dds_exercise as t
from backend.core.dds_service_policy import WITHOUT_BRIGADE, allowed_statuses, context
from backend.schemas.dds_exercise import STAGES


def initialize(plan, card_id, at):
    names = list(dict.fromkeys(c['service_name'] for c in plan['contacts']))
    return {'version': 2, 'plan': deepcopy(plan), 'index': 0, 'accepted': None, 'due_at': None,
            'outgoing': {}, 'requests': [], 'notes': {}, 'events': [],
            'services': {name: {'index': 0, 'paused': False, 'terminal': False, 'due_at': None}
                         for name in names}, 'received_at': at}


def reports(ex, name):
    contacts = {c['id']: c['service_name'] for c in ex['plan']['contacts']}
    return [r for r in ex['plan']['reports'] if contacts[r['contact_id']] == name]


def current(ex):
    if ex['accepted']:
        return next(r for r in ex['plan']['reports'] if r['id'] == ex['accepted'])
    candidates = [(progress['due_at'], order, reports(ex, name)[progress['index']])
                  for order, (name, progress) in enumerate(ex['services'].items())
                  if progress['due_at'] and not progress['paused'] and not progress['terminal']]
    return min(candidates, key=lambda item: (t.parse_time(item[0]), item[1]))[2] if candidates else None


def refresh_due(ex):
    report = current(ex)
    ex['due_at'] = ex['services'][t.contact_for(ex, report)['service_name']]['due_at'] if report else None


def finished(ex):
    return all(p['terminal'] or p['paused'] for p in ex['services'].values())


def action_issue(data, payload, service_status):
    ex = data['exercise']
    if payload.kind == 'dispatch':
        call = ex['outgoing'].get(payload.service_name)
        if not call or call.get('report_id') != ex['accepted']:
            return 'call_required'
        return None if service_status == 'Принята' else 'transition'
    if payload.status == service_status and service_status in ('Принята', *STAGES[:-1]) and (payload.comment or '').strip():
        return None
    if payload.status in STAGES and not ex['accepted']:
        return 'premature'
    options = allowed_statuses(service_status, **context(data, payload.service_name))
    if payload.status not in options:
        return 'wrong_stage' if ex['accepted'] and payload.status in STAGES else 'transition'
    if payload.status in ('Не принята', 'Отказ от выполнения работ', WITHOUT_BRIGADE):
        return None if (payload.comment or '').strip() else 'refusal'
    if payload.status == 'Принята':
        return None
    if payload.status == 'Работы завершены' and not (payload.comment or '').strip():
        return 'result_comment'
    report = current(ex)
    if not report or ex['accepted'] != report['id']:
        return 'premature'
    if t.contact_for(ex, report)['service_name'] != payload.service_name:
        return 'wrong_service'
    if report['status'] != payload.status:
        return 'wrong_stage'
    if payload.status == STAGES[0] and not any(a['kind'] == 'dispatch' and a['service_name'] == payload.service_name for a in data['actions']):
        return 'report_note'
    if not ex['notes'].get(report['id'], '').strip():
        return 'report_note'
    return None


def accepted_action(data, payload, at):
    ex = data['exercise']
    name = payload.service_name
    progress = ex['services'][name]
    # A repeated status with a comment supplements history without consuming another report.
    previous = next((a.get('status') for a in reversed(data['actions'][:-1])
                     if a['kind'] == 'status' and a['service_name'] == name), None)
    if payload.kind == 'status' and payload.status == previous:
        t.event(ex, 'action', at, data['card_id'], service_name=name, action=payload.model_dump(exclude_none=True))
        return
    report = current(ex) if ex['accepted'] else None
    if payload.kind == 'dispatch':
        note = f"{payload.who_accepted}\n{payload.summary}"
        ex['notes'][report['id']] = note
        t.event(ex, 'note', at, data['card_id'], service_name=name, report_id=report['id'], note=note)
    issues = t.accuracy_issues(data, payload)
    if issues:
        action = payload.model_dump(exclude_none=True)
        if payload.kind == 'status' and report:
            action['note'] = ex['notes'].get(report['id'], '')
        t.event(ex, 'mistake', at, data['card_id'], service_name=name, reason='record_accuracy',
                blocking=False, message=' '.join(issues), action=action,
                report_id=report['id'] if report else None)
    t.event(ex, 'action', at, data['card_id'], service_name=name, action=payload.model_dump(exclude_none=True))
    if payload.kind == 'dispatch':
        return
    if payload.status == 'Принята':
        progress['paused'] = False
    elif payload.status in ('Не принята', 'Отказ от выполнения работ', WITHOUT_BRIGADE):
        progress['paused'] = payload.status == 'Не принята'
        progress['terminal'] = not progress['paused']
        progress['due_at'] = None
        if report and t.contact_for(ex, report)['service_name'] == name:
            ex['accepted'] = None
        t.event(ex, 'service_paused' if progress['paused'] else 'service_stopped', at, data['card_id'], service_name=name)
    elif payload.status in STAGES:
        answered = next(e for e in reversed(ex['events']) if e['kind'] in ('dialed', 'answered') and e.get('report_id') == report['id'])
        t.event(ex, 'report_processed', at, data['card_id'], report_id=report['id'], service_name=name,
                delay_seconds=max(0, (t.parse_time(at) - t.parse_time(answered['at'])).total_seconds()))
        progress['index'] += 1
        ex['index'] += 1
        ex['accepted'] = None
        progress['terminal'] = progress['index'] == 4
        progress['due_at'] = None if progress['terminal'] else (t.parse_time(at) + timedelta(seconds=3)).isoformat()
        if progress['due_at']:
            next_report = reports(ex, name)[progress['index']]
            t.event(ex, 'incoming_scheduled', at, data['card_id'], report_id=next_report['id'], service_name=name, due_at=progress['due_at'])
    refresh_due(ex)


def dial(data, contact, at):
    """Return a domain error or accept the departure report of the selected service."""
    ex = data['exercise']
    if ex['accepted']:
        return 'phone_busy'
    progress = ex['services'][contact['service_name']]
    report = reports(ex, contact['service_name'])[0]
    if progress['index'] or progress['paused'] or progress['terminal']:
        return 'transition'
    if report['contact_id'] != contact['id']:
        return 'wrong_contact'
    call = t.event(ex, 'dialed', at, data['card_id'], service_name=contact['service_name'],
                   contact_id=contact['id'], number=contact['number'], report_id=report['id'],
                   text=report['text'], audio=report.get('audio'))
    ex['outgoing'][contact['service_name']] = {'contact_id': contact['id'], 'call_id': call['id'],
                                              'report_id': report['id'], 'text': report['text'], 'audio': report.get('audio')}
    ex['accepted'] = report['id']
    refresh_due(ex)
    return None
