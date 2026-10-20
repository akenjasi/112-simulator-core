"use client"

import React, { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight, BookOpen, ChevronDown, ClipboardCheck, Clock3, FileText, RefreshCw, UserRound } from "lucide-react"
import { ThemeSelect } from "@/components/theme-select"
import { ProfileMaterials } from "@/components/student/profile-materials"
import { LogoutButton } from "@/components/auth/LogoutButton"
import { ProfileAssignments } from "@/components/student/profile-assignments"
import { TrainingDialog } from "@/components/student/training-dialog"
import { fetchStudentWorkspace, type StudentWorkspace } from "@/lib/student-workspace"
import styles from "./student-profile.module.css"
import {reviewUrl} from "@/lib/student-review"
import {reviewTime, type TeacherAssessment} from "@/lib/student-review"
import {PersonalRecommendations} from "@/components/student/student-review"
import { getStoredToken } from "@/lib/auth-session"

export interface HistoryTicket {
  ticket_id: string
  card_id?: string | null
  title: string
  category?: string
  status: string
  score?: number | null
  teacher_assessment?: TeacherAssessment | null
  errors_count: number
  errors: string[]
  completed_at?: string | null
}

export interface HistoryLesson {
  report_mode?: string
  session_id: string
  lesson_id?: string
  title: string
  target_role: string
  session_type: string
  status: string
  score?: number | null
  date?: string
  tickets: HistoryTicket[]
}

export interface UserProfile {
  user_id?: string
  student_id?: string
  full_name?: string
  username: string
  role: string
}

interface SavedAdvice { advice_id: string; analysis_text: string; date: string }

interface StudentReport {
  job_id: string; status: string; waiting_reason?: string | null; report_text?: string | null; facts_text?: string | null
  period_start?: string | null; period_end?: string | null; snapshot_at?: string | null
}

const REPORT_WAIT: Record<string, string> = {
  learning_active: "Ожидает завершения занятий", cpu_busy: "Недостаточно ресурсов",
  memory_low: "Недостаточно ресурсов", metrics_unavailable: "Ожидает проверки ресурсов",
  idle_window: "Ожидает свободного сервера", runtime_busy: "Ожидает освобождения ИИ",
  retry_wait: "Ожидает повторной попытки",
}
const REPORT_WAIT_DETAILS: Record<string, string> = {
  memory_low: "Недостаточно свободной оперативной памяти для модели и резерва сервера.",
  cpu_busy: "Сервер занят вычислениями. Отчёт продолжит ожидание в очереди.",
}

