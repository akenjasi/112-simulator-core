"""Four authored demo scenarios using exact EKP records and the common generator.

The prepared manifest is the reviewable input: applying it never regenerates facts.
"""
from datetime import datetime, timezone
import json
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, or_, select

from backend.core.dds_cycle import build_incoming_card
from backend.core.dds_exercise import validated_plan
from backend.core.dds_phone_catalog import AUDIO_DIR, default_phone_plan
from backend.core.faker import FakeDataGenerator
from backend.core.ticket_generator import generate_tickets
from backend.core.ticket_storage import save_generated_ticket
from backend.models.domain_02 import GeneratedTicket, ScenarioTicket
from backend.models.domain_03 import Assignment, CardActionSession, ExamSession, SessionStateModel
from backend.models.domain_04 import EvaluationResult, IncidentCard, SessionReport, TicketResult
from backend.models.dds_report_job import LegacyDDSReportJob
from backend.models.report_job import ReportJob
from backend.schemas.generator import ClassifierRow, TicketData

CATALOG = "dds-city-demo-v1"
SEED = 1122026
CLASSIFIER = Path(__file__).resolve().parents[2] / "assets/reference/classifier_ekp.json"
LEGACY_ROOTS = {"prototype-dds-phone-1": 14020602, "prototype-dds-phone-2": 13020500}
# Names deliberately match the source, except the standard 101/103/104 UI aliases.
SPECS = (
    (14080106, "Дерево. Двор (упало).", ["Гор. Хозяйство", "Управа района / Префектура"],
     "По адресу {address} во дворе упало дерево и перегородило пешеходную дорожку. "
     "Люди и автомобили не задеты, пострадавших нет. Очевидец {fio} находится рядом. "
     "Требуются ограждение участка и уборка дерева.", False),
    (14020602, "Прорыв воды. Двор.", ["Мосводоканал", "Гор. Хозяйство"],
     "По адресу {address} во дворе из-под асфальта вытекает холодная вода, затапливает дорожку. "
     "Очевидец {fio} сообщает, что пострадавших нет. Требуются ограждение участка, "
     "устранение повреждения водопровода и отвод воды.", False),
    (14100101, "Лифт. Застревание. Медицинская помощь.", ["Мослифт", "01 Пожарные", "03 Скорая"],
     "По адресу {address}, подъезд {entrance}, лифт остановился между этажами. Внутри заблокированы "
     "два человека; одному стало плохо, требуется медицинская помощь. Очевидец {fio} находится "
     "снаружи у дверей лифта и поддерживает связь с людьми. Требуются освобождение людей "
     "и помощь медицинской бригады.", True),
    (13020500, "Запах газа. Подъезд.", ["04 Газ", "01 Пожарные"],
     "По адресу {address}, подъезд {entrance}, ощущается сильный запах бытового газа. "
     "Очевидец {fio} вышел на улицу и сообщил о происшествии. Дыма и открытого огня нет, "
     "пострадавших нет. Требуются проверка газового оборудования и обеспечение безопасности.", False),
)


class DemoTicket(BaseModel):
    model_config = ConfigDict(extra="forbid")
    classifier_id: int
    category: str
    short_title: str
    final_type: str
    data: TicketData


class DemoManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    catalog: str = CATALOG
    seed: int = SEED
    prepared_at: datetime
    tickets: list[DemoTicket]


def ticket_id(record_id):
    return str(uuid5(NAMESPACE_URL, f"112-simulator/{CATALOG}/{record_id}"))


def classifier_records():
    return {r["id"]: r for r in json.loads(CLASSIFIER.read_text())["records"]}


def prepare_demo():
    rows = classifier_records()
    faker = FakeDataGenerator(seed=SEED)
    tickets = []
    for record_id, title, services, template, medical in SPECS:
        row = rows[record_id]
        generated = generate_tickets(ClassifierRow(code=str(record_id), incident_name=row["final_type"],
            services=services, markers=[], templates=[template]), 1, faker, caller_role="очевидец")[0]
        generated.ticket_id = ticket_id(record_id)
        generated.ground_truth.update(classifier_id=record_id, **{"class": row["final_type"], "visClass": ""},
            injured="да" if medical else "нет", blocked="да" if medical else "нет", ambulanceRefusal="нет")
        tickets.append(DemoTicket(classifier_id=record_id, category=row["category"], short_title=title,
                                   final_type=row["final_type"], data=generated))
    result = DemoManifest(prepared_at=datetime.now(timezone.utc), tickets=tickets)
    validate_demo(result)
    return result


