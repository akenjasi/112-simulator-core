"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import {
  fetchDDSAssignments,
  getStoredToken,
  type DDSSessionState,
} from "@/lib/dds-cycle"

export function DDSAssignments() {
  const [assignments, setAssignments] = useState<DDSSessionState[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const epochRef = useRef<number>(0)
  const controllerRef = useRef<AbortController | null>(null)

  const loadAssignments = useCallback(async () => {
    const epoch = ++epochRef.current
    if (controllerRef.current) {
      controllerRef.current.abort()
    }
    const controller = new AbortController()
    controllerRef.current = controller

    const token = getStoredToken()
    if (!token) {
      setError("Требуется авторизация для просмотра назначений. Пожалуйста, выполните вход.")
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const data = await fetchDDSAssignments(controller.signal)
      if (epochRef.current === epoch) {
        setAssignments(data)
        setError(null)
      }
    } catch (err: any) {
      if (controller.signal.aborted || epochRef.current !== epoch) {
        return
      }
      setError(err.message || "Ошибка загрузки назначений")
    } finally {
      if (epochRef.current === epoch) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    loadAssignments()
    return () => {
      epochRef.current++
      if (controllerRef.current) {
        controllerRef.current.abort()
      }
    }
  }, [loadAssignments])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">
          Назначенные занятия ДДС
        </h3>
        <button
          type="button"
          onClick={() => loadAssignments()}
          disabled={isLoading}
          className="px-3 py-1.5 text-xs font-semibold rounded bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors disabled:opacity-50"
        >
          {isLoading ? "Загрузка..." : "Обновить"}
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 text-sm rounded bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 space-y-2"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => loadAssignments()}
            className="text-xs font-bold underline hover:no-underline"
          >
            Повторить загрузку
          </button>
        </div>
      )}

      {!error && !isLoading && assignments.length === 0 && (
        <div className="p-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg bg-card">
          Нет назначенных занятий ДДС
        </div>
      )}

      {!error && assignments.length > 0 && (
        <div className="space-y-2">
          {assignments.map((item) => {
            const incNum =
              item.incoming_card?.incident?.number ||
              `Сессия ${item.session_id.slice(0, 8)}`
            const desc = item.incoming_card?.description || "Без описания"
            const statusLabel =
              item.session_status === "COMPLETED"
                ? item.submitted_at
                  ? "Выполнено"
                  : "Не завершено"
                : item.session_status === "ACTIVE"
                ? "В процессе"
                : item.session_status
            const scoreLabel =
              item.score !== null && item.score !== undefined
                ? `${item.score}`
                : "Нет оценки"
            const journalUrl = `/dds/journal?session_id=${encodeURIComponent(
              item.session_id
            )}&ticket_id=${encodeURIComponent(item.ticket_id || "")}`

            return (
              <div
                key={item.session_id}
                className="p-3 rounded-lg border border-border bg-card shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-primary/40 transition-colors"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-foreground">
                      {incNum}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                      {statusLabel}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                      {scoreLabel}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate max-w-xl">
                    {desc}
                  </p>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <Link
                    href={journalUrl}
                    className="px-3 py-1.5 text-xs font-semibold rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Перейти к занятию
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
