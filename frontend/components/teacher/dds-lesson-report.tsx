"use client"

import React, { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Clock,
  Cpu,
  LogIn,
  RotateCcw,
} from "lucide-react"
import { getStoredToken } from "@/lib/auth-session"
import {LessonPersonalRecommendations} from "@/components/student/student-review"

export interface DDSLessonReportJob {
  job_id?: string
  lesson_id?: string
  status: "pending" | "running" | "completed" | "failed" | string
  attempt?: number
  created_at?: string
  updated_at?: string
  report_text?: string | null
  error_code?: string | null
  model_used?: string | null
  waiting_reason?: string | null
  period_start?: string | null
  period_end?: string | null
  snapshot_at?: string | null
  execution_mode?: string
}

const WAIT_LABELS: Record<string, string> = {
  learning_active: "Ожидает завершения занятий", cpu_busy: "Недостаточно ресурсов",
  memory_low: "Недостаточно ресурсов", metrics_unavailable: "Ожидает проверки ресурсов",
  idle_window: "Ожидает свободного сервера", runtime_busy: "Ожидает освобождения ИИ",
  retry_wait: "Ожидает повторной попытки",
}
const WAIT_DETAILS: Record<string, string> = {
  memory_low: "Недостаточно свободной оперативной памяти для модели и резерва сервера.",
  cpu_busy: "Сервер занят вычислениями. Отчёт продолжит ожидание в очереди.",
}

export interface DDSLessonReportProps {
  lessonId: string
}

const KNOWN_STATUSES = new Set(["pending", "running", "completed", "failed"])

function validateReportPayload(
  data: any,
  requestedLessonId: string
): { valid: true; job: DDSLessonReportJob } | { valid: false; error: string } {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "Получен некорректный формат ответа от сервера." }
  }

  // Validate lesson_id: strictly required and must match requestedLessonId
  if (!data.lesson_id || typeof data.lesson_id !== "string" || data.lesson_id !== requestedLessonId) {
    return { valid: false, error: "Получены некорректные данные отчёта или данные для другого занятия." }
  }

  // Validate status against known statuses
  const rawStatus = data.status === "generating" ? "running" : typeof data.status === "string" ? data.status.toLowerCase() : ""
  if (!KNOWN_STATUSES.has(rawStatus)) {
    return { valid: false, error: "Сервер вернул неизвестный статус отчёта." }
  }

  // For completed status, report_text must be non-empty string
  if (rawStatus === "completed") {
    if (typeof data.report_text !== "string" || data.report_text.trim().length === 0) {
      return { valid: false, error: "Отчёт помечен как завершённый, но текст отчёта пуст или некорректен." }
    }
  }

  return {
    valid: true,
    job: {
      ...data,
      status: rawStatus,
    },
  }
}

