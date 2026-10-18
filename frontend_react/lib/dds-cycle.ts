/**
 * DDS Lesson Cycle API client, types and runtime validators (A-06).
 */

import type { DispatcherData } from "@/lib/dispatcher-data"
import { getStoredToken } from "@/lib/auth-session"

export { getStoredToken }

export const ALLOWED_DDS_STATUSES = [
  "Принята",
  "Не принята",
  "В пути",
  "Прибыли",
  "Работы завершены",
  "Отказ от выполнения работ",
  "Отказ",
  "Завершена",
  "Завершение работ без бригады",
  "Добавлена",
  "Получена службой",
  "В обработке",
  "Направлена",
  "Начало реагирования",
  "Прибытие",
  "Проведение работ",
] as const

export type AllowedDDSStatus = (typeof ALLOWED_DDS_STATUSES)[number]

export type DDSActionKind = "status" | "dispatch"

export interface DDSActionRecord {
  request_id: string
  kind: DDSActionKind
  service_name: string
  status?: string | null
  comment?: string | null
  order_number?: string | null
  who_accepted?: string | null
  summary?: string | null
  actor_id?: string | null
  actor_name?: string | null
  card_id?: string | null
  at?: string | null
}

export interface DDSActionPayload {
  request_id: string
  card_id?: string
  kind: DDSActionKind
  service_name: string
  status?: string
  comment?: string
  order_number?: string
  who_accepted?: string
  summary?: string
}

export type DDSFinishPayload = Record<string, never>

export interface DDSSessionState {
  session_id: string
  lesson_id: string
  ticket_id: string
  card_id: string
  session_status: string
  lesson_status: string
  started_at?: string | null
  incoming_card: DispatcherData
  actions: DDSActionRecord[]
  allowed_service_statuses?: Record<string, string[]>
  submitted_at: string | null
  score: number | null
  received_at?: string | null
  card_submitted_at?: string | null
  current_index?: number
  total_cards?: number
  completed_cards?: number
  can_complete?: boolean
  completion_blockers?: {code: string; service_name: string}[]
  cards?: {card_id: string; ticket_id: string; status: string; submitted_at?: string | null}[]
  readonly?: boolean
  stop_reason?: string | null
}

export interface DDSTicketSummary {
  ticket_id: string
  title: string
  category?: string
  subcategory?: string
  complexity?: number
}

export function getSafeHttpErrorMessage(status: number): string {
  switch (status) {
    case 401:
      return "Требуется авторизация для доступа к занятию"
    case 403:
      return "Доступ к занятию запрещен"
    case 404:
      return "Занятие или сессия не найдена"
    case 409:
      return "Конфликт состояния сессии. Обновите данные"
    case 422:
      return "Некорректные параметры запроса"
    default:
      if (status >= 500) {
        return "Ошибка сервера при обработке запроса"
      }
      return `Ошибка выполнения запроса (код ${status})`
  }
}

