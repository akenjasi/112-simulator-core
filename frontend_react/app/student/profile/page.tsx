"use client"

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowRight, BookOpen, ChevronDown, ClipboardCheck, Clock3, FileText, RefreshCw, UserRound } from "lucide-react"
import { LogoutButton } from "@/components/auth/LogoutButton"
import { ProfileAssignments } from "@/components/student/profile-assignments"
import { DDSSelfTraining } from "@/components/dispatcher/dds-self-training"
import { getStoredToken } from "@/lib/auth-session"

export interface HistoryTicket {
  ticket_id: string
  card_id?: string | null
  title: string
  category?: string
  status: string
  score?: number | null
  errors_count: number
  errors: string[]
  completed_at?: string | null
}

export interface HistoryLesson {
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
  return ({COMPLETED: "Завершено", ACTIVE: "В процессе", IN_PROGRESS: "В процессе", INCOMPLETE: "Завершено досрочно", CANCELLED: "Отменено", PENDING: "Ожидает начала"} as Record<string, string>)[status] || "Статус не указан"
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
    if (showTraining) {
      const catalog = document.getElementById("training-catalog")
      catalog?.scrollIntoView?.({behavior: "smooth", block: "start"})
      catalog?.focus({preventScroll: true})
    }
  }, [showTraining])

  return <div className="min-h-screen bg-slate-50 text-foreground dark:bg-slate-950">
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
            <LogoutButton />
          </div>
        </details>
      </div>
    </header>

    <main id="main-content" className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 sm:py-8">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><h1 className="text-3xl font-semibold tracking-tight">Личный кабинет курсанта</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">Продолжайте занятия с преподавателем или тренируйтесь самостоятельно.</p></div>
        {profile?.student_id && <p className="shrink-0 text-sm text-muted-foreground">Код курсанта: <span className="ml-1 rounded-md border border-border bg-card px-2.5 py-1.5 font-mono font-semibold text-foreground">{profile.student_id}</span></p>}
      </div>
      {profileError && <p role="alert" className="mb-5 rounded-xl border border-destructive/25 bg-card p-4 text-sm">Не удалось загрузить профиль. <button type="button" onClick={() => setReload(value => value + 1)} className="text-primary underline">Повторить</button></p>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="contents lg:block lg:min-w-0 lg:space-y-6">
          <ProfileAssignments />
          <section id="learning-history" aria-labelledby="history-heading" className="order-3 scroll-mt-6 overflow-hidden lg:order-none rounded-2xl border border-border bg-card shadow-xs">
            <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
              <h2 id="history-heading" className="text-xl font-semibold tracking-tight">Последние результаты</h2>
              <button type="button" aria-label="Обновить историю занятий" disabled={loading} onClick={() => setReload(value => value + 1)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /></button>
            </div>
            <nav aria-label="Результаты и материалы" className="mt-4 flex flex-wrap gap-1 border-b border-border px-4 sm:px-5">
              {([{id: "history", label: "История занятий", Icon: Clock3}, {id: "materials", label: "Материалы", Icon: BookOpen}, {id: "advice", label: "Рекомендации ИИ", Icon: FileText}] as const).map(({id, label, Icon}) => <button type="button" key={id} aria-current={activeTab === id ? "page" : undefined} onClick={() => setActiveTab(id)} className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring ${activeTab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icon className="h-4 w-4" aria-hidden="true" />{label}</button>)}
            </nav>
            <div className="p-5 sm:p-6">
              {activeTab === "history" && <div aria-busy={loading}>
                {historyError ? <div role="alert" className="space-y-2 text-sm"><p>{historyError}</p><button type="button" onClick={() => setReload(value => value + 1)} className="font-medium text-primary underline">Повторить загрузку истории</button></div> : loading ? <p role="status" className="py-5 text-sm text-muted-foreground">Загружаем историю занятий…</p> : lessons.length === 0 ? <div className="py-3"><p className="font-medium">История занятий пока пуста</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">После первого занятия здесь появятся карточки и сохранённые результаты. Начните с назначенного занятия или самостоятельной тренировки.</p></div> : <>
                  <p className="mb-4 text-sm text-muted-foreground">Откройте занятие, чтобы посмотреть карточки и замечания.</p>
                  <div className="space-y-3">{(showAll ? lessons : lessons.slice(0, 3)).map(lesson => <details key={lesson.session_id} className="group rounded-xl border border-border bg-background">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl p-4 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0"><h3 className="text-sm font-semibold leading-relaxed">{lessonTitle(lesson)}</h3><p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{lesson.date && <span>{lesson.date}</span>}<span>Карточек: {lesson.tickets?.length ?? 0}</span><span>{lessonStatus(lesson.status)}</span></p></div><ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <div className="space-y-3 border-t border-border p-4">
                      {lesson.tickets?.length ? lesson.tickets.map((ticket, index) => <article key={ticket.card_id || `${ticket.ticket_id}-${index}`} className="rounded-lg border border-border p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="text-sm font-medium">{ticket.title || `Карточка ${index + 1}`}</h4><span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{ticketStatus(ticket)}</span></div>
                        {(ticket.errors?.length > 0 || ticket.errors_count > 0) ? <div className="mt-3 text-sm"><p className="font-medium text-destructive">Ошибок в сохранённой проверке: {Math.max(ticket.errors_count || 0, ticket.errors?.length || 0)}</p>{ticket.errors?.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">{ticket.errors.map((error, i) => <li key={i}>{error}</li>)}</ul>}</div> : <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{ticket.card_id ? "Результаты проверки по критериям смотрите в карточке." : "Результаты проверки по критериям пока недоступны."}</p>}
                        {ticket.card_id && <Link className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring" href={`/dds?${new URLSearchParams({session_id: lesson.session_id, ticket_id: ticket.ticket_id, card_id: ticket.card_id})}`}>Открыть карточку<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
                      </article>) : <p className="text-sm text-muted-foreground">Подробности по карточкам пока недоступны.</p>}
                      <p className="break-all text-xs text-muted-foreground">Номер занятия: {lesson.session_id}</p>
                    </div>
                  </details>)}</div>
                  {lessons.length > 3 && <button type="button" onClick={() => setShowAll(value => !value)} className="mt-4 min-h-10 text-sm font-medium text-primary hover:underline">{showAll ? "Показать последние" : `Вся история занятий (${lessons.length})`}</button>}
                </>}
              </div>}
              {activeTab === "materials" && <div className="py-3"><p className="font-medium">Справочные материалы пока не опубликованы</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Уточните у преподавателя, какие инструкции и регламенты использовать для подготовки.</p></div>}
              {activeTab === "advice" && <div className="space-y-4 text-sm">
                <p className="leading-relaxed text-muted-foreground">Сохранённые рекомендации ИИ могут содержать неточности. Обсуждайте спорные выводы с преподавателем.</p>
                {adviceStatus === "loading" ? <p role="status">Загружаем рекомендации…</p> : adviceStatus === "error" || !profile?.user_id ? <div role="alert">Не удалось загрузить рекомендации. <button type="button" onClick={() => setAdviceReload(value => value + 1)} className="text-primary underline">Повторить загрузку</button></div> : adviceStatus === "ready" && advices.length === 0 ? <p>Сохранённых рекомендаций пока нет.</p> : advices.map(advice => <article key={advice.advice_id} className="rounded-xl border border-border p-4"><p className="mb-2 text-xs text-muted-foreground">{advice.date}</p><p className="whitespace-pre-wrap leading-relaxed">{advice.analysis_text}</p></article>)}
              </div>}
            </div>
          </section>
        </div>

        <aside className="contents lg:block lg:space-y-6">
          <section aria-labelledby="practice-heading" className="order-2 rounded-2xl border border-primary/20 lg:order-none bg-primary/5 p-5 sm:p-6">
            <BookOpen className="mb-4 h-6 w-6 text-primary" aria-hidden="true" /><h2 id="practice-heading" className="text-xl font-semibold tracking-tight">Самостоятельная тренировка</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Выберите учебные задания и отработайте действия диспетчера в своём темпе.</p>
            <button type="button" aria-expanded={showTraining} aria-controls="training-catalog" onClick={() => setShowTraining(value => !value)} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-card px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring">{showTraining ? "Скрыть выбор заданий" : "Выбрать задания"}<ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
          </section>
          <section aria-labelledby="criteria-heading" className="order-4 rounded-2xl border border-border bg-card p-5 shadow-xs sm:p-6 lg:order-none">
            <ClipboardCheck className="mb-3 h-5 w-5 text-muted-foreground" aria-hidden="true" /><h2 id="criteria-heading" className="text-lg font-semibold">Что проверяется в карточке</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Пять критериев без общего балла. Раскройте критерий, чтобы узнать правило.</p>
            <ol className="mt-5 space-y-4">{CRITERIA.map((criterion, i) => <li key={criterion.title} className="flex gap-3"><span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">{i + 1}</span><details className="min-w-0 flex-1"><summary className="flex cursor-pointer list-none items-start justify-between gap-2 rounded text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"><h3>{criterion.title}</h3><ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /></summary><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{criterion.description}</p></details></li>)}</ol>
          </section>
        </aside>
      </div>
      {showTraining && <section id="training-catalog" aria-label="Выбор заданий для тренировки" tabIndex={-1} className="mt-6 scroll-mt-6 rounded-xl focus-visible:outline-2 focus-visible:outline-ring"><DDSSelfTraining /></section>}
    </main>
    <footer className="mx-auto max-w-[1440px] px-5 pb-6 text-xs text-muted-foreground sm:px-8">Тренажёр Системы-112 · Учебный режим ДДС</footer>
  </div>
}
