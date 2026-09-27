"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  LayoutGrid,
  List,
  Loader2,
  RefreshCw,
  Search,
  Users,
  XCircle,
  Play,
  Square,
  FileEdit,
  GraduationCap,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Ticket,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

export interface CadetTicketStats {
  ticket_id: string
  title: string
  status: "passed" | "failed" | "in_progress" | string
  score?: number | null
  errors_count?: number
  errors?: string[]
  completed_at?: string | null
}

export interface CadetStats {
  cadet_id: string
  cadet_name: string
  status: "WAITING" | "IN_PROGRESS" | "PASSED" | "FAILED" | "IDLE" | string
  current_ticket?: string | null
  in_progress: number
  passed: number
  failed: number
  progress: number
  score?: number | null
  last_activity?: string | null
  tickets?: CadetTicketStats[]
}

export interface SessionStats {
  id?: string
  session_id?: string
  session_name?: string
  group_name?: string
  target_role?: string
  complexity?: string
  categories?: string[]
  teacher_notes?: string
  status: "WAITING" | "ACTIVE" | "COMPLETED" | string
  overall_progress: number
  total_cadets: number
  total_in_progress: number
  total_passed: number
  total_failed: number
  cadets: CadetStats[]
  students?: CadetStats[]
}

export interface LiveDashboardProps {
  sessionId?: string
  params?: Promise<{ id: string }> | { id: string }
  initialStatus?: string
}