export function validateDDSSessionState(
  raw: unknown,
  expectedSessionId?: string,
  expectedTicketId?: string
): DDSSessionState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Некорректный ответ сервера: ожидается объект состояния")
  }
  const obj = raw as Record<string, any>

  if (typeof obj.session_id !== "string" || !obj.session_id.trim()) {
    throw new Error("Некорректный ответ: отсутствует session_id")
  }
  if (typeof obj.lesson_id !== "string" || !obj.lesson_id.trim()) {
    throw new Error("Некорректный ответ: отсутствует lesson_id")
  }
  if (typeof obj.ticket_id !== "string" || !obj.ticket_id.trim()) {
    throw new Error("Некорректный ответ: отсутствует ticket_id")
  }
  if (typeof obj.card_id !== "string" || !obj.card_id.trim()) {
    throw new Error("Некорректный ответ: отсутствует card_id")
  }

  if (expectedSessionId !== undefined && obj.session_id !== expectedSessionId) {
    throw new Error("Несоответствие идентификатора сессии")
  }

  if (expectedTicketId !== undefined && obj.ticket_id !== expectedTicketId) {
    throw new Error("Несоответствие идентификатора билета")
  }

  if (typeof obj.session_status !== "string" || !obj.session_status.trim()) {
    throw new Error("Некорректный ответ: отсутствует session_status")
  }
  if (typeof obj.lesson_status !== "string" || !obj.lesson_status.trim()) {
    throw new Error("Некорректный ответ: отсутствует lesson_status")
  }

  // Score validation: strictly null or finite number 0..100.
  // Boolean, string, NaN, Infinity, out of bounds -> throw error.
  let scoreVal: number | null = null
  if (obj.score === null || obj.score === undefined) {
    scoreVal = null
  } else if (typeof obj.score === "number") {
    if (!Number.isFinite(obj.score) || obj.score < 0 || obj.score > 100) {
      throw new Error("Некорректный ответ: score должен быть в диапазоне от 0 до 100")
    }
    scoreVal = obj.score
  } else {
    throw new Error("Некорректный ответ: неверный тип score")
  }

  // submitted_at
  let submittedAt: string | null = null
  if (obj.submitted_at !== null && obj.submitted_at !== undefined) {
    if (typeof obj.submitted_at !== "string") {
      throw new Error("Некорректный ответ: submitted_at должен быть строкой или null")
    }
    submittedAt = obj.submitted_at
  }

  // incoming_card validation
  const card = obj.incoming_card
  if (!card || typeof card !== "object" || Array.isArray(card)) {
    throw new Error("Некорректный ответ: отсутствует входящая карточка")
  }

  if (typeof card.description !== "string" || !card.description.trim()) {
    throw new Error("Некорректный ответ: отсутствует описание происшествия")
  }

  // phones panel
  if (!card.phones || typeof card.phones !== "object" || Array.isArray(card.phones)) {
    throw new Error("Некорректный ответ: отсутствуют данные телефонов")
  }
  if (
    typeof card.phones.aon !== "string" ||
    typeof card.phones.provided !== "string" ||
    (card.phones.onSite !== undefined && typeof card.phones.onSite !== "string")
  ) {
    throw new Error("Некорректный ответ: неверный формат панели телефонов")
  }

  // incident panel
  if (!card.incident || typeof card.incident !== "object" || Array.isArray(card.incident)) {
    throw new Error("Некорректный ответ: отсутствуют данные происшествия")
  }
  if (
    typeof card.incident.number !== "string" ||
    typeof card.incident.savedAt !== "string" ||
    typeof card.incident.operator !== "string"
  ) {
    throw new Error("Некорректный ответ: неверный формат панели происшествия")
  }

  // caller panel
  if (!card.caller || typeof card.caller !== "object" || Array.isArray(card.caller)) {
    throw new Error("Некорректный ответ: отсутствуют данные заявителя")
  }
  if (
    typeof card.caller.name !== "string" ||
    typeof card.caller.role !== "string" ||
    typeof card.caller.address !== "string"
  ) {
    throw new Error("Некорректный ответ: неверный формат данных заявителя")
  }

  // statuses panel
  if (!card.statuses || typeof card.statuses !== "object" || Array.isArray(card.statuses)) {
    throw new Error("Некорректный ответ: отсутствуют статусы")
  }
  if (
    typeof card.statuses.injured !== "string" ||
    typeof card.statuses.ambulanceRefusal !== "string" ||
    typeof card.statuses.blocked !== "string"
  ) {
    throw new Error("Некорректный ответ: неверный формат статусов")
  }

  // emergency panel
  if (!card.emergency || typeof card.emergency !== "object" || Array.isArray(card.emergency)) {
    throw new Error("Некорректный ответ: отсутствуют признаки ЧС/ЧП")
  }
  if (typeof card.emergency.cs !== "boolean" || typeof card.emergency.cp !== "boolean") {
    throw new Error("Некорректный ответ: флаги ЧС/ЧП должны быть булевыми")
  }

  // classification panel
  if (!card.classification || typeof card.classification !== "object" || Array.isArray(card.classification)) {
    throw new Error("Некорректный ответ: отсутствует классификация")
  }
  if (
    typeof card.classification.section !== "string" ||
    typeof card.classification.title !== "string" ||
    typeof card.classification.class !== "string"
  ) {
    throw new Error("Некорректный ответ: неверный формат классификации")
  }

  // services panel
  if (!Array.isArray(card.services) || card.services.length === 0) {
    throw new Error("Некорректный ответ: список служб не может быть пустым")
  }
  for (const s of card.services) {
    if (!s || typeof s !== "object" || Array.isArray(s)) {
      throw new Error("Некорректный ответ: неверный формат службы")
    }
    if (typeof s.name !== "string" || !s.name.trim()) {
      throw new Error("Некорректный ответ: имя службы обязательно")
    }
    if (s.status !== undefined && typeof s.status !== "string") {
      throw new Error("Некорректный ответ: неверный статус службы")
    }
    if (s.history !== undefined && !Array.isArray(s.history)) {
      throw new Error("Некорректный ответ: история службы должна быть массивом")
    }
  }

  // actions validation
  let actionsList: DDSActionRecord[] = []
  if (obj.actions === undefined || obj.actions === null) {
    actionsList = []
  } else if (Array.isArray(obj.actions)) {
    for (const act of obj.actions) {
      if (!act || typeof act !== "object" || Array.isArray(act)) {
        throw new Error("Некорректный ответ: неверный формат действия")
      }
      if (typeof act.request_id !== "string" || !act.request_id.trim()) {
        throw new Error("Некорректный ответ: отсутствует request_id действия")
      }
      if (act.kind !== "status" && act.kind !== "dispatch") {
        throw new Error("Некорректный ответ: неверный kind действия")
      }
      if (typeof act.service_name !== "string" || !act.service_name.trim()) {
        throw new Error("Некорректный ответ: отсутствует service_name действия")
      }
      actionsList.push({
        request_id: act.request_id,
        kind: act.kind,
        service_name: act.service_name,
        status: typeof act.status === "string" ? act.status : null,
        comment: typeof act.comment === "string" ? act.comment : null,
        order_number: typeof act.order_number === "string" ? act.order_number : null,
        who_accepted: typeof act.who_accepted === "string" ? act.who_accepted : null,
        summary: typeof act.summary === "string" ? act.summary : null,
        actor_id: typeof act.actor_id === "string" ? act.actor_id : null,
        actor_name: typeof act.actor_name === "string" ? act.actor_name : null,
        card_id: typeof act.card_id === "string" ? act.card_id : null,
        at: typeof act.at === "string" ? act.at : null,
      })
    }
  } else {
    throw new Error("Некорректный ответ: actions должен быть массивом")
  }

  let allowedServiceStatuses: Record<string, string[]> | undefined
  if (obj.allowed_service_statuses !== undefined) {
    const options = obj.allowed_service_statuses
    if (!options || typeof options !== "object" || Array.isArray(options) ||
        Object.values(options).some(value => !Array.isArray(value) ||
          value.some(status => typeof status !== "string" || !ALLOWED_DDS_STATUSES.includes(status as AllowedDDSStatus)))) {
      throw new Error("Некорректный ответ: неверные разрешённые статусы служб")
    }
    allowedServiceStatuses = Object.fromEntries(Object.entries(options).map(([name, values]) => [name, [...values as string[]]]))
  }

  for (const field of ["current_index", "total_cards", "completed_cards"] as const) {
    if (obj[field] !== undefined && (!Number.isSafeInteger(obj[field]) || obj[field] < (field === "total_cards" ? 1 : 0))) {
      throw new Error("Некорректный ответ: неверный прогресс занятия")
    }
  }
  if (obj.cards !== undefined && (!Array.isArray(obj.cards) || obj.cards.some((item: any) =>
    !item || typeof item.card_id !== "string" || typeof item.ticket_id !== "string" || typeof item.status !== "string"))) {
    throw new Error("Некорректный ответ: неверная история карточек")
  }
  if (obj.completion_blockers !== undefined && (!Array.isArray(obj.completion_blockers) || obj.completion_blockers.some((item: any) =>
    !item || typeof item.code !== "string" || typeof item.service_name !== "string"))) {
    throw new Error("Некорректный ответ: неверные условия закрытия")
  }
  return {
    session_id: obj.session_id,
    lesson_id: obj.lesson_id,
    ticket_id: obj.ticket_id,
    card_id: obj.card_id,
    session_status: obj.session_status,
    lesson_status: obj.lesson_status,
    started_at: typeof obj.started_at === "string" && Number.isFinite(Date.parse(obj.started_at)) ? obj.started_at : null,
    incoming_card: card as DispatcherData,
    actions: actionsList,
    allowed_service_statuses: allowedServiceStatuses,
    submitted_at: submittedAt,
    score: scoreVal,
    received_at: typeof obj.received_at === "string" && Number.isFinite(Date.parse(obj.received_at)) ? obj.received_at : null,
    card_submitted_at: typeof obj.card_submitted_at === "string" ? obj.card_submitted_at : null,
    current_index: obj.current_index ?? 0, total_cards: obj.total_cards ?? 1,
    completed_cards: obj.completed_cards ?? (submittedAt ? 1 : 0),
    can_complete: obj.can_complete === true, readonly: obj.readonly === true,
    completion_blockers: obj.completion_blockers ?? [], cards: obj.cards ?? [],
    stop_reason: typeof obj.stop_reason === "string" ? obj.stop_reason : null,
  }
}

