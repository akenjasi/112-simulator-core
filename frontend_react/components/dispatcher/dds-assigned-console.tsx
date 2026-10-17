"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import {
  ALLOWED_DDS_STATUSES,
  fetchDDSSessionState,
  postDDSAction,
  finishDDSSession,
  getStoredToken,
  type DDSSessionState,
  type DDSActionPayload,
  type DDSFinishPayload,
} from "@/lib/dds-cycle"
import { TopBar } from "@/components/dispatcher/top-bar"
import { CallerPanel } from "@/components/dispatcher/caller-panel"
import { IncidentPanel } from "@/components/dispatcher/incident-panel"

interface Props {
  sessionId: string
  ticketId?: string
}

type PendingMutation =
  | { type: "action"; payload: DDSActionPayload }
  | { type: "finish"; payload: DDSFinishPayload }

export function DDSAssignedConsole({ sessionId, ticketId }: Props) {
  const [sessionState, setSessionState] = useState<DDSSessionState | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const isSavingRef = useRef<boolean>(false)

  // Action form state
  const [selectedService, setSelectedService] = useState<string>("")
  const [selectedStatus, setSelectedStatus] = useState<string>("Принята")
  const [orderNumber, setOrderNumber] = useState<string>("")
  const [comment, setComment] = useState<string>("")
  const [whoAccepted, setWhoAccepted] = useState<string>("")
  const [summary, setSummary] = useState<string>("")

  // Pending mutation for retry
  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null)
  const pendingRef = useRef<PendingMutation | null>(null)

  const epochRef = useRef<number>(0)
  const getControllerRef = useRef<AbortController | null>(null)
  const postControllerRef = useRef<AbortController | null>(null)

  // Load session state
  const loadState = useCallback(async () => {
    const epoch = ++epochRef.current
    if (getControllerRef.current) {
      getControllerRef.current.abort()
    }
    const controller = new AbortController()
    getControllerRef.current = controller

    const token = getStoredToken()
    if (!token) {
      setLoadError("Требуется авторизация для доступа к занятию. Пожалуйста, выполните вход.")
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setLoadError(null)

    try {
      const state = await fetchDDSSessionState(sessionId, ticketId, controller.signal)
      if (epochRef.current === epoch) {
        setSessionState(state)
        setLoadError(null)
        if (state.incoming_card?.services?.length > 0) {
          setSelectedService((prev) => prev || state.incoming_card.services[0].name)
        }
      }
    } catch (err: any) {
      if (controller.signal.aborted || epochRef.current !== epoch) {
        return
      }
      setLoadError(err.message || "Ошибка загрузки данных занятия")
      setSessionState(null)
    } finally {
      if (epochRef.current === epoch) {
        setIsLoading(false)
      }
    }
  }, [sessionId, ticketId])

  useEffect(() => {
    // Reset state & abort in-flight requests on session change or unmount
    epochRef.current++
    if (getControllerRef.current) {
      getControllerRef.current.abort()
    }
    if (postControllerRef.current) {
      postControllerRef.current.abort()
    }
    isSavingRef.current = false
    setIsSaving(false)
    pendingRef.current = null
    setPendingMutation(null)
    setSessionState(null)
    setActionError(null)
    setLoadError(null)
    setSelectedService("")
    setComment("")
    setOrderNumber("")
    setWhoAccepted("")
    setSummary("")

    loadState()

    return () => {
      epochRef.current++
      if (getControllerRef.current) {
        getControllerRef.current.abort()
      }
      if (postControllerRef.current) {
        postControllerRef.current.abort()
      }
      isSavingRef.current = false
    }
  }, [sessionId, ticketId, loadState])

  // Set default selected service if loaded
  useEffect(() => {
    if (sessionState?.incoming_card?.services?.length && !selectedService) {
      setSelectedService(sessionState.incoming_card.services[0].name)
    }
  }, [sessionState, selectedService])

  const isCompleted =
    sessionState?.session_status === "COMPLETED" ||
    sessionState?.lesson_status === "COMPLETED"

  const hasPending = pendingMutation !== null

  // Save status action
  const handleSaveStatus = async () => {
    if (isSavingRef.current || hasPending || pendingRef.current || isCompleted || !sessionState) return
    isSavingRef.current = true
    setIsSaving(true)
    setActionError(null)

    const epoch = epochRef.current
    if (postControllerRef.current) {
      postControllerRef.current.abort()
    }
    const controller = new AbortController()
    postControllerRef.current = controller

    const payload: DDSActionPayload = {
      request_id: crypto.randomUUID(),
      kind: "status",
      service_name: selectedService || sessionState.incoming_card.services[0]?.name || "",
      status: selectedStatus || "Принята",
    }
    if (comment.trim()) {
      payload.comment = comment.trim()
    }
    if (orderNumber.trim()) {
      payload.order_number = orderNumber.trim()
    }

    try {
      const updated = await postDDSAction(sessionId, payload, controller.signal)
      if (epochRef.current !== epoch) return
      setSessionState(updated)
      setActionError(null)
      setPendingMutation(null)
      pendingRef.current = null
      setComment("")
      setOrderNumber("")
    } catch (err: any) {
      if (epochRef.current !== epoch || controller.signal.aborted) return
      setActionError(err.message || "Не удалось сохранить статус")
      setPendingMutation({ type: "action", payload })
      pendingRef.current = { type: "action", payload }
    } finally {
      if (epochRef.current === epoch) {
        isSavingRef.current = false
        setIsSaving(false)
      }
    }
  }

  // Save dispatch action
  const handleSaveDispatch = async () => {
    if (isSavingRef.current || hasPending || pendingRef.current || isCompleted || !sessionState) return
    isSavingRef.current = true
    setIsSaving(true)
    setActionError(null)

    const epoch = epochRef.current
    if (postControllerRef.current) {
      postControllerRef.current.abort()
    }
    const controller = new AbortController()
    postControllerRef.current = controller

    const payload: DDSActionPayload = {
      request_id: crypto.randomUUID(),
      kind: "dispatch",
      service_name: selectedService || sessionState.incoming_card.services[0]?.name || "",
      who_accepted: whoAccepted.trim(),
      summary: summary.trim(),
    }

    try {
      const updated = await postDDSAction(sessionId, payload, controller.signal)
      if (epochRef.current !== epoch) return
      setSessionState(updated)
      setActionError(null)
      setPendingMutation(null)
      pendingRef.current = null
      setWhoAccepted("")
      setSummary("")
    } catch (err: any) {
      if (epochRef.current !== epoch || controller.signal.aborted) return
      setActionError(err.message || "Не удалось сохранить направление")
      setPendingMutation({ type: "action", payload })
      pendingRef.current = { type: "action", payload }
    } finally {
      if (epochRef.current === epoch) {
        isSavingRef.current = false
        setIsSaving(false)
      }
    }
  }

  // Finish session
  const handleFinish = async () => {
    if (isSavingRef.current || hasPending || pendingRef.current || isCompleted || !sessionState) return
    isSavingRef.current = true
    setIsSaving(true)
    setActionError(null)

    const epoch = epochRef.current
    if (postControllerRef.current) {
      postControllerRef.current.abort()
    }
    const controller = new AbortController()
    postControllerRef.current = controller

    const payload: DDSFinishPayload = {}

    try {
      const updated = await finishDDSSession(sessionId, payload, controller.signal)
      if (epochRef.current !== epoch) return
      setSessionState(updated)
      setActionError(null)
      setPendingMutation(null)
      pendingRef.current = null
    } catch (err: any) {
      if (epochRef.current !== epoch || controller.signal.aborted) return
      setActionError(err.message || "Не удалось завершить занятие")
      setPendingMutation({ type: "finish", payload })
      pendingRef.current = { type: "finish", payload }
    } finally {
      if (epochRef.current === epoch) {
        isSavingRef.current = false
        setIsSaving(false)
      }
    }
  }

  // Retry pending mutation
  const handleRetry = async () => {
    if (isSavingRef.current || !pendingMutation || !sessionState) return
    isSavingRef.current = true
    setIsSaving(true)
    setActionError(null)

    const epoch = epochRef.current
    if (postControllerRef.current) {
      postControllerRef.current.abort()
    }
    const controller = new AbortController()
    postControllerRef.current = controller

    const currentPending = pendingMutation

    try {
      let updated: DDSSessionState
      if (currentPending.type === "action") {
        updated = await postDDSAction(sessionId, currentPending.payload, controller.signal)
      } else {
        updated = await finishDDSSession(sessionId, currentPending.payload, controller.signal)
      }
      if (epochRef.current !== epoch) return
      setSessionState(updated)
      setActionError(null)
      setPendingMutation(null)
      pendingRef.current = null
      if (currentPending.type === "action") {
        setComment("")
        setOrderNumber("")
        setWhoAccepted("")
        setSummary("")
      }
    } catch (err: any) {
      if (epochRef.current !== epoch || controller.signal.aborted) return
      setActionError(err.message || "Ошибка при повторной отправке")
    } finally {
      if (epochRef.current === epoch) {
        isSavingRef.current = false
        setIsSaving(false)
      }
    }
  }

  // Refresh session state and clear pending
  const handleRefresh = () => {
    setPendingMutation(null)
    pendingRef.current = null
    setActionError(null)
    loadState()
  }

  // If fatal load error and no state
  if (!isLoading && loadError && !sessionState) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div
          role="alert"
          className="p-4 rounded border border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400 space-y-2 text-sm"
        >
          <p className="font-semibold">{loadError}</p>
          <button
            type="button"
            onClick={handleRefresh}
            className="text-xs font-bold underline hover:no-underline"
          >
            Повторить попытку
          </button>
        </div>
      </div>
    )
  }

  if (isLoading && !sessionState) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500">
        Загрузка назначенной карточки ДДС...
      </div>
    )
  }

  if (!sessionState) {
    return null
  }

  const card = sessionState.incoming_card
  const serviceOptions = card.services || []

  // Score and status messages
  let completionNotice: string | null = null
  if (isCompleted) {
    if (sessionState.session_status === "COMPLETED" && sessionState.submitted_at) {
      const scoreText =
        sessionState.score !== null && sessionState.score !== undefined
          ? `Оценка: ${sessionState.score}`
          : "Нет оценки"
      completionNotice = `Выполнено. ${scoreText}`
    } else {
      completionNotice = "Занятие завершено. Выполнение не завершено. Нет оценки"
    }
  }

  return (
    <div className="min-h-screen bg-[#efefef] text-[#1e2327] flex flex-col font-sans select-none">
      {/* TopBar using read-only incoming card */}
      <TopBar data={card} />

      {/* Main workspace */}
      <div className="flex-1 flex flex-col gap-3 p-3 max-w-[1600px] w-full mx-auto">
        {/* Error / Alert banner */}
        {actionError && (
          <div
            role="alert"
            className="p-3 text-sm rounded bg-red-500/15 border border-red-500/40 text-red-800 dark:text-red-300 flex items-center justify-between gap-4"
          >
            <span>{actionError}</span>
            {pendingMutation && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={isSaving}
                className="px-3 py-1 text-xs font-bold rounded bg-red-700 text-white hover:bg-red-800 disabled:opacity-50 shrink-0"
              >
                Повторить сохранение
              </button>
            )}
          </div>
        )}

        {/* Completion status notification */}
        {completionNotice && (
          <div className="p-3 text-sm font-semibold rounded bg-blue-500/10 border border-blue-500/30 text-blue-900 dark:text-blue-200 flex items-center justify-between">
            <span>{completionNotice}</span>
            <span className="text-xs text-gray-500">
              {sessionState.submitted_at
                ? new Date(sessionState.submitted_at).toLocaleTimeString()
                : ""}
            </span>
          </div>
        )}

        {/* Incoming Card (Read-only panels) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded border border-[#b4b9bc] bg-[#fbfdfe] p-3 shadow-xs">
            <CallerPanel data={card} />
          </div>
          <div className="rounded border border-[#b4b9bc] bg-[#fbfdfe] p-3 shadow-xs">
            <IncidentPanel data={card} />
          </div>
        </div>

        {/* Cadet actions panel (compact, separate controls) */}
        <div className="rounded border border-[#b4b9bc] bg-[#fbfdfe] p-4 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#c9ced1] pb-2">
            <h4 className="text-sm font-bold text-[#111827]">
              Действия диспетчера ДДС
            </h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isSaving}
                className="px-2.5 py-1 text-xs font-medium rounded border border-[#b4b9bc] bg-[#efefef] hover:bg-white text-gray-700 disabled:opacity-50"
              >
                Обновить
              </button>
              <button
                type="button"
                onClick={handleFinish}
                disabled={isSaving || isCompleted || hasPending}
                className="px-4 py-1.5 text-xs font-bold rounded bg-[#107c41] text-white hover:bg-[#0d6535] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Завершить выполнение
              </button>
            </div>
          </div>

          {/* Service status mutation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label
                htmlFor="dds-service-select"
                className="block font-semibold text-gray-700 mb-1"
              >
                Служба
              </label>
              <select
                id="dds-service-select"
                aria-label="Служба"
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                disabled={isSaving || isCompleted || hasPending}
                className="w-full h-8 px-2 border border-[#b4b9bc] rounded bg-white text-gray-800 disabled:bg-gray-100"
              >
                {serviceOptions.map((s) => (
                  <option key={s.id || s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="dds-status-select"
                className="block font-semibold text-gray-700 mb-1"
              >
                Статус службы
              </label>
              <select
                id="dds-status-select"
                aria-label="Статус службы"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                disabled={isSaving || isCompleted || hasPending}
                className="w-full h-8 px-2 border border-[#b4b9bc] rounded bg-white text-gray-800 disabled:bg-gray-100"
              >
                {ALLOWED_DDS_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="dds-order-number"
                className="block font-semibold text-gray-700 mb-1"
              >
                Номер наряда
              </label>
              <input
                id="dds-order-number"
                aria-label="Номер наряда"
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                disabled={isSaving || isCompleted || hasPending}
                placeholder="Например, 102/4"
                className="w-full h-8 px-2 border border-[#b4b9bc] rounded bg-white text-gray-800 disabled:bg-gray-100"
              />
            </div>

            <div>
              <label
                htmlFor="dds-comment"
                className="block font-semibold text-gray-700 mb-1"
              >
                Комментарий
              </label>
              <textarea
                id="dds-comment"
                aria-label="Комментарий"
                rows={1}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                disabled={isSaving || isCompleted || hasPending}
                placeholder="Заметка к статусу..."
                className="w-full h-8 px-2 py-1 border border-[#b4b9bc] rounded bg-white text-gray-800 disabled:bg-gray-100 resize-none text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveStatus}
              disabled={isSaving || isCompleted || hasPending}
              className="px-4 py-1.5 text-xs font-semibold rounded bg-[#157dbd] text-white hover:bg-[#136ba3] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Сохранить статус
            </button>
          </div>

          {/* Dispatch mutation (separate form) */}
          <div className="border-t border-[#c9ced1] pt-3 space-y-2">
            <span className="text-xs font-bold text-gray-700 block">
              Направление в службу
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label
                  htmlFor="dds-who-accepted"
                  className="block font-semibold text-gray-700 mb-1"
                >
                  Кто принял
                </label>
                <input
                  id="dds-who-accepted"
                  aria-label="Кто принял"
                  type="text"
                  value={whoAccepted}
                  onChange={(e) => setWhoAccepted(e.target.value)}
                  disabled={isSaving || isCompleted || hasPending}
                  placeholder="ФИО или позывной сотрудника..."
                  className="w-full h-8 px-2 border border-[#b4b9bc] rounded bg-white text-gray-800 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label
                  htmlFor="dds-summary"
                  className="block font-semibold text-gray-700 mb-1"
                >
                  Суть сообщения
                </label>
                <textarea
                  id="dds-summary"
                  aria-label="Суть сообщения"
                  rows={1}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  disabled={isSaving || isCompleted || hasPending}
                  placeholder="Краткое содержание переданной информации..."
                  className="w-full h-8 px-2 py-1 border border-[#b4b9bc] rounded bg-white text-gray-800 disabled:bg-gray-100 resize-none text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveDispatch}
                disabled={isSaving || isCompleted || hasPending}
                className="px-4 py-1.5 text-xs font-semibold rounded bg-[#3b5998] text-white hover:bg-[#2d4373] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Сохранить направление
              </button>
            </div>
          </div>

          {/* Server Actions Journal */}
          <div className="border-t border-[#c9ced1] pt-3">
            <h5 className="text-xs font-bold text-gray-700 mb-2">
              Журнал действий занятия ({sessionState.actions.length})
            </h5>
            {sessionState.actions.length === 0 ? (
              <p className="text-xs text-gray-500 italic py-1">
                Пока нет сохраненных действий по этой карточке.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {sessionState.actions.map((act) => (
                  <div
                    key={act.request_id}
                    className="p-2 rounded bg-white border border-[#c9ced1] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[#111827]">
                          {act.service_name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono text-[11px]">
                          {act.kind === "status"
                            ? act.status || "Статус"
                            : "Направление"}
                        </span>
                        {act.order_number && (
                          <span className="text-gray-500 text-[11px]">
                            № {act.order_number}
                          </span>
                        )}
                      </div>
                      {act.comment && (
                        <p className="text-gray-700">{act.comment}</p>
                      )}
                      {act.who_accepted && (
                        <p className="text-gray-600 text-[11px]">
                          Принял: {act.who_accepted} &bull; {act.summary}
                        </p>
                      )}
                    </div>
                    {act.at && (
                      <span className="text-[11px] text-gray-400 shrink-0">
                        {new Date(act.at).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
