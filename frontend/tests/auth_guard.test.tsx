import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}))

import RequireAuth from "@/components/auth/RequireAuth"

describe("RequireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    global.fetch = vi.fn()
  })

  it("не показывает кабинет без JWT и отправляет на страницу входа", async () => {
    render(
      <RequireAuth allowedRoles={["ADMIN"]}>
        <div>Закрытый кабинет</div>
      </RequireAuth>
    )

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"))
    expect(screen.queryByText("Закрытый кабинет")).not.toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("очищает недействительный JWT и возвращает на страницу входа", async () => {
    localStorage.setItem("access_token", "expired-token")
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))

    render(
      <RequireAuth allowedRoles={["ADMIN"]}>
        <div>Закрытый кабинет</div>
      </RequireAuth>
    )

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"))
    expect(localStorage.getItem("access_token")).toBeNull()
    expect(screen.queryByText("Закрытый кабинет")).not.toBeInTheDocument()
  })

  it("отображает кабинет только после проверки JWT и роли", async () => {
    localStorage.setItem("access_token", "valid-token")
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ role: "ADMIN" }), { status: 200 }))
    )

    render(
      <RequireAuth allowedRoles={["ADMIN"]}>
        <div>Закрытый кабинет</div>
      </RequireAuth>
    )

    expect(await screen.findByText("Закрытый кабинет")).toBeInTheDocument()
    expect(replaceMock).not.toHaveBeenCalled()
  })
})
