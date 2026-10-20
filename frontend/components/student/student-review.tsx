"use client"

import {useEffect, useRef, useState} from "react"
import Link from "next/link"
import {useSearchParams} from "next/navigation"
import {ArrowLeft, ArrowRight, ChevronDown, RefreshCw} from "lucide-react"
import {TrainingDialog} from "@/components/student/training-dialog"
import {REVIEW_CRITERIA, REVIEW_STATUS, actionDescription, fetchStudentReview, reviewTime, reviewUrl,
  type ReviewEvidence, type StudentReview} from "@/lib/student-review"
import styles from "./student-review.module.css"
import {getStoredToken} from "@/lib/auth-session"

interface PersonalReport {
  session_id: string; status: "not_started" | "awaiting_lesson" | "disabled" | "generating" | "failed" | "completed"
  report_text?: string | null; snapshot_at?: string | null; model_used?: string | null; error_code?: string | null
}

export function PersonalRecommendations({sessionId}: {sessionId: string}) {
  const [result, setResult] = useState<{id: string; data?: PersonalReport; error?: string} | null>(null)
  const [revision, setRevision] = useState(0)
  const [posting, setPosting] = useState(false)
  const postLock = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller
    let timer: ReturnType<typeof setTimeout> | undefined
    setResult(null)
    const load = async () => {
      let retryable = true
      try {
        const token = getStoredToken()
        if (!token) {retryable = false; throw new Error()}
        const response = await fetch(`/api/ai-analytics/sessions/${encodeURIComponent(sessionId)}/recommendation`, {
          headers: {Authorization: `Bearer ${token}`}, cache: "no-store", signal: controller.signal,
        })
        if (!response.ok) {
          retryable = response.status >= 500
          throw new Error()
        }
        retryable = false
        const data = await response.json()
        if (data.session_id !== sessionId || !["not_started", "awaiting_lesson", "disabled", "generating", "failed", "completed"].includes(data.status) ||
          data.status === "completed" && (typeof data.report_text !== "string" || !data.report_text.trim())) throw new Error()
        if (!controller.signal.aborted) {
          setResult({id: sessionId, data})
          if (["generating", "awaiting_lesson"].includes(data.status)) timer = setTimeout(load, 2000)
        }
      } catch {
        if (!controller.signal.aborted) {
          setResult({id: sessionId, error: "Не удалось загрузить рекомендации ИИ."})
          if (retryable) timer = setTimeout(load, 2000)
        }
      }
    }
    void load()
    return () => {controller.abort(); if (timer) clearTimeout(timer)}
  }, [sessionId, revision])
  const current = result?.id === sessionId ? result : null
  const data = current?.data
  const request = async () => {
    if (postLock.current) return
    postLock.current = true; setPosting(true)
    const controller = controllerRef.current
    try {
      const token = getStoredToken()
      const response = await fetch(`/api/ai-analytics/sessions/${encodeURIComponent(sessionId)}/recommendation`, {
        method: "POST", headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
        body: JSON.stringify({retry: true}), signal: controller?.signal,
      })
      if (!response.ok) throw new Error()
      if (!controller?.signal.aborted) setRevision(value => value + 1)
    } catch {if (!controller?.signal.aborted) setResult({id: sessionId, error: "Не удалось запустить рекомендации ИИ. Результаты занятия сохранены."})}
    finally {postLock.current = false; if (!controller?.signal.aborted) setPosting(false)}
  }
  return <section aria-label="Персональные рекомендации ИИ" className="rounded-xl border border-primary/20 bg-card p-4 text-sm space-y-3">
    <h3 className="font-semibold">Рекомендации ИИ по занятию</h3>
    {!current && <p role="status">Загружаем рекомендации ИИ…</p>}
    {current?.error && <div role="alert">{current.error} <button type="button" onClick={() => setRevision(value => value + 1)} className="underline">Обновить рекомендации</button></div>}
    {data?.status === "generating" && <p role="status">ИИ анализирует занятие. Рекомендации появятся здесь автоматически.</p>}
    {data?.status === "awaiting_lesson" && <p role="status">Рекомендации появятся после завершения всего занятия преподавателем.</p>}
    {data?.status === "disabled" && <p>Для этого режима доступны накопительные отчёты в кабинете.</p>}
    {data?.status === "failed" && <p role="alert">{data.error_code === "llm_unavailable" ? "Сервис ИИ недоступен. После восстановления подключения повторите анализ." : "Не удалось сформировать рекомендации ИИ."} Результаты занятия сохранены.</p>}
    {data?.status === "not_started" && <p>Анализ этого занятия ещё не запущен.</p>}
    {(data?.status === "failed" || data?.status === "not_started") && <button type="button" disabled={posting} onClick={() => void request()} className="min-h-10 rounded border px-3 disabled:opacity-50">{posting ? "Запускаем анализ…" : "Повторить анализ ИИ"}</button>}
    {data?.status === "completed" && <><p className="whitespace-pre-wrap leading-relaxed select-text">{data.report_text}</p>
      <p className="text-xs text-muted-foreground">По всем вашим карточкам этого занятия.{data.snapshot_at ? ` Данные на ${new Date(data.snapshot_at).toLocaleString("ru-RU", {timeZone: "Europe/Moscow"})}.` : ""}{data.model_used ? ` Модель: ${data.model_used}.` : ""}</p></>}
  </section>
}

