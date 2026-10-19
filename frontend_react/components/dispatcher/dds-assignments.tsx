"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { getStoredToken } from "@/lib/dds-cycle"
import {
  fetchLobbyAssignments,
  isTeacherAssignment,
  isDDSAssignmentCompleted,
  sortLobbyAssignments,
  dedupLobbyAssignments,
  LOBBY_PAGE_SIZE,
  type LobbySessionState,
} from "@/lib/dds-lobby"

export function DDSAssignments() {
  const [assignments, setAssignments] = useState<LobbySessionState[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"active" | "history">("active")
  const [activePage, setActivePage] = useState<number>(1)
  const [historyPage, setHistoryPage] = useState<number>(1)
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
      const data = await fetchLobbyAssignments(controller.signal)
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
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadAssignments()
    }, 5000)
    return () => {
      clearInterval(timer)
      epochRef.current++
      if (controllerRef.current) {
        controllerRef.current.abort()
      }
    }
  }, [loadAssignments])

  const teacherAssignments = assignments.filter(isTeacherAssignment)
  const deduped = dedupLobbyAssignments(teacherAssignments)

  const activeItems = sortLobbyAssignments(
    deduped.filter((item) => !isDDSAssignmentCompleted(item))
  )
  const historyItems = sortLobbyAssignments(
    deduped.filter(isDDSAssignmentCompleted)
  )

  const stoppedHistoryCount = historyItems.filter((item) => !item.submitted_at).length
  const completedHistoryCount = historyItems.filter((item) => Boolean(item.submitted_at)).length

  let historyTabLabel = "История"
  if (stoppedHistoryCount > 0 && completedHistoryCount === 0) {
    historyTabLabel = `История (${historyItems.length}: не завершено)`
  } else if (stoppedHistoryCount > 0 && completedHistoryCount > 0) {
    historyTabLabel = `История (${historyItems.length}: ${stoppedHistoryCount} не завершено)`
  } else if (historyItems.length > 0) {
    historyTabLabel = `История (${historyItems.length})`
  }

  const currentList = activeTab === "active" ? activeItems : historyItems
  const currentPage = activeTab === "active" ? activePage : historyPage
  const totalPages = Math.max(1, Math.ceil(currentList.length / LOBBY_PAGE_SIZE))
  const safePage = Math.min(Math.max(1, currentPage), totalPages)
  const pageItems = currentList.slice(
    (safePage - 1) * LOBBY_PAGE_SIZE,
    safePage * LOBBY_PAGE_SIZE
  )

  const handlePageChange = (newPage: number) => {
    if (activeTab === "active") {
      setActivePage(newPage)
    } else {
      setHistoryPage(newPage)
    }
  }

  const hasAnyAssignments = activeItems.length > 0 || historyItems.length > 0

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
          className="px-3 py-1.5 text-xs font-semibold rounded bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors disabled:opacity-50 cursor-pointer"
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

      {!error && !isLoading && !hasAnyAssignments && (
        <div className="p-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg bg-card">
          Нет назначенных занятий ДДС
        </div>
      )}

      {!error && hasAnyAssignments && (
        <div className="space-y-3">
          <div
            role="tablist"
            aria-label="Разделы занятий ДДС"
            className="flex items-center gap-1 border-b border-border pb-2"
          >
            <button
              role="tab"
              type="button"
              id="dds-tab-active"
              aria-selected={activeTab === "active"}
              aria-controls="dds-panel-active"
              onClick={() => setActiveTab("active")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeTab === "active"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              Текущие {activeItems.length > 0 ? `(${activeItems.length})` : ""}
            </button>
            <button
              role="tab"
              type="button"
              id="dds-tab-history"
              aria-selected={activeTab === "history"}
              aria-controls="dds-panel-history"
              onClick={() => setActiveTab("history")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeTab === "history"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {historyTabLabel}
            </button>
          </div>

          <div
            id={`dds-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`dds-tab-${activeTab}`}
            className="space-y-2"
          >
            {pageItems.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg bg-card">
                {activeTab === "active"
                  ? "Нет активных назначений ДДС"
                  : "Нет завершённых занятий ДДС"}
              </div>
            ) : (
              pageItems.map((item) => {
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
                const consoleUrl = `/dds?session_id=${encodeURIComponent(
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
                      <p className="text-xs text-muted-foreground">
                        Закрыто карточек: {item.completed_cards ?? 0} из{" "}
                        {item.total_cards ?? 1}
                      </p>
                      <p className="text-xs text-muted-foreground truncate max-w-xl">
                        {desc}
                      </p>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <Link
                        href={consoleUrl}
                        className="px-3 py-1.5 text-xs font-semibold rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        Перейти к занятию
                      </Link>
                    </div>
                  </div>
                )
              })
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 px-1 text-xs text-muted-foreground">
                <span>
                  Страница {safePage} из {totalPages} ({currentList.length}{" "}
                  {currentList.length === 1
                    ? "занятие"
                    : currentList.length < 5
                    ? "занятия"
                    : "занятий"}
                  )
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePageChange(safePage - 1)}
                    disabled={safePage <= 1}
                    className="px-2.5 py-1 text-xs font-medium rounded border border-border bg-card hover:bg-muted text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Предыдущая
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePageChange(safePage + 1)}
                    disabled={safePage >= totalPages}
                    className="px-2.5 py-1 text-xs font-medium rounded border border-border bg-card hover:bg-muted text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Следующая
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
