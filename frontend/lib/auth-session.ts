const SESSION_KEYS = [
  "token",
  "access_token",
  "jwt_token",
  "user",
  "user_role",
  "role",
  "username",
  "user_id",
] as const

const TOKEN_KEYS = ["token", "access_token", "jwt_token"] as const

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null
  for (const key of TOKEN_KEYS) {
    const value = window.localStorage.getItem(key)
    if (value) return value
  }
  return null
}

export function clearStoredSession(): void {
  if (typeof window !== "undefined") {
    for (const key of SESSION_KEYS) {
      window.localStorage.removeItem(key)
      window.sessionStorage.removeItem(key)
    }
  }

  if (typeof document !== "undefined") {
    for (const key of TOKEN_KEYS) {
      document.cookie = `${key}=; path=/; max-age=0; SameSite=Lax`
    }
  }
}
