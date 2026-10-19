import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import StudentProfilePage from "@/app/student/profile/page"

vi.mock("recharts", () => ({
  Radar: () => null, RadarChart: () => null, PolarGrid: () => null,
  PolarAngleAxis: () => null, PolarRadiusAxis: () => null,
  ResponsiveContainer: () => null, Tooltip: () => null,
}))
vi.mock("@/components/theme-select", () => ({ ThemeSelect: () => null }))
vi.mock("@/components/auth/LogoutButton", () => ({ LogoutButton: () => null }))

const document = {
  id: "real-upload-742", name: "Регламент преподавателя 742.pdf",
  size: 742, size_bytes: 742, uploaded_at: "2026-10-18T10:00:00Z",
  content_type: "application/pdf", uploaded_by: "teacher-742",
  url: "/api/v1/knowledge/files/real-upload-742/download",
}
let catalog: typeof document[]
let catalogFails: boolean

async function openMaterials() {
  render(<StudentProfilePage />)
  fireEvent.click(await screen.findByRole("button", { name: /Справочные материалы/i }))
}

describe("Tester FIX-01: cadet reference materials use teacher catalog", () => {
  beforeEach(() => {
    catalog = [document]
    catalogFails = false
    localStorage.setItem("token", "cadet-reference-token")
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/v1/knowledge/files") return {
        ok: !catalogFails, status: catalogFails ? 503 : 200, json: async () => catalog,
      }
      if (url === "/api/v1/users/me") return {
        ok: true, json: async () => ({ user_id: "cadet-742", username: "cadet742", role: "CADET" }),
      }
      return { ok: true, json: async () => url.includes("/stats") ? {} : [] }
    }))
  })
  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("shows a teacher upload from the common authenticated API catalog", async () => {
    await openMaterials()
    expect(await screen.findByText(document.name)).toBeInTheDocument()
    const calls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === "/api/v1/knowledge/files")
    expect(calls.length).toBeGreaterThan(0)
    // A direct student-page fetch must carry the existing bearer token.
    expect(new Headers(calls[0][1]?.headers).get("Authorization")).toBe("Bearer cadet-reference-token")
    expect(screen.queryByText("Алгоритм опроса при ДТП.pdf")).not.toBeInTheDocument()
  })

  it("opens the uploaded document by fetching its protected download URL", async () => {
    const blob = new Blob(["%PDF-1.4 real uploaded bytes"], { type: "application/pdf" })
    const baseFetch = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input) === document.url) return {
        ok: true, status: 200, blob: async () => blob,
      } as Response
      return baseFetch(input, init)
    })
    const createObjectURL = vi.fn(() => "blob:teacher-document")
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true })
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    vi.spyOn(window, "open").mockImplementation(() => null)
    await openMaterials()
    expect(await screen.findByText(document.name)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Открыть|Скачать/i }))
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(blob))
    const downloadCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url) === document.url)
    expect(downloadCall).toBeDefined()
    expect(new Headers(downloadCall![1]?.headers).get("Authorization")).toBe("Bearer cadet-reference-token")
  })

  it("shows a truthful empty state instead of four invented PDF files", async () => {
    catalog = []
    await openMaterials()
    await waitFor(() => expect(screen.getByText(/Материалов пока нет/i)).toBeInTheDocument())
    expect(screen.queryByText("Алгоритм опроса при ДТП.pdf")).not.toBeInTheDocument()
    expect(screen.queryByText("Памятка по службам.pdf")).not.toBeInTheDocument()
  })

  it("reports a catalog failure instead of silently showing invented files", async () => {
    catalogFails = true
    await openMaterials()
    expect(await screen.findByText(/Не удалось загрузить материалы/i)).toBeInTheDocument()
    expect(screen.queryByText("Алгоритм опроса при ДТП.pdf")).not.toBeInTheDocument()
  })

  it("retries loading materials when clicking retry button", async () => {
    catalogFails = true
    await openMaterials()
    expect(await screen.findByText(/Не удалось загрузить материалы/i)).toBeInTheDocument()

    catalogFails = false
    fireEvent.click(screen.getByRole("button", { name: /Повторить попытку/i }))
    expect(await screen.findByText(document.name)).toBeInTheDocument()
  })

  it("reloads materials when returning to docs tab", async () => {
    await openMaterials()
    expect(await screen.findByText(document.name)).toBeInTheDocument()

    // Teacher uploads a second document
    const secondDoc = {
      id: "real-upload-999", name: "Новая инструкция 999.docx",
      size: 999, size_bytes: 999, uploaded_at: "2026-10-18T11:00:00Z",
      content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      uploaded_by: "teacher-742",
      url: "/api/v1/knowledge/files/real-upload-999/download",
    }
    catalog = [document, secondDoc]

    // Switch to lessons tab
    fireEvent.click(screen.getByRole("button", { name: /История обучения и билеты/i }))
    // Switch back to docs tab
    fireEvent.click(screen.getByRole("button", { name: /Справочные материалы/i }))

    expect(await screen.findByText(secondDoc.name)).toBeInTheDocument()
  })

  it("handles download failure gracefully without crashing", async () => {
    const alertMock = vi.spyOn(window, "alert").mockImplementation(() => {})
    const baseFetch = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input) === document.url) return {
        ok: false, status: 404,
      } as Response
      return baseFetch(input, init)
    })

    await openMaterials()
    expect(await screen.findByText(document.name)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Открыть|Скачать/i }))

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalled()
    })
    expect(screen.getByText(document.name)).toBeInTheDocument()
  })
})
