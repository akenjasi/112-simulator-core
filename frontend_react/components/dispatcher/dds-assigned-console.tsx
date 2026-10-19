"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import {fetchDDSSessionState, fetchDDSCard, postDDSAction, finishDDSSession, completeDDSCard, postDDSPhone,
  DDSRequestError, ddsBlockerMessage, getStoredToken,
  type DDSPhonePayload, type DDSSessionState, type DDSActionPayload, type DDSFinishPayload} from "@/lib/dds-cycle"
import { TopBar } from "@/components/dispatcher/top-bar"
import { CallerPanel } from "@/components/dispatcher/caller-panel"
import { IncidentPanel } from "@/components/dispatcher/incident-panel"
import { ServicesBar } from "@/components/dispatcher/services-bar"
import { getDDSServiceResponse } from "@/lib/dds-service-response"
import { DispatchPanel } from "@/components/dispatcher/dispatch-panel"
import { getDDSWorkingCard } from "@/lib/dds-working-card"

import {DDSTrainingPhone} from "./dds-training-phone"

interface Props { sessionId: string; ticketId?: string; cardId?: string }
type PendingMutation =
  | { type: "phone"; payload: DDSPhonePayload }
  | { type: "action"; payload: DDSActionPayload }
  | { type: "finish"; payload: DDSFinishPayload }
  | { type: "complete"; cardId: string; payload: {request_id: string} }

