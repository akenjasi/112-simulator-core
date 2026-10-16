import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}))

import { LogoutButton } from "@/components/auth/LogoutButton"

describe("выход из кабинета", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    document.cookie = "access_token=; Max-Age=0; path=/"
  })

  it("отзывает серверную сессию, очищает браузер и открывает login", async () => {
    localStorage.setItem("access_token", "current-token")
    localStorage.setItem("user", JSON.stringify({ role: "ADMIN" }))
    sessionStorage.setItem("access_token", "shadow-token")
    document.cookie = "access_token=current-token; path=/"
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))

    render(<LogoutButton />)
    fireEvent.click(screen.getByRole("button", { name: /выйти/i }))

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"))
    expect(global.fetch).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: "Bearer current-token" },
    })
    expect(localStorage.getItem("access_token")).toBeNull()
    expect(localStorage.getItem("user")).toBeNull()
    expect(sessionStorage.getItem("access_token")).toBeNull()
    expect(document.cookie).not.toContain("access_token=")
  })

  it("локально завершает вход даже если сервер недоступен", async () => {
    localStorage.setItem("access_token", "current-token")
    global.fetch = vi.fn().mockRejectedValue(new Error("offline"))

    render(<LogoutButton />)
    fireEvent.click(screen.getByRole("button", { name: /выйти/i }))

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"))
    expect(localStorage.getItem("access_token")).toBeNull()
  })
})
