import {getSafeHttpErrorMessage, getStoredToken, validateDDSSessionState, type DDSSessionState} from "@/lib/dds-cycle"

export const REVIEW_CRITERIA = [
  {key: "confirmation", title: "Первичное подтверждение", rule: "Подтверждайте получение каждой службой не позднее 30 секунд от направления карточки сервером."},
  {key: "service", title: "Соответствие службе", rule: "Сохраняйте действие для той службы, от которой поступил доклад."},
  {key: "stage", title: "Соответствие этапу", rule: "Выбирайте статус, который подтверждён полученным докладом."},
  {key: "accuracy", title: "Точность записей", rule: "Сверяйте исполнителя, номер бригады и результат с учебными сведениями."},
  {key: "completion", title: "Завершение", rule: "Получите заключительный доклад и запишите результат перед завершением карточки."},
] as const

export type ReviewStatus = "completed" | "completed_after_correction" | "not_completed" | "not_evaluated"
export const REVIEW_STATUS: Record<ReviewStatus, string> = {
  completed: "Выполнено", completed_after_correction: "Выполнено после исправления",
  not_completed: "Не выполнено", not_evaluated: "Не оценено",
}
export interface ReviewEvidence {
  service_name?: string; seconds?: number | null; at?: string; message?: string;
  action?: Record<string, unknown>
}
export interface ReviewCriterion {key: string; status: ReviewStatus; evidence: ReviewEvidence[]}
export interface ReviewEvent extends ReviewEvidence {id: string; kind: string; text?: string}
export interface StudentReview {
  state: DDSSessionState; criteria: ReviewCriterion[]; events: ReviewEvent[];
  savedErrors?: {count: number; messages: string[]}; historyUnavailable?: boolean
}

export function reviewUrl(sessionId: string, cardId?: string) {
  return `/student/review?${new URLSearchParams({session_id: sessionId, ...(cardId ? {card_id: cardId} : {})})}`
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
function evidence(value: unknown): value is ReviewEvidence {
  return object(value) && (value.seconds === undefined || value.seconds === null ||
    typeof value.seconds === "number" && Number.isFinite(value.seconds) && value.seconds >= 0) &&
    ["service_name", "at", "message"].every(key => value[key] == null || typeof value[key] === "string") &&
    (value.action == null || object(value.action))
}

export function validateStudentReview(raw: unknown, sessionId: string, cardId?: string): StudentReview {
  const state = validateDDSSessionState(raw, sessionId)
  if (cardId && state.card_id !== cardId) throw new Error("Сервер вернул другую карточку. Разбор не показан.")
  const data = raw as Record<string, unknown>
  const criteria = data.criteria ?? []
  if (!Array.isArray(criteria) || criteria.some(item => !object(item) || typeof item.key !== "string" ||
    !Object.hasOwn(REVIEW_STATUS, String(item.status)) || !Array.isArray(item.evidence) || !item.evidence.every(evidence)) ||
    new Set(criteria.map(item => item.key)).size !== criteria.length) {
    throw new Error("Не удалось прочитать результаты проверки. Повторите загрузку.")
  }
  const events = object(data.exercise) ? data.exercise.events ?? [] : []
  if (!Array.isArray(events) || events.some(item => !evidence(item) || !object(item) ||
    typeof item.id !== "string" || typeof item.kind !== "string" || item.card_id !== state.card_id ||
    (item.text != null && typeof item.text !== "string"))) {
    throw new Error("Не удалось прочитать события карточки. Повторите загрузку.")
  }
  return {state, criteria: (criteria as ReviewCriterion[]).filter(item => REVIEW_CRITERIA.some(definition => definition.key === item.key)), events: events as ReviewEvent[]}
}

export async function fetchStudentReview(sessionId: string, cardId?: string, signal?: AbortSignal) {
  const token = getStoredToken()
  if (!token) throw new Error("Для просмотра разбора необходимо войти в систему.")
  const path = `/api/dds/sessions/${encodeURIComponent(sessionId)}${cardId ? `/cards/${encodeURIComponent(cardId)}` : ""}`
  const response = await fetch(path, {headers: {Authorization: `Bearer ${token}`}, cache: "no-store", signal})
  if (!response.ok) throw new Error(getSafeHttpErrorMessage(response.status))
  const review = validateStudentReview(await response.json(), sessionId, cardId)
  if (review.criteria.some(item => item.status !== "not_evaluated")) return review
  // Older checks have no five-criterion protocol. Preserve their remarks without assigning them to criteria.
  try {
    signal?.throwIfAborted()
    const historyResponse = await fetch("/api/v1/students/me/lessons?role=DISPATCHER_DDS", {
      headers: {Authorization: `Bearer ${token}`}, cache: "no-store", signal,
    })
    if (!historyResponse.ok) throw new Error()
    const history: unknown = await historyResponse.json()
    if (!Array.isArray(history)) throw new Error()
    const lesson = history.find(item => object(item) && item.session_id === sessionId)
    const ticket = Array.isArray(lesson?.tickets) ? lesson.tickets.find((item: unknown) => object(item) && item.card_id === review.state.card_id) : undefined
    if (ticket && object(ticket) && Number.isSafeInteger(ticket.errors_count) && Number(ticket.errors_count) >= 0 &&
        Array.isArray(ticket.errors) && ticket.errors.every(item => typeof item === "string")) {
      review.savedErrors = {count: Math.max(Number(ticket.errors_count), ticket.errors.length), messages: ticket.errors}
    }
  } catch {
    if (signal?.aborted) signal.throwIfAborted()
    review.historyUnavailable = true
  }
  return review
}

export function actionDescription(action?: Record<string, unknown>) {
  if (!action) return ""
  const parts = [typeof action.status === "string" ? `Статус: ${action.status}` :
    action.kind === "dispatch" ? "Передача задания" : action.operation === "dial" ? "Звонок исполнителю" :
    action.operation === "complete" ? "Завершение карточки" : "",
    typeof action.number === "string" ? `Номер: ${action.number}` : "",
    typeof action.who_accepted === "string" ? `Исполнитель: ${action.who_accepted}` : "",
    typeof action.order_number === "string" ? `Бригада: ${action.order_number}` : "",
    action.comment, action.summary]
  return parts.filter((part): part is string => typeof part === "string" && !!part.trim()).join(" · ")
}

export function reviewTime(value?: string | null) {
  if (!value) return "Время не записано"
  // Server timestamps without an offset are UTC, as in the existing DDS server parser.
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`)
  return Number.isFinite(date.getTime()) ? date.toLocaleString("ru-RU", {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"}) : "Время не записано"
}
