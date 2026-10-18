"""A-06 independent acceptance. Owned by GPT lead, not the product worker."""
import asyncio
import uuid
from copy import deepcopy

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from backend.main import app
from backend.database import AsyncSessionLocal
from backend.core.security import create_access_token
from backend.models.domain_01 import User, StudentGroup
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import Assignment, ExamSession
from backend.models.domain_04 import IncidentCard, EvaluationResult, TicketResult


INCOMING = {
    "connection": "Установлено",
    "phones": {"aon": "000", "provided": "000", "onSite": ""},
    "incident": {"number": "A06-112", "savedAt": "17.10.2026 10:00", "operator": "112"},
    "caller": {"name": "Учебный заявитель", "role": "очевидец", "address": "Учебная улица, 1"},
    "description": "Учебная авария водопровода",
    "statuses": {"injured": "нет", "ambulanceRefusal": "нет", "blocked": "нет"},
    "emergency": {"cs": False, "cp": False},
    "classification": {"section": "ЖКХ", "title": "Водопровод", "class": "Авария", "visClass": ""},
    "services": [{"id": "water", "name": "Аварийная служба", "time": "10:00", "status": "Получена службой", "isRejected": False, "history": []}],
}


async def request(method, path, user=None, **kwargs):
    headers = {} if user is None else {"Authorization": "Bearer " + create_access_token(user[0], user[1])}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=headers) as client:
        return await client.request(method, path, **kwargs)


async def setup_group(n=2):
    tag = uuid.uuid4().hex
    async with AsyncSessionLocal() as db:
        teacher = User(username=f"a06_t_{tag}", role="TEACHER", password_hash="unused")
        other = User(username=f"a06_o_{tag}", role="TEACHER", password_hash="unused")
        admin = User(username=f"a06_a_{tag}", role="ADMIN", password_hash="unused")
        users = [User(username=f"a06_c{i}_{tag}", full_name=f"Участник {i}", role="CADET", password_hash="unused") for i in range(n + 1)]
        db.add_all([teacher, other, admin, *users]); await db.flush()
        group = StudentGroup(group_name=f"a06_g_{tag}", teacher_id=teacher.user_id,
                             cadet_ids=[u.user_id for u in users[:n]])
        # Overlapping membership must be deduplicated, not treated as two separate rosters.
        group.students = users[:1]
        ticket = ScenarioTicket(workflow_state={"status": "APPROVED"}, title=f"Авария {tag}", content={"incoming_card": deepcopy(INCOMING)},
                                ground_truth={"SECRET_ETALON": "must not reach cadet"})
        bad = ScenarioTicket(title=f"Неполный {tag}", content={})
        db.add_all([group, ticket, bad]); await db.commit()
        return {"teacher": (teacher.user_id, "TEACHER"), "other": (other.user_id, "TEACHER"),
                "admin": (admin.user_id, "ADMIN"), "cadets": [(u.user_id, "CADET") for u in users[:n]],
                "outsider": (users[-1].user_id, "CADET"), "group_id": group.group_id,
                "ticket_id": ticket.scenario_id, "bad_ticket_id": bad.scenario_id, "n": n}


async def create(d, ticket=True):
    payload = {"group_id": d["group_id"], "target_role": "DISPATCHER_DDS", "complexity": "level_1"}
    if ticket:
        payload["ticket_id"] = d["ticket_id"]
    r = await request("POST", "/api/v1/lessons", d["teacher"], json=payload)
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def start(d):
    lesson = await create(d)
    r = await request("POST", f"/api/v1/lessons/{lesson}/start", d["teacher"])
    assert r.status_code == 200, r.text
    states = []
    for cadet in d["cadets"]:
        r = await request("GET", "/api/dds/assignments", cadet)
        assert r.status_code == 200, r.text
        own = [s for s in r.json() if s["lesson_id"] == lesson]
        assert len(own) == 1, r.text
        states.append(own[0])
    return lesson, states


def action(key=None, **extra):
    return {"request_id": key or str(uuid.uuid4()), "kind": "status", "service_name": "Аварийная служба",
            "status": "Принята", "comment": "Учебное решение", "order_number": "Н-17", **extra}


