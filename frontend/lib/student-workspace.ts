import {getStoredToken} from "@/lib/auth-session"

export interface CurrentActivity {
  session_id: string
  lesson_id: string
  ticket_id: string | null
  kind: "teacher" | "self_training"
  teacher_name: string | null
  group_name: string | null
  started_at: string | null
  session_status: string
  completed_cards: number
  total_cards: number
  has_activity: boolean
}
export interface StudentWorkspace { activities: CurrentActivity[]; can_start_training: boolean }

export async function fetchStudentWorkspace(signal?: AbortSignal): Promise<StudentWorkspace> {
  const token = getStoredToken()
  if (!token) throw new Error("Для просмотра занятий необходимо войти в систему.")
  const response = await fetch("/api/dds/student-workspace", {
    headers: {Authorization: `Bearer ${token}`}, cache: "no-store", signal,
  })
  if (!response.ok) throw new Error(response.status === 401 ? "Сессия истекла. Войдите в систему повторно." : "Не удалось проверить текущее занятие. Повторите загрузку.")
  const data = await response.json()
  if (!data || !Array.isArray(data.activities) || typeof data.can_start_training !== "boolean" ||
      data.activities.some((item: any) =>
        !item || typeof item.session_id !== "string" || !item.session_id || typeof item.lesson_id !== "string" ||
        !["teacher", "self_training"].includes(item.kind) || typeof item.session_status !== "string" ||
        typeof item.has_activity !== "boolean" || !Number.isInteger(item.total_cards) || item.total_cards < 1 ||
        !Number.isInteger(item.completed_cards) || item.completed_cards < 0 || item.completed_cards > item.total_cards ||
        ![item.teacher_name, item.group_name, item.ticket_id, item.started_at].every(value => value === null || typeof value === "string"))) {
    throw new Error("Не удалось прочитать состояние занятия. Повторите загрузку.")
  }
  return data
}

export function activityUrl(activity: CurrentActivity): string {
  return `/dds?${new URLSearchParams({session_id: activity.session_id, ...(activity.ticket_id ? {ticket_id: activity.ticket_id} : {})})}`
}
