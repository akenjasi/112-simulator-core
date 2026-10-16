import { describe, expect, it, vi } from "vitest"

const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }))

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}))

import LandingPage from "@/app/page"

describe("точка входа", () => {
  it("перенаправляет корневой маршрут на страницу авторизации", () => {
    LandingPage()

    expect(redirectMock).toHaveBeenCalledWith("/login")
  })
})