export function DDSAssignedConsole({sessionId, ticketId, cardId}: Props) {
  const [sessionState, setSessionState] = useState<DDSSessionState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const isSavingRef = useRef(false)
  const [selectedService, setSelectedService] = useState("")
  const [whoAccepted, setWhoAccepted] = useState("")
  const [summary, setSummary] = useState("")
  const [now, setNow] = useState(() => Date.now())
  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null)
  const pendingRef = useRef<PendingMutation | null>(null)
  const epochRef = useRef(0)
  const lastCardRef = useRef<string | null>(null)
  const ticketRef = useRef(ticketId)
  ticketRef.current = ticketId
  const getControllerRef = useRef<AbortController | null>(null)
  const postControllerRef = useRef<AbortController | null>(null)

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])

  const acceptState = useCallback((state: DDSSessionState) => {
    if (lastCardRef.current !== state.card_id) {
      setWhoAccepted(""); setSummary("")
      setSelectedService(state.incoming_card.services[0]?.name || "")
      lastCardRef.current = state.card_id
    }
    setSessionState(state)
    // Next.js supports native history updates; preserve the session while the server advances its card.
    if (typeof window !== "undefined" && window.location.pathname.replace(/\/$/, "") === "/dds") {
      const params = new URLSearchParams({session_id: state.session_id, ticket_id: state.ticket_id})
      if (cardId) params.set("card_id", state.card_id)
      window.history.replaceState(null, "", `/dds?${params}`)
    }
  }, [cardId])

  const loadState = useCallback(async () => {
    const epoch = ++epochRef.current
    getControllerRef.current?.abort()
    const controller = new AbortController()
    getControllerRef.current = controller
    if (!getStoredToken()) {
      setLoadError("Требуется авторизация для доступа к занятию. Пожалуйста, выполните вход.")
      setIsLoading(false); return
    }
    setIsLoading(true); setLoadError(null)
    try {
      const state = cardId ? await fetchDDSCard(sessionId, cardId, controller.signal)
        : await fetchDDSSessionState(sessionId, ticketRef.current, controller.signal)
      if (epochRef.current === epoch) { acceptState(state); setLoadError(null) }
    } catch (error: any) {
      if (controller.signal.aborted || epochRef.current !== epoch) return
      setLoadError(error.message || "Ошибка загрузки данных занятия"); setSessionState(null)
    } finally { if (epochRef.current === epoch) setIsLoading(false) }
  }, [sessionId, cardId, acceptState])

  useEffect(() => {
    epochRef.current++; getControllerRef.current?.abort(); postControllerRef.current?.abort()
    isSavingRef.current = false; setIsSaving(false)
    pendingRef.current = null; setPendingMutation(null); setSessionState(null)
    setActionError(null); setLoadError(null); setSelectedService(""); setWhoAccepted(""); setSummary("")
    lastCardRef.current = null
    loadState()
    return () => { epochRef.current++; getControllerRef.current?.abort(); postControllerRef.current?.abort(); isSavingRef.current = false }
  }, [sessionId, cardId, loadState])

  const isCompleted = sessionState?.session_status === "COMPLETED" || sessionState?.lesson_status === "COMPLETED"
  const isReadOnly = isCompleted || sessionState?.readonly === true
  const hasPending = pendingMutation !== null

  useEffect(() => {
    if (!sessionState?.exercise || isReadOnly) return
    let alive = true
    let polling = false
    const timer = setInterval(async () => {
      if (polling || isSavingRef.current || pendingRef.current || document.visibilityState === "hidden") return
      polling = true
      const epoch = epochRef.current
      try {
        const state = cardId ? await fetchDDSCard(sessionId, cardId) : await fetchDDSSessionState(sessionId)
        if (alive && epoch === epochRef.current && !isSavingRef.current) acceptState(state)
      } catch { /* Explicit actions and reload retain error reporting; polling never discards local drafts. */ }
      finally {polling = false}
    }, 1000)
    return () => {alive = false; clearInterval(timer)}
  }, [sessionId, cardId, !!sessionState?.exercise, isReadOnly, acceptState])

  const sendMutation = async (mutation: PendingMutation): Promise<boolean> => {
    if (isSavingRef.current || !sessionState) return false
    isSavingRef.current = true; setIsSaving(true); setActionError(null)
    const epoch = ++epochRef.current
    getControllerRef.current?.abort()
    postControllerRef.current?.abort()
    const controller = new AbortController(); postControllerRef.current = controller
    try {
      const updated = mutation.type === "phone" ? await postDDSPhone(sessionId, mutation.payload, controller.signal)
        : mutation.type === "action" ? await postDDSAction(sessionId, mutation.payload, controller.signal)
        : mutation.type === "complete" ? await completeDDSCard(sessionId, mutation.cardId, mutation.payload, controller.signal)
        : await finishDDSSession(sessionId, mutation.payload, controller.signal)
      if (epochRef.current !== epoch) return false
      acceptState(updated); setActionError(null); setPendingMutation(null); pendingRef.current = null
      const requestId = mutation.type === "finish" ? null : mutation.payload.request_id
      if (updated.last_attempt?.request_id === requestId && !updated.last_attempt.accepted) {
        setActionError(updated.last_attempt.message); return false
      }
      if (mutation.type === "action" && mutation.payload.kind === "dispatch") {setWhoAccepted(""); setSummary("")}
      return true
    } catch (error: any) {
      if (epochRef.current !== epoch || controller.signal.aborted) return false
      setActionError(error.message || "Не удалось сохранить действие")
      // A definitive rejection is correctable; an uncertain network/server result needs the same request ID.
      if (!(error instanceof DDSRequestError) || error.retryable) {
        setPendingMutation(mutation); pendingRef.current = mutation
      } else {setPendingMutation(null); pendingRef.current = null}
      return false
    } finally {if (epochRef.current === epoch) {isSavingRef.current = false; setIsSaving(false)}}
  }

  const blocked = () => isSavingRef.current || pendingRef.current || isReadOnly || !sessionState
  const handleSaveStatus = async (draft: {serviceName: string; status: string; comment: string; orderNumber: string}) => {
    if (blocked() || !sessionState) return false
    return sendMutation({type: "action", payload: {request_id: crypto.randomUUID(), card_id: sessionState.card_id,
      kind: "status", service_name: draft.serviceName, status: draft.status,
      ...(draft.comment.trim() ? {comment: draft.comment.trim()} : {}),
      ...(draft.orderNumber.trim() ? {order_number: draft.orderNumber.trim()} : {})}})
  }
  const handleSaveDispatch = async (serviceName: string, receiver: string, message: string) => {
    if (blocked() || !sessionState) return false
    return sendMutation({type: "action", payload: {request_id: crypto.randomUUID(), card_id: sessionState.card_id,
      kind: "dispatch", service_name: serviceName, who_accepted: receiver.trim(), summary: message.trim()}})
  }
  const handleFinish = () => {if (!blocked()) void sendMutation({type: "finish", payload: {}})}
  const handleComplete = () => {
    if (!blocked() && (sessionState?.can_complete || sessionState?.exercise)) void sendMutation({type: "complete", cardId: sessionState.card_id, payload: {request_id: crypto.randomUUID()}})
  }
  const handleRetry = () => {if (!isSavingRef.current && pendingRef.current) void sendMutation(pendingRef.current)}
  const handleRefresh = () => {
    if (isSavingRef.current) return
    setPendingMutation(null); pendingRef.current = null; setActionError(null); void loadState()
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
  const mutationDisabled = isSaving || isReadOnly || hasPending
  const historyIndex = sessionState.cards?.findIndex(item => item.card_id === sessionState.card_id) ?? -1
  const displayedIndex = historyIndex >= 0 ? historyIndex : sessionState.current_index ?? 0
  const completionNotice = sessionState.readonly && !isCompleted ? "Карточка завершена: просмотр истории" : isCompleted
    ? sessionState.submitted_at
      ? `Выполнено. ${sessionState.score == null ? (sessionState.exercise ? "Результаты сохранены" : "Нет оценки") : `Оценка: ${sessionState.score}`}`
      : "Занятие завершено. Выполнение не завершено. Нет оценки"
    : null

  return (
    <div className="flex h-screen w-full overflow-hidden select-none flex-col bg-[#c9ced1] text-[#1e2327]" data-testid="dds-reference-workspace">
      <div className="w-full z-50 flex shrink-0 items-center justify-between px-4 2xl:px-8 py-2 border-b-2 shadow-md bg-[#2b3a42] border-[#157dbd] text-white">
        <div className="flex items-center gap-3">
          <span className="font-bold text-xs 2xl:text-sm text-[#4ade80] flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#4ade80]" />
            {sessionState.exercise ? (isCompleted ? "Занятие завершено · ДДС" : "Учебное занятие · ДДС") : (isCompleted ? "Смена завершена (ДДС-112)" : "Смена активна (ДДС-112)")}
          </span>
          <div aria-label={`Норматив принятия: ${responseService}`} className={`flex items-center gap-1.5 px-2 py-0.5 rounded font-mono font-bold text-xs border ml-2 ${response.overdue ? "bg-red-600 text-white border-red-500" : "bg-emerald-900/40 text-emerald-400 border-emerald-500/50"}`}
            title={`${responseService}: ${response.responded ? "Первичное решение сохранено; время дальнейших работ не относится к нормативу принятия" : remaining === null ? "Время начала не получено от сервера" : "30 секунд от получения карточки до решения этой службы"}`}>
            <span className="uppercase tracking-wider opacity-90 text-[10px]">SLA 30С:</span>
            <span className="text-sm">{response.responded ? "Решение принято" : remaining === null ? "—" : remaining === 0 ? "Просрочено" : `${remaining} сек`}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs">Карточка {displayedIndex + 1} из {sessionState.total_cards ?? 1} · Закрыто: {sessionState.completed_cards ?? 0}</span>
          <Link href="/student/profile" className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded font-medium">← В личный кабинет</Link>
          <button type="button" onClick={handleFinish} disabled={mutationDisabled}
            className="px-4 py-1.5 text-xs 2xl:text-sm bg-red-600 hover:bg-red-700 text-white rounded font-bold transition shadow disabled:opacity-50">
            {sessionState.exercise ? "Завершить занятие досрочно" : "Завершить смену"}
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
        <div className="flex flex-1 min-w-0 min-h-0 flex-col gap-2 overflow-hidden pr-2 pb-2">
          <IncidentPanel data={card} />
          {sessionState.exercise ? <DDSTrainingPhone key={`phone-${sessionState.card_id}`} exercise={sessionState.exercise}
            selectedService={selectedService} onServiceChange={setSelectedService} disabled={mutationDisabled}
            command={payload => sendMutation({type: "phone", payload: {...payload, request_id: crypto.randomUUID(), card_id: sessionState.card_id}})}
            record={{accepted: acceptedServices.includes(selectedService), whoAccepted, setWhoAccepted, summary, setSummary,
              saved: dispatches[selectedService], onSave: () => handleSaveDispatch(selectedService, whoAccepted, summary)}}/>
            : <DispatchPanel
              key={`${sessionId}-${sessionState.card_id}`}
              isCardAccepted={acceptedServices.length > 0}
              acceptedServices={acceptedServices}
              disabled={mutationDisabled}
              whoAccepted={whoAccepted} setWhoAccepted={setWhoAccepted}
              summary={summary} setSummary={setSummary}
              services={workingCard.services}
              selectedServiceName={selectedService} onServiceChange={setSelectedService}
              calledServices={Object.keys(dispatches)} savedDispatches={dispatches}
              onServiceSaved={handleSaveDispatch}
            />}
        </div>
      </div>
      <div className="shrink-0 z-50 w-full">
        <ServicesBar key={`${sessionId}-${sessionState.card_id}`} data={workingCard} disabled={mutationDisabled}
          allowedStatuses={sessionState.allowed_service_statuses}
          closeHref="/dds/journal"
          disabledReason={isCompleted ? "Занятие завершено: доступен только просмотр" : "Дождитесь сохранения действия или повторите неудавшийся запрос"}
          onStatusChange={(serviceName, status, comment, orderNumber) => handleSaveStatus({serviceName, status, comment, orderNumber})}
          completionDisabled={!sessionState.exercise && !sessionState.can_complete}
          completionReason={(sessionState.completion_blockers || []).map(ddsBlockerMessage).join("; ") || undefined}
          onNextCard={handleComplete}/>
      </div>
    </div>
  )
}