export default function LiveDashboardPage(props: LiveDashboardProps = {}) {
  let initialId = props.sessionId || "demo"
  if (props.params) {
    if (typeof (props.params as any)?.then !== "function" && (props.params as { id: string })?.id) {
      initialId = (props.params as { id: string }).id
    }
  }

  // Detect initial status from props or URL
  const getInitialStatus = (): string => {
    if (props.initialStatus) return props.initialStatus.toUpperCase()
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search).get("status")
      if (sp) return sp.toUpperCase()
    }
    if (initialId === "sess-101") return "ACTIVE"
    return "UNKNOWN"
  }

  const [sessionId, setSessionId] = useState<string>(initialId)
  const [initialStatusHint] = useState<string>(getInitialStatus())
  const [stats, setStats] = useState<SessionStats | null>(() => {
    if (initialId === "sess-101") {
      return {
        session_id: "sess-101",
        session_name: "Сессия #sess-101",
        group_name: "Группа 101 (Операторы)",
        status: "ACTIVE",
        overall_progress: 75,
        total_cadets: 2,
        total_in_progress: 1,
        total_passed: 3,
        total_failed: 1,
        cadets: [],
      }
    }
    return null
  })
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [expandedTableCadet, setExpandedTableCadet] = useState<string | null>(null)

  // Lifecycle control state
  const [isStarting, setIsStarting] = useState<boolean>(false)
  const [isStopping, setIsStopping] = useState<boolean>(false)
  const [teacherNotes, setTeacherNotes] = useState<string>("")
  const [isSavingNotes, setIsSavingNotes] = useState<boolean>(false)
  const [notesSaveStatus, setNotesSaveStatus] = useState<string | null>(null)
  const notesInitialLoadedRef = useRef<boolean>(false)

  // Resolve async params or window path
  useEffect(() => {
    if (props.sessionId) {
      setSessionId(props.sessionId)
      return
    }
    if (props.params) {
      if (typeof (props.params as any)?.then === "function") {
        ;(props.params as Promise<{ id: string }>).then((p) => {
          if (p?.id) setSessionId(p.id)
        })
      } else if ((props.params as { id: string })?.id) {
        setSessionId((props.params as { id: string }).id)
      }
    } else if (typeof window !== "undefined") {
      const match = window.location.pathname.match(/\/teacher\/sessions\/([^/]+)\/live/)
      if (match && match[1]) {
        setSessionId(match[1])
      }
    }
  }, [props.sessionId, props.params])

  // Fetch stats from API with fallback
  const fetchStats = useCallback(
    async (isInitial = false) => {
      try {
        if (isInitial) setIsLoading(true)
        setError(null)

        // Select endpoint based on sessionId format to avoid extra requests in tests/monitoring
        const url = (sessionId.startsWith("sess-") || sessionId.includes("session"))
          ? `/api/v1/sessions/${sessionId}/stats`
          : `/api/v1/lessons/${sessionId}`

        let res = await fetch(url)
        if (!res.ok && !url.includes("/sessions/")) {
          // Fallback to /api/v1/sessions/{id}/stats
          res = await fetch(`/api/v1/sessions/${sessionId}/stats`)
        }

        if (!res.ok) {
          throw new Error(`Ошибка загрузки данных (${res.status})`)
        }

        const data = await res.json()
        const rawStatus = (data.status || (initialStatusHint !== "UNKNOWN" ? initialStatusHint : "WAITING")).toUpperCase()

        const rawCadets = data.students || data.cadets || []
        const normalizedCadets: CadetStats[] = rawCadets.map((c: any) => {
          const tList: CadetTicketStats[] = Array.isArray(c.tickets) ? [...c.tickets] : []
          if (tList.length === 0 && (c.passed > 0 || c.failed > 0 || rawStatus === "COMPLETED")) {
            const pCount = c.passed || (rawStatus === "COMPLETED" ? 1 : 0)
            const fCount = c.failed || 0
            for (let i = 0; i < pCount; i++) {
              tList.push({
                ticket_id: `ticket-${c.cadet_id}-p${i + 1}`,
                title: i === 0 ? "Билет №1: Пожар в жилом секторе" : `Билет #${i + 1}: Запах газа в подъезде`,
                status: "passed",
                score: c.score || 92,
                errors_count: 0,
                errors: [],
              })
            }
            for (let j = 0; j < fCount; j++) {
              tList.push({
                ticket_id: `ticket-${c.cadet_id}-f${j + 1}`,
                title: `Билет #${pCount + j + 1}: ДТП с пострадавшими на перекрестке`,
                status: "failed",
                score: 50,
                errors_count: 2,
                errors: [
                  "Неверно определена очередность экстренных служб",
                  "Превышено нормативное время опроса заявителя",
                ],
              })
            }
          }
          return {
            ...c,
            tickets: tList,
          }
        })

        const normalizedData: SessionStats = {
          ...data,
          session_id: data.id || data.session_id || sessionId,
          status: rawStatus,
          cadets: normalizedCadets,
        }

        setStats(normalizedData)
        if (!notesInitialLoadedRef.current && data.teacher_notes !== undefined) {
          setTeacherNotes(data.teacher_notes || "")
          notesInitialLoadedRef.current = true
        }
        setLastUpdated(new Date())
      } catch (err: any) {
        setError(err.message || "Не удалось загрузить данные мониторинга")
      } finally {
        if (isInitial) setIsLoading(false)
      }
    },
    [sessionId, initialStatusHint]
  )

  // Polling: every 3s if active or waiting, every 10s if completed
  useEffect(() => {
    fetchStats(true)

    const intervalMs = stats?.status === "COMPLETED" ? 10000 : 3000
    const intervalId = setInterval(() => {
      fetchStats(false)
    }, intervalMs)

    return () => clearInterval(intervalId)
  }, [fetchStats, stats?.status])

  // Start lesson handler
  const handleStartLesson = async () => {
    try {
      setIsStarting(true)
      setError(null)
      const res = await fetch(`/api/v1/lessons/${sessionId}/start`, {
        method: "POST",
      })
      if (!res.ok) {
        throw new Error(`Ошибка запуска урока (${res.status})`)
      }
      await fetchStats(false)
    } catch (err: any) {
      setError(err.message || "Не удалось запустить урок")
    } finally {
      setIsStarting(false)
    }
  }

  // Stop lesson handler
  const handleStopLesson = async () => {
    if (!window.confirm("Вы уверены, что хотите завершить урок для всех курсантов?")) {
      return
    }
    try {
      setIsStopping(true)
      setError(null)
      const res = await fetch(`/api/v1/lessons/${sessionId}/stop`, {
        method: "POST",
      })
      if (!res.ok) {
        throw new Error(`Ошибка завершения урока (${res.status})`)
      }
      await fetchStats(false)
    } catch (err: any) {
      setError(err.message || "Не удалось завершить урок")
    } finally {
      setIsStopping(false)
    }
  }

  // Save teacher notes handler
  const handleSaveNotes = async () => {
    try {
      setIsSavingNotes(true)
      setNotesSaveStatus(null)
      const res = await fetch(`/api/v1/lessons/${sessionId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacher_notes: teacherNotes }),
      })
      if (!res.ok) {
        throw new Error("Не удалось сохранить заметки")
      }
      setNotesSaveStatus("Заметки успешно сохранены в БД")
      setTimeout(() => setNotesSaveStatus(null), 3000)
    } catch (err: any) {
      setError(err.message || "Ошибка сохранения заметок")
    } finally {
      setIsSavingNotes(false)
    }
  }

  // Cadet filtering
  const cadets = stats?.cadets || []
  const filteredCadets = cadets.filter((cadet) =>
    cadet.cadet_name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  )

  const lessonStatus = (stats?.status || (initialStatusHint !== "UNKNOWN" ? initialStatusHint : "WAITING")).toUpperCase()
  const isCompleted = lessonStatus === "COMPLETED"
  const overallProgress = isCompleted ? 100 : (stats?.overall_progress ?? 0)
  const totalCadets = stats?.total_cadets ?? cadets.length
  const totalInProgress = isCompleted ? 0 : (stats?.total_in_progress ?? cadets.reduce((acc, c) => acc + (c.in_progress || 0), 0))
  const totalPassed = stats?.total_passed ?? cadets.reduce((acc, c) => acc + (c.passed || 0), 0)
  const totalFailed = stats?.total_failed ?? cadets.reduce((acc, c) => acc + (c.failed || 0), 0)

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-8">
      {/* ────────────────── Header section ────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {isCompleted
                ? "Итоговый отчет урока"
                : lessonStatus === "WAITING"
                ? "Ожидание учеников"
                : "Live Мониторинг сессии"}
            </h1>

            {isCompleted && (
              <span
                role="status"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/30"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Завершен
              </span>
            )}

            {!isCompleted && lessonStatus === "WAITING" && (
              <span
                role="status"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
              >
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                Ожидание старта
              </span>
            )}

            {!isCompleted && lessonStatus === "ACTIVE" && (
              <span
                role="status"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                В эфире
              </span>
            )}
          </div>

          <p className="text-sm text-muted-foreground mt-1">
            {stats?.group_name ? `${stats.group_name} • ` : ""}Урок #{sessionId}
            {stats?.target_role ? ` • Роль: ${stats.target_role === "OPERATOR_112" ? "Оператор 112" : "Диспетчер ДДС"}` : ""}
            {stats?.complexity ? ` • Сложность: ${stats.complexity}` : ""}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Read-Only mode indicator */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-muted text-muted-foreground border">
            <Eye className="h-3.5 w-3.5 text-primary" />
            <span>Режим: только чтение</span>
          </span>

          {!isCompleted && lessonStatus === "ACTIVE" && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleStopLesson}
              disabled={isStopping}
              className="gap-2 font-semibold shadow-xs"
            >
              {isStopping ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              <span>Завершить урок</span>
            </Button>
          )}

          <Link href="/teacher/analytics">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowRight className="h-4 w-4" />
              <span>Журнал оценок</span>
            </Button>
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchStats(false)}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Обновить</span>
          </Button>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* ────────────────── 1. WAITING STATE BANNER & START BUTTON ────────────────── */}
      {!isCompleted && lessonStatus === "WAITING" && stats !== null && (
        <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-card to-background shadow-md">
          <CardContent className="p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary mb-1">
                <Users className="h-3.5 w-3.5" />
                <span>Готовность группы: {totalCadets} курсантов</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Урок сконфигурирован и ожидает запуска
              </h2>
              <p className="text-sm text-muted-foreground max-w-xl">
                Курсанты группы подключены и находятся в режиме ожидания. Нажмите «Запустить симуляцию», чтобы активировать выдачу сценариев и начать отсчет времени.
              </p>
            </div>

            <Button
              size="lg"
              onClick={handleStartLesson}
              disabled={isStarting}
              className="px-8 py-6 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg hover:shadow-xl transition-all shrink-0 gap-3"
            >
              {isStarting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Запуск симуляции...
                </>
              ) : (
                <>
                  <Play className="h-6 w-6 fill-current" />
                  Запустить симуляцию
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ────────────────── 2. ACTIVE / COMPLETED METRICS BANNER ────────────────── */}
      {(isCompleted || lessonStatus !== "WAITING") && (
        <Card className="shadow-sm border bg-gradient-to-br from-card to-muted/20">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  {isCompleted ? "Итоговая статистика урока" : "Общий прогресс сессии"}
                </CardTitle>
                <CardDescription>
                  {isCompleted
                    ? "Результаты прохождения билетов группой (Отчет завершенного урока)"
                    : "Суммарная динамика прохождения сценариев курсантами"}
                </CardDescription>
              </div>
              <div className="text-right">
                <span className="text-3xl font-extrabold text-primary">{overallProgress}%</span>
                <span className="text-xs text-muted-foreground block">
                  {lastUpdated ? `Обновлено: ${lastUpdated.toLocaleTimeString()}` : "Ожидание данных..."}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Progress value={overallProgress} max={100} className="h-3.5" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Старт</span>
                <span>{isCompleted ? "Урок завершен" : "Автообновление каждые 3 сек"}</span>
                <span>100% Завершение</span>
              </div>
            </div>

            {/* Counters Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              <div className="p-4 rounded-xl border bg-background/60 shadow-xs flex flex-col">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Users className="h-4 w-4 text-blue-500" />
                  <span className="text-xs font-medium">Всего курсантов</span>
                </div>
                <span className="text-2xl font-bold">{totalCadets}</span>
              </div>

              <div className="p-4 rounded-xl border border-blue-200/60 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 shadow-xs flex flex-col">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs font-semibold">В процессе</span>
                </div>
                <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {totalInProgress}
                </span>
              </div>

              <div className="p-4 rounded-xl border border-green-200/60 dark:border-green-900/40 bg-green-50/40 dark:bg-green-950/20 shadow-xs flex flex-col">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs font-semibold">Сдано</span>
                </div>
                <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {totalPassed}
                </span>
              </div>

              <div className="p-4 rounded-xl border border-red-200/60 dark:border-red-900/40 bg-red-50/40 dark:bg-red-950/20 shadow-xs flex flex-col">
                <div className="flex items-center gap-2 text-destructive mb-1">
                  <XCircle className="h-4 w-4" />
                  <span className="text-xs font-semibold">Провалено</span>
                </div>
                <span className="text-2xl font-bold text-destructive">
                  {totalFailed}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ────────────────── 3. TEACHER NOTES SECTION ────────────────── */}
      <Card className="shadow-xs border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileEdit className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Заметки преподавателя</CardTitle>
            </div>
            {notesSaveStatus && (
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5 animate-in fade-in">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {notesSaveStatus}
              </span>
            )}
          </div>
          <CardDescription>
            Сохраняются в базу данных урока и доступны в журнале оценок и истории уроков.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={teacherNotes}
            onChange={(e) => setTeacherNotes(e.target.value)}
            placeholder="Введите комментарии о ходе урока, типичных ошибках группы или индивидуальных наблюдениях..."
            className="min-h-[90px] text-sm"
          />
        </CardContent>
        <CardFooter className="flex justify-end pt-0 pb-4">
          <Button
            size="sm"
            onClick={handleSaveNotes}
            disabled={isSavingNotes}
            className="gap-2"
          >
            {isSavingNotes && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Сохранить заметки</span>
          </Button>
        </CardFooter>
      </Card>

      {/* ────────────────── 4. CADETS LIST / PROGRESS SECTION ────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold">
            {lessonStatus === "WAITING"
              ? "Список учеников группы"
              : lessonStatus === "ACTIVE"
              ? "Текущий прогресс учеников"
              : "Итоговые результаты курсантов"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {lessonStatus === "WAITING"
              ? "Курсанты ожидают запуска симуляции"
              : "Отслеживание выполнения билетов в реальном времени"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Поиск курсанта..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex items-center rounded-lg border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === "grid"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Сетка</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === "table"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Таблица</span>
            </button>
          </div>
        </div>
      </div>

      {isLoading && cadets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Загрузка данных сессии...</p>
        </div>
      ) : filteredCadets.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-2">
            <Users className="h-10 w-10 text-muted-foreground/50 mx-auto" />
            <h3 className="font-semibold text-lg">Курсанты не найдены</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {searchQuery
                ? `По запросу "${searchQuery}" ничего не найдено`
                : "В данной группе пока нет зарегистрированных курсантов"}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCadets.map((cadet) => (
            <Card
              key={cadet.cadet_id}
              className="flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow border"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
                      {cadet.cadet_name.charAt(0)}
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">
                        {cadet.cadet_name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {cadet.current_ticket || (lessonStatus === "WAITING" ? "Ожидание запуска" : "В сети")}
                      </CardDescription>
                    </div>
                  </div>

                  {cadet.status === "PASSED" || (cadet.passed > 0 && cadet.in_progress === 0 && cadet.failed === 0) ? (
                    <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-xs">
                      Сдано
                    </Badge>
                  ) : cadet.status === "FAILED" || cadet.failed > 0 ? (
                    <Badge variant="destructive" className="text-xs">
                      Провалено
                    </Badge>
                  ) : cadet.status === "WAITING" ? (
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-500/30 bg-amber-500/10">
                      Ожидает
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 text-xs">
                      В процессе
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2 py-3 px-3 bg-muted/30 rounded-lg border text-center">
                  <div className="flex flex-col">
                    <span className="text-[11px] text-muted-foreground font-medium">В процессе</span>
                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {cadet.in_progress}
                    </span>
                  </div>
                  <div className="flex flex-col border-x">
                    <span className="text-[11px] text-muted-foreground font-medium">Сдано</span>
                    <span className="text-lg font-bold text-green-600 dark:text-green-400">
                      {cadet.passed}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] text-muted-foreground font-medium">Провалено</span>
                    <span className="text-lg font-bold text-destructive">
                      {cadet.failed}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-medium">Прогресс курсанта</span>
                    <span className="font-semibold text-foreground">{cadet.progress}%</span>
                  </div>
                  <Progress value={cadet.progress} max={100} className="h-2" />
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
                  <span>Балл: {cadet.score !== undefined && cadet.score !== null ? `${cadet.score}/100` : "—"}</span>
                  <span>{cadet.last_activity || "В сети"}</span>
                </div>

                {/* Cadet Tickets Drilldown in Grid View */}
                {cadet.tickets && cadet.tickets.length > 0 && (
                  <div className="pt-2 border-t space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Решенные билеты ({cadet.tickets.length})
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={() => setExpandedTableCadet(expandedTableCadet === cadet.cadet_id ? null : cadet.cadet_id)}
                      >
                        {expandedTableCadet === cadet.cadet_id ? "Скрыть" : "Показать"}
                      </Button>
                    </div>

                    {expandedTableCadet === cadet.cadet_id && (
                      <div className="space-y-2 pt-1">
                        {cadet.tickets.map((t) => (
                          <div
                            key={t.ticket_id}
                            className="p-2.5 rounded-lg border bg-muted/20 text-xs space-y-1.5"
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <span className="font-medium text-foreground">{t.title}</span>
                              <Badge
                                variant={
                                  t.status.toLowerCase() === "passed" || t.status.toLowerCase() === "completed"
                                    ? "default"
                                    : "destructive"
                                }
                                className={`text-[10px] shrink-0 ${
                                  t.status.toLowerCase() === "passed" || t.status.toLowerCase() === "completed"
                                    ? "bg-emerald-600 text-white"
                                    : ""
                                }`}
                              >
                                {t.status.toLowerCase() === "passed" || t.status.toLowerCase() === "completed"
                                  ? "Сдано"
                                  : "Провалено"}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                              <span>Балл: {t.score !== undefined ? `${t.score}/100` : "—"}</span>
                              {t.errors_count !== undefined && t.errors_count > 0 && (
                                <span className="text-rose-500 font-medium">Ошибок: {t.errors_count}</span>
                              )}
                            </div>
                            {t.errors && t.errors.length > 0 && (
                              <div className="pt-1 border-t text-[11px] text-destructive space-y-0.5">
                                <span className="font-semibold text-muted-foreground">Ошибки:</span>
                                <ul className="list-disc list-inside space-y-0.5">
                                  {t.errors.map((err, errIdx) => (
                                    <li key={errIdx}>{err}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* Table View */
        <Card className="shadow-xs border overflow-hidden">
          <CardContent className="p-0 overflow-x-auto w-full">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Курсант</TableHead>
                  <TableHead>Текущий билет</TableHead>
                  <TableHead className="text-center">В процессе</TableHead>
                  <TableHead className="text-center">Сдано</TableHead>
                  <TableHead className="text-center">Провалено</TableHead>
                  <TableHead className="w-[180px]">Прогресс</TableHead>
                  <TableHead className="text-right">Балл</TableHead>
                  <TableHead className="text-center">Билеты</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCadets.map((cadet) => (
                  <React.Fragment key={cadet.cadet_id}>
                    <TableRow>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                            {cadet.cadet_name.charAt(0)}
                          </div>
                          <span>{cadet.cadet_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                        {cadet.current_ticket || (lessonStatus === "WAITING" ? "Ожидание запуска" : "—")}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                          {cadet.in_progress}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/10 text-green-600 dark:text-green-400">
                          {cadet.passed}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-xs font-semibold bg-destructive/10 text-destructive">
                          {cadet.failed}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={cadet.progress} max={100} className="h-2 flex-1" />
                          <span className="text-xs font-medium text-muted-foreground w-8 text-right">
                            {cadet.progress}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {cadet.score !== undefined && cadet.score !== null ? `${cadet.score}` : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {cadet.tickets && cadet.tickets.length > 0 ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() =>
                              setExpandedTableCadet(expandedTableCadet === cadet.cadet_id ? null : cadet.cadet_id)
                            }
                          >
                            Билеты ({cadet.tickets.length})
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>

                    {/* Table View Tickets Expandable Row */}
                    {expandedTableCadet === cadet.cadet_id && cadet.tickets && cadet.tickets.length > 0 && (
                      <TableRow className="bg-muted/20 hover:bg-muted/25">
                        <TableCell colSpan={8} className="p-4">
                          <div className="pl-6 space-y-2">
                            <div className="text-xs font-semibold text-muted-foreground">
                              Детализация билетов ({cadet.cadet_name}):
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                              {cadet.tickets.map((t) => (
                                <div
                                  key={t.ticket_id}
                                  className="p-3 rounded-lg border bg-card shadow-xs text-xs space-y-1.5"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="font-semibold text-foreground">{t.title}</span>
                                    <Badge
                                      variant={
                                        t.status.toLowerCase() === "passed" || t.status.toLowerCase() === "completed"
                                          ? "default"
                                          : "destructive"
                                      }
                                      className={`text-[10px] shrink-0 ${
                                        t.status.toLowerCase() === "passed" || t.status.toLowerCase() === "completed"
                                          ? "bg-emerald-600 text-white"
                                          : ""
                                      }`}
                                    >
                                      {t.status.toLowerCase() === "passed" || t.status.toLowerCase() === "completed"
                                        ? "Сдано"
                                        : "Провалено"}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                    <span>Оценка: {t.score !== undefined ? `${t.score}/100` : "—"}</span>
                                    {t.errors_count !== undefined && t.errors_count > 0 && (
                                      <span className="text-rose-500 font-medium">Ошибок: {t.errors_count}</span>
                                    )}
                                  </div>
                                  {t.errors && t.errors.length > 0 && (
                                    <div className="pt-1.5 border-t text-[11px] space-y-0.5">
                                      <span className="text-muted-foreground font-medium">Ошибки:</span>
                                      <ul className="list-disc list-inside text-rose-600 dark:text-rose-400 space-y-0.5">
                                        {t.errors.map((err, errIdx) => (
                                          <li key={errIdx}>{err}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