async def state(d, s, index=0):
    r = await request("GET", f"/api/dds/sessions/{s['session_id']}", d["cadets"][index])
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.asyncio
@pytest.mark.parametrize("n", [2, 5])
async def test_n_members_get_independent_snapshot_and_idempotent_start(n):
    d = await setup_group(n); lesson, states = await start(d)
    assert len({s["session_id"] for s in states}) == n
    assert len({s["card_id"] for s in states}) == n
    assert all(s["ticket_id"] == d["ticket_id"] and s["score"] is None for s in states)
    assert all(s["incoming_card"]["description"] == INCOMING["description"] for s in states)
    before = await request("GET", f"/api/v1/lessons/{lesson}", d["teacher"])
    again = await request("POST", f"/api/v1/lessons/{lesson}/start", d["teacher"])
    assert again.status_code == 200, again.text
    assert again.json()["started_at"] == before.json()["started_at"]
    async with AsyncSessionLocal() as db:
        sessions = (await db.scalars(select(ExamSession).where(ExamSession.assignment_id == lesson))).all()
        assert len(sessions) == n
        assert await db.scalar(select(func.count()).select_from(IncidentCard).where(IncidentCard.session_id.in_([s.session_id for s in sessions]))) == n
        ticket = await db.get(ScenarioTicket, d["ticket_id"])
        ticket.content = {"incoming_card": {**INCOMING, "description": "Changed after start"}}
        await db.commit()
    assert (await state(d, states[0]))["incoming_card"]["description"] == INCOMING["description"]
    assert "SECRET_ETALON" not in str(states)


@pytest.mark.asyncio
async def test_actions_persist_retry_conflict_dispatch_and_cadet_isolation():
    d = await setup_group(); lesson, ss = await start(d); s = ss[0]
    path = f"/api/dds/sessions/{s['session_id']}/actions"
    payload = action()
    r = await request("POST", path, d["cadets"][0], json=payload)
    assert r.status_code == 200, r.text
    assert len(r.json()["actions"]) == 1
    saved = r.json()["actions"][0]
    assert saved["actor_id"] == d["cadets"][0][0] and saved["at"]
    assert (await request("POST", path, d["cadets"][0], json=payload)).json() == r.json()
    assert (await request("POST", path, d["cadets"][0], json={**payload, "comment": "different"})).status_code == 409
    dispatch = {"request_id": str(uuid.uuid4()), "kind": "dispatch", "service_name": "Аварийная служба", "who_accepted": "Дежурный", "summary": "Направлена бригада"}
    r = await request("POST", path, d["cadets"][0], json=dispatch)
    assert r.status_code == 200, r.text
    restored = await state(d, s)
    assert len(restored["actions"]) == 2 and restored["incoming_card"] == s["incoming_card"]
    assert (await state(d, ss[1], 1))["actions"] == []
    async with AsyncSessionLocal() as db:
        card = await db.get(IncidentCard, s["card_id"])
        assert card.filled_data == s["incoming_card"]


@pytest.mark.asyncio
async def test_parallel_start_action_finish_are_not_duplicate_or_lost_updates():
    d = await setup_group(); lesson = await create(d)
    rs = await asyncio.gather(*[request("POST", f"/api/v1/lessons/{lesson}/start", d["teacher"]) for _ in range(3)])
    assert all(r.status_code == 200 for r in rs), [(r.status_code, r.text) for r in rs]
    s = next(s for s in (await request("GET", "/api/dds/assignments", d["cadets"][0])).json() if s["lesson_id"] == lesson)
    path = f"/api/dds/sessions/{s['session_id']}"
    payload = action()
    rs = await asyncio.gather(*[request("POST", path + "/actions", d["cadets"][0], json=payload) for _ in range(3)])
    assert all(r.status_code == 200 for r in rs), [(r.status_code, r.text) for r in rs]
    distinct = [action(comment=f"Событие {i}") for i in range(3)]
    rs = await asyncio.gather(*[request("POST", path + "/actions", d["cadets"][0], json=p) for p in distinct])
    assert all(r.status_code == 200 for r in rs), [(r.status_code, r.text) for r in rs]
    assert len((await state(d, s))["actions"]) == 4
    rs = await asyncio.gather(*[request("POST", path + "/finish", d["cadets"][0], json={}) for _ in range(3)])
    assert all(r.status_code == 200 for r in rs), [(r.status_code, r.text) for r in rs]
    assert len({r.json()["submitted_at"] for r in rs}) == 1
    assert (await request("POST", path + "/actions", d["cadets"][0], json=action())).status_code == 409
    assert (await request("POST", path + "/actions", d["cadets"][0], json=payload)).status_code == 200
    async with AsyncSessionLocal() as db:
        assert await db.scalar(select(func.count()).select_from(ExamSession).where(ExamSession.assignment_id == lesson)) == 2
        assert await db.scalar(select(func.count()).select_from(EvaluationResult).where(EvaluationResult.session_id == s["session_id"])) == 0


