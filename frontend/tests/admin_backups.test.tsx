import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AdminSystemPage from "@/app/admin/system/page"
import AdminDashboardPage from "@/app/admin/page"

// Mocks
vi.mock("@/components/auth/RequireAuth", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@/components/auth/LogoutButton", () => ({ LogoutButton: () => null }))
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/system",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// Mock recharts for dashboard
vi.mock("recharts", async () => {
  const original = await vi.importActual("recharts")
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => (
      <div data-testid="responsive-container" style={{ width: 500, height: 300 }}>
        {children}
      </div>
    ),
  }
})

const fetchMock = vi.fn<typeof fetch>()

const mockBackups = [
  {
    filename: "database_20261017_120000_123456_a1b2c3.sql",
    created_at: "2026-10-17T12:00:00Z",
    size_bytes: 2048576, // ~2.0 MB
  },
  {
    filename: "112_simulator_20261016_100000_654321_d4e5f6.db",
    created_at: "2026-10-16T10:00:00Z",
    size_bytes: 512000, // ~500 KB
  },
]

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

beforeEach(() => {
  localStorage.setItem("token", "admin-test-token")
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input)

    if (url.includes("/api/admin/healthcheck")) {
      return jsonResponse({ cpu_percent: 15.0, ram_percent: 45.0, db_status: "ok" })
    }

    if (url.includes("/api/admin/users")) {
      return jsonResponse([])
    }

    if (url.includes("/api/admin/backups/") && url.includes("/download")) {
      return new Response("-- test backup sql dump content --", {
        status: 200,
        headers: {
          "Content-Disposition": 'attachment; filename="database_20261017_120000_123456_a1b2c3.sql"',
          "Content-Type": "application/octet-stream",
        },
      })
    }

    if (url.includes("/api/admin/backups")) {
      return jsonResponse({ backups: mockBackups })
    }

    if (url.includes("/api/admin/backup")) {
      return jsonResponse({
        backup_file: "/app/data/backups/database_20261017_140000_999999_x1y2z3.sql",
        filename: "database_20261017_140000_999999_x1y2z3.sql",
        status: "ok",
        size_bytes: 3145728,
        created_at: "2026-10-17T14:00:00Z",
      })
    }

    return jsonResponse({}, 200)
  })

  vi.stubGlobal("fetch", fetchMock)

  // Mock window.URL methods
  window.URL.createObjectURL = vi.fn(() => "blob:http://localhost/fake-uuid")
  window.URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe("Admin System & Backups Management", () => {
  it("renders backups list from server upon mount with name, formatted date, size, and download button", async () => {
    render(<AdminSystemPage />)

    // Verify header and DB scope disclaimer
    expect(screen.getByText(/Система и резервное копирование/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Резервная копия содержит только структуры и данные таблиц базы данных/i)
    ).toBeInTheDocument()

    // Wait for list to load
    await waitFor(() => {
      expect(
        screen.getByText("database_20261017_120000_123456_a1b2c3.sql")
      ).toBeInTheDocument()
      expect(
        screen.getByText("112_simulator_20261016_100000_654321_d4e5f6.db")
      ).toBeInTheDocument()
    })

    // Size formatting check
    expect(screen.getByText(/2 МБ/i)).toBeInTheDocument()
    expect(screen.getByText(/500 КБ/i)).toBeInTheDocument()

    // Download buttons
    const downloadBtns = screen.getAllByRole("button", { name: /Скачать/i })
    expect(downloadBtns.length).toBe(2)
  })

  it("handles empty backups list with clear empty state message", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/admin/backups")) {
        return jsonResponse({ backups: [] })
      }
      if (url.includes("/api/admin/healthcheck")) {
        return jsonResponse({ cpu_percent: 10, ram_percent: 30, db_status: "ok" })
      }
      return jsonResponse({})
    })

    render(<AdminSystemPage />)

    await waitFor(() => {
      expect(
        screen.getByText(/Резервные копии базы данных ещё не создавались/i)
      ).toBeInTheDocument()
    })
  })

  it("handles list fetch failure with error banner and retry button", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/admin/backups")) {
        return jsonResponse({ detail: "Сетевой сбой при получении каталога" }, 500)
      }
      return jsonResponse({ cpu_percent: 10, ram_percent: 30, db_status: "ok" })
    })

    render(<AdminSystemPage />)

    await waitFor(() => {
      expect(screen.getByText(/Сетевой сбой при получении каталога/i)).toBeInTheDocument()
    })

    // Click retry
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/admin/backups")) {
        return jsonResponse({ backups: mockBackups })
      }
      return jsonResponse({ cpu_percent: 10, ram_percent: 30, db_status: "ok" })
    })

    const retryBtn = screen.getByRole("button", { name: /Повторить/i })
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(
        screen.getByText("database_20261017_120000_123456_a1b2c3.sql")
      ).toBeInTheDocument()
    })
  })

  it("successful backup creation triggers list reload and shows success banner with filename", async () => {
    render(<AdminSystemPage />)

    await waitFor(() => {
      expect(screen.getByText("database_20261017_120000_123456_a1b2c3.sql")).toBeInTheDocument()
    })

    const newBackup = {
      filename: "database_20261017_140000_999999_x1y2z3.sql",
      created_at: "2026-10-17T14:00:00Z",
      size_bytes: 3145728,
    }

    // When backup triggers, update list return
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/admin/backup") && !url.includes("/backups")) {
        return jsonResponse({
          backup_file: `/app/data/backups/${newBackup.filename}`,
          filename: newBackup.filename,
          status: "ok",
          size_bytes: newBackup.size_bytes,
          created_at: newBackup.created_at,
        })
      }
      if (url.includes("/api/admin/backups")) {
        return jsonResponse({ backups: [newBackup, ...mockBackups] })
      }
      return jsonResponse({ cpu_percent: 10, ram_percent: 30, db_status: "ok" })
    })

    const createBtn = screen.getByRole("button", { name: /Создать Backup базы данных/i })
    fireEvent.click(createBtn)

    await waitFor(() => {
      expect(
        screen.getByText(/Дамп базы данных успешно сформирован: database_20261017_140000_999999_x1y2z3.sql/i)
      ).toBeInTheDocument()
      expect(
        screen.getAllByText("database_20261017_140000_999999_x1y2z3.sql").length
      ).toBeGreaterThanOrEqual(1)
    })
  })

  it("failed backup creation displays safe API error detail and enables retry without adding fake item", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/admin/backup") && !url.includes("/backups")) {
        return jsonResponse(
          { detail: "Служба резервного копирования недоступна: pg_dump executable not found on server" },
          503
        )
      }
      if (url.includes("/api/admin/backups")) {
        return jsonResponse({ backups: mockBackups })
      }
      return jsonResponse({ cpu_percent: 10, ram_percent: 30, db_status: "ok" })
    })

    render(<AdminSystemPage />)

    await waitFor(() => {
      expect(screen.getByText("database_20261017_120000_123456_a1b2c3.sql")).toBeInTheDocument()
    })

    const createBtn = screen.getByRole("button", { name: /Создать Backup базы данных/i })
    fireEvent.click(createBtn)

    await waitFor(() => {
      expect(
        screen.getByText(/pg_dump executable not found on server/i)
      ).toBeInTheDocument()
    })

    // Button re-enabled
    expect(createBtn).not.toBeDisabled()

    // No fake item added to list
    expect(screen.getAllByRole("button", { name: /Скачать/i }).length).toBe(2)
  })

  it("displays separate list update error when backup succeeds but list refresh fails", async () => {
    let callCount = 0
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/admin/backup") && !url.includes("/backups")) {
        return jsonResponse({
          backup_file: "/app/data/backups/new_backup.sql",
          filename: "new_backup.sql",
          status: "ok",
        })
      }
      if (url.includes("/api/admin/backups")) {
        callCount++
        if (callCount > 1) {
          return jsonResponse({ detail: "Gateway timeout reading backups directory" }, 504)
        }
        return jsonResponse({ backups: mockBackups })
      }
      return jsonResponse({ cpu_percent: 10, ram_percent: 30, db_status: "ok" })
    })

    render(<AdminSystemPage />)

    await waitFor(() => {
      expect(screen.getByText("database_20261017_120000_123456_a1b2c3.sql")).toBeInTheDocument()
    })

    const createBtn = screen.getByRole("button", { name: /Создать Backup базы данных/i })
    fireEvent.click(createBtn)

    await waitFor(() => {
      // Both success of backup and warning about list update failure are communicated
      expect(screen.getByText(/Дамп базы данных успешно сформирован: new_backup.sql/i)).toBeInTheDocument()
      expect(screen.getByText(/Резервная копия создана, но не удалось обновить список копий/i)).toBeInTheDocument()
    })
  })

  it("download button passes auth headers, creates and clicks blob link, and revokes object URL", async () => {
    render(<AdminSystemPage />)

    await waitFor(() => {
      expect(screen.getByText("database_20261017_120000_123456_a1b2c3.sql")).toBeInTheDocument()
    })

    const downloadBtns = screen.getAllByRole("button", { name: /Скачать/i })
    fireEvent.click(downloadBtns[0])

    await waitFor(() => {
      // Verify download fetch call
      const dlCall = fetchMock.mock.calls.find(([u]) =>
        String(u).includes("/database_20261017_120000_123456_a1b2c3.sql/download")
      )
      expect(dlCall).toBeTruthy()
      const headers = dlCall![1]?.headers as Record<string, string>
      expect(headers["Authorization"]).toBe("Bearer admin-test-token")

      // Verify blob URL lifecycle
      expect(window.URL.createObjectURL).toHaveBeenCalled()
      expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/fake-uuid")
    })
  })

  it("download HTTP error displays error banner and does not download error response", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/download")) {
        return jsonResponse({ detail: "Файл резервной копии поврежден или заблокирован" }, 404)
      }
      if (url.includes("/api/admin/backups")) {
        return jsonResponse({ backups: mockBackups })
      }
      return jsonResponse({ cpu_percent: 10, ram_percent: 30, db_status: "ok" })
    })

    render(<AdminSystemPage />)

    await waitFor(() => {
      expect(screen.getByText("database_20261017_120000_123456_a1b2c3.sql")).toBeInTheDocument()
    })

    const downloadBtns = screen.getAllByRole("button", { name: /Скачать/i })
    fireEvent.click(downloadBtns[0])

    await waitFor(() => {
      expect(
        screen.getByText(/Файл резервной копии поврежден или заблокирован/i)
      ).toBeInTheDocument()
      // Should not have created object URL for failed response
      expect(window.URL.createObjectURL).not.toHaveBeenCalled()
    })
  })

  it("dashboard backup button displays API detail on error and re-enables button", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes("/api/admin/users")) {
        return jsonResponse([])
      }
      if (url.includes("/api/admin/backup")) {
        return jsonResponse(
          { detail: "Превышено время ожидания создания резервной копии базы данных" },
          504
        )
      }
      return jsonResponse({ cpu_percent: 15, ram_percent: 35, db_status: "ok" })
    })

    render(<AdminDashboardPage />)

    const backupBtn = screen.getByRole("button", { name: /Создать бэкап/i })
    fireEvent.click(backupBtn)

    await waitFor(() => {
      expect(
        screen.getByText(/Превышено время ожидания создания резервной копии базы данных/i)
      ).toBeInTheDocument()
    })

    expect(backupBtn).not.toBeDisabled()
  })
})