export function LessonPersonalRecommendations({lessonId}: {lessonId: string}) {
  const [result, setResult] = useState<{id: string; reports?: {session_id: string; cadet_name: string}[]; error?: boolean} | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setResult(null)
    void (async () => {
      try {
        const response = await fetch(`/api/ai-analytics/lessons/${encodeURIComponent(lessonId)}/personal-reports`, {
          headers: {Authorization: `Bearer ${getStoredToken()}`}, cache: "no-store", signal: controller.signal,
        })
        const data = await response.json()
        if (!response.ok || data.lesson_id !== lessonId || !Array.isArray(data.reports) ||
          data.reports.some((item: any) => typeof item.session_id !== "string" || typeof item.cadet_name !== "string")) throw new Error()
        if (!controller.signal.aborted) setResult({id: lessonId, reports: data.reports})
      } catch {if (!controller.signal.aborted) setResult({id: lessonId, error: true})}
    })()
    return () => controller.abort()
  }, [lessonId, revision])
  const current = result?.id === lessonId ? result : null
  return <section aria-label="Рекомендации участникам" className="space-y-3"><h3 className="font-semibold">Персональные рекомендации участникам</h3>
    {current?.error && <p role="alert">Не удалось загрузить рекомендации участников. <button type="button" onClick={() => setRevision(value => value + 1)} className="underline">Повторить загрузку</button></p>}
    {current?.reports?.map(item => <div key={item.session_id}><h4 className="mb-2 font-medium">{item.cadet_name}</h4><PersonalRecommendations sessionId={item.session_id}/></div>)}
  </section>
}

function Evidence({item}: {item: ReviewEvidence}) {
  const action = actionDescription(item.action)
  return <li className="rounded-lg border border-border bg-background p-3 text-sm leading-relaxed">
    {(item.service_name || item.at) && <p className="mb-1 text-xs text-muted-foreground">{[item.at ? reviewTime(item.at) : "", item.service_name].filter(Boolean).join(" · ")}</p>}
    {item.seconds !== undefined && <p>{item.seconds === null ? "Подтверждение не записано." : `Подтверждение через ${item.seconds.toLocaleString("ru-RU", {maximumFractionDigits: 1})} с. Норматив — не позднее 30 с.`}</p>}
    {action && <p>{action}</p>}
    {item.message && <p className="mt-1">{item.message}</p>}
    {item.seconds === undefined && !action && !item.message && <p className="text-muted-foreground">Подробности этого события не сохранены.</p>}
  </li>
}

