import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import AdminUsersPage from "@/app/admin/users/page"

const data = { username: "new-cadet", password: "Valid-password-123", role: "CADET" }
const validationError = {
  detail: [{
    type: "string_too_short", loc: ["body", "password"],
    msg: "String should have at least 10 characters",
    input: "secret", ctx: { min_length: 10 },
  }],
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem("access_token", "admin-token")
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("форма создания пользователя", () => {
  function mockApi(response: Response) {
    const fetch = vi.fn().mockImplementation((_url, init) => Promise.resolve(
      init?.method === "POST" ? response : new Response("[]", { status: 200 })
    ))
    vi.stubGlobal("fetch", fetch)
    return fetch
  }

  async function openForm() {
    render(<AdminUsersPage />)
    fireEvent.click(screen.getByRole("button", { name: "Добавить пользователя" }))
    fireEvent.change(screen.getByPlaceholderText("ivanov@system112.ru"), { target: { value: data.username } })
    const password = screen.getByPlaceholderText("Введите пароль...")
    expect(password).toHaveAttribute("minlength", "8")
    expect(screen.getByText(/Не менее 8 символов/)).toBeInTheDocument()
    fireEvent.change(password, { target: { value: data.password } })
    return password.closest("form")!
  }

  it.each([
    [{ detail: "Password must be at least 12 characters" }, "Пароль: не менее 12 символов"],
    [{ detail: { message: "Логин уже занят" } }, "Логин уже занят"],
    [{ detail: [{ loc: ["body", "username"], type: "missing", msg: "Field required" }] }, "Логин: заполните обязательное поле"],
    [{ detail: [{ loc: ["body", "password"], type: "value_error", msg: "Value error, Password must fit within 72 UTF-8 bytes" }] }, "Пароль слишком длинный: максимум 72 байта UTF-8"],
  ])("показывает понятный текст для ответа API: %j", async (body, expected) => {
    mockApi(new Response(JSON.stringify(body), { status: 422 }))
    fireEvent.submit(await openForm())
    expect(await screen.findByText(expected)).toBeInTheDocument()
  })

  it("показывает понятный текст при HTML-ошибке прокси", async () => {
    mockApi(new Response("<html>Bad Gateway</html>", { status: 502 }))
    fireEvent.submit(await openForm())
    expect(await screen.findByText("Ошибка создания пользователя: 502")).toBeInTheDocument()
  })

  it("показывает причину отказа вместо объекта и оставляет форму открытой", async () => {
    mockApi(new Response(JSON.stringify(validationError), { status: 422 }))
    fireEvent.submit(await openForm())
    expect(await screen.findByText("Пароль: не менее 10 символов")).toBeInTheDocument()
    expect(screen.getByText("Новый пользователь")).toBeInTheDocument()
    expect(screen.queryByText(/\[object Object\]|secret/)).not.toBeInTheDocument()
  })

  it("отправляет введённые данные и показывает созданного пользователя", async () => {
    const fetch = mockApi(new Response(JSON.stringify({ ...data, user_id: "new-id", is_active: true }), { status: 200 }))
    fireEvent.submit(await openForm())
    expect(await screen.findByText(`Пользователь ${data.username} успешно создан`)).toBeInTheDocument()
    expect(screen.getByText(data.username)).toBeInTheDocument()
    expect(screen.queryByText("Новый пользователь")).not.toBeInTheDocument()
    const call = fetch.mock.calls.find(([, init]) => init?.method === "POST")!
    expect(call[0]).toBe("/api/admin/users")
    expect(JSON.parse(call[1].body)).toEqual({ ...data, full_name: "" })
    expect(call[1].headers.Authorization).toBe("Bearer admin-token")
  })
})
