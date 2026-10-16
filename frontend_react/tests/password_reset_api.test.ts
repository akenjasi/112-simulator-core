import { beforeEach, describe, expect, it, vi } from "vitest"

import { resetUserPassword } from "@/lib/admin-api"


describe("смена пароля пользователя", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem("access_token", "admin-token")
  })

  it("передаёт собственный пароль без принудительного завершения сессий", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user_id: "user-1",
          username: "student",
          new_password: "chosen_password_123",
          password_was_generated: false,
          sessions_revoked: false,
          message: "ok",
        }),
        { status: 200 }
      )
    )

    await resetUserPassword("user-1", { password: "chosen_password_123" })

    expect(global.fetch).toHaveBeenCalledWith("/api/admin/users/user-1/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-token",
      },
      body: JSON.stringify({
        password: "chosen_password_123",
        revoke_sessions: false,
      }),
    })
  })

  it("оставляет возможность запросить сгенерированный пароль и отзыв сессий", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user_id: "user-1",
          username: "student",
          new_password: "Generated123",
          password_was_generated: true,
          sessions_revoked: true,
          message: "ok",
        }),
        { status: 200 }
      )
    )

    await resetUserPassword("user-1", { revokeSessions: true })

    expect(global.fetch).toHaveBeenCalledWith("/api/admin/users/user-1/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-token",
      },
      body: JSON.stringify({ password: null, revoke_sessions: true }),
    })
  })
})
