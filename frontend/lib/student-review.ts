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
export interface ReviewEvent extends ReviewEvidence {id: string; kind: string; text?: string; note?: string; blocking?: boolean}
export interface AutomaticAssessment {
  source: "rules"; version: 1
  status: "in_progress" | "incomplete" | "insufficient_data" | "passed" | "needs_review"
  completed_criteria: number; corrected_criteria: number; total_criteria: number; mistakes_count: number
  recommendations: {criterion: string; text: string}[]
}
export interface TeacherAssessment {
  score: number | null
  is_passed: boolean | null
  comment: string | null
  graded_at: string | null
}
export type TeacherAssessmentStatus = "available" | "not_graded" | "unavailable"
export interface StudentReview {
  state: DDSSessionState; criteria: ReviewCriterion[]; events: ReviewEvent[];
  assessment?: AutomaticAssessment | null
  savedErrors?: {count: number; messages: string[]}; historyUnavailable?: boolean
  teacherAssessment?: TeacherAssessment | null
  teacherAssessmentStatus?: TeacherAssessmentStatus
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
    (item.text != null && typeof item.text !== "string") || (item.note != null && typeof item.note !== "string"))) {
    throw new Error("Не удалось прочитать события карточки. Повторите загрузку.")
  }
  const assessment = data.assessment
  if (assessment != null && (!object(assessment) || assessment.source !== "rules" || assessment.version !== 1 ||
    !["in_progress", "incomplete", "insufficient_data", "passed", "needs_review"].includes(String(assessment.status)) ||
    ["completed_criteria", "corrected_criteria", "total_criteria", "mistakes_count"].some(key => !Number.isSafeInteger(assessment[key]) || Number(assessment[key]) < 0) ||
    assessment.total_criteria !== REVIEW_CRITERIA.length || Number(assessment.completed_criteria) + Number(assessment.corrected_criteria) > REVIEW_CRITERIA.length ||
    (assessment.status === "passed" && (assessment.completed_criteria !== 5 || assessment.corrected_criteria !== 0 || assessment.mistakes_count !== 0)) ||
    !Array.isArray(assessment.recommendations) || assessment.recommendations.some(item => !object(item) ||
      !REVIEW_CRITERIA.some(definition => definition.key === item.criterion) || typeof item.text !== "string" || !item.text.trim()))) {
    throw new Error("Не удалось прочитать автоматический разбор. Повторите загрузку.")
  }
  return {state, criteria: (criteria as ReviewCriterion[]).filter(item => REVIEW_CRITERIA.some(definition => definition.key === item.key)), events: events as ReviewEvent[], assessment: assessment as AutomaticAssessment | null | undefined}
}

export async function fetchStudentReview(sessionId: string, cardId?: string, signal?: AbortSignal) {
  const token = getStoredToken()
  if (!token) throw new Error("Для просмотра разбора необходимо войти в систему.")
  const path = `/api/dds/sessions/${encodeURIComponent(sessionId)}${cardId ? `/cards/${encodeURIComponent(cardId)}` : ""}`
  const response = await fetch(path, {headers: {Authorization: `Bearer ${token}`}, cache: "no-store", signal})
  if (!response.ok) throw new Error(getSafeHttpErrorMessage(response.status))
  const review = validateStudentReview(await response.json(), sessionId, cardId)
  // Load teacher metadata independently of the five-criterion protocol. Older reviews may have either or both.
  try {
    signal?.throwIfAborted()
    const historyResponse = await fetch("/api/v1/students/me/lessons?role=DISPATCHER_DDS", {
      headers: {Authorization: `Bearer ${token}`}, cache: "no-store", signal,
    })
    if (!historyResponse.ok) throw new Error()
    const history: unknown = await historyResponse.json()
    if (!Array.isArray(history)) throw new Error()
    const lesson = history.find(item => object(item) && item.session_id === sessionId &&
      Array.isArray(item.tickets) && item.tickets.some(ticket =>
        object(ticket) && ticket.card_id === review.state.card_id))
    const ticket = Array.isArray(lesson?.tickets) ? lesson.tickets.find((item: unknown) =>
      object(item) && item.card_id === review.state.card_id) : undefined
    if (!object(ticket)) throw new Error()
    if (Object.hasOwn(ticket, "teacher_assessment")) {
      const rawAssessment = ticket.teacher_assessment
      if (rawAssessment === null) {
        review.teacherAssessment = null
        review.teacherAssessmentStatus = "not_graded"
      } else if (object(rawAssessment) &&
        (rawAssessment.score === null || typeof rawAssessment.score === "number" && Number.isFinite(rawAssessment.score) && rawAssessment.score >= 0 && rawAssessment.score <= 100) &&
        (rawAssessment.is_passed === null || typeof rawAssessment.is_passed === "boolean") &&
        (rawAssessment.comment === null || typeof rawAssessment.comment === "string") &&
        (rawAssessment.graded_at === null || typeof rawAssessment.graded_at === "string")) {
        review.teacherAssessment = rawAssessment as unknown as TeacherAssessment
        review.teacherAssessmentStatus = "available"
      } else {
        throw new Error()
      }
    } else {
      review.teacherAssessmentStatus = "unavailable"
    }
    if (!review.criteria.some(item => item.status !== "not_evaluated") &&
        Number.isSafeInteger(ticket.errors_count) && Number(ticket.errors_count) >= 0 &&
        Array.isArray(ticket.errors) && ticket.errors.every(item => typeof item === "string")) {
      review.savedErrors = {count: Math.max(Number(ticket.errors_count), ticket.errors.length), messages: ticket.errors}
    }
  } catch {
    if (signal?.aborted) signal.throwIfAborted()
    review.historyUnavailable = true
    review.teacherAssessmentStatus = "unavailable"
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
    action.comment, action.summary,
    typeof action.note === "string" ? `Запись доклада: ${action.note}` : ""]
  return parts.filter((part): part is string => typeof part === "string" && !!part.trim()).join(" · ")
}

export function reviewTime(value?: string | null) {
  if (!value) return "Время не записано"
  // Server timestamps without an offset are UTC, as in the existing DDS server parser.
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`)
  return Number.isFinite(date.getTime()) ? date.toLocaleString("ru-RU", {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"}) : "Время не записано"
}