@pytest.mark.asyncio
async def test_completed_ungraded_and_teacher_stop_are_honest_in_history_and_report():
    d = await setup_group(); lesson, ss = await start(d)
    first = await request("POST", f"/api/dds/sessions/{ss[0]['session_id']}/finish", d["cadets"][0], json={})
    assert first.status_code == 200 and first.json()["score"] is None, first.text
    stop = await request("POST", f"/api/v1/lessons/{lesson}/stop", d["teacher"])
    assert stop.status_code == 200, stop.text
    again = await request("POST", f"/api/v1/lessons/{lesson}/stop", d["teacher"])
    assert again.json()["completed_at"] == stop.json()["completed_at"]
    assert (await request("POST", f"/api/v1/lessons/{lesson}/start", d["teacher"])).status_code == 409
    assert (await request("POST", f"/api/dds/sessions/{ss[1]['session_id']}/finish", d["cadets"][1], json={})).status_code == 409
    assert (await state(d, ss[0]))["submitted_at"] == first.json()["submitted_at"]
    assert (await state(d, ss[1], 1))["submitted_at"] is None
    r = await request("GET", "/api/v1/lessons", d["teacher"])
    history = next(x for x in r.json() if x["id"] == lesson)
    assert history["avg_score"] is None
    assert history["passed_count"] == history["failed_count"] == 0
    people = {x["cadet_id"]: x for x in history["students"]}
    assert people[d["cadets"][0][0]]["status"] == "COMPLETED"
    assert people[d["cadets"][1][0]]["status"] == "INCOMPLETE"
    assert all(p["score"] is None for p in people.values())
    assert all(p["tickets"][0]["ticket_id"] == d["ticket_id"] for p in people.values())
    report = await request("GET", f"/api/ai-analytics/lessons/{lesson}/data", d["teacher"])
    assert report.status_code == 200, report.text
    assert report.json()["summary"] == {"student_count": 2, "completed_session_count": 2, "evaluation_count": 0, "ticket_result_count": 0, "incident_card_count": 2}
    async with AsyncSessionLocal() as db:
        group = await db.get(StudentGroup, d["group_id"])
        group.cadet_ids = []; group.students = []
        await db.commit()
    assert len((await request("GET", f"/api/v1/lessons/{lesson}", d["teacher"])).json()["students"]) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("who", ["anonymous", "other", "outsider", "peer"])
async def test_foreign_ids_cannot_read_or_mutate(who):
    d = await setup_group(); lesson, ss = await start(d)
    user = None if who == "anonymous" else d["cadets"][1] if who == "peer" else d[who]
    base = f"/api/dds/sessions/{ss[0]['session_id']}"
    for method, path, payload in [("GET", base, None), ("POST", base+"/actions", action()), ("POST", base+"/finish", {})]:
        kwargs = {} if payload is None else {"json": payload}
        r = await request(method, path, user, **kwargs)
        assert r.status_code in (401, 403, 404), (who, path, r.text)
    assert (await state(d, ss[0]))["actions"] == []
    if who in ("anonymous", "other"):
        for tail in ["", "/stats", "/start", "/stop", "/notes"]:
            method = "PATCH" if tail == "/notes" else "POST" if tail in ("/start", "/stop") else "GET"
            r = await request(method, f"/api/v1/lessons/{lesson}{tail}", user, **({"json": {"teacher_notes": "intrusion"}} if tail == "/notes" else {}))
            assert r.status_code in (401, 403, 404), (tail, r.text)


