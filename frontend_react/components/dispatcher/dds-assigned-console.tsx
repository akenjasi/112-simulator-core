"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import {
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
import { ServicesBar } from "@/components/dispatcher/services-bar"
import { getDDSServiceResponse } from "@/lib/dds-service-response"
import { DispatchPanel } from "@/components/dispatcher/dispatch-panel"
import { getDDSWorkingCard } from "@/lib/dds-working-card"

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
  const [whoAccepted, setWhoAccepted] = useState<string>("")
  const [summary, setSummary] = useState<string>("")
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

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
  const handleSaveStatus = async (draft: {serviceName: string; status: string; comment: string; orderNumber: string}) => {
    if (isSavingRef.current || hasPending || pendingRef.current || isCompleted || !sessionState) return false
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
      service_name: draft.serviceName,
      status: draft.status,
    }
    if (draft.comment.trim()) {
      payload.comment = draft.comment.trim()
    }
    if (draft.orderNumber.trim()) {
      payload.order_number = draft.orderNumber.trim()
    }

    try {
      const updated = await postDDSAction(sessionId, payload, controller.signal)
      if (epochRef.current !== epoch) return false
      setSessionState(updated)
      setActionError(null)
      setPendingMutation(null)
      pendingRef.current = null
      setSelectedService(draft.serviceName)
      return true
    } catch (err: any) {
      if (epochRef.current !== epoch || controller.signal.aborted) return false
      setActionError(err.message || "Не удалось сохранить статус")
      setPendingMutation({ type: "action", payload })
      pendingRef.current = { type: "action", payload }
      return false
    } finally {
      if (epochRef.current === epoch) {
        isSavingRef.current = false
        setIsSaving(false)
      }
    }
  }

  // Save dispatch action
  const handleSaveDispatch = async (serviceName: string, receiver: string, message: string) => {
    if (isSavingRef.current || hasPending || pendingRef.current || isCompleted || !sessionState) return false
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
      service_name: serviceName,
      who_accepted: receiver.trim(),
      summary: message.trim(),
    }

    try {
      const updated = await postDDSAction(sessionId, payload, controller.signal)
      if (epochRef.current !== epoch) return false
      setSessionState(updated)
      setActionError(null)
      setPendingMutation(null)
      pendingRef.current = null
      setWhoAccepted("")
      setSummary("")
      return true
    } catch (err: any) {
      if (epochRef.current !== epoch || controller.signal.aborted) return false
      setActionError(err.message || "Не удалось сохранить направление")
      setPendingMutation({ type: "action", payload })
      pendingRef.current = { type: "action", payload }
      return false
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
  const workingCard = getDDSWorkingCard(sessionState)
  const acceptedStatuses = ["Принята", "Начало реагирования", "Прибытие", "Проведение работ", "В пути", "Прибыли"]
  const acceptedServices = workingCard.services.filter(service => acceptedStatuses.includes(service.status)).map(service => service.name)
  const dispatches: Record<string, {whoAccepted: string; summary: string}> = {}
  for (const action of sessionState.actions) {
    if (action.kind === "dispatch") dispatches[action.service_name] = {
      whoAccepted: action.who_accepted || "", summary: action.summary || "",
    }
  }
  const responseService = selectedService || workingCard.services[0]?.name || ""
  const response = getDDSServiceResponse(sessionState, responseService, now)
  const remaining = response.remaining
  const mutationDisabled = isSaving || isCompleted || hasPending
  const completionNotice = isCompleted
    ? sessionState.submitted_at
      ? `Выполнено. ${sessionState.score == null ? "Нет оценки" : `Оценка: ${sessionState.score}`}`
      : "Занятие завершено. Выполнение не завершено. Нет оценки"
    : null

  return (
    <div className="flex h-screen w-full overflow-hidden select-none flex-col bg-[#c9ced1] text-[#1e2327]" data-testid="dds-reference-workspace">
      <div className="w-full z-50 flex shrink-0 items-center justify-between px-4 2xl:px-8 py-2 border-b-2 shadow-md bg-[#2b3a42] border-[#157dbd] text-white">
        <div className="flex items-center gap-3">
          <span className="font-bold text-xs 2xl:text-sm text-[#4ade80] flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#4ade80]" />
            {isCompleted ? "Смена завершена (ДДС-112)" : "Смена активна (ДДС-112)"}
          </span>
          <div aria-label={`Норматив принятия: ${responseService}`} className={`flex items-center gap-1.5 px-2 py-0.5 rounded font-mono font-bold text-xs border ml-2 ${response.overdue ? "bg-red-600 text-white border-red-500" : "bg-emerald-900/40 text-emerald-400 border-emerald-500/50"}`}
            title={`${responseService}: ${response.responded ? "Первичное решение сохранено; время дальнейших работ не относится к нормативу принятия" : remaining === null ? "Время начала не получено от сервера" : "30 секунд от начала сессии до решения этой службы"}`}>
            <span className="uppercase tracking-wider opacity-90 text-[10px]">SLA 30С:</span>
            <span className="text-sm">{response.responded ? "Решение принято" : remaining === null ? "—" : remaining === 0 ? "Просрочено" : `${remaining} сек`}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/student/lobby" className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded font-medium">← В Лобби</Link>
          <button type="button" onClick={handleFinish} disabled={mutationDisabled}
            className="px-4 py-1.5 text-xs 2xl:text-sm bg-red-600 hover:bg-red-700 text-white rounded font-bold transition shadow disabled:opacity-50">
            Завершить смену
          </button>
        </div>
      </div>
      {actionError && <div role="alert" className="shrink-0 flex items-center justify-between gap-4 px-4 py-2 text-sm bg-red-100 text-red-900 border-b border-red-400">
        <span>{actionError}</span>
        {pendingMutation && <button type="button" onClick={handleRetry} disabled={isSaving} className="font-bold underline disabled:opacity-50">Повторить сохранение</button>}
        <button type="button" onClick={handleRefresh} disabled={isSaving} className="underline disabled:opacity-50">Обновить</button>
      </div>}
      {completionNotice && <div className="shrink-0 px-4 py-2 text-sm bg-blue-100 text-blue-900">{completionNotice}</div>}
      <TopBar data={card} />
      <div className="flex flex-1 min-h-0 gap-3 px-2 py-1 overflow-hidden" data-testid="dds-reference-columns">
        <CallerPanel data={card} />
        <div className="flex flex-1 min-w-0 flex-col gap-2 overflow-y-auto pr-2 pb-2">
          <IncidentPanel data={card} />
          <DispatchPanel
            key={`${sessionId}-${ticketId || ""}`}
            isCardAccepted={acceptedServices.length > 0}
            acceptedServices={acceptedServices}
            disabled={mutationDisabled}
            whoAccepted={whoAccepted} setWhoAccepted={setWhoAccepted}
            summary={summary} setSummary={setSummary}
            services={workingCard.services}
            selectedServiceName={selectedService} onServiceChange={setSelectedService}
            calledServices={Object.keys(dispatches)} savedDispatches={dispatches}
            onServiceSaved={handleSaveDispatch}
          />
        </div>
      </div>
      <div className="shrink-0 z-50 w-full">
        <ServicesBar key={`${sessionId}-${ticketId || ""}`} data={workingCard} disabled={mutationDisabled}
          allowedStatuses={sessionState.allowed_service_statuses}
          closeHref="/dds/journal"
          disabledReason={isCompleted ? "Занятие завершено: доступен только просмотр" : "Дождитесь сохранения действия или повторите неудавшийся запрос"}
          onStatusChange={(serviceName, status, comment, orderNumber) => handleSaveStatus({serviceName, status, comment, orderNumber})}
          onNextCard={handleFinish}/>
      </div>
    </div>
  )
}