def validate_demo(manifest):
    """Reject incomplete/changed record selection, contradictory facts or missing audio."""
    import re
    if manifest.catalog != CATALOG or manifest.seed != SEED or manifest.prepared_at.tzinfo is None:
        raise ValueError("Invalid demo manifest identity or timestamp")
    if [t.classifier_id for t in manifest.tickets] != [s[0] for s in SPECS]:
        raise ValueError("The demo must contain exactly the four selected records in order")
    rows = classifier_records()
    phones, people, addresses = set(), set(), set()
    for t, spec in zip(manifest.tickets, SPECS):
        row = rows[t.classifier_id]
        gt = t.data.ground_truth
        if (t.category, t.short_title, t.final_type, t.data.ticket_id, t.data.etalon_services) != (
                row["category"], spec[1], row["final_type"], ticket_id(t.classifier_id), spec[2]):
            raise ValueError("Demo classifier identity, title or service selection changed")
        if gt.get("classifier_id") != t.classifier_id or gt.get("class") != t.final_type or gt.get("visClass") != "":
            raise ValueError("Invalid classifier provenance")
        if (gt.get("injured"), gt.get("blocked"), gt.get("ambulanceRefusal")) != (
                "да" if spec[4] else "нет", "да" if spec[4] else "нет", "нет"):
            raise ValueError("Incident flags contradict the scenario")
        if gt.get("caller_status") != "очевидец" or len(gt.get("fio", "").split()) != 3:
            raise ValueError("Full caller name and eyewitness role required")
        if not re.fullmatch(r"\+79\d{9}", gt.get("phone", "")) or "Москва" not in gt.get("address", ""):
            raise ValueError("Full mobile number and Moscow address required")
        if not all(str(gt[k]) in t.data.plot for k in ("fio", "address")) or "{" in t.data.plot:
            raise ValueError("The plot must include the saved caller and address")
        aliases = {"01 Пожарные": "Служба 101", "03 Скорая": "Служба 103", "04 Газ": "Служба 104"}
        if not {aliases.get(s, s) for s in spec[2]} <= set(row["services"]):
            raise ValueError("Selected service is absent from the classifier record")
        phones.add(gt["phone"]); people.add(gt["fio"]); addresses.add(gt["address"])
        build_incoming_card(category=t.category, subcategory=t.short_title, plot=t.data.plot,
                            ground_truth=gt, etalon_services=t.data.etalon_services, now=manifest.prepared_at)
        plan = validated_plan(default_phone_plan(t.data.etalon_services), t.data.etalon_services)
        for item in [*plan["contacts"], *plan["reports"]]:
            if not (AUDIO_DIR / item["audio"].rsplit("/", 1)[-1]).is_file():
                raise ValueError("Missing bundled demo recording")
    if min(len(phones), len(people), len(addresses)) != 4:
        raise ValueError("Demo callers, phones and addresses must be distinct")


def legacy_mapping(scenarios):
    """Identify only the two prototype roots and their explicit replacement lineage."""
    mapping = dict(LEGACY_ROOTS)
    while True:
        extra = {t.scenario_id: mapping[(t.settings or {})["replaces_ticket_id"]] for t in scenarios
                 if (t.settings or {}).get("replaces_ticket_id") in mapping and t.scenario_id not in mapping}
        if not extra:
            return mapping
        mapping.update(extra)


