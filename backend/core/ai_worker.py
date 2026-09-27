"""AI Background Analyzer Worker (Qwen 3.5 9B / Qwen 2.5 9B).

Handles asynchronous queue processing, session logs collection,
prompt formulation, deep analysis generation (LLM stub / inference),
and database persistence for AIStudentAdvice and AIGroupAdvice.

Target Model:
  Qwen3.5-9B-Q6_K.gguf
  URL: https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q6_K.gguf?download=true
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import AsyncSessionLocal
from backend.models.domain_01 import User, StudentGroup
from backend.models.domain_02 import ScenarioTicket
from backend.models.domain_03 import (
    ExamSession,
    CardActionSession,
    SessionStateModel,
    AIStudentAdvice,
    AIGroupAdvice,
)
from backend.models.domain_04 import EvaluationResult, TicketResult

logger = logging.getLogger("ai_worker")

DEFAULT_MODEL_NAME = "Qwen 3.5 9B"
MODEL_GGUF_URL = "https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q6_K.gguf?download=true"
MODEL_FILENAME = "Qwen3.5-9B-Q6_K.gguf"


async def call_qwen_llm(
    prompt: str,
    sleep_seconds: float = 5.0,
    model: str = DEFAULT_MODEL_NAME,
) -> str:
    """Stub call for heavy LLM inference (e.g. Qwen 3.5 9B GGUF).

    Simulates high-parameter neural network reasoning with an asynchronous pause.
    In real deployment, this interfaces with llama-cpp-python or vLLM server.
    """
    logger.info("Starting LLM deep analysis (%s)...", model)
    if sleep_seconds > 0:
        await asyncio.sleep(sleep_seconds)

    # Simulated deep structured analytical feedback in Russian
    analysis_report = (
        f"### Экспертный отчет ИИ-аналитика ({model})\n\n"
        "#### 1. Общая оценка операционной деятельности\n"
        "- **Следование регламенту 112:** Продемонстрирован устойчивый навык первичного сбора информации "
        "и адресации происшествия. Базовый опрос заявителя проводится по структуре «Что? Где? С кем? Угроза жизни?».\n"
        "- **Психологическая устойчивость:** При повышении эмоционального накала и уровня стресса заявителя "
        "сохраняется спокойный темп речи, однако зафиксированы повторы однотипных успокаивающих фраз.\n\n"
        "#### 2. Детальный разбор выявленных ошибок и узких мест\n"
        "1. **Сбор адресных ориентиров:** В сложных сценариях (выезд из населенного пункта, лесополоса) "
        "не всегда уточняются километровые столбы или приметные ориентиры местности.\n"
        "2. **Определение состава экстренных служб:** Зафиксированы единичные задержки при подключении ДДС-04 "
        "при косвенных признаках запаха газа в жилом секторе.\n"
        "3. **Параллельное заполнение полей:** Требуется оптимизировать время между получением ответа от заявителя "
        "и внесением данных в карточку происшествия.\n\n"
        "#### 3. Персональные рекомендации по обучению\n"
        "- **Практикум:** Пройти 2-3 тренировочных билета повышенной категории сложности по теме «ДТП с зажатыми и утечкой топлива».\n"
        "- **Коммуникация:** Использовать техники активного перехвата инициативы при диалоге с дезориентированным заявителем.\n"
        "- **Регламент:** Повторить матрицу межведомственного взаимодействия при комплексных ЧС.\n\n"
        "_Сформировано автономным фоновым модулем Системы-112 на основе журнала сессий._"
    )

    logger.info("LLM deep analysis completed successfully.")
    return analysis_report


async def collect_cadet_session_data(
    cadet_id: str,
    db: AsyncSession,
    target_date: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Collect cadet's sessions, dialogue logs, errors and evaluations for analysis."""
    # 1. User info
    stmt_user = select(User).where(User.user_id == cadet_id)
    res_user = await db.execute(stmt_user)
    cadet = res_user.scalar_one_or_none()

    cadet_name = cadet.full_name or cadet.username if cadet else f"Курсант {cadet_id}"

    # 2. Query exam sessions
    stmt_sessions = select(ExamSession).where(ExamSession.cadet_id == cadet_id)
    if target_date:
        start_of_day = datetime(target_date.year, target_date.month, target_date.day, 0, 0, 0, tzinfo=timezone.utc)
        end_of_day = start_of_day + timedelta(days=1)
        stmt_sessions = stmt_sessions.where(
            and_(ExamSession.start_time >= start_of_day, ExamSession.start_time < end_of_day)
        )
    stmt_sessions = stmt_sessions.order_by(ExamSession.start_time.desc()).limit(20)

    res_sessions = await db.execute(stmt_sessions)
    sessions = res_sessions.scalars().all()

    # If target_date filter produced no sessions, query recent sessions to have context
    if not sessions and target_date:
        stmt_fallback = (
            select(ExamSession)
            .where(ExamSession.cadet_id == cadet_id)
            .order_by(ExamSession.start_time.desc())
            .limit(10)
        )
        res_fb = await db.execute(stmt_fallback)
        sessions = res_fb.scalars().all()

    # 3. Collect dialogue logs, errors, and ticket results
    session_summaries = []
    all_errors = []
    total_dialogue_turns = 0

    for s in sessions:
        dialogue = s.dialogue_log or []
        total_dialogue_turns += len(dialogue)

        # Get results for this session if any
        stmt_tr = select(TicketResult).where(TicketResult.session_id == s.session_id)
        res_tr = await db.execute(stmt_tr)
        t_results = res_tr.scalars().all()

        session_errs = []
        for tr in t_results:
            if tr.error_details:
                session_errs.append(tr.error_details)
                all_errors.append(tr.error_details)

        stmt_ev = select(EvaluationResult).where(EvaluationResult.session_id == s.session_id)
        res_ev = await db.execute(stmt_ev)
        eval_results = res_ev.scalars().all()
        for ev in eval_results:
            if ev.errors_list:
                all_errors.extend(ev.errors_list)

        session_summaries.append({
            "session_id": s.session_id,
            "session_type": s.session_type,
            "status": s.status,
            "start_time": s.start_time.isoformat() if s.start_time else None,
            "dialogue_count": len(dialogue),
            "dialogue_sample": dialogue[:5],
            "errors": session_errs,
        })

    return {
        "cadet_id": cadet_id,
        "cadet_name": cadet_name,
        "session_count": len(sessions),
        "total_dialogue_turns": total_dialogue_turns,
        "sessions": session_summaries,
        "errors": all_errors,
    }