@pytest.mark.asyncio
@pytest.mark.parametrize("change", [{"score":100}, {"at":"2000-01-01"}, {"service_name":"Чужая служба"}, {"status":"invented"}, {"kind":"dispatch", "who_accepted":"", "summary":""}])
async def test_invalid_or_client_supplied_facts_rejected(change):
    d = await setup_group(); _, ss = await start(d)
    r = await request("POST", f"/api/dds/sessions/{ss[0]['session_id']}/actions", d["cadets"][0], json=action(**change))
    assert r.status_code in (400, 409, 422), r.text
    assert (await state(d, ss[0]))["actions"] == []


@pytest.mark.asyncio
async def test_legacy_mutations_cannot_bypass_cycle_or_manufacture_success():
    d = await setup_group(); lesson, ss = await start(d); s = ss[0]
    for path, payload in [
        ("/api/dds/action", {"card_id":s["card_id"], "service_name":"Аварийная служба", "status":"Принята"}),
        (f"/api/dds/cards/{s['card_id']}/action", {"service_name":"Аварийная служба", "status":"Принята"}),
        (f"/api/v1/sessions/{s['session_id']}/evaluate", {"ticket_id":d["ticket_id"], "assigned_services":[], "time_taken_seconds":0, "caller_name":"Учебный", "caller_status":"очевидец", "incident_description":"Авария"}),
        (f"/api/v2/assignments/{lesson}/sessions/start", {"cadet_id":d["cadets"][0][0]}),
    ]:
        r = await request("POST", path, d["cadets"][0], json=payload)
        assert r.status_code in (403, 409), (path, r.status_code, r.text)
    r = await request("POST", "/api/dds/action", d["cadets"][0], json={"card_id":"does-not-exist","status":"Принята"})
    assert r.status_code == 404
    assert (await state(d, s))["actions"] == []


@pytest.mark.asyncio
async def test_existing_fractional_zero_scores_and_dedup_are_preserved_without_new_rubric():
    d = await setup_group(); lesson, ss = await start(d)
    for i, s in enumerate(ss):
        await request("POST", f"/api/dds/sessions/{s['session_id']}/finish", d["cadets"][i], json={})
    await request("POST", f"/api/v1/lessons/{lesson}/stop", d["teacher"])
    # Synthetic stored results exercise reading only, not a claimed implemented grader.
    async with AsyncSessionLocal() as db:
        db.add(EvaluationResult(card_id=ss[0]["card_id"], session_id=ss[0]["session_id"], scores={"total":0}, errors_list=["zero evidence"]))
        db.add(EvaluationResult(card_id=ss[1]["card_id"], session_id=ss[1]["session_id"], scores={"final_score":71.25}, errors_list=[]))
        db.add(TicketResult(session_id=ss[1]["session_id"], ticket_id=d["ticket_id"], score_total=71.25, status="completed", is_passed=True))
        await db.commit()
    assert (await state(d, ss[0]))["score"] == 0
    history = next(x for x in (await request("GET", "/api/v1/lessons", d["teacher"])).json() if x["id"] == lesson)
    assert history["avg_score"] == 35.6
    assert sorted(p["score"] for p in history["students"]) == [0, 71.25]
    assert all(len(p["tickets"]) == 1 for p in history["students"])
    assert history["passed_count"] == 1 and history["failed_count"] == 0


