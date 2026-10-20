import { render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}))

import LandingPage from "@/app/page"

describe("точка входа", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    global.fetch = vi.fn()
  })

  it("без сохранённой сессии отправляет на страницу авторизации", async () => {
    render(<LandingPage />)

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"))
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("с действующим токеном администратора открывает его кабинет", async () => {
    localStorage.setItem("access_token", "valid-admin-token")
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ role: "ADMIN" }), { status: 200 }))
    )

    render(<LandingPage />)

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/admin"))
    expect(global.fetch).toHaveBeenCalledWith("/api/v1/users/me", {
      headers: { Authorization: "Bearer valid-admin-token" },
    })
  })

  it("с истёкшим токеном очищает сессию и отправляет на страницу авторизации", async () => {
    localStorage.setItem("access_token", "expired-token")
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))

    render(<LandingPage />)

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"))
    expect(localStorage.getItem("access_token")).toBeNull()
  })

  it("с действующим токеном преподавателя открывает главную страницу кабинета", async () => {
    localStorage.setItem("access_token", "teacher-token")
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ role: "TEACHER" }), { status: 200 })
    )

    render(<LandingPage />)

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/teacher"))
  })
})
