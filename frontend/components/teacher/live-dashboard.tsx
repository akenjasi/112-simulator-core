"use client"

import { apiFetch as fetch } from "@/lib/api-fetch"

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
import { getStoredToken } from "@/lib/auth-session"

const getAuthHeaders = (): Record<string, string> => {
  const token = getStoredToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

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
  time_limit_seconds?: number
  error_limit?: number | null
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
  source?: "lesson" | "session"
  params?: Promise<{ id: string }> | { id: string }
  initialStatus?: string
}

export default function LiveDashboardPage(props: LiveDashboardProps = {}) {
  const getSourceFromUrl = (): "lesson" | "session" => {
    if (props.source) return props.source
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("source") === "session") return "session"
    return "lesson"
  }
  // Always derive ID from URL on every render (client-side navigation safe)
  const getIdFromUrl = () => {
    if (props.sessionId) return props.sessionId
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search).get("id")
      if (sp) return sp
      const match = window.location.pathname.match(/\/teacher\/sessions\/([^/]+)\/live/)
      if (match && match[1]) return match[1]
    }
    return ""
  }

  const getStatusFromUrl = (): string => {
    if (props.initialStatus) return props.initialStatus.toUpperCase()
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search).get("status")
      if (sp) return sp.toUpperCase()
    }
    return "UNKNOWN"
  }

  const [sessionId, setSessionId] = useState<string>(getIdFromUrl)
  const [initialStatusHint, setInitialStatusHint] = useState<string>(getStatusFromUrl)
  const [source, setSource] = useState<"lesson" | "session">(getSourceFromUrl)

  // Sync state synchronously when props.sessionId changes between renders
  const prevPropIdRef = useRef<string | undefined>(props.sessionId)
  if (props.sessionId && props.sessionId !== prevPropIdRef.current) {
    prevPropIdRef.current = props.sessionId
    setSessionId(props.sessionId)
  }

  // Re-sync on client-side navigation (URL changes without page reload)
  useEffect(() => {
    if (!props.sessionId && typeof window !== "undefined") {
      const id = getIdFromUrl()
      const status = getStatusFromUrl()
      const nextSource = getSourceFromUrl()
      if (id && id !== sessionId) setSessionId(id)
      if (status !== initialStatusHint) setInitialStatusHint(status)
      if (nextSource !== source) setSource(nextSource)
    }
  }, [props.sessionId, typeof window !== "undefined" ? window.location.search : ""])

  // Resolve async params safely without resurrecting old IDs
  useEffect(() => {
    let active = true
    if (props.sessionId) return
    if (props.params) {
      if (typeof (props.params as any)?.then === "function") {
        ;(props.params as Promise<{ id: string }>).then((p) => {
          if (active && p?.id && !props.sessionId) {
            setSessionId(p.id)
          }
        })
      } else if ((props.params as { id: string })?.id) {
        setSessionId((props.params as { id: string }).id)
      }
    }
    return () => {
      active = false
    }
  }, [props.sessionId, props.params])

  const [stats, setStats] = useState<SessionStats | null>(null)
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

  // Epoch, request sequence & AbortController tracking
  const epochRef = useRef<number>(0)
  const sequenceRef = useRef<number>(0)
  const activeControllerRef = useRef<AbortController | null>(null)
  const currentIdRef = useRef<string>(sessionId)
  currentIdRef.current = sessionId

  // Core fetch method protected by epoch, request sequence, id, and AbortController
  const fetchStatsForSession = useCallback(
    async (targetLessonId: string, epoch: number, isInitial = false) => {
      if (!targetLessonId) return
      if (epoch !== epochRef.current || targetLessonId !== currentIdRef.current) return

      // Abort any previous in-flight GET (manual refresh, initial, or poll)
      if (activeControllerRef.current) {
        activeControllerRef.current.abort()
      }
      const controller = new AbortController()
      activeControllerRef.current = controller

      // Monotonically increasing sequence for every request to guarantee freshest response wins
      const reqSeq = ++sequenceRef.current

      if (isInitial) {
        setIsLoading(true)
      }
      setError(null)

      try {
        const isSessionTarget = source === "session"
        const primaryUrl = isSessionTarget
          ? `/api/v1/sessions/${targetLessonId}/stats`
          : `/api/v1/lessons/${targetLessonId}`
        const res = await fetch(primaryUrl, {
          headers: getAuthHeaders(),
          signal: controller.signal,
        })

        if (
          controller.signal.aborted ||
          reqSeq !== sequenceRef.current ||
          epoch !== epochRef.current ||
          targetLessonId !== currentIdRef.current
        ) {
          return
        }

        if (!res.ok) {
          throw new Error(`Ошибка загрузки данных (${res.status})`)
        }

        const data = await res.json()

        if (
          controller.signal.aborted ||
          reqSeq !== sequenceRef.current ||
          epoch !== epochRef.current ||
          targetLessonId !== currentIdRef.current
        ) {
          return
        }

        const payloadId = data.id || data.lesson_id || data.session_id
        if (payloadId && String(payloadId) !== String(targetLessonId)) {
          return
        }

        const rawStatus = (
          data.status ||
          (initialStatusHint !== "UNKNOWN" ? initialStatusHint : "WAITING")
        ).toUpperCase()

        const rawCadets = data.students || data.cadets || []
        const normalizedCadets: CadetStats[] = rawCadets.map((c: any) => ({
          ...c,
          tickets: Array.isArray(c.tickets) ? c.tickets : [],
        }))

        const normalizedData: SessionStats = {
          ...data,
          session_id: payloadId || targetLessonId,
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
        if (
          err.name === "AbortError" ||
          controller.signal.aborted ||
          reqSeq !== sequenceRef.current ||
          epoch !== epochRef.current ||
          targetLessonId !== currentIdRef.current
        ) {
          return
        }
        setError(err.message || "Не удалось загрузить данные мониторинга")
      } finally {
        if (
          !controller.signal.aborted &&
          reqSeq === sequenceRef.current &&
          epoch === epochRef.current &&
          targetLessonId === currentIdRef.current
        ) {
          if (isInitial) setIsLoading(false)
        }
      }
    },
    [initialStatusHint, source]
  )

  // Session lifecycle: reset on ID change, launch fetch and poll
  useEffect(() => {
    currentIdRef.current = sessionId
    epochRef.current += 1
    sequenceRef.current += 1
    const currentEpoch = epochRef.current

    if (activeControllerRef.current) {
      activeControllerRef.current.abort()
      activeControllerRef.current = null
    }

    // Reset old session data immediately ONLY when sessionId changes
    setStats(null)
    setTeacherNotes("")
    notesInitialLoadedRef.current = false
    setError(null)
    setLastUpdated(null)
    setIsLoading(true)
    setIsStarting(false)
    setIsStopping(false)
    setIsSavingNotes(false)
    setNotesSaveStatus(null)
    setExpandedTableCadet(null)

    if (!sessionId) {
      setIsLoading(false)
      return
    }

    fetchStatsForSession(sessionId, currentEpoch, true)

    const intervalMs = 3000
    const intervalId = setInterval(() => {
      fetchStatsForSession(sessionId, currentEpoch, false)
    }, intervalMs)

    return () => {
      epochRef.current += 1
      sequenceRef.current += 1
      if (activeControllerRef.current) {
        activeControllerRef.current.abort()
        activeControllerRef.current = null
      }
      clearInterval(intervalId)
    }
  }, [sessionId, fetchStatsForSession])

  // Backward compatible fetchStats helper for manual refresh button
  const fetchStats = useCallback(
    (isInitial = false) => {
      fetchStatsForSession(sessionId, epochRef.current, isInitial)
    },
    [sessionId, fetchStatsForSession]
  )

  // Start lesson handler
  const handleStartLesson = async () => {
    const targetLessonId = currentIdRef.current
    const epoch = epochRef.current
    if (!targetLessonId) return
    try {
      setIsStarting(true)
      setError(null)
      const res = await fetch(`/api/v1/lessons/${targetLessonId}/start`, {
        method: "POST",
        headers: getAuthHeaders(),
      })
      if (epoch !== epochRef.current || targetLessonId !== currentIdRef.current) {
        return
      }
      if (!res.ok) {
        throw new Error(`Ошибка запуска урока (${res.status})`)
      }
      await fetchStatsForSession(targetLessonId, epoch, false)
    } catch (err: any) {
      if (epoch !== epochRef.current || targetLessonId !== currentIdRef.current) return
      setError(err.message || "Не удалось запустить урок")
    } finally {
      if (epoch === epochRef.current && targetLessonId === currentIdRef.current) {
        setIsStarting(false)
      }
    }
  }

  // Stop lesson handler
  const handleStopLesson = async () => {
    const targetLessonId = currentIdRef.current
    const epoch = epochRef.current
    if (!targetLessonId) return
    if (!window.confirm("Вы уверены, что хотите завершить урок для всех курсантов?")) {
      return
    }
    try {
      setIsStopping(true)
      setError(null)
      const res = await fetch(`/api/v1/lessons/${targetLessonId}/stop`, {
        method: "POST",
        headers: getAuthHeaders(),
      })
      if (epoch !== epochRef.current || targetLessonId !== currentIdRef.current) {
        return
      }
      if (!res.ok) {
        throw new Error(`Ошибка завершения урока (${res.status})`)
      }
      await fetchStatsForSession(targetLessonId, epoch, false)
    } catch (err: any) {
      if (epoch !== epochRef.current || targetLessonId !== currentIdRef.current) return
      setError(err.message || "Не удалось завершить урок")
    } finally {
      if (epoch === epochRef.current && targetLessonId === currentIdRef.current) {
        setIsStopping(false)
      }
    }
  }

  // Save teacher notes handler
  const handleSaveNotes = async () => {
    const targetLessonId = currentIdRef.current
    const epoch = epochRef.current
    if (!targetLessonId) return
    try {
      setIsSavingNotes(true)
      setNotesSaveStatus(null)
      const res = await fetch(`/api/v1/lessons/${targetLessonId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ teacher_notes: teacherNotes }),
      })
      if (epoch !== epochRef.current || targetLessonId !== currentIdRef.current) {
        return
      }
      if (!res.ok) {
        throw new Error("Не удалось сохранить заметки")
      }
      setNotesSaveStatus("Заметки успешно сохранены в БД")
      setTimeout(() => {
        if (epoch === epochRef.current && targetLessonId === currentIdRef.current) {
          setNotesSaveStatus(null)
        }
      }, 3000)
    } catch (err: any) {
      if (epoch !== epochRef.current || targetLessonId !== currentIdRef.current) return
      setError(err.message || "Ошибка сохранения заметок")
    } finally {
      if (epoch === epochRef.current && targetLessonId === currentIdRef.current) {
        setIsSavingNotes(false)
      }
    }
  }

  // Cadet filtering
  const cadets = stats?.cadets || []
  const filteredCadets = cadets.filter((cadet) =>
    cadet.cadet_name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  )

  const lessonStatus = (stats?.status || (initialStatusHint !== "UNKNOWN" ? initialStatusHint : "WAITING")).toUpperCase()
  const isCompleted = lessonStatus === "COMPLETED"
  const overallProgress = stats?.overall_progress ?? 0
  const totalCadets = stats?.total_cadets ?? cadets.length
  const totalInProgress = stats?.total_in_progress ?? cadets.reduce((acc, c) => acc + (c.in_progress || 0), 0)
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
            {stats?.time_limit_seconds ? ` • Лимит времени: ${stats.time_limit_seconds}с` : " • Лимит времени: 30с"}
            {stats?.error_limit !== undefined && stats?.error_limit !== null ? ` • Допустимо ошибок: ${stats.error_limit}` : ""}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Read-Only mode indicator */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-muted text-muted-foreground border">
            <Eye className="h-3.5 w-3.5 text-primary" />
            <span>{source === "session" ? "Сессия: только чтение; управление недоступно" : "Мониторинг урока"}</span>
          </span>

          {source === "lesson" && !isCompleted && lessonStatus === "ACTIVE" && (
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
      {source === "lesson" && !isCompleted && lessonStatus === "WAITING" && stats !== null && (
        <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-card to-background shadow-md">
          <CardContent className="p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary mb-1">
                <Users className="h-3.5 w-3.5" />
                <span>В группе назначено {totalCadets} участников</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Урок сконфигурирован и ожидает запуска
              </h2>
              <p className="text-sm text-muted-foreground max-w-xl">
                В группе назначено {totalCadets} участников; запустите симуляцию.
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
            readOnly={source === "session"}
            placeholder="Введите комментарии о ходе урока, типичных ошибках группы или индивидуальных наблюдениях..."
            className="min-h-[90px] text-sm"
          />
        </CardContent>
        <CardFooter className="flex justify-end pt-0 pb-4">
          {source === "lesson" && <Button
            size="sm"
            onClick={handleSaveNotes}
            disabled={isSavingNotes}
            className="gap-2"
          >
            {isSavingNotes && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Сохранить заметки</span>
          </Button>}
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
                        {cadet.current_ticket || (lessonStatus === "WAITING" ? "Ожидание запуска" : "Участник занятия")}
                      </CardDescription>
                    </div>
                  </div>

                  {cadet.status?.toUpperCase() === "COMPLETED" ? (
                    <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-xs">
                      Выполнено
                    </Badge>
                  ) : cadet.status?.toUpperCase() === "INCOMPLETE" ? (
                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-500/30 bg-amber-500/10">
                      Не завершено
                    </Badge>
                  ) : cadet.status?.toUpperCase() === "PASSED" ? (
                    <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-xs">
                      Сдано
                    </Badge>
                  ) : cadet.status?.toUpperCase() === "FAILED" ? (
                    <Badge variant="destructive" className="text-xs">
                      Провалено
                    </Badge>
                  ) : cadet.status?.toUpperCase() === "WAITING" ? (
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
                  <span>Балл: {cadet.score !== undefined && cadet.score !== null ? `${cadet.score}/100` : "Нет оценки"}</span>
                  <span>{cadet.last_activity || "Нет данных об активности"}</span>
                </div>

                {/* Cadet Tickets Drilldown in Grid View */}
                {cadet.tickets && cadet.tickets.length > 0 && (
                  <div className="pt-2 border-t space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Назначенные билеты ({cadet.tickets.length})
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
                                  t.status?.toLowerCase() === "passed"
                                    ? "default"
                                    : t.status?.toLowerCase() === "failed"
                                    ? "destructive"
                                    : "outline"
                                }
                                className={`text-[10px] shrink-0 ${
                                  t.status?.toLowerCase() === "passed"
                                    ? "bg-emerald-600 text-white"
                                    : t.status?.toLowerCase() === "completed"
                                    ? "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30"
                                    : ""
                                }`}
                              >
                                {(() => {
                                  const s = t.status?.toLowerCase()
                                  if (s === "pending") return "Ожидает выдачи"
                                  if (s === "ungraded") return "Выполнено, нет оценки"
                                  if (s === "completed") return "Выполнено"
                                  if (s === "incomplete") return "Не завершено"
                                  if (s === "passed") return "Сдано"
                                  if (s === "failed") return "Провалено"
                                  if (s === "in_progress") return "В процессе"
                                  return s || "—"
                                })()}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                              <span>Балл: {t.score !== undefined && t.score !== null ? `${t.score}/100` : "Нет оценки"}</span>
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
                        {cadet.score !== undefined && cadet.score !== null ? `${cadet.score}` : "Нет оценки"}
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
                                        t.status?.toLowerCase() === "passed"
                                          ? "default"
                                          : t.status?.toLowerCase() === "failed"
                                          ? "destructive"
                                          : "outline"
                                      }
                                      className={`text-[10px] shrink-0 ${
                                        t.status?.toLowerCase() === "passed"
                                          ? "bg-emerald-600 text-white"
                                          : t.status?.toLowerCase() === "completed"
                                          ? "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30"
                                          : ""
                                      }`}
                                    >
                                      {(() => {
                                        const s = t.status?.toLowerCase()
                                        if (s === "pending") return "Ожидает выдачи"
                                  if (s === "ungraded") return "Выполнено, нет оценки"
                                        if (s === "completed") return "Выполнено"
                                        if (s === "incomplete") return "Не завершено"
                                        if (s === "passed") return "Сдано"
                                        if (s === "failed") return "Провалено"
                                        if (s === "in_progress") return "В процессе"
                                        return s || "—"
                                      })()}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                    <span>Оценка: {t.score !== undefined && t.score !== null ? `${t.score}/100` : "Нет оценки"}</span>
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