export function validateDDSAssignmentsList(raw: unknown): DDSSessionState[] {
  if (!Array.isArray(raw)) {
    throw new Error("Некорректный ответ сервера: ожидается список назначений")
  }
  return raw.map((item) => validateDDSSessionState(item))
}

export function validateDDSTicketSummaryList(raw: unknown): DDSTicketSummary[] {
  if (!Array.isArray(raw)) {
    throw new Error("Некорректный ответ сервера: ожидается список билетов")
  }
  return raw.map((item: any) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.ticket_id !== "string" ||
      !item.ticket_id.trim() ||
      typeof item.title !== "string" ||
      !item.title.trim()
    ) {
      throw new Error("Некорректный формат билета в каталоге")
    }
    return {
      ticket_id: item.ticket_id,
      title: item.title,
      category: typeof item.category === "string" ? item.category : undefined,
      subcategory: typeof item.subcategory === "string" ? item.subcategory : undefined,
      complexity: typeof item.complexity === "number" ? item.complexity : undefined,
    }
  })
}

export async function fetchDDSSessionState(
  sessionId: string,
  ticketId?: string,
  signal?: AbortSignal
): Promise<DDSSessionState> {
  const token = getStoredToken()
  if (!token) {
    throw new Error("Требуется авторизация для доступа к занятию. Пожалуйста, выполните вход.")
  }

  let res: Response
  try {
    res = await fetch(`/api/dds/sessions/${encodeURIComponent(sessionId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal,
    })
  } catch (err: any) {
    if (signal?.aborted) throw err
    throw new Error("Ошибка сети при загрузке данных занятия")
  }

  if (!res.ok) {
    throw new Error(getSafeHttpErrorMessage(res.status))
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new Error("Некорректный формат ответа сервера")
  }

  const state = validateDDSSessionState(data, sessionId)
  if (ticketId && state.ticket_id !== ticketId && !state.cards?.some(card => card.ticket_id === ticketId)) {
    throw new Error("Несоответствие идентификатора билета")
  }
  return state
}

export async function fetchDDSAssignments(signal?: AbortSignal, includeHistory = false): Promise<DDSSessionState[]> {
  const token = getStoredToken()
  if (!token) {
    throw new Error("Требуется авторизация для доступа к назначениям. Пожалуйста, выполните вход.")
  }

  let res: Response
  try {
    res = await fetch(includeHistory ? "/api/dds/assignments?include_history=true" : "/api/dds/assignments", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal,
    })
  } catch (err: any) {
    if (signal?.aborted) throw err
    throw new Error("Ошибка сети при загрузке назначений")
  }

  if (!res.ok) {
    throw new Error(getSafeHttpErrorMessage(res.status))
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new Error("Некорректный формат ответа сервера")
  }

  return validateDDSAssignmentsList(data)
}

export async function postDDSAction(
  sessionId: string,
  payload: DDSActionPayload,
  signal?: AbortSignal
): Promise<DDSSessionState> {
  const token = getStoredToken()
  if (!token) {
    throw new Error("Требуется авторизация для отправки действий. Пожалуйста, выполните вход.")
  }

  let res: Response
  try {
    res = await fetch(`/api/dds/sessions/${encodeURIComponent(sessionId)}/actions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal,
    })
  } catch (err: any) {
    if (signal?.aborted) throw err
    throw new Error("Ошибка сети при сохранении действия")
  }

  if (!res.ok) throw await ddsResponseError(res)

  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new Error("Некорректный формат ответа сервера")
  }

  return validateDDSSessionState(data, sessionId)
}