export function DDSLessonReport({ lessonId }: DDSLessonReportProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [report, setReport] = useState<DDSLessonReportJob | null>(null)
  const [jobStatus, setJobStatus] = useState<
    "loading" | "not_started" | "pending" | "running" | "completed" | "failed" | "error" | "unauthorized"
  >("loading")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pollingError, setPollingError] = useState<string | null>(null)

  // Monotonically increasing scope generation counter
  const scopeGenRef = useRef(0)
  // Active AbortController for in-flight request
  const activeAbortCtrlRef = useRef<AbortController | null>(null)
  // Active polling timer
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Synchronous lock against double POST
  const isPostingRef = useRef(false)

  const schedulePoll = (targetLessonId: string, gen: number) => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }

    pollTimerRef.current = setTimeout(() => {
      executePoll(targetLessonId, gen)
    }, 2000)
  }

  const executePoll = async (targetLessonId: string, gen: number) => {
    if (scopeGenRef.current !== gen) return

    const token = getStoredToken()
    if (!token) {
      if (scopeGenRef.current === gen) {
        setJobStatus("unauthorized")
      }
      return
    }

    // Cancel existing in-flight request to serialize requests
    if (activeAbortCtrlRef.current) {
      activeAbortCtrlRef.current.abort()
      activeAbortCtrlRef.current = null
    }

    const controller = new AbortController()
    activeAbortCtrlRef.current = controller

    try {
      const res = await fetch(`/api/ai-analytics/lessons/${encodeURIComponent(targetLessonId)}/report`, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (scopeGenRef.current !== gen || controller.signal.aborted) return

      if (res.status === 200) {
        const rawData = await res.json()
        if (scopeGenRef.current !== gen || controller.signal.aborted) return

        const validated = validateReportPayload(rawData, targetLessonId)
        if (!validated.valid) {
          // Unknown, malformed or foreign payload -> safe error, NEVER not_started
          setJobStatus("error")
          setErrorMessage(validated.error)
          return
        }

        setReport(validated.job)
        setPollingError(null)

        if (validated.job.status === "completed") {
          setJobStatus("completed")
          return // terminal: stop polling
        }
        if (validated.job.status === "failed") {
          setJobStatus("failed")
          return // terminal: stop polling
        }

        setJobStatus(validated.job.status as any)
        schedulePoll(targetLessonId, gen)
      } else if (res.status === 401) {
        setJobStatus("error")
        setErrorMessage("Сессия истекла во время ожидания отчёта (401).")
      } else if (res.status === 403) {
        setJobStatus("error")
        setErrorMessage("Доступ к отчёту ограничен (403).")
      } else {
        setPollingError("Временная ошибка проверки статуса. Нажмите «Обновить», чтобы проверить результат.")
      }
    } catch (err: any) {
      if (scopeGenRef.current !== gen || controller.signal.aborted || err?.name === "AbortError") {
        return // Cancellation is never shown as error
      }
      setPollingError("Не удалось связаться с сервером. Повторная проверка через кнопку «Обновить».")
    }
  }

  const fetchInitialReport = async (targetLessonId: string, gen: number, token: string) => {
    if (activeAbortCtrlRef.current) {
      activeAbortCtrlRef.current.abort()
      activeAbortCtrlRef.current = null
    }

    const controller = new AbortController()
    activeAbortCtrlRef.current = controller

    try {
      const res = await fetch(`/api/ai-analytics/lessons/${encodeURIComponent(targetLessonId)}/report`, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (scopeGenRef.current !== gen || controller.signal.aborted) return

      if (res.status === 404) {
        // Only actual GET 404 means not_started
        setReport(null)
        setJobStatus("not_started")
        setIsLoading(false)
        return
      }

      if (res.status === 200) {
        const rawData = await res.json()
        if (scopeGenRef.current !== gen || controller.signal.aborted) return

        const validated = validateReportPayload(rawData, targetLessonId)
        if (!validated.valid) {
          setJobStatus("error")
          setErrorMessage(validated.error)
          setIsLoading(false)
          return
        }

        setReport(validated.job)
        setJobStatus(validated.job.status as any)
        setIsLoading(false)

        if (validated.job.status === "pending" || validated.job.status === "running") {
          schedulePoll(targetLessonId, gen)
        }
        return
      }

      if (res.status === 401) {
        setJobStatus("error")
        setErrorMessage("Сессия истекла или требуется повторный вход в систему (401).")
      } else if (res.status === 403) {
        setJobStatus("error")
        setErrorMessage("Недостаточно прав для просмотра нейроотчёта по этому занятию (403).")
      } else if (res.status === 409) {
        setJobStatus("error")
        setErrorMessage("Конфликт состояния задания отчёта (409).")
      } else {
        setJobStatus("error")
        setErrorMessage(`Сервер вернул ошибку при запросе отчёта (${res.status}).`)
      }
    } catch (err: any) {
      if (scopeGenRef.current !== gen || controller.signal.aborted || err?.name === "AbortError") {
        return // Cancellation is never shown as error
      }
      setJobStatus("error")
      setErrorMessage("Ошибка сети при проверке статуса отчёта. Проверьте соединение.")
    } finally {
      if (scopeGenRef.current === gen && !controller.signal.aborted) {
        setIsLoading(false)
      }
    }
  }

  // Handle lessonId change / lifecycle scope
  useEffect(() => {
    scopeGenRef.current += 1
    const currentGen = scopeGenRef.current

    // Cancel in-flight requests and timers
    if (activeAbortCtrlRef.current) {
      activeAbortCtrlRef.current.abort()
      activeAbortCtrlRef.current = null
    }
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }

    // Reset synchronous POST lock
    isPostingRef.current = false

    // Reset all state for new scope
    setReport(null)
    setJobStatus("loading")
    setIsLoading(true)
    setIsSubmitting(false)
    setErrorMessage(null)
    setPollingError(null)

    const token = getStoredToken()
    if (!token) {
      setJobStatus("unauthorized")
      setIsLoading(false)
      return
    }

    fetchInitialReport(lessonId, currentGen, token)

    return () => {
      scopeGenRef.current += 1
      if (activeAbortCtrlRef.current) {
        activeAbortCtrlRef.current.abort()
        activeAbortCtrlRef.current = null
      }
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }
      isPostingRef.current = false
    }
  }, [lessonId])

  // Handle manual refresh
  const handleRefresh = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }

    if (activeAbortCtrlRef.current) {
      activeAbortCtrlRef.current.abort()
      activeAbortCtrlRef.current = null
    }

    const token = getStoredToken()
    if (!token) {
      setJobStatus("unauthorized")
      return
    }

    const gen = scopeGenRef.current
    setIsLoading(true)
    setErrorMessage(null)
    setPollingError(null)
    fetchInitialReport(lessonId, gen, token)
  }

  // Handle generation start (or retry)
  const handleGenerate = async (isRetry = false) => {
    // Synchronous lock against double clicks
    if (isPostingRef.current) return
    isPostingRef.current = true
    setIsSubmitting(true)

    const gen = scopeGenRef.current
    const targetLessonId = lessonId

    const token = getStoredToken()
    if (!token) {
      isPostingRef.current = false
      setIsSubmitting(false)
      setJobStatus("unauthorized")
      return
    }

    if (activeAbortCtrlRef.current) {
      activeAbortCtrlRef.current.abort()
      activeAbortCtrlRef.current = null
    }
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }

    const controller = new AbortController()
    activeAbortCtrlRef.current = controller

    setErrorMessage(null)
    setPollingError(null)

    try {
      const res = await fetch(`/api/ai-analytics/lessons/${encodeURIComponent(targetLessonId)}/report`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ retry: isRetry }),
      })

      if (scopeGenRef.current !== gen || controller.signal.aborted) return

      if (res.status === 200 || res.status === 202) {
        const rawData = await res.json()
        if (scopeGenRef.current !== gen || controller.signal.aborted) return

        const validated = validateReportPayload(rawData, targetLessonId)
        if (!validated.valid) {
          setJobStatus("error")
          setErrorMessage(validated.error)
          return
        }

        setReport(validated.job)
        setJobStatus(validated.job.status as any)

        if (validated.job.status === "pending" || validated.job.status === "running") {
          schedulePoll(targetLessonId, gen)
        }
      } else if (res.status === 401) {
        setErrorMessage("Сессия истекла. Войдите в систему для генерации отчёта (401).")
        setJobStatus("error")
      } else if (res.status === 403) {
        setErrorMessage("Недостаточно прав для генерации нейроотчёта (403).")
        setJobStatus("error")
      } else if (res.status === 409) {
        setJobStatus("error")
        setErrorMessage(
          "Конфликт состояния: задание отчёта уже существует. Нажмите «Обновить», чтобы перечитать актуальный статус (409)."
        )
      } else {
        setJobStatus("error")
        setErrorMessage(`Сервер вернул ошибку при запуске генерации отчёта (${res.status}).`)
      }
    } catch (err: any) {
      if (scopeGenRef.current !== gen || controller.signal.aborted || err?.name === "AbortError") {
        return
      }
      setJobStatus("error")
      setErrorMessage("Ошибка сети при отправке запроса на генерацию отчёта. Проверьте соединение.")
    } finally {
      if (scopeGenRef.current === gen) {
        isPostingRef.current = false
        setIsSubmitting(false)
      }
    }
  }

  // Format date helper
  const formatDate = (isoString?: string) => {
    if (!isoString) return null
    try {
      const d = new Date(isoString)
      if (isNaN(d.getTime())) return null
      return d.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return null
    }
  }

  const needsDemoStart = jobStatus === "pending" && report?.execution_mode === "demo"
  const pendingLabel = needsDemoStart ? "Ожидает запуска в деморежиме" : WAIT_LABELS[report?.waiting_reason || ""] || "В очереди"

  return (
    <div
      className="bg-card rounded-2xl border p-5 shadow-xs space-y-4"
      data-testid="dds-lesson-report"
    >
      {report?.execution_mode === "demo" && <LessonPersonalRecommendations key={`${lessonId}:${report.attempt || 0}`} lessonId={lessonId}/>}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-base text-foreground">
                Нейроотчёт занятия (Диспетчер ДДС)
              </h4>
              {jobStatus === "completed" && (
                <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold">
                  Сформирован
                </Badge>
              )}
              {(jobStatus === "pending" || jobStatus === "running") && (
                <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 text-xs font-semibold animate-pulse">
                  {jobStatus === "running" ? "Генерация отчёта" : pendingLabel}
                </Badge>
              )}
              {jobStatus === "failed" && (
                <Badge variant="destructive" className="text-xs font-semibold">
                  Ошибка генерации
                </Badge>
              )}
            </div>
            <p className="text-xs text-foreground/75 mt-0.5">
              Аналитический разбор действий курсантов и соблюдения регламентов служб
            </p>
          </div>
        </div>

        {/* Action button in header if not loading and not unauthorized */}
        {jobStatus !== "loading" && jobStatus !== "unauthorized" && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading || isSubmitting}
              className="h-8 text-xs gap-1.5"
              data-testid="dds-report-refresh-btn"
              title="Перечитать текущий статус отчёта"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Обновить</span>
            </Button>
          </div>
        )}
      </div>

      {/* Main Content Area based on State */}

      {/* 1. Unauthorized State */}
      {jobStatus === "unauthorized" && (
        <div
          className="p-5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-foreground space-y-3"
          data-testid="dds-report-unauthorized"
        >
          <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
            <LogIn className="h-4 w-4 text-amber-500" />
            <span>Требуется авторизация</span>
          </div>
          <p className="text-xs leading-relaxed text-foreground/75">
            Для просмотра сохранённого нейроотчёта или запуска анализа необходимо войти в систему с правами преподавателя.
          </p>
          <div>
            <Link href="/login">
              <Button size="sm" variant="default" className="h-8 text-xs gap-1.5">
                <LogIn className="h-3.5 w-3.5" />
                <span>Войти в систему</span>
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* 2. Initial Loading State */}
      {jobStatus === "loading" && (
        <div
          className="flex items-center justify-center py-8 text-foreground/75 gap-2.5"
          data-testid="dds-report-loading"
        >
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm">Проверка наличия нейроотчёта...</span>
        </div>
      )}

      {/* 3. Not Started State (404 received) */}
      {jobStatus === "not_started" && (
        <div
          className="p-5 rounded-xl border border-dashed bg-muted/20 space-y-3 text-center sm:text-left"
          data-testid="dds-report-not-started"
        >
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Нейроотчёт по этому занятию ещё не сформирован
            </p>
            <p className="text-xs text-foreground/75 max-w-xl">
              Отчёт формируется в фоне после завершения занятия. Можно запросить его кнопкой; генерация дождётся окончания учебной работы и свободных ресурсов.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="pt-1">
            <Button
              size="sm"
              onClick={() => handleGenerate(false)}
              disabled={isSubmitting}
              className="gap-2 font-semibold"
              data-testid="dds-report-generate-btn"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Отправка запроса...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Сформировать нейроотчёт</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* 4. In Progress State (pending or running) */}
      {(jobStatus === "pending" || jobStatus === "running") && (
        <div
          className="p-5 rounded-xl bg-blue-500/5 border border-blue-500/20 space-y-3"
          data-testid="dds-report-progress"
        >
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-foreground">
                {jobStatus === "running"
                  ? "Нейросеть формирует аналитический отчёт..."
                  : pendingLabel}
              </p>
              <p className="text-xs text-foreground/75 mt-0.5">
                {needsDemoStart ? "Этот отчёт ожидал ресурсов до включения деморежима. Запустите анализ на настроенной модели." : "Идёт опрос готовности. По завершении отчёт появится здесь автоматически."}
              </p>
              {!needsDemoStart && jobStatus === "pending" && WAIT_DETAILS[report?.waiting_reason || ""] && <p className="text-xs text-foreground/75 mt-1">{WAIT_DETAILS[report?.waiting_reason || ""]}</p>}
            </div>
          </div>

          {needsDemoStart && <Button size="sm" disabled={isSubmitting} onClick={() => handleGenerate(false)}>
            {isSubmitting ? "Запуск анализа..." : "Запустить анализ ИИ"}
          </Button>}

          {pollingError && (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-foreground text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              <span>{pollingError}</span>
            </div>
          )}
        </div>
      )}

      {/* 5. Completed State */}
      {jobStatus === "completed" && report && (
        <div className="space-y-4" data-testid="dds-report-completed">
          {(report.period_start || report.period_end) && <p className="text-xs text-foreground/75">Период занятия: {report.period_start ? new Date(report.period_start).toLocaleString("ru-RU", {timeZone: "Europe/Moscow"}) : "начало не указано"} — {report.period_end ? new Date(report.period_end).toLocaleString("ru-RU", {timeZone: "Europe/Moscow"}) : "окончание не указано"}</p>}
          {report.snapshot_at && <p className="text-xs text-foreground/75">Данные на {new Date(report.snapshot_at).toLocaleString("ru-RU", {timeZone: "Europe/Moscow"})}. Последующие изменения оценок не переписывают этот отчёт.</p>}
          {/* Prominent Disclaimer Banner */}
          <div
            className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-foreground shadow-2xs"
            data-testid="dds-report-disclaimer"
          >
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs">
              <p className="font-bold leading-tight text-foreground">
                Сформировано ИИ. Проверьте выводы по исходным данным занятия.
              </p>
              <p className="text-foreground/75">
                Текст подготовлен языковой моделью на основе протокола занятия. Результаты носят рекомендательный характер.
              </p>
            </div>
          </div>

          {/* Metadata badges (Model, Date, Attempt) */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/75">
            {report.model_used && (
              <span className="flex items-center gap-1.5 font-medium bg-muted/50 px-2.5 py-1 rounded-md border text-foreground">
                <Cpu className="h-3.5 w-3.5 text-primary" />
                <span>Модель: {report.model_used}</span>
              </span>
            )}
            {(report.updated_at || report.created_at) && (
              <span className="flex items-center gap-1.5 font-medium bg-muted/50 px-2.5 py-1 rounded-md border text-foreground">
                <Clock className="h-3.5 w-3.5 text-foreground/75" />
                <span>Дата: {formatDate(report.updated_at || report.created_at)}</span>
              </span>
            )}
            {report.attempt !== undefined && report.attempt > 1 && (
              <span className="font-medium bg-muted/50 px-2 py-1 rounded-md border text-[11px] text-foreground">
                Попытка: {report.attempt}
              </span>
            )}
          </div>

          {/* Safely Rendered Report Text (No dangerouslySetInnerHTML, preserves line breaks) */}
          <div
            className="rounded-xl border bg-muted/15 p-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap font-sans selection:bg-primary/20"
            data-testid="dds-report-text"
          >
            {report.report_text ? (
              report.report_text
            ) : (
              <span className="text-foreground/75 italic">Текст отчёта пуст.</span>
            )}
          </div>
        </div>
      )}

      {/* 6. Failed State */}
      {jobStatus === "failed" && (
        <div
          className="p-5 rounded-xl bg-destructive/5 border border-destructive/20 space-y-3"
          data-testid="dds-report-failed"
        >
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">
                Не удалось сформировать нейроотчёт
              </p>
              <p className="text-xs text-foreground/75">
                Произошла ошибка при обработке данных занятия языковой моделью.
                {report?.error_code && (
                  <span className="font-mono text-foreground/75 block mt-1">
                    Код ошибки: {report.error_code}
                  </span>
                )}
              </p>
            </div>
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleGenerate(true)}
              disabled={isSubmitting}
              className="gap-2 border-destructive/30 hover:bg-destructive/10 text-destructive font-semibold"
              data-testid="dds-report-retry-btn"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Повторный запуск...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  <span>Повторить генерацию</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* 7. Error State (Network, 401, 403, 409 etc) */}
      {jobStatus === "error" && (
        <div
          className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive space-y-3"
          data-testid="dds-report-error"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{errorMessage || "Произошла ошибка при загрузке нейроотчёта."}</span>
          </div>
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={isLoading}
              className="h-8 text-xs gap-1.5 bg-background text-foreground"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
              <span>Попробовать снова</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default DDSLessonReport