function StudentReports({demo = false}: {demo?: boolean}) {
  const [reports, setReports] = useState<StudentReport[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [revision, setRevision] = useState(0)
  const postLock = useRef(false)
  const postController = useRef<AbortController | null>(null)
  useEffect(() => () => postController.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const token = getStoredToken()
        const res = await fetch("/api/ai-analytics/students/me/reports", {
          headers: token ? {Authorization: `Bearer ${token}`} : {}, signal: controller.signal, cache: "no-store",
        })
        if (!res.ok) throw new Error()
        const data = await res.json()
        if (!Array.isArray(data)) throw new Error()
        if (!controller.signal.aborted) {
          setReports(demo ? data.filter(item => item.status === "completed" || item.status === "failed") : data); setError(null)
          if (!demo && data.some(item => item.status === "pending" || item.status === "running")) timer = setTimeout(load, 10000)
        }
      } catch { if (!controller.signal.aborted) setError("Не удалось загрузить отчёты.") }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => {controller.abort(); if (timer) clearTimeout(timer)}
  }, [revision, demo])
  const requestReport = async () => {
    if (postLock.current) return
    postLock.current = true
    const controller = new AbortController()
    postController.current = controller
    setPosting(true); setNotice(null)
    try {
      const token = getStoredToken()
      const res = await fetch("/api/ai-analytics/students/me/reports", {
        method: "POST", headers: {"Content-Type": "application/json", ...(token ? {Authorization: `Bearer ${token}`} : {})},
        body: JSON.stringify({retry: true}), signal: controller.signal,
      })
      if (!res.ok) throw new Error()
      if (!controller.signal.aborted) {
        setNotice(res.status === 204 ? "Новых результатов за расчётный период пока нет." : "Запрос принят. Повторное нажатие не создаёт новый отчёт.")
        setRevision(value => value + 1)
      }
    } catch { if (!controller.signal.aborted) setError("Не удалось запросить отчёт. Повторите попытку.") }
    finally { postLock.current = false; if (!controller.signal.aborted) setPosting(false) }
  }
  const date = (value: string) => new Date(value).toLocaleDateString("ru-RU", {timeZone: "Europe/Moscow"})
  return <section className="space-y-3" aria-label="Накопительные отчёты ДДС">
    <h3 className="font-semibold">Отчёт за семь дней</h3>
    <p className="text-muted-foreground">{demo ? "Сохранённая история накопительных отчётов. В деморежиме новые рекомендации формируются отдельно после каждого занятия." : "Обновляется не чаще раза в сутки по завершённым дням. Генерация ждёт окончания занятий и свободных ресурсов."}</p>
    {!demo && <button type="button" onClick={() => void requestReport()} disabled={posting} className="min-h-10 rounded-lg border px-3 disabled:opacity-50">{posting ? "Отправляем запрос…" : "Сформировать отчёт"}</button>}
    {notice && <p role="status">{notice}</p>}
    {error && <div role="alert">{error} <button type="button" onClick={() => setRevision(value => value + 1)} className="underline">Повторить загрузку отчётов</button></div>}
    {loading && <p role="status">Загружаем отчёты…</p>}
    {!loading && !error && reports.length === 0 && <p>Накопительных отчётов пока нет.</p>}
    {reports.map(report => <article key={report.job_id} className="rounded-xl border border-border p-4 space-y-2">
      <p className="font-medium">{report.status === "completed" ? "Готов" : report.status === "failed" ? "Ошибка генерации — можно повторить запрос" : report.status === "running" ? "Формируется" : REPORT_WAIT[report.waiting_reason || ""] || "В очереди"}</p>
      {report.status === "pending" && REPORT_WAIT_DETAILS[report.waiting_reason || ""] && <p className="text-sm text-muted-foreground">{REPORT_WAIT_DETAILS[report.waiting_reason || ""]}</p>}
      {report.period_start && report.period_end && <p className="text-xs text-muted-foreground">Период: {date(report.period_start)} — {date(new Date(new Date(report.period_end).getTime() - 1).toISOString())}</p>}
      {report.snapshot_at && <p className="text-xs text-muted-foreground">Данные на {new Date(report.snapshot_at).toLocaleString("ru-RU", {timeZone: "Europe/Moscow"})}</p>}
      {report.facts_text && <p className="text-sm text-muted-foreground">{report.facts_text}</p>}
      {report.status === "completed" && <p className="whitespace-pre-wrap leading-relaxed">{report.report_text}</p>}
    </article>)}
  </section>
}

const CRITERIA = [
  {title: "Первичное подтверждение", description: "По каждой службе — в течение 30 секунд от направления карточки сервером."},
  {title: "Соответствие службе", description: "Действие относится к службе, от которой поступил доклад."},
  {title: "Соответствие этапу", description: "Выбранный статус подтверждён полученным сообщением."},
  {title: "Точность записей", description: "Исполнитель, номер бригады и результат соответствуют учебным сведениям."},
  {title: "Завершение", description: "Получен заключительный доклад и записан результат."},
]