@pytest.mark.asyncio
async def test_ticket_catalog_and_creation_are_protected_and_missing_ticket_start_is_atomic():
    d = await setup_group()
    catalog = await request("GET", "/api/dds/tickets", d["teacher"])
    assert catalog.status_code == 200, catalog.text
    assert any(t["ticket_id"] == d["ticket_id"] for t in catalog.json())
    assert not any(t["ticket_id"] == d["bad_ticket_id"] for t in catalog.json())
    assert "SECRET_ETALON" not in catalog.text
    assert (await request("GET", "/api/dds/tickets", d["cadets"][0])).status_code == 403
    payload = {"group_id":d["group_id"],"target_role":"DISPATCHER_DDS","ticket_id":d["ticket_id"]}
    assert (await request("POST", "/api/v1/lessons", d["other"], json=payload)).status_code == 403
    # Public creation rejects missing tickets. A legacy incomplete WAITING row
    # must still fail atomically when someone tries to start it.
    missing = await request("POST", "/api/v1/lessons", d["teacher"], json={"group_id":d["group_id"],"target_role":"DISPATCHER_DDS"})
    assert missing.status_code == 422
    async with AsyncSessionLocal() as db:
        incomplete = Assignment(group_id=d["group_id"], assigned_by=d["teacher"][0], target_role="DISPATCHER_DDS", session_type="CARD_ACTIONS", status="WAITING")
        db.add(incomplete)
        await db.commit()
        lesson = incomplete.assignment_id
    r = await request("POST", f"/api/v1/lessons/{lesson}/start", d["teacher"])
    assert r.status_code in (409,422), r.text
    async with AsyncSessionLocal() as db:
        assert (await db.get(Assignment, lesson)).status == "WAITING"
        assert await db.scalar(select(func.count()).select_from(ExamSession).where(ExamSession.assignment_id == lesson)) == 0


@pytest.mark.asyncio
async def test_unstructured_trainee_text_is_saved_but_not_automatically_sent_to_llm():
    d = await setup_group(); lesson, ss = await start(d); s = ss[0]
    private_note = "PERSONAL_TRAINEE_NOTE_NOT_FOR_LLM"
    r = await request("POST", f"/api/dds/sessions/{s['session_id']}/actions", d["cadets"][0], json=action(comment=private_note))
    assert r.status_code == 200, r.text
    assert private_note in str((await state(d,s))["actions"])
    await request("POST", f"/api/dds/sessions/{s['session_id']}/finish", d["cadets"][0], json={})
    await request("POST", f"/api/v1/lessons/{lesson}/stop", d["teacher"])
    report = await request("GET", f"/api/ai-analytics/lessons/{lesson}/data", d["teacher"])
    assert report.status_code == 200, report.text
    assert private_note not in report.text


@pytest.mark.asyncio
async def test_legacy_read_submit_and_message_do_not_escape_assigned_session_boundary():
    d = await setup_group(); _, ss = await start(d); s = ss[0]
    r = await request("GET", f"/api/v2/sessions/{s['session_id']}", d["cadets"][1])
    assert r.status_code in (403,404), r.text
    for tail,payload in [("submit_card", {"operator_id":d["cadets"][0][0],"filled_data":{"fake":True},"assigned_services":[]}), ("message", {"text":"must not call any LLM"})]:
        r = await request("POST", f"/api/v2/sessions/{s['session_id']}/{tail}", d["cadets"][0], json=payload)
        assert r.status_code in (403,409), r.text
    cards = await request("GET", "/api/dds/cards", d["cadets"][0])
    assert cards.status_code == 200, cards.text
    assert not any(c["card_id"] == ss[1]["card_id"] for c in cards.json())


@pytest.mark.asyncio
async def test_nested_incoming_secrets_are_removed_from_snapshot():
    d = await setup_group()
    async with AsyncSessionLocal() as db:
        ticket=await db.get(ScenarioTicket,d["ticket_id"])
        incoming=deepcopy(INCOMING)
        incoming["caller"]["hidden_etalon"]="NESTED_SECRET"
        incoming["services"][0]["history"]=[{"status":"Получена службой","ground_truth":"NESTED_SECRET"}]
        incoming["unknown"]="NESTED_SECRET"
        ticket.content={"incoming_card":incoming}
        await db.commit()
    _,ss=await start(d)
    assert "NESTED_SECRET" not in str(ss)


