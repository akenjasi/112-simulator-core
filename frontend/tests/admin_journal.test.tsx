import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AdminLayout from "@/app/admin/layout"
import AdminLogsPage from "@/app/admin/logs/page"

// Mocks
vi.mock("@/components/auth/RequireAuth", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@/components/auth/LogoutButton", () => ({ LogoutButton: () => null }))
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/logs",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const fetchMock = vi.fn<typeof fetch>()

const mockAuditLogs = [
  {
    log_id: "log-1",
    user_id: "u-123",
    username: "operator_ivan",
    role: "ADMIN",
    action: "POST /api/admin/users",
    action_type: "POST /api/admin/users",
    endpoint: "/api/admin/users",
    target_entity: "users",
    target_id: "u-456",
    ip_address: "192.168.1.10",
    details: '{"created_user": "u-456", "note": "<script>alert(1)</script>"}',
    timestamp: "2026-10-17T12:00:00Z",
  },
  {
    log_id: "log-2",
    user_id: null,
    username: null,
    role: null,
    action: "SECURITY_POLICY_UPDATE",
    action_type: "SECURITY_POLICY_UPDATE",
    endpoint: null,
    target_entity: null,
    target_id: null,
    ip_address: null,
    details: "Plain text note without json",
    timestamp: "2026-10-17T11:00:00Z",
  },
]

const mockErrorLogs = [
  {
    id: "err-1",
    error_message: "Database connection timeout during healthcheck",
    traceback: "Traceback (most recent call last):\n  File 'main.py', line 45\nConnectionError",
    timestamp: "2026-10-17T12:05:00Z",
  },
]

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

beforeEach(() => {
  localStorage.setItem("token", "test-admin-jwt-token")
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (input) => {
    const url = String(input)
    if (url.includes("/api/admin/audit-logs")) {
      return jsonResponse(mockAuditLogs)
    }
    if (url.includes("/api/admin/error-logs")) {
      return jsonResponse(mockErrorLogs)
    }
    if (url.includes("/api/health")) {
      return jsonResponse({ status: "ok", version: "v2" })
    }
    return jsonResponse([], 200)
  })
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe("Admin Logs Page and Navigation", () => {
  it("includes 'Журналы' navigation link in both desktop and mobile admin menus", async () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    )

    // Desktop link
    const logsLinks = screen.getAllByRole("link", { name: /Журналы/i })
    expect(logsLinks.length).toBeGreaterThanOrEqual(1)
    expect(logsLinks[0]).toHaveAttribute("href", "/admin/logs")

    // Open mobile menu
    const menuToggle = screen.getByTestId("admin-mobile-menu-toggle")
    fireEvent.click(menuToggle)

    const mobileLogsLinks = screen.getAllByRole("link", { name: /Журналы/i })
    expect(mobileLogsLinks.length).toBe(2) // 1 desktop + 1 mobile
  })

  it("renders page, tabs, and loads audit logs by default with explanation disclaimer", async () => {
    render(<AdminLogsPage />)

    // Check heading and disclaimer
    expect(screen.getByRole("heading", { name: /Журналы/i, level: 1 })).toBeInTheDocument()
    expect(
      screen.getByText(/не всегда подтверждает успешное выполнение/i)
    ).toBeInTheDocument()

    // Wait for audit records to load
    await waitFor(() => {
      expect(screen.getByText("operator_ivan")).toBeInTheDocument()
    })

    expect(screen.getByText("POST /api/admin/users")).toBeInTheDocument()
    // Null user fallback check
    expect(screen.getByText("Не указан")).toBeInTheDocument()

    // Auth header check
    const calls = fetchMock.mock.calls
    const auditCall = calls.find((c) => String(c[0]).includes("/api/admin/audit-logs"))
    expect(auditCall).toBeDefined()
    const headers = auditCall?.[1]?.headers as Record<string, string>
    expect(headers?.Authorization || headers?.authorization).toBe("Bearer test-admin-jwt-token")
  })

  it("switches to 'Ошибки' tab and renders error logs without invented user or status", async () => {
    render(<AdminLogsPage />)

    await waitFor(() => {
      expect(screen.getByText("operator_ivan")).toBeInTheDocument()
    })

    // Click Errors tab
    const errorsTab = screen.getByRole("tab", { name: /Ошибки/i })
    fireEvent.click(errorsTab)

    await waitFor(() => {
      expect(
        screen.getByText(/Database connection timeout during healthcheck/i)
      ).toBeInTheDocument()
    })

    // Errors table must NOT have user columns or "Успешно" status column
    expect(screen.queryByText("Пользователь")).not.toBeInTheDocument()
    expect(screen.queryByText("Успешно")).not.toBeInTheDocument()
  })

  it("handles filter application, date validation, and filter reset", async () => {
    render(<AdminLogsPage />)

    await waitFor(() => {
      expect(screen.getByText("operator_ivan")).toBeInTheDocument()
    })

    const userInput = screen.getByLabelText(/Пользователь/i)
    fireEvent.change(userInput, { target: { value: "u-123" } })

    const fromInput = screen.getByLabelText(/^С$/i)
    const toInput = screen.getByLabelText(/^По$/i)

    // Test inverted dates validation before fetch
    fireEvent.change(fromInput, { target: { value: "2026-10-18T10:00" } })
    fireEvent.change(toInput, { target: { value: "2026-10-17T10:00" } })

    const applyBtn = screen.getByRole("button", { name: /Применить/i })
    fireEvent.click(applyBtn)

    // Error message shown before request
    expect(screen.getByText(/Дата «С» не может быть позже «По»/i)).toBeInTheDocument()

    // Fix dates
    fireEvent.change(fromInput, { target: { value: "2026-10-17T10:00" } })
    fireEvent.change(toInput, { target: { value: "2026-10-18T10:00" } })
    fireEvent.click(applyBtn)

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
      const url = String(lastCall[0])
      expect(url).toContain("user_id=u-123")
      expect(url).toContain("from_at=")
      expect(url).toContain("to_at=")
    })

    // Reset filters
    const resetBtn = screen.getByRole("button", { name: /Сбросить/i })
    fireEvent.click(resetBtn)

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
      const url = String(lastCall[0])
      expect(url).not.toContain("user_id=")
    })
  })

  it("preserves user_id filter across tab switching and date filter application on Errors tab", async () => {
    render(<AdminLogsPage />)

    await waitFor(() => {
      expect(screen.getByText("operator_ivan")).toBeInTheDocument()
    })

    // 1. Enter user ID and apply filter on audit tab
    const userInput = screen.getByLabelText(/Пользователь/i)
    fireEvent.change(userInput, { target: { value: "u-123" } })
    const applyBtn = screen.getByRole("button", { name: /Применить/i })
    fireEvent.click(applyBtn)

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
      expect(String(lastCall[0])).toContain("user_id=u-123")
    })

    // 2. Switch to "Ошибки" tab
    const errorsTab = screen.getByRole("tab", { name: /Ошибки/i })
    fireEvent.click(errorsTab)

    await waitFor(() => {
      expect(
        screen.getByText(/Database connection timeout during healthcheck/i)
      ).toBeInTheDocument()
    })

    // 3. Apply period while on "Ошибки" tab
    const fromInput = screen.getByLabelText(/^С$/i)
    const toInput = screen.getByLabelText(/^По$/i)
    fireEvent.change(fromInput, { target: { value: "2026-10-17T10:00" } })
    fireEvent.change(toInput, { target: { value: "2026-10-18T10:00" } })
    fireEvent.click(applyBtn)

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
      const url = String(lastCall[0])
      expect(url).toContain("/api/admin/error-logs")
      expect(url).toContain("from_at=")
    })

    // 4. Switch back to "Действия пользователей" tab
    const auditTab = screen.getByRole("tab", { name: /Действия пользователей/i })
    fireEvent.click(auditTab)

    // User ID field must retain "u-123", AND the request must still filter by user_id=u-123!
    await waitFor(() => {
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
      const url = String(lastCall[0])
      expect(url).toContain("/api/admin/audit-logs")
      expect(url).toContain("user_id=u-123")
      expect(url).toContain("from_at=")
    })
    const restoredUserInput = screen.getByLabelText(/Пользователь/i) as HTMLInputElement
    expect(restoredUserInput.value).toBe("u-123")
  })

  it("opens details modal, formats JSON details, escapes HTML safely, and closes on Escape", async () => {
    render(<AdminLogsPage />)

    await waitFor(() => {
      expect(screen.getByText("operator_ivan")).toBeInTheDocument()
    })

    // Click first "Подробнее" button
    const detailButtons = screen.getAllByRole("button", { name: /Подробнее/i })
    fireEvent.click(detailButtons[0])

    // Modal opens
    const modal = screen.getByRole("dialog")
    expect(modal).toBeInTheDocument()
    expect(screen.getByText(/ID записи:/i)).toBeInTheDocument()
    expect(screen.getByText("log-1")).toBeInTheDocument()
    expect(screen.getByText("192.168.1.10")).toBeInTheDocument()

    // HTML in JSON details must be rendered as raw text, not active HTML
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument()

    // Close on Escape key
    fireEvent.keyDown(window, { key: "Escape" })
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
  })

  it("distinguishes error state from empty state and supports retry", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }))

    render(<AdminLogsPage />)

    // Should show error state, NOT "Записей не найдено"
    await waitFor(() => {
      expect(screen.getByText(/Ошибка загрузки данных/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/Записей не найдено/i)).not.toBeInTheDocument()

    // Click retry button
    fetchMock.mockResolvedValueOnce(jsonResponse([]))
    const retryBtn = screen.getByRole("button", { name: /Повторить/i })
    fireEvent.click(retryBtn)

    // Now empty state
    await waitFor(() => {
      expect(screen.getByText(/Записей не найдено/i)).toBeInTheDocument()
    })
  })

  it("protects against stale delayed response when switching tabs rapidly", async () => {
    let resolveAudit!: (v: Response) => void
    const slowAuditPromise = new Promise<Response>((res) => {
      resolveAudit = res
    })

    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/admin/audit-logs")) {
        return slowAuditPromise
      }
      if (url.includes("/api/admin/error-logs")) {
        return jsonResponse(mockErrorLogs)
      }
      return jsonResponse([])
    })

    render(<AdminLogsPage />)

    // Quickly switch to Errors tab before audit resolves
    const errorsTab = screen.getByRole("tab", { name: /Ошибки/i })
    fireEvent.click(errorsTab)

    // Errors tab loads
    await waitFor(() => {
      expect(
        screen.getByText(/Database connection timeout during healthcheck/i)
      ).toBeInTheDocument()
    })

    // Now slow audit response resolves
    resolveAudit(jsonResponse(mockAuditLogs))

    // Give microtasks time to settle
    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })

    // Must still show Errors tab data, NOT overwritten by audit logs!
    expect(screen.getByRole("tab", { name: /Ошибки/i })).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByText("operator_ivan")).not.toBeInTheDocument()
  })

  it("manages pagination controls and disables 'Далее' on the last page", async () => {
    // Return 20 items (exactly one page, no next page since limit=21 was requested)
    fetchMock.mockResolvedValueOnce(jsonResponse(mockAuditLogs))

    render(<AdminLogsPage />)

    await waitFor(() => {
      expect(screen.getByText("operator_ivan")).toBeInTheDocument()
    })

    const prevBtn = screen.getByRole("button", { name: /Назад/i })
    const nextBtn = screen.getByRole("button", { name: /Далее/i })

    // On page 1: "Назад" disabled
    expect(prevBtn).toBeDisabled()
    // Only 2 items returned (< 21 requested), so "Далее" is also disabled
    expect(nextBtn).toBeDisabled()
  })
})