def build_cadet_prompt(cadet_data: Dict[str, Any]) -> str:
    """Format prompt for Qwen LLM from collected session logs and errors."""
    name = cadet_data.get("cadet_name", "Курсант")
    sessions = cadet_data.get("sessions", [])
    errors = cadet_data.get("errors", [])
    dialogue_turns = cadet_data.get("total_dialogue_turns", 0)

    prompt = (
        f"Ты — строгий, но конструктивный старший инструктор-методист Центра обработки вызовов Системы-112.\n"
        f"Проведи глубокий разбор действий курсанта: {name}.\n\n"
        f"Статистика за анализируемый период:\n"
        f"- Количество тренировочных сессий: {len(sessions)}\n"
        f"- Всего реплик в диалогах: {dialogue_turns}\n"
        f"- Зафиксированные ошибки и отклонения от регламентов: {errors}\n\n"
        f"Логи сессий:\n"
    )

    for i, s in enumerate(sessions[:5], 1):
        prompt += f"\n--- Сессия #{i} ({s.get('session_type')}, статус: {s.get('status')}) ---\n"
        sample = s.get("dialogue_sample", [])
        if sample:
            for turn in sample:
                speaker = turn.get("speaker") or turn.get("role") or "Собеседник"
                text = turn.get("text") or turn.get("content") or ""
                prompt += f"  [{speaker}]: {text}\n"
        else:
            prompt += "  (Диалог отсутствовал или не зафиксирован)\n"

    prompt += (
        "\nСформируй подробный структурированный отчет:\n"
        "1. Оценка соблюдения стандартов приема и обработки вызовов.\n"
        "2. Анализ речевого поведения, ошибок в адресации и назначении экстренных служб.\n"
        "3. Персональные рекомендации и конкретные темы для повторения."
    )
    return prompt


