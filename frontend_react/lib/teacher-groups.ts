export interface StudentGroup {
  group_id: string
  group_name: string
  department?: string | null
  cadet_ids: string[]
  created_at?: string
  is_active?: boolean
}

export interface StudentItem {
  user_id: string
  id?: string
  student_id?: string
  username: string
  email?: string
  full_name?: string | null
  role: string
  groups?: string[]
  is_active?: boolean
  created_at?: string
}

export interface BulkLinkResult {
  user_id: string
  status: "success" | "already_in_group" | "error"
  error?: string | null
}

/**
 * Splits full_name string into lastName, firstName, middleName.
 * Handles cases where full_name has 1, 2, 3+ words or is empty/null.
 */
export function splitFullName(fullName?: string | null, username?: string): {
  lastName: string
  firstName: string
  middleName: string
} {
  const nameToSplit = (fullName && fullName.trim()) || (username && username.trim()) || ""
  if (!nameToSplit) {
    return { lastName: "—", firstName: "—", middleName: "—" }
  }
  const parts = nameToSplit.split(/\s+/)
  if (parts.length === 1) {
    return { lastName: parts[0], firstName: "—", middleName: "—" }
  }
  if (parts.length === 2) {
    return { lastName: parts[0], firstName: parts[1], middleName: "—" }
  }
  return {
    lastName: parts[0],
    firstName: parts[1],
    middleName: parts.slice(2).join(" "),
  }
}

/**
 * Localizes user roles from system codes (CADET, TEACHER, ADMIN) to Russian.
 */
export function formatRole(role?: string): string {
  if (!role) return "Ученик"
  const upper = role.toUpperCase()
  if (upper === "CADET" || upper === "STUDENT") return "Ученик"
  if (upper === "TEACHER") return "Преподаватель"
  if (upper === "ADMIN") return "Администратор"
  return role
}

/**
 * Formats ISO date string to DD.MM.YYYY.
 */
export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—"
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return "—"
    return d.toLocaleDateString("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
  } catch {
    return "—"
  }
}