@pytest.mark.asyncio
async def test_teacher_list_and_cadet_list_do_not_include_another_owners_assignments():
    d=await setup_group(); lesson,_=await start(d)
    others=await request('GET','/api/v1/lessons',d['other'])
    assert others.status_code==200,others.text
    assert all(item['id']!=lesson for item in others.json())
    outside=await request('GET','/api/dds/assignments',d['outsider'])
    assert outside.status_code==200 and outside.json()==[],outside.text


@pytest.mark.asyncio
async def test_start_replay_does_not_add_late_members_or_reopen_submitted_session():
    d=await setup_group();lesson,ss=await start(d)
    done=await request('POST',f"/api/dds/sessions/{ss[0]['session_id']}/finish",d['cadets'][0],json={})
    assert done.status_code==200,done.text
    async with AsyncSessionLocal() as db:
        group=await db.get(StudentGroup,d['group_id'])
        group.cadet_ids=[*group.cadet_ids,d['outsider'][0]]
        await db.commit()
    replay=await request('POST',f'/api/v1/lessons/{lesson}/start',d['teacher'])
    assert replay.status_code==200,replay.text
    assert (await state(d,ss[0]))['submitted_at']==done.json()['submitted_at']
    assert (await state(d,ss[0]))['session_status']=='COMPLETED'
    outside=await request('GET','/api/dds/assignments',d['outsider'])
    assert all(s['lesson_id']!=lesson for s in outside.json())


@pytest.mark.asyncio
@pytest.mark.parametrize('operation',['read','action','finish'])
async def test_dds_api_rejects_operator_session_without_mutating_it(operation):
    d=await setup_group()
    async with AsyncSessionLocal() as db:
        lesson=Assignment(group_id=d['group_id'],assigned_by=d['teacher'][0],target_role='OPERATOR_112',session_type='CALL_SIMULATION',status='ACTIVE')
        db.add(lesson);await db.flush()
        session=ExamSession(assignment_id=lesson.assignment_id,cadet_id=d['cadets'][0][0],session_type='CALL_SIMULATION',status='ACTIVE')
        db.add(session);await db.flush()
        db.add(IncidentCard(session_id=session.session_id,operator_id=d['cadets'][0][0],card_origin='runtime',filled_data=deepcopy(INCOMING),assigned_services={'Аварийная служба':{'status':'Получена службой','history':[]}}))
        await db.commit();sid=session.session_id
    base=f'/api/dds/sessions/{sid}'
    if operation=='read': r=await request('GET',base,d['cadets'][0])
    else: r=await request('POST',base+('/actions' if operation=='action' else '/finish'),d['cadets'][0],json=action() if operation=='action' else {})
    assert r.status_code in (403,409),r.text
    async with AsyncSessionLocal() as db:
        session=await db.get(ExamSession,sid)
        assert session.status=='ACTIVE' and not (session.dynamic_state or {}).get('dds')


@pytest.mark.asyncio
async def test_legacy_appeals_cannot_rewrite_new_assigned_dds_results():
    d=await setup_group();_,ss=await start(d);s=ss[0]
    async with AsyncSessionLocal() as db:
        result=TicketResult(session_id=s['session_id'],ticket_id=d['ticket_id'],score_total=40,status='completed',is_passed=False)
        db.add(result);await db.commit();rid=result.result_id
    for path,user,payload in [
        (f'/api/v2/ticket-results/{rid}/appeal',d['cadets'][1],{'is_passed':True,'teacher_comment':'unauthorised'}),
        (f'/api/v2/tickets/{rid}/appeal',d['teacher'],{'is_passed':True,'teacher_comment':'out of scope'}),
        (f'/api/v1/analytics/records/{rid}/appeal',d['other'],{'status':'passed','comment':'Недопустимое изменение результата'}),
    ]:
        r=await request('PATCH',path,user,json=payload)
        assert r.status_code in (403,409),(path,r.status_code,r.text)
    async with AsyncSessionLocal() as db:
        result=await db.get(TicketResult,rid)
        assert result.is_passed is False and result.score_total==40


