import { getStoredToken } from "./auth-session"

/** Attach the signed-in session only to our own API requests. */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const passthrough = () => init === undefined ? fetch(input) : fetch(input, init)
  const rawUrl = input instanceof Request ? input.url : String(input)
  if (typeof window === "undefined") return passthrough()
  const url = new URL(rawUrl, window.location.href)
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) {
    return passthrough()
  }

  const token = getStoredToken()
  if (!token) return passthrough()

  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
  if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}