async def clear_legacy_history(db, old_ids, lessons):
    """Remove scoped demo history, children first; preserve users and unrelated lessons."""
    affected = [l for l in lessons if {l.scenario_id, *(l.card_pool_ids or [])} & old_ids]
    for lesson in affected:
        if lesson.target_role != "DISPATCHER_DDS" or not ({lesson.scenario_id, *(lesson.card_pool_ids or [])} - {None}) <= old_ids:
            raise ValueError("Refusing to clear a mixed or non-DDS lesson")
    removed_lessons = {l.assignment_id for l in affected if l.status != "WAITING"}
    sessions = list((await db.scalars(select(ExamSession))).all())
    selected = []
    for s in sessions:
        queue = (s.dynamic_state or {}).get("dds", {}).get("queue", [])
        refs = {s.ticket_id, *[q.get("ticket_id") for q in queue]} - {None}
        if s.assignment_id in removed_lessons or refs & old_ids:
            if s.session_type != "CARD_ACTIONS" or not refs <= old_ids:
                raise ValueError("Refusing to clear a mixed or non-DDS attempt")
            selected.append(s.session_id)
    session_ids = set(selected)
    incident_cards = list((await db.scalars(select(IncidentCard).where(or_(
        IncidentCard.session_id.in_(session_ids), IncidentCard.scenario_id.in_(old_ids))))).all())
    if any(c.session_id and c.session_id not in session_ids for c in incident_cards):
        raise ValueError("Refusing to clear a card belonging to an unrelated attempt")
    cards = {c.card_id for c in incident_cards}
    owners = {s.cadet_id for s in sessions if s.session_id in session_ids}
    # Non-FK queues carry their own explicit lesson/session scope keys.
    jobs = list((await db.scalars(select(ReportJob))).all())
    for job in jobs:
        if job.lesson_id in removed_lessons or job.scope_key in {f"session:{i}" for i in session_ids}:
            if job.status == "generating":
                raise ValueError("Demo report generation is active; retry after it finishes")
            await db.delete(job)
        elif job.kind == "student" and job.owner_id in owners:
            if job.status == "generating":
                raise ValueError("Student report generation is active; retry after it finishes")
            # Rebuild the daily summary from the remaining history on the next run.
            job.snapshot = None
            job.snapshot_at = None
            job.report_text = None
            job.status = "pending"
            job.error_code = None
            job.error_message = None
            job.next_run_at = None
    legacy_jobs = list((await db.scalars(select(LegacyDDSReportJob).where(
        LegacyDDSReportJob.lesson_id.in_(removed_lessons)))).all())
    if any(j.status == "generating" for j in legacy_jobs):
        raise ValueError("Legacy demo report generation is active; retry after it finishes")
    await db.execute(delete(LegacyDDSReportJob).where(LegacyDDSReportJob.lesson_id.in_(removed_lessons)))
    await db.execute(delete(EvaluationResult).where(or_(EvaluationResult.session_id.in_(session_ids), EvaluationResult.card_id.in_(cards))))
    await db.execute(delete(TicketResult).where(or_(TicketResult.session_id.in_(session_ids), TicketResult.ticket_id.in_(old_ids))))
    await db.execute(delete(IncidentCard).where(IncidentCard.card_id.in_(cards)))
    await db.execute(delete(SessionStateModel).where(SessionStateModel.session_id.in_(session_ids)))
    await db.execute(delete(ExamSession).where(ExamSession.session_id.in_(session_ids)))
    await db.execute(delete(CardActionSession).where(CardActionSession.assignment_id.in_(removed_lessons)))
    await db.execute(delete(SessionReport).where(SessionReport.assignment_id.in_(removed_lessons)))
    await db.execute(delete(Assignment).where(Assignment.assignment_id.in_(removed_lessons)))
    return {"lessons": len(removed_lessons), "sessions": len(session_ids), "cards": len(cards)}


async def install_demo(db, manifest):
    """Atomic by caller transaction. Re-running an installed set is strictly read-only."""
    validate_demo(manifest)
    scenarios = list((await db.scalars(select(ScenarioTicket))).all())
    old_map = legacy_mapping(scenarios)
    demo_ids = {t.data.ticket_id for t in manifest.tickets}
    allowed = set(old_map) | demo_ids
    mirrors = list((await db.scalars(select(GeneratedTicket))).all())
    if any(not t.is_deleted and t.scenario_id not in allowed for t in scenarios) or any(
            not t.is_deleted and t.id not in allowed for t in mirrors):
        raise ValueError("Refusing to replace a catalog containing unrelated active tickets")
    present = [t for t in scenarios if t.scenario_id in demo_ids]
    present_mirrors = [t for t in mirrors if t.id in demo_ids]
    if present or present_mirrors:
        if len(present) != 4 or len(present_mirrors) != 4 or any(t.is_deleted for t in [*present, *present_mirrors]):
            raise ValueError("Partial/hidden demo installation; refusing to overwrite")
        if any((t.settings or {}).get("demo_catalog") != CATALOG for t in present):
            raise ValueError("Ticket identity collision")
        if any(not t.is_deleted and t.scenario_id in old_map for t in scenarios) or any(
                not t.is_deleted and t.id in old_map for t in mirrors):
            raise ValueError("Partial demo installation: legacy tickets are still active")
        return {"created": 0, "lessons": 0, "sessions": 0, "cards": 0}
    created = []
    for t in manifest.tickets:
        row = classifier_records()[t.classifier_id]
        scenario, _ = await save_generated_ticket(db, t.data, category=t.category, subcategory=t.short_title,
            status="APPROVED", now=manifest.prepared_at, exercise=default_phone_plan(t.data.etalon_services),
            settings={"demo_catalog": CATALOG, "classifier_source": {
                "id": t.classifier_id, "category": t.category, "group": row["group"], "final_type": t.final_type}})
        created.append(scenario)
    lessons = list((await db.scalars(select(Assignment))).all())
    counts = await clear_legacy_history(db, set(old_map), lessons)
    mapping = {old: ticket_id(record) for old, record in old_map.items()}
    for lesson in lessons:
        if lesson.status == "WAITING":
            lesson.scenario_id = mapping.get(lesson.scenario_id, lesson.scenario_id)
            lesson.card_pool_ids = [mapping.get(i, i) for i in lesson.card_pool_ids or []]
    for t in scenarios:
        if t.scenario_id in old_map:
            t.is_deleted = True
    for t in mirrors:
        if t.id in old_map:
            t.is_deleted = True
    await db.flush()
    return {"created": len(created), **counts}