@pytest.mark.asyncio
async def test_legacy_telephony_cannot_overwrite_assigned_dds_state():
    from backend.api.router_telephony import _update_db_session_call_status
    d=await setup_group();_,ss=await start(d);s=ss[0]
    before=await state(d,s)
    async with AsyncSessionLocal() as db:
        await _update_db_session_call_status(db,s['session_id'],'RINGING','1002','fake-ticket','legacy-call')
    after=await state(d,s)
    assert after==before
    async with AsyncSessionLocal() as db:
        session=await db.get(ExamSession,s['session_id'])
        assert not session.browser_call and 'call_status' not in session.dynamic_state


@pytest.mark.asyncio
async def test_empty_completed_lesson_does_not_invent_participation_from_current_group():
    d=await setup_group()
    async with AsyncSessionLocal() as db:
        lesson=Assignment(group_id=d['group_id'],assigned_by=d['teacher'][0],target_role='DISPATCHER_DDS',session_type='CARD_ACTIONS',status='COMPLETED')
        db.add(lesson);await db.commit();lid=lesson.assignment_id
    r=await request('GET',f'/api/v1/lessons/{lid}',d['teacher'])
    assert r.status_code==200,r.text
    assert r.json()['students']==[] and r.json()['total_cadets']==0


@pytest.mark.asyncio
async def test_legacy_multiple_real_cards_are_not_collapsed_into_a_fictional_ticket():
    d=await setup_group()
    async with AsyncSessionLocal() as db:
        lesson=Assignment(group_id=d['group_id'],assigned_by=d['teacher'][0],target_role='DISPATCHER_DDS',session_type='CARD_ACTIONS',status='COMPLETED')
        db.add(lesson);await db.flush()
        session=ExamSession(assignment_id=lesson.assignment_id,cadet_id=d['cadets'][0][0],session_type='CARD_ACTIONS',status='COMPLETED')
        db.add(session);await db.flush()
        ids=[]
        for score in (60,80):
            card=IncidentCard(session_id=session.session_id,operator_id=d['cadets'][0][0],card_origin='DDS',filled_data={},status='closed')
            db.add(card);await db.flush();ids.append(card.card_id)
            db.add(EvaluationResult(session_id=session.session_id,card_id=card.card_id,scores={'total':score}))
        await db.commit();lid=lesson.assignment_id
    r=await request('GET',f'/api/v1/lessons/{lid}',d['teacher'])
    assert r.status_code==200,r.text
    student=r.json()['students'][0]
    assert student['score']==70
    assert len(student['tickets'])==2
    assert {t['card_id'] for t in student['tickets']}==set(ids)
    assert sorted(t['score'] for t in student['tickets'])==[60,80]
    assert all(t['ticket_id']!='ticket-dds' for t in student['tickets'])


@pytest.mark.asyncio
async def test_cadet_cannot_read_peer_actions_via_group_lesson_detail():
    d=await setup_group();lesson,_=await start(d)
    for cadet in d['cadets']:
        for tail in ('','/stats'):
            r=await request('GET',f'/api/v1/lessons/{lesson}{tail}',cadet)
            assert r.status_code==403,r.text


@pytest.mark.asyncio
async def test_legacy_placeholder_result_does_not_imply_failure():
    d=await setup_group()
    async with AsyncSessionLocal() as db:
        lesson=Assignment(group_id=d['group_id'],assigned_by=d['teacher'][0],target_role='DISPATCHER_DDS',session_type='CARD_ACTIONS',status='COMPLETED')
        db.add(lesson);await db.flush()
        session=ExamSession(assignment_id=lesson.assignment_id,cadet_id=d['cadets'][0][0],ticket_id=d['ticket_id'],session_type='CARD_ACTIONS',status='COMPLETED')
        db.add(session);await db.flush()
        db.add(TicketResult(session_id=session.session_id,ticket_id=d['ticket_id'],status=None,is_passed=False,score_total=None))
        await db.commit();lid=lesson.assignment_id
    r=await request('GET',f'/api/v1/lessons/{lid}',d['teacher'])
    assert r.status_code==200,r.text
    student=r.json()['students'][0]
    assert student['passed']==student['failed']==0 and student['score'] is None
    assert student['tickets'][0]['status'] not in ('passed','failed')
