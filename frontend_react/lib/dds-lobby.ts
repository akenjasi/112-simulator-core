import {
  validateDDSSessionState,
  getSafeHttpErrorMessage,
  getStoredToken,
  type DDSSessionState,
} from "@/lib/dds-cycle"

export interface LobbySessionState extends DDSSessionState {
  card_pool_source?: string | null
  is_self_training?: boolean
}

export const LOBBY_PAGE_SIZE = 5

export function isTeacherAssignment(item: LobbySessionState | DDSSessionState): boolean {
  const raw = item as LobbySessionState
  if (raw.is_self_training === true) return false
  if (raw.card_pool_source === "self_training") return false
  return true
}

export function isDDSAssignmentCompleted(item: DDSSessionState): boolean {
  return (
    item.session_status === "COMPLETED" ||
    item.lesson_status === "COMPLETED" ||
    Boolean(item.submitted_at)
  )
}

export function sortLobbyAssignments<T extends DDSSessionState>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const timeA = a.started_at ? Date.parse(a.started_at) : 0
    const timeB = b.started_at ? Date.parse(b.started_at) : 0
    if (timeA !== timeB) return timeB - timeA
    return (b.session_id || "").localeCompare(a.session_id || "")
  })
}

export function dedupLobbyAssignments<T extends DDSSessionState>(items: T[]): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of items) {
    if (!seen.has(item.session_id)) {
      seen.add(item.session_id)
      result.push(item)
    }
  }
  return result
}

export async function fetchLobbyAssignments(signal?: AbortSignal): Promise<LobbySessionState[]> {
  const token = getStoredToken()
  if (!token) {
    throw new Error("Требуется авторизация для доступа к назначениям. Пожалуйста, выполните вход.")
  }

  let res: Response
  try {
    res = await fetch("/api/dds/assignments", {
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

  let raw: unknown
  try {
    raw = await res.json()
  } catch {
    throw new Error("Некорректный формат ответа сервера")
  }

  if (!Array.isArray(raw)) {
    throw new Error("Некорректный ответ сервера: ожидается список назначений")
  }

  return raw.map((item: any) => {
    const validated = validateDDSSessionState(item) as LobbySessionState
    if (item && typeof item === "object") {
      validated.card_pool_source = item.card_pool_source ?? null
      validated.is_self_training = Boolean(
        item.is_self_training || item.card_pool_source === "self_training"
      )
    }
    return validated
  })
}