export function StudentAttemptReview() {
  const params = useSearchParams()
  const sessionId = params.get("session_id")?.trim() || ""
  const cardId = params.get("card_id")?.trim() || undefined
  const identity = `${sessionId}/${cardId || ""}`
  const [result, setResult] = useState<{identity: string; data?: StudentReview; error?: string} | null>(null)
  const [reload, setReload] = useState(0)
  const [training, setTraining] = useState(false)
  useEffect(() => {
    if (!sessionId) return
    const controller = new AbortController()
    setResult(null)
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const data = await fetchStudentReview(sessionId, cardId, controller.signal)
        if (!controller.signal.aborted) {
          setResult({identity, data})
          if (["ACTIVE", "WAITING"].includes(data.state.lesson_status)) timer = setTimeout(load, 3000)
        }
      } catch (error) {
        if (!controller.signal.aborted) setResult({identity, error: error instanceof Error ? error.message : "Не удалось загрузить разбор."})
      }
    }
    void load()
    return () => {controller.abort(); if (timer) clearTimeout(timer)}
  }, [sessionId, cardId, identity, reload])
  const current = result?.identity === identity ? result : null
  const review = current?.data
  const state = review?.state
  const closed = !!state && (state.readonly || !!state.card_submitted_at || ["COMPLETED", "CANCELLED", "ARCHIVED"].includes(state.session_status) || ["COMPLETED", "CANCELLED", "ARCHIVED"].includes(state.lesson_status))
  const finished = !!state?.card_submitted_at
  const evaluated = review?.criteria.some(item => item.status !== "not_evaluated")
  const journal = review ? [
    ...review.state.actions.map((action, i) => ({id: `action-${i}`, at: action.at, service: action.service_name, text: actionDescription(action as unknown as Record<string, unknown>), mistake: false, blocking: false})),
    ...review.events.filter(event => ["mistake", "answered", "dialed", "note"].includes(event.kind)).map(event => ({id: event.id, at: event.at, service: event.service_name, text: event.kind === "mistake" ? [actionDescription(event.action), event.message].filter(Boolean).join(". ") : event.kind === "note" ? `Запись доклада: ${event.note || "Текст записи не сохранён."}` : event.text || (event.kind === "dialed" ? "Исходящий вызов исполнителю." : "Входящий доклад принят."), mistake: event.kind === "mistake", blocking: event.blocking !== false})),
  ].sort((a, b) => (a.at || "").localeCompare(b.at || "")) : []

  return <div className={`${styles.root} min-h-screen bg-slate-50 text-foreground dark:bg-slate-950`}>
    <header className="shrink-0 border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <Link href="/student/profile#learning-history" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-ring"><ArrowLeft className="h-4 w-4" aria-hidden="true"/>В кабинет</Link>
        <button type="button" onClick={() => setTraining(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring">Выбрать следующую тренировку<ArrowRight className="h-4 w-4" aria-hidden="true"/></button>
      </div>
    </header>
    <main className={`${styles.main} mx-auto w-full max-w-[1440px] px-5 py-5 sm:px-8`}>
      <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
        <div><h1 className="text-2xl font-semibold tracking-tight">Разбор карточки</h1><p className="mt-2 text-sm text-muted-foreground">Сохранённые действия и проверка по пяти критериям.</p></div>
        {sessionId && <button type="button" disabled={!current} aria-label="Обновить разбор" onClick={() => setReload(value => value + 1)} className="rounded-lg p-3 text-muted-foreground hover:bg-muted disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring"><RefreshCw className="h-4 w-4" aria-hidden="true"/></button>}
      </div>
      {!sessionId ? <p role="alert" className="rounded-xl border border-border bg-card p-5">Не указано занятие. Откройте разбор из истории в кабинете.</p> : current?.error ? <div role="alert" className="rounded-xl border border-border bg-card p-5"><p>{current.error}</p><button type="button" onClick={() => setReload(value => value + 1)} className="mt-3 min-h-11 font-medium text-primary underline">Повторить загрузку</button></div> : !review || !state ? <p role="status" className="py-5 text-sm text-muted-foreground">Загружаем разбор…</p> : <>
        <div className="mb-4 shrink-0 rounded-xl border border-border bg-card px-4 py-3 text-sm leading-relaxed">
          <p className="font-medium">{!closed ? "Работа с карточкой продолжается. Разбор предварительный." : finished ? "Карточка обработана. Результаты проверки приведены ниже." : "Работа остановлена до завершения карточки. Это статус выполнения, а не оценка."}</p>
          {state.session_status === "COMPLETED" && state.lesson_status === "ACTIVE" && <p className="mt-1 text-muted-foreground">Ваша работа завершена, общее занятие ещё идёт.</p>}
          {!evaluated && <p className="mt-1 text-muted-foreground">Проверка по критериям недоступна. Отсутствие результата не означает успешное выполнение или отсутствие ошибок.</p>}
        </div>
        {state.cards && state.cards.length > 1 && <nav aria-label="Карточки занятия" className="mb-4 flex shrink-0 flex-wrap gap-2">{state.cards.map((card, i) => <Link key={card.card_id} aria-current={card.card_id === state.card_id ? "page" : undefined} href={reviewUrl(sessionId, card.card_id)} className={`min-h-10 rounded-lg border px-3 py-2 text-sm ${card.card_id === state.card_id ? "border-primary bg-primary/5 text-primary" : "border-border bg-card"}`}>Карточка {i + 1}</Link>)}</nav>}
        <div className={`${styles.grid} grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]`}>
          <section aria-labelledby="review-criteria" className={`${styles.panel} rounded-2xl border border-border bg-card`}>
            <h2 id="review-criteria" className="shrink-0 border-b border-border px-5 py-4 text-lg font-semibold">Проверка по критериям</h2>
            <div className={`${styles.scroll} space-y-3 p-4`}>
              {state.report_mode === "demo" && closed && <PersonalRecommendations sessionId={sessionId}/>}
              {review.assessment && <section aria-label="Автоматический разбор" className="rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm leading-relaxed">
                <h3 className="font-semibold">Автоматический разбор</h3>
                <p className="mt-2">{{passed: "Все пять критериев выполнены без зафиксированных ошибок. Можно переходить к следующей тренировке.", needs_review: "Есть замечания к выполнению. Разберите их перед следующей тренировкой.", incomplete: "Карточка не завершена. Итоговая проверка полного цикла недоступна.", insufficient_data: "Не все критерии оценены. Данных недостаточно для полного итога.", in_progress: "Предварительный разбор: работа с карточкой продолжается."}[review.assessment.status]}</p>
                <p className="mt-2">Выполнено критериев: {review.assessment.completed_criteria + review.assessment.corrected_criteria} из {review.assessment.total_criteria}; после исправления: {review.assessment.corrected_criteria}. Ошибок в протоколе: {review.assessment.mistakes_count}.</p>
                {!!review.assessment.recommendations.length && <ul aria-label="Рекомендации по попытке" className="mt-3 list-disc space-y-2 pl-5">{review.assessment.recommendations.map((item, i) => <li key={i}><strong>{REVIEW_CRITERIA.find(c => c.key === item.criterion)?.title}: </strong>{item.text}</li>)}</ul>}
                <p className="mt-3 text-xs text-muted-foreground">Разбор сформирован автоматически по сохранённым действиям и правилам пяти критериев. Оценка преподавателя учитывается отдельно.</p>
              </section>}
              {review.savedErrors && review.savedErrors.count > 0 && <div className="rounded-xl border border-border p-4 text-sm leading-relaxed"><h3 className="font-semibold">Ранее сохранённая проверка</h3><p className="mt-2">Сохранённых ошибок: {review.savedErrors.count}. Проверка по пяти критериям для них не передана.</p>{review.savedErrors.messages.length > 0 ? <ul className="mt-2 list-disc space-y-1 pl-5">{review.savedErrors.messages.map((message, i) => <li key={i}>{message}</li>)}</ul> : <p className="mt-2 text-muted-foreground">Подробные замечания не сохранены.</p>}</div>}
              {review.historyUnavailable && <p role="status" className="text-sm text-muted-foreground">Сохранённые замечания из истории не удалось загрузить. Обновите разбор, чтобы повторить загрузку.</p>}
              <div className="rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm leading-relaxed">
                <h3 className="font-semibold">Оценка преподавателя</h3>
                {review.teacherAssessmentStatus === "unavailable" || !review.teacherAssessmentStatus ? <p className="mt-2 text-muted-foreground">Оценку преподавателя для этой карточки не удалось загрузить. Обновите разбор, чтобы повторить загрузку.</p> : review.teacherAssessmentStatus === "not_graded" || !review.teacherAssessment ? <p className="mt-2 text-muted-foreground">Преподаватель ещё не выставил оценку.</p> : <>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {review.teacherAssessment.score !== null && <span>Баллы: <strong>{review.teacherAssessment.score}</strong></span>}
                    {review.teacherAssessment.is_passed !== null && <span>{review.teacherAssessment.is_passed ? "Зачёт" : "Не зачёт"}</span>}
                    {review.teacherAssessment.score === null && review.teacherAssessment.is_passed === null && <span className="text-muted-foreground">Оценка ещё не выставлена.</span>}
                  </div>
                  {review.teacherAssessment.comment && <p className="mt-2 whitespace-pre-wrap">Комментарий преподавателя: {review.teacherAssessment.comment}</p>}
                  {review.teacherAssessment.graded_at && <p className="mt-2 text-xs text-muted-foreground">Выставлена: {reviewTime(review.teacherAssessment.graded_at)}</p>}
                </>}
              </div>
              {REVIEW_CRITERIA.map(definition => {
                const criterion = review.criteria.find(item => item.key === definition.key)
                const status = criterion?.status || "not_evaluated"
                const insufficient = closed && !finished && status === "not_completed" && !criterion?.evidence.length && !["confirmation", "completion"].includes(definition.key)
                const label = insufficient ? "Проверка не завершена" : closed && !finished && definition.key === "completion" && status === "not_completed" ? "Не завершено" : REVIEW_STATUS[status]
                return <details key={`${identity}-${definition.key}`} open={definition.key === "confirmation" || !!criterion?.evidence.length && (status === "not_completed" || status === "completed_after_correction")} className="group rounded-xl border border-border">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-xl p-4 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                    <h3 className="text-sm font-semibold">{definition.title}</h3><span className={`ml-auto text-right text-xs font-medium ${insufficient ? "text-muted-foreground" : status === "not_completed" || status === "completed_after_correction" ? "text-amber-800 dark:text-amber-300" : status === "completed" ? "text-emerald-800 dark:text-emerald-300" : "text-muted-foreground"}`}>{label}</span><ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground group-open:rotate-180" aria-hidden="true"/>
                  </summary>
                  <div className="space-y-3 border-t border-border p-4"><p className="text-sm leading-relaxed text-muted-foreground">{definition.rule}</p>
                    {status === "not_evaluated" && <p className="text-sm">По этому критерию нет подтверждённого вывода.</p>}
                    {!!criterion?.evidence.length && <ul aria-label={`Основания: ${definition.title}`} className="space-y-2">{criterion.evidence.map((item, i) => <Evidence key={i} item={item}/>)}</ul>}
                    {insufficient ? <p className="text-sm text-muted-foreground">Работа остановлена до завершения карточки. Данных недостаточно для итогового вывода по этому критерию.</p> : status !== "not_evaluated" && !criterion?.evidence.length && <p className="text-sm text-muted-foreground">Результат сохранён сервером; отдельные пояснения по этому критерию не переданы.</p>}
                  </div>
                </details>
              })}
            </div>
          </section>
          <aside className={`${styles.panel} rounded-2xl border border-border bg-card`}>
            <div className="shrink-0 border-b border-border p-5"><h2 className="text-lg font-semibold">{state.incoming_card.classification.title || "Учебная карточка ДДС"}</h2><p className="mt-2 text-xs text-muted-foreground">Направлена: {reviewTime(state.received_at || state.started_at)}</p>
              <Link href={`/dds?${new URLSearchParams({session_id: sessionId, ticket_id: state.ticket_id, card_id: state.card_id})}`} className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline">{closed ? "Открыть сохранённую карточку" : "Вернуться к работе"}<ArrowRight className="h-4 w-4" aria-hidden="true"/></Link>
            </div>
            <div className={`${styles.scroll} space-y-4 p-5`}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{state.incoming_card.description}</p>
              <h3 className="text-sm font-semibold">Доклады и действия</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">Только сохранённые события этой карточки. Ошибки в содержании записей сохраняются для разбора и не блокируют работу.</p>
              {journal.length ? <ol className="space-y-3">{journal.map(item => <li key={item.id} className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{reviewTime(item.at)}{item.service ? ` · ${item.service}` : ""}</p>{item.mistake && <p className="mt-1 text-xs font-semibold">{item.blocking ? "Ошибочная попытка" : "Ошибка в записи · действие сохранено"}</p>}<p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{item.text}</p></li>)}</ol> : <p className="text-sm text-muted-foreground">Сохранённых докладов и действий пока нет. Это не результат проверки.</p>}
            </div>
          </aside>
        </div>
      </>}
    </main>
    <TrainingDialog open={training} onOpenChange={setTraining}/>
  </div>
}