async def collect_group_session_data(
    group_id: str,
    db: AsyncSession,
    target_date: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Collect aggregate performance data for a student group."""
    # 1. Group info
    stmt_group = select(StudentGroup).where(StudentGroup.group_id == group_id)
    res_group = await db.execute(stmt_group)
    group = res_group.scalar_one_or_none()
    group_name = (getattr(group, "group_name", None) or getattr(group, "name", None)) if group else f"Группа {group_id}"

    # 2. Get students in group
    stmt_users = select(User).where(User.role.in_(["CADET", "STUDENT"]))
    res_users = await db.execute(stmt_users)
    all_users = res_users.scalars().all()
    group_cadets = [u for u in all_users if group_id in (u.group_ids or []) or (group and u.user_id in (group.cadet_ids or []))]

    if not group_cadets:
        group_cadets = all_users[:10]

    cadet_ids = [u.user_id for u in group_cadets]

    # 3. Collect sessions for these cadets
    stmt_sessions = select(ExamSession).where(ExamSession.cadet_id.in_(cadet_ids)).limit(50)
    res_sess = await db.execute(stmt_sessions)
    sessions = res_sess.scalars().all()

    # 4. Collect errors
    stmt_results = select(TicketResult).limit(100)
    res_tr = await db.execute(stmt_results)
    all_results = res_tr.scalars().all()
    common_errors = [tr.error_details for tr in all_results if tr.error_details]

    return {
        "group_id": group_id,
        "group_name": group_name,
        "cadet_count": len(group_cadets),
        "total_sessions": len(sessions),
        "sample_errors": common_errors[:15],
    }


def build_group_prompt(group_data: Dict[str, Any]) -> str:
    """Format prompt for Qwen LLM to analyze group training metrics."""
    group_name = group_data.get("group_name", "Учебная группа")
    cadet_count = group_data.get("cadet_count", 0)
    total_sessions = group_data.get("total_sessions", 0)
    errors = group_data.get("sample_errors", [])

    prompt = (
        f"Ты — старший методист и преподаватель кафедры информационных технологий и связи Системы-112.\n"
        f"Проанализируй сводные результаты учебной группы: «{group_name}».\n\n"
        f"Параметры потока:\n"
        f"- Количество курсантов в группе: {cadet_count}\n"
        f"- Пройдено занятий и сессий: {total_sessions}\n"
        f"- Характерные ошибки курсантов: {errors}\n\n"
        f"Сформируй отчет для преподавателя:\n"
        f"1. Общий уровень готовности группы к дежурству.\n"
        f"2. Системные ошибки потока (типовые трудности с классификацией, маршрутизацией, карточками).\n"
        f"3. Темы лекций и практических занятий, требующие дополнительной отработки."
    )
    return prompt


async def run_cadet_analysis(
    cadet_id: str,
    db: AsyncSession,
    sleep_seconds: float = 5.0,
    model: str = DEFAULT_MODEL_NAME,
    target_date: Optional[datetime] = None,
) -> AIStudentAdvice:
    """End-to-end routine: collect sessions, generate prompt, call LLM, save advice."""
    cadet_data = await collect_cadet_session_data(cadet_id, db, target_date=target_date)
    prompt = build_cadet_prompt(cadet_data)
    analysis_text = await call_qwen_llm(prompt, sleep_seconds=sleep_seconds, model=model)

    advice = AIStudentAdvice(
        advice_id=str(uuid.uuid4()),
        cadet_id=cadet_id,
        analysis_text=analysis_text,
        model_used=model,
        date=datetime.now(timezone.utc),
        is_read=False,
    )
    db.add(advice)
    await db.commit()
    await db.refresh(advice)
    logger.info("Saved AIStudentAdvice id=%s for cadet_id=%s", advice.advice_id, cadet_id)
    return advice


async def run_group_analysis(
    group_id: str,
    db: AsyncSession,
    sleep_seconds: float = 5.0,
    model: str = DEFAULT_MODEL_NAME,
    target_date: Optional[datetime] = None,
) -> AIGroupAdvice:
    """End-to-end routine for group analysis by LLM."""
    group_data = await collect_group_session_data(group_id, db, target_date=target_date)
    prompt = build_group_prompt(group_data)
    analysis_text = await call_qwen_llm(prompt, sleep_seconds=sleep_seconds, model=model)

    advice = AIGroupAdvice(
        advice_id=str(uuid.uuid4()),
        group_id=group_id,
        analysis_text=analysis_text,
        model_used=model,
        date=datetime.now(timezone.utc),
        is_read=False,
    )
    db.add(advice)
    await db.commit()
    await db.refresh(advice)
    logger.info("Saved AIGroupAdvice id=%s for group_id=%s", advice.advice_id, group_id)
    return advice


class AIAnalysisWorker:
    """In-memory asyncio queue worker for background AI analysis tasks."""

    def __init__(self):
        self.queue: asyncio.Queue = asyncio.Queue()
        self.is_running: bool = False
        self._worker_task: Optional[asyncio.Task] = None

    async def enqueue(
        self,
        job_type: str,
        target_id: str,
        sleep_seconds: float = 5.0,
        model: str = DEFAULT_MODEL_NAME,
    ) -> str:
        """Enqueue an analysis job and return job_id."""
        job_id = str(uuid.uuid4())
        job = {
            "job_id": job_id,
            "type": job_type,  # 'student' or 'group'
            "target_id": target_id,
            "sleep_seconds": sleep_seconds,
            "model": model,
            "enqueued_at": datetime.now(timezone.utc).isoformat(),
        }
        await self.queue.put(job)
        logger.info("Job %s enqueued (%s: %s)", job_id, job_type, target_id)
        return job_id

    async def process_job(self, job: Dict[str, Any]) -> None:
        """Process a single queued job with a fresh DB session."""
        job_id = job.get("job_id")
        job_type = job.get("type")
        target_id = job.get("target_id")
        sleep_seconds = job.get("sleep_seconds", 5.0)
        model = job.get("model", DEFAULT_MODEL_NAME)

        logger.info("Processing job %s (%s, target=%s)...", job_id, job_type, target_id)
        try:
            async with AsyncSessionLocal() as session:
                if job_type in ("student", "cadet"):
                    await run_cadet_analysis(
                        cadet_id=target_id,
                        db=session,
                        sleep_seconds=sleep_seconds,
                        model=model,
                    )
                elif job_type == "group":
                    await run_group_analysis(
                        group_id=target_id,
                        db=session,
                        sleep_seconds=sleep_seconds,
                        model=model,
                    )
                else:
                    logger.warning("Unknown job type: %s", job_type)
        except Exception as e:
            logger.exception("Failed to process AI job %s: %s", job_id, e)

    async def worker_loop(self) -> None:
        """Background continuous worker consumer."""
        self.is_running = True
        logger.info("AIAnalysisWorker loop started.")
        while self.is_running:
            try:
                job = await self.queue.get()
                await self.process_job(job)
                self.queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Error in AIAnalysisWorker loop: %s", e)

        logger.info("AIAnalysisWorker loop stopped.")

    def start(self) -> None:
        """Start the background worker task if not already running."""
        if not self.is_running or self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self.worker_loop())

    async def stop(self) -> None:
        """Stop worker task gracefully."""
        self.is_running = False
        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass


# Global singleton instance
ai_worker = AIAnalysisWorker()