export async function finishDDSSession(
  sessionId: string,
  payload: DDSFinishPayload = {},
  signal?: AbortSignal
): Promise<DDSSessionState> {
  const token = getStoredToken()
  if (!token) {
    throw new Error("Требуется авторизация для завершения занятия. Пожалуйста, выполните вход.")
  }

  let res: Response
  try {
    res = await fetch(`/api/dds/sessions/${encodeURIComponent(sessionId)}/finish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal,
    })
  } catch (err: any) {
    if (signal?.aborted) throw err
    throw new Error("Ошибка сети при завершении занятия")
  }

  if (!res.ok) throw await ddsResponseError(res)

  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new Error("Некорректный формат ответа сервера")
  }

  return validateDDSSessionState(data, sessionId)
}

export interface FetchDDSTicketsFilters {
  category?: string
  subcategory?: string
  complexity?: number | null
}

export async function fetchPreparedDDSTickets(
  filtersOrSignal?: FetchDDSTicketsFilters | AbortSignal,
  optionalSignal?: AbortSignal
): Promise<DDSTicketSummary[]> {
  const token = getStoredToken()
  if (!token) {
    throw new Error("Требуется авторизация для просмотра билетов. Пожалуйста, выполните вход.")
  }

  let filters: FetchDDSTicketsFilters | undefined
  let signal: AbortSignal | undefined

  if (filtersOrSignal instanceof AbortSignal || (filtersOrSignal && "aborted" in filtersOrSignal)) {
    signal = filtersOrSignal as AbortSignal
  } else {
    filters = filtersOrSignal as FetchDDSTicketsFilters | undefined
    signal = optionalSignal
  }

  const params = new URLSearchParams()
  if (filters?.category) params.append("category", filters.category)
  if (filters?.subcategory) params.append("subcategory", filters.subcategory)
  if (filters?.complexity !== undefined && filters?.complexity !== null) {
    params.append("complexity", String(filters.complexity))
  }
  const qs = params.toString()
  const url = qs ? `/api/dds/tickets?${qs}` : "/api/dds/tickets"

  let res: Response
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal,
    })
  } catch (err: any) {
    if (signal?.aborted) throw err
    throw new Error("Ошибка сети при загрузке билетов")
  }

  if (!res.ok) {
    throw new Error(getSafeHttpErrorMessage(res.status))
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new Error("Некорректный формат ответа сервера")
  }

  return validateDDSTicketSummaryList(data)
}


export class DDSRequestError extends Error {
  constructor(message: string, public status: number) { super(message) }
  get retryable() { return this.status >= 500 }
}

export function ddsBlockerMessage(blocker: {code: string; service_name: string}): string {
  const messages: Record<string, string> = {
    DDS_DISPATCH_REQUIRED: "Сохраните направление: «Кто принял» и «Суть»",
    DDS_REFUSAL_REASON_REQUIRED: "Укажите причину отказа",
    DDS_SERVICE_NOT_FINISHED: "Завершите отработку службы или укажите мотивированный отказ",
    DDS_NO_SERVICES: "В карточке отсутствуют службы",
  }
  return `${blocker.service_name ? blocker.service_name + ": " : ""}${messages[blocker.code] || "Карточка ещё не готова к закрытию"}`
}

async function ddsResponseError(res: Response): Promise<DDSRequestError> {
  const messages: Record<string, string> = {
    DDS_SERVICE_TRANSITION_FORBIDDEN: "Этот переход статуса службы недоступен. Обновите данные",
    DDS_SERVICE_NOT_DISPATCHABLE: "Направление доступно только для принятой службы до завершения работ",
    DDS_REFUSAL_REASON_REQUIRED: "Укажите причину отказа",
    DDS_STATUS_COMMENT_REQUIRED: "Для повторного статуса укажите комментарий",
    DDS_DISPATCH_STATUS_FORBIDDEN: "Изменяйте статус через карандаш службы",
    DDS_DISPATCH_REQUIRED: "Сначала сохраните реквизиты направления: «Кто принял» и «Суть»",
    DDS_CARD_NOT_CURRENT: "Текущая карточка изменилась. Обновите данные",
    DDS_CARD_ID_REQUIRED: "Обновите рабочее место для работы с набором карточек",
    DDS_CARD_NOT_READY: "Завершите работу всех служб и сохраните реквизиты",
    DDS_SESSION_NOT_ACTIVE: "Занятие уже остановлено. Обновите данные",
    DDS_TICKET_UNAVAILABLE: "Один из выбранных билетов недоступен. Обновите каталог",
    DDS_REQUEST_CONFLICT: "Этот запрос уже использован для другого действия. Обновите данные",
    DDS_EXAM_TIME_EXPIRED: "Время выполнения экзамена истекло",
    DDS_ORDER_NUMBER_REQUIRED: "Укажите номер наряда",
  }
  let detail: any
  try {
    const json = await res.json()
    detail = json?.detail
  } catch { /* fixed messages only */ }
  const code = typeof detail === "object" && detail !== null ? detail.code : undefined
  const message = (typeof code === "string" && Object.hasOwn(messages, code))
    ? messages[code]
    : (typeof detail === "string" && detail.includes("Время выполнения экзамена истекло"))
      ? "Время выполнения экзамена истекло"
      : (typeof detail?.message === "string" && detail?.code === "DDS_EXAM_TIME_EXPIRED")
        ? detail.message
        : getSafeHttpErrorMessage(res.status)
  return new DDSRequestError(message, res.status)
}

async function ddsRequest(path: string, payload?: unknown, signal?: AbortSignal): Promise<unknown> {
  const token = getStoredToken()
  if (!token) throw new DDSRequestError("Требуется авторизация", 401)
  const response = await fetch(path, {method: payload === undefined ? "GET" : "POST",
    headers: {Authorization: `Bearer ${token}`, ...(payload === undefined ? {} : {"Content-Type": "application/json"})},
    ...(payload === undefined ? {} : {body: JSON.stringify(payload)}), cache: "no-store", signal})
  if (!response.ok) throw await ddsResponseError(response)
  return response.json()
}

export async function completeDDSCard(sessionId: string, cardId: string, payload: {request_id: string}, signal?: AbortSignal) {
  return validateDDSSessionState(await ddsRequest(`/api/dds/sessions/${encodeURIComponent(sessionId)}/cards/${encodeURIComponent(cardId)}/complete`, payload, signal), sessionId)
}

export async function fetchDDSCard(sessionId: string, cardId: string, signal?: AbortSignal) {
  const result = validateDDSSessionState(await ddsRequest(`/api/dds/sessions/${encodeURIComponent(sessionId)}/cards/${encodeURIComponent(cardId)}`, undefined, signal), sessionId)
  if (result.card_id !== cardId) throw new Error("Несоответствие идентификатора карточки")
  return result
}

export async function fetchDDSTrainingTickets(signal?: AbortSignal) {
  return validateDDSTicketSummaryList(await ddsRequest("/api/dds/training/tickets", undefined, signal))
}

export async function startDDSTraining(payload: {request_id: string; ticket_ids: string[]}, signal?: AbortSignal) {
  return validateDDSSessionState(await ddsRequest("/api/dds/training", payload, signal))
}