function lessonTitle(lesson: HistoryLesson) {
  if (lesson.title && !/^(Занятие|Урок)\s*#/i.test(lesson.title)) return lesson.title
  const ticketTitle = lesson.tickets?.[0]?.title
  return ticketTitle && !/^(Билет|Карточка)\s*#/i.test(ticketTitle) ? ticketTitle : "Занятие ДДС"
}

function ticketStatus(ticket: HistoryTicket) {
  return ({pending: "Не поступала", in_progress: "В работе", incomplete: "Не завершена", ungraded: "Завершена", completed: "Завершена", passed: "Завершена", failed: "Завершена"} as Record<string, string>)[ticket.status] || "Статус не указан"
}

function lessonStatus(status: string) {
  return ({ARCHIVED: "В архиве · тестовое занятие", COMPLETED: "Завершено", ACTIVE: "В процессе", IN_PROGRESS: "В процессе", INCOMPLETE: "Завершено досрочно", CANCELLED: "Отменено", PENDING: "Ожидает начала"} as Record<string, string>)[status] || "Статус не указан"
}

function teacherAssessmentText(assessment: TeacherAssessment | null | undefined) {
  if (assessment === null) return "Преподаватель ещё не выставил оценку."
  if (!assessment) return "Оценка преподавателя для этой карточки пока недоступна."
  const values = [
    assessment.score !== null ? `Баллы: ${assessment.score}` : "",
    assessment.is_passed === true ? "Зачёт" : assessment.is_passed === false ? "Не зачёт" : "",
  ].filter(Boolean)
  return values.length ? values.join(" · ") : "Оценка преподавателя ещё не выставлена."
}

function lessonTeacherAssessmentSummary(lesson: HistoryLesson) {
  const tickets = lesson.tickets || []
  const graded = tickets.filter(ticket => ticket.teacher_assessment &&
    (ticket.teacher_assessment.score !== null || ticket.teacher_assessment.is_passed !== null))
  if (graded.length === 1) return `Оценка преподавателя: ${teacherAssessmentText(graded[0].teacher_assessment)}`
  if (graded.length > 1) return `Оценок преподавателя: ${graded.length}`
  if (tickets.some(ticket => Object.hasOwn(ticket, "teacher_assessment"))) return "Оценка преподавателя ещё не выставлена."
  return "Оценка преподавателя пока недоступна."
}

export default function StudentProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileError, setProfileError] = useState(false)
  const [lessons, setLessons] = useState<HistoryLesson[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const [showTraining, setShowTraining] = useState(false)
  const [workspace, setWorkspace] = useState<StudentWorkspace | null>(null)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  const [workspaceReload, setWorkspaceReload] = useState(0)
  const [activeTab, setActiveTab] = useState<"history" | "materials" | "advice">("history")
  const [advices, setAdvices] = useState<SavedAdvice[]>([])
  const [adviceStatus, setAdviceStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [adviceReload, setAdviceReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const headers: Record<string, string> = {}
    const token = getStoredToken()
    if (token) headers.Authorization = `Bearer ${token}`
    setLoading(true)
    setProfileError(false)
    const loadProfile = async () => {
      try {
        const res = await fetch("/api/v1/users/me", {headers, signal: controller.signal, cache: "no-store"})
        if (!res.ok) throw new Error()
        const data = await res.json()
        if (!controller.signal.aborted) setProfile(data)
      } catch { if (!controller.signal.aborted) setProfileError(true) }
    }
    const loadHistory = async () => {
      try {
        const res = await fetch("/api/v1/students/me/lessons?role=DISPATCHER_DDS", {headers, signal: controller.signal, cache: "no-store"})
        if (!res.ok) throw new Error()
        const data = await res.json()
        if (!Array.isArray(data)) throw new Error()
        if (!controller.signal.aborted) {setLessons(data); setHistoryError(null)}
      } catch { if (!controller.signal.aborted) setHistoryError("Не удалось загрузить историю занятий. Попробуйте ещё раз.") }
    }
    void Promise.all([loadProfile(), loadHistory()]).finally(() => {if (!controller.signal.aborted) setLoading(false)})
    return () => controller.abort()
  }, [reload])

  useEffect(() => {
    if (activeTab !== "advice" || !profile?.user_id) return
    const controller = new AbortController()
    setAdviceStatus("loading")
    const token = getStoredToken()
    void fetch(`/api/ai-analytics/student/${encodeURIComponent(profile.user_id)}`, {
      headers: token ? {Authorization: `Bearer ${token}`} : {}, signal: controller.signal, cache: "no-store",
    }).then(async res => {
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (!Array.isArray(data)) throw new Error()
      if (!controller.signal.aborted) {setAdvices(data); setAdviceStatus("ready")}
    }).catch(() => {if (!controller.signal.aborted) setAdviceStatus("error")})
    return () => controller.abort()
  }, [activeTab, profile?.user_id, adviceReload])

  useEffect(() => {
    let disposed = false
    let pending = false
    let controller: AbortController | null = null
    const load = async () => {
      if (pending) return
      pending = true
      controller = new AbortController()
      try {
        const data = await fetchStudentWorkspace(controller.signal)
        if (!disposed) {setWorkspace(data); setWorkspaceError(null)}
      } catch (error) {
        if (!disposed) setWorkspaceError(error instanceof Error ? error.message : "Не удалось проверить текущее занятие.")
      } finally {
        pending = false
        if (!disposed) setWorkspaceLoading(false)
      }
    }
    setWorkspaceLoading(true)
    void load()
    const timer = window.setInterval(() => {if (document.visibilityState === "visible") void load()}, 5000)
    return () => {disposed = true; controller?.abort(); window.clearInterval(timer)}
  }, [workspaceReload])

  return <div className={`${styles.root} min-h-screen bg-slate-50 text-foreground dark:bg-slate-950`}>
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded focus:bg-card focus:p-3">Перейти к содержимому</a>
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex min-h-20 max-w-[1440px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground">112</span>
          <div><p className="text-sm font-semibold sm:text-base">Тренажёр Системы-112</p><p className="mt-0.5 text-xs text-muted-foreground">Обучение диспетчера ДДС</p></div>
        </div>
        <details className="relative">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="hidden max-w-80 truncate sm:inline">{profile?.full_name || profile?.username || "Профиль"}</span><span className="sm:hidden">Профиль</span><ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </summary>
          <div className="absolute right-0 z-40 mt-2 w-72 max-w-[calc(100vw-2.5rem)] space-y-4 rounded-xl border border-border bg-card p-4 shadow-lg">
            <div><p className="font-medium">{profile?.full_name || profile?.username || "Профиль курсанта"}</p><p className="mt-1 text-sm text-muted-foreground">Курсант · Диспетчер ДДС</p></div>
            <ThemeSelect />
            <LogoutButton />
          </div>
        </details>
      </div>
    </header>

    <main id="main-content" className={`${styles.main} mx-auto w-full max-w-[1440px] px-5 py-5 sm:px-8`}>
      <div className="mb-4 flex shrink-0 flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><h1 className="text-2xl font-semibold tracking-tight">Личный кабинет курсанта</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">Продолжайте занятия с преподавателем или тренируйтесь самостоятельно.</p></div>
        {profile?.student_id && <p className="shrink-0 text-sm text-muted-foreground">Код курсанта: <span className="ml-1 rounded-md border border-border bg-card px-2.5 py-1.5 font-mono font-semibold text-foreground">{profile.student_id}</span></p>}
      </div>
      {profileError && <p role="alert" className="mb-5 rounded-xl border border-destructive/25 bg-card p-4 text-sm">Не удалось загрузить профиль. <button type="button" onClick={() => setReload(value => value + 1)} className="text-primary underline">Повторить</button></p>}

      <div className={`${styles.layout} grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]`}>
        <div className={`${styles.left} contents lg:block lg:min-w-0 lg:space-y-4`}>
          <ProfileAssignments workspace={workspace} loading={workspaceLoading} error={workspaceError} onReload={() => setWorkspaceReload(value => value + 1)} />
          <section id="learning-history" aria-labelledby="history-heading" className={`${styles.results} order-3 scroll-mt-6 overflow-hidden lg:order-none rounded-2xl border border-border bg-card shadow-xs`}>
            <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
              <h2 id="history-heading" className="text-xl font-semibold tracking-tight">Последние результаты</h2>
              <button type="button" aria-label="Обновить историю занятий" disabled={loading} onClick={() => setReload(value => value + 1)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /></button>
            </div>
            <nav aria-label="Результаты и материалы" className="mt-4 flex flex-wrap gap-1 border-b border-border px-4 sm:px-5">
              {([{id: "history", label: "История занятий", Icon: Clock3}, {id: "materials", label: "Материалы", Icon: BookOpen}, {id: "advice", label: "Рекомендации ИИ", Icon: FileText}] as const).map(({id, label, Icon}) => <button type="button" key={id} aria-label={id === "materials" ? "Справочные материалы" : id === "history" ? "История обучения и билеты" : undefined} aria-current={activeTab === id ? "page" : undefined} onClick={() => setActiveTab(id)} className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring ${activeTab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icon className="h-4 w-4" aria-hidden="true" />{label}</button>)}
            </nav>
            <div className={`${styles.resultContent} p-4`}>
              {activeTab === "history" && <div aria-busy={loading}>
                {historyError ? <div role="alert" className="space-y-2 text-sm"><p>{historyError}</p><button type="button" onClick={() => setReload(value => value + 1)} className="font-medium text-primary underline">Повторить загрузку истории</button></div> : loading ? <p role="status" className="py-5 text-sm text-muted-foreground">Загружаем историю занятий…</p> : lessons.length === 0 ? <div className="py-3"><p className="font-medium">История занятий пока пуста</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">После первого занятия здесь появятся карточки и сохранённые результаты. Начните с назначенного занятия или самостоятельной тренировки.</p></div> : <>
                  <p className="mb-4 text-sm text-muted-foreground">Откройте занятие, чтобы посмотреть карточки и замечания.</p>
                  <div className="space-y-3">{(showAll ? lessons : lessons.slice(0, 3)).map(lesson => <details key={lesson.session_id} className="group rounded-xl border border-border bg-background">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl p-4 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0"><h3 className="text-sm font-semibold leading-relaxed">{lessonTitle(lesson)}</h3><p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{lesson.date && <span>{lesson.date}</span>}<span>Карточек: {lesson.tickets?.length ?? 0}</span><span>{lessonStatus(lesson.status)}</span><span>{lessonTeacherAssessmentSummary(lesson)}</span></p></div><ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <div className="space-y-3 border-t border-border p-4">
                      {lesson.status === "ARCHIVED" && <p className="text-sm text-muted-foreground">Тестовое занятие перенесено в архив. Карточки и сохранённые результаты оставлены для просмотра.</p>}
                      {lesson.status === "INCOMPLETE" && <p className="text-sm text-muted-foreground">Занятие закончено, но не все карточки обработаны до конца. Это статус выполнения, а не оценка.</p>}
                      {lesson.tickets?.length ? lesson.tickets.map((ticket, index) => <article key={ticket.card_id || `${ticket.ticket_id}-${index}`} className="rounded-lg border border-border p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="text-sm font-medium">{ticket.title || `Карточка ${index + 1}`}</h4><span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{lesson.status === "ARCHIVED" ? "Архивная карточка" : ticketStatus(ticket)}</span></div>
                        <div className="mt-3 rounded-lg border border-primary/15 bg-primary/5 p-3 text-sm"><p className="font-medium">Оценка преподавателя</p><p className="mt-1">{teacherAssessmentText(ticket.teacher_assessment)}</p>{ticket.teacher_assessment?.comment && <p className="mt-2 whitespace-pre-wrap leading-relaxed text-muted-foreground">{ticket.teacher_assessment.comment}</p>}{ticket.teacher_assessment?.graded_at && <p className="mt-2 text-xs text-muted-foreground">Выставлена: {reviewTime(ticket.teacher_assessment.graded_at)}</p>}</div>
                        {(ticket.errors?.length > 0 || ticket.errors_count > 0) ? <div className="mt-3 text-sm"><p className="font-medium text-destructive">Ошибок в сохранённой проверке: {Math.max(ticket.errors_count || 0, ticket.errors?.length || 0)}</p>{ticket.errors?.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{ticket.errors.map((error, i) => <li key={i}>{error}</li>)}</ul>}</div> : <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{ticket.card_id ? "Результаты проверки и сохранённые действия доступны в разборе." : "Результаты проверки по критериям пока недоступны."}</p>}
                        {ticket.card_id && <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2"><Link className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring" href={reviewUrl(lesson.session_id, ticket.card_id)}>Разбор<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link><Link className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring" href={`/dds?${new URLSearchParams({session_id: lesson.session_id, ticket_id: ticket.ticket_id, card_id: ticket.card_id})}`}>Открыть карточку<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div>}
                      </article>) : <p className="text-sm text-muted-foreground">Подробности по карточкам пока недоступны.</p>}
                      <p className="break-all text-xs text-muted-foreground">Номер занятия: {lesson.session_id}</p>
                      {lesson.report_mode === "demo" && lesson.status !== "IN_PROGRESS" && lesson.status !== "ARCHIVED" && <PersonalRecommendations sessionId={lesson.session_id}/>}
                    </div>
                  </details>)}</div>
                  {lessons.length > 3 && <button type="button" onClick={() => setShowAll(value => !value)} className="mt-4 min-h-10 text-sm font-medium text-primary hover:underline">{showAll ? "Показать последние" : `Вся история занятий (${lessons.length})`}</button>}
                </>}
              </div>}
              {activeTab === "materials" && <ProfileMaterials />}
              {activeTab === "advice" && <div className="space-y-4 text-sm">
                {lessons.filter(lesson => lesson.report_mode === "demo" && lesson.status !== "IN_PROGRESS" && lesson.status !== "ARCHIVED").map(lesson => <section key={lesson.session_id} className="space-y-2"><h3 className="font-semibold">{lessonTitle(lesson)}</h3><PersonalRecommendations sessionId={lesson.session_id}/></section>)}
                <StudentReports demo={lessons.some(lesson => lesson.report_mode === "demo")} />
                <p className="leading-relaxed text-muted-foreground">Сохранённые рекомендации ИИ могут содержать неточности. Обсуждайте спорные выводы с преподавателем.</p>
                <h3 className="font-semibold">Прежние рекомендации · история</h3>
                {adviceStatus === "loading" ? <p role="status">Загружаем рекомендации…</p> : adviceStatus === "error" || !profile?.user_id ? <div role="alert">Не удалось загрузить рекомендации. <button type="button" onClick={() => setAdviceReload(value => value + 1)} className="text-primary underline">Повторить загрузку</button></div> : adviceStatus === "ready" && advices.length === 0 ? <p>Сохранённых рекомендаций пока нет.</p> : advices.map(advice => <article key={advice.advice_id} className="rounded-xl border border-border p-4"><p className="mb-2 text-xs text-muted-foreground">{advice.date}</p><p className="whitespace-pre-wrap leading-relaxed">{advice.analysis_text}</p></article>)}
              </div>}
            </div>
          </section>
        </div>

        <aside className={`${styles.aside} contents lg:block lg:space-y-4`}>
          <section aria-labelledby="practice-heading" className="order-2 rounded-2xl border border-primary/20 lg:order-none bg-primary/5 p-5 sm:p-6">
            <BookOpen className="mb-4 h-6 w-6 text-primary" aria-hidden="true" /><h2 id="practice-heading" className="text-xl font-semibold tracking-tight">Самостоятельная тренировка</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Выберите учебные задания и отработайте действия диспетчера в своём темпе.</p>
            <button type="button" aria-haspopup="dialog" onClick={() => setShowTraining(true)} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-card px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring">Выбрать задания<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
            <Link href="/dds?guide=true" className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-primary underline underline-offset-4 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring">Знакомство с интерфейсом</Link>
          </section>
          <section aria-labelledby="criteria-heading" className={`${styles.criteria} order-4 rounded-2xl border border-border bg-card p-4 shadow-xs lg:order-none`}>
            <ClipboardCheck className="mb-3 h-5 w-5 text-muted-foreground" aria-hidden="true" /><h2 id="criteria-heading" className="text-lg font-semibold">Что проверяется в карточке</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Пять критериев без общего балла. Раскройте критерий, чтобы узнать правило.</p>
            <ol className={`${styles.criteriaList} mt-4 space-y-3`}>{CRITERIA.map((criterion, i) => <li key={criterion.title} className="flex gap-3"><span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">{i + 1}</span><details className="min-w-0 flex-1"><summary className="flex cursor-pointer list-none items-start justify-between gap-2 rounded text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"><h3>{criterion.title}</h3><ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /></summary><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{criterion.description}</p></details></li>)}</ol>
          </section>
        </aside>
      </div>
      <TrainingDialog open={showTraining} onOpenChange={setShowTraining} />
    </main>
    <footer className="mx-auto w-full max-w-[1440px] shrink-0 px-5 pb-3 text-xs text-muted-foreground sm:px-8">Тренажёр Системы-112 · Учебный режим ДДС</footer>
  </div>
}
