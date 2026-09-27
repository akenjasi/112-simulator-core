export interface HealthCheckData {
  cpu_percent: number
  ram_percent: number
  db_status: "ok" | "error" | string
}

export interface BackupResult {
  backup_file: string
  status: string
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
    throw new Error(`Ошибка создания бэкапа: ${res.status}`)
  }
  return res.json()
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

export async function resetUserPassword(userId: string): Promise<ResetPasswordResult> {
  const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
    method: "POST",
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(errorBody.detail || `Ошибка сброса пароля: ${res.status}`)
  }
  return res.json()
}
