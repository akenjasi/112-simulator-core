export interface HealthCheckData {
  cpu_percent: number
  ram_percent: number
  db_status: "ok" | "error" | string
}

export interface BackupResult {
  backup_file: string
  status: string
  filename?: string
  size_bytes?: number
  created_at?: string
}

export interface BackupItem {
  filename: string
  created_at: string
  size_bytes: number
}

export interface AdminUser {
  user_id: string
  username: string
  role: "ADMIN" | "TEACHER" | "CADET" | string
  full_name?: string | null
  student_id?: string | null
  is_active: boolean
}

export interface CreateUserData {
  username: string
  password: string
  role: string
  full_name?: string
  student_id?: string
}

export interface UpdateUserData {
  full_name?: string
  role?: string
  password?: string
  student_id?: string
  is_active?: boolean
}

export interface ResetPasswordResult {
  user_id: string
  username: string
  new_password: string
  password_was_generated: boolean
  sessions_revoked: boolean
  message: string
}

export function getAuthHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("token") ||
        localStorage.getItem("access_token") ||
        localStorage.getItem("jwt_token")
      : null

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  return headers
}

export async function fetchHealthcheck(): Promise<HealthCheckData> {
  const res = await fetch("/api/admin/healthcheck", {
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    throw new Error(`Ошибка healthcheck: ${res.status}`)
  }
  return res.json()
}

export async function triggerBackup(): Promise<BackupResult> {
  const res = await fetch("/api/admin/backup", {
    method: "POST",
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(errorBody.detail || `Ошибка создания бэкапа: ${res.status}`)
  }
  return res.json()
}

export async function fetchBackups(signal?: AbortSignal): Promise<{ backups: BackupItem[] }> {
  const res = await fetch("/api/admin/backups", {
    headers: getAuthHeaders(),
    signal,
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(errorBody.detail || `Ошибка загрузки списка бэкапов: ${res.status}`)
  }
  return res.json()
}

export async function downloadBackupFile(filename: string): Promise<void> {
  const res = await fetch(`/api/admin/backups/${encodeURIComponent(filename)}/download`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(errorBody.detail || `Ошибка скачивания файла: ${res.status}`)
  }
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}


export async function fetchUsers(role?: string): Promise<AdminUser[]> {
  const query = role ? `?role=${encodeURIComponent(role)}` : ""
  const res = await fetch(`/api/admin/users${query}`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    throw new Error(`Ошибка загрузки пользователей: ${res.status}`)
  }
  return res.json()
}

export async function createUser(data: CreateUserData): Promise<AdminUser> {
  const res = await fetch("/api/admin/users", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(errorBody.detail || `Ошибка создания пользователя: ${res.status}`)
  }
  return res.json()
}

export async function updateUser(
  userId: string,
  data: UpdateUserData
): Promise<AdminUser> {
  const res = await fetch(`/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(errorBody.detail || `Ошибка обновления пользователя: ${res.status}`)
  }
  return res.json()
}

export async function deleteUser(userId: string): Promise<{ status: string; user_id: string; is_active: boolean }> {
  const res = await fetch(`/api/admin/users/${userId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(errorBody.detail || `Ошибка блокировки пользователя: ${res.status}`)
  }
  return res.json()
}

export async function resetUserPassword(
  userId: string,
  options: { password?: string; revokeSessions?: boolean } = {}
): Promise<ResetPasswordResult> {
  const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      password: options.password ?? null,
      revoke_sessions: options.revokeSessions ?? false,
    }),
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(errorBody.detail || `Ошибка сброса пароля: ${res.status}`)
  }
  return res.json()
}

export interface UserActionLogItem {
  log_id: string
  user_id?: string | null
  username?: string | null
  role?: string | null
  action: string
  action_type?: string | null
  endpoint?: string | null
  target_entity?: string | null
  target_id?: string | null
  ip_address?: string | null
  details?: string | null
  timestamp: string
}

export interface SystemErrorLogItem {
  id: string
  timestamp: string
  error_message: string
  traceback?: string | null
}

export interface FetchLogsFilter {
  from_at?: string
  to_at?: string
  user_id?: string
  limit?: number
  offset?: number
}

export async function fetchAuditLogs(
  filter: FetchLogsFilter = {},
  signal?: AbortSignal
): Promise<UserActionLogItem[]> {
  const params = new URLSearchParams()
  if (filter.limit !== undefined) params.set("limit", String(filter.limit))
  if (filter.offset !== undefined) params.set("offset", String(filter.offset))
  if (filter.from_at) params.set("from_at", filter.from_at)
  if (filter.to_at) params.set("to_at", filter.to_at)
  if (filter.user_id) params.set("user_id", filter.user_id)

  const query = params.toString() ? `?${params.toString()}` : ""
  const res = await fetch(`/api/admin/audit-logs${query}`, {
    headers: getAuthHeaders(),
    signal,
  })
  if (!res.ok) {
    throw new Error(`Ошибка загрузки журнала действий: ${res.status}`)
  }
  return res.json()
}

export async function fetchErrorLogs(
  filter: FetchLogsFilter = {},
  signal?: AbortSignal
): Promise<SystemErrorLogItem[]> {
  const params = new URLSearchParams()
  if (filter.limit !== undefined) params.set("limit", String(filter.limit))
  if (filter.offset !== undefined) params.set("offset", String(filter.offset))
  if (filter.from_at) params.set("from_at", filter.from_at)
  if (filter.to_at) params.set("to_at", filter.to_at)

  const query = params.toString() ? `?${params.toString()}` : ""
  const res = await fetch(`/api/admin/error-logs${query}`, {
    headers: getAuthHeaders(),
    signal,
  })
  if (!res.ok) {
    throw new Error(`Ошибка загрузки журнала ошибок: ${res.status}`)
  }
  return res.json()
}

export interface IntegrityDeviation {
  path: string
  reason: "modified" | "missing" | "unreadable" | "unexpected" | string
  details?: string
}

export interface IntegrityCheckResponse {
  status: "ok" | "deviation" | "unavailable"
  checked_at: string
  manifest_digest?: string | null
  checked_files_count: number
  deviations: IntegrityDeviation[]
  scope_summary?: string
  error?: string | null
}

export async function checkBackendIntegrity(
  signal?: AbortSignal
): Promise<IntegrityCheckResponse> {
  const res = await fetch("/api/admin/integrity/check", {
    method: "POST",
    headers: getAuthHeaders(),
    signal,
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(errorBody.detail || `Ошибка проверки целостности: ${res.status}`)
  }
  return res.json()
}
