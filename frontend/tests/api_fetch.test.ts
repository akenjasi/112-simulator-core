import { beforeEach, expect, it, vi } from "vitest"
import { apiFetch } from "../lib/api-fetch"

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem("token", "test-session")
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
})

it("adds the session to same-origin API requests without changing the body", async () => {
  const body = new FormData()
  body.append("file", "document")
  await apiFetch("/api/v1/knowledge/files", { method: "POST", body })
  const options = vi.mocked(fetch).mock.calls[0][1]!
  expect(new Headers(options.headers).get("Authorization")).toBe("Bearer test-session")
  expect(new Headers(options.headers).has("Content-Type")).toBe(false)
  expect(options.body).toBe(body)
})

it("does not attach credentials to another origin or static resources", async () => {
  await apiFetch("https://example.com/api/data")
  await apiFetch("/document.pdf")
  for (const call of vi.mocked(fetch).mock.calls) {
    expect(new Headers(call[1]?.headers).has("Authorization")).toBe(false)
  }
})

it("preserves an explicitly supplied authorization header", async () => {
  await apiFetch("/api/users", { headers: { Authorization: "Bearer explicit" } })
  expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get("Authorization"))
    .toBe("Bearer explicit")
})
