import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import AnalyticsPage from "@/components/teacher/analytics-page"

const lessons = [
  { id: "lesson-a1", group_id: "group-a", group_name: "Группа А", status: "COMPLETED",
    completed_at: "2026-10-20T10:00:00Z", started_at: "2026-10-19T10:00:00Z", students: [
      { cadet_id: "cadet-a", cadet_name: "Курсант А", tickets: [
        { ticket_id: "ticket-1", title: "Билет 1", score: 0 },
        { ticket_id: "ticket-2", title: "Билет 2", score: 94.5, expert_score: 94.5 },
      ] },
      { cadet_id: "cadet-b", cadet_name: "Без попытки", score: null },
    ] },
  { id: "lesson-a2", group_id: "group-a", group_name: "Группа А", status: "WAITING",
    created_at: "2026-10-18T10:00:00Z", students: [{ cadet_id: "cadet-a", cadet_name: "Курсант А", score: 80 }] },
  { id: "lesson-b1", group_id: "group-b", group_name: "Группа Б", status: "WAITING",
    started_at: "2026-10-19T10:00:00Z", students: [{ cadet_id: "cadet-c", cadet_name: "Курсант Б", score: null }] },
]

function setup(options: { empty?: boolean; failed?: boolean; downloadError?: boolean; generationError?: boolean } = {}) {
  const downloads: string[] = []
  const NativeURL = URL
  vi.stubGlobal("URL", class extends NativeURL {
    static createObjectURL = vi.fn(() => "blob:gradebook-test")
    static revokeObjectURL = vi.fn()
  })
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download)
  })
  const request = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input)
    if (url === "/api/v1/lessons") return { ok: true, json: async () => options.empty ? [] : lessons }
    if (url === "/api/reports/generate") return { ok: !options.generationError, status: 503, json: async () => ({ task_id: "task-1" }) }
    if (url === "/api/reports/status/task-1") return { ok: true, json: async () => ({
      status: options.failed ? "failed" : "ready", error: "Не удалось создать PDF", generated_at: "2026-10-21T00:30:00+03:00",
    }) }
    if (url.startsWith("/api/reports/download?")) return {
      ok: !options.downloadError, status: options.downloadError ? 500 : 200,
      blob: async () => new Blob(["exported file"]),
    }
    return { ok: true, json: async () => ({ daily_dynamics: [] }) }
  })
  vi.stubGlobal("fetch", request)
  return { request, downloads }
}

async function mount() {
  render(<AnalyticsPage initialTab="history" />)
  await waitFor(() => expect(screen.getByRole("button", { name: "Экспорт в Excel" })).not.toBeDisabled())
}

function generationBody(request: ReturnType<typeof setup>["request"]) {
  const call = request.mock.calls.find(([url]) => url === "/api/reports/generate")!
  return JSON.parse(String(call[1]?.body))
}

describe("Journal PDF and Excel export", () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem("token", "teacher-token")
  })
  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  for (const format of ["excel", "pdf"] as const) {
    for (const scope of ["all", "group", "lesson"] as const) {
      it(`downloads ${format} for ${scope} using explicit scope and Moscow generation date`, async () => {
        const { request, downloads } = setup()
        await mount()
        if (scope !== "all") fireEvent.change(screen.getByLabelText("Группа отчёта"), { target: { value: "group-a" } })
        if (scope === "lesson") fireEvent.change(screen.getByLabelText("Занятие отчёта"), { target: { value: "lesson-a1" } })
        fireEvent.click(screen.getByRole("button", { name: format === "excel" ? "Экспорт в Excel" : "Экспорт в PDF" }))
        expect(screen.getByRole("button", { name: /Генерация/ })).toBeDisabled()
        await waitFor(() => expect(downloads).toHaveLength(1))
        const body = generationBody(request)
        expect(body).toMatchObject({ format, report_kind: "gradebook" })
        expect(body.custom_records).toHaveLength(scope === "all" ? 5 : scope === "group" ? 4 : 3)
        expect(body.custom_records[0]).toMatchObject({ final_score: 0, group_name: "Группа А", lesson_date: "2026-10-20T10:00:00Z" })
        expect(body.custom_records[1].final_score).toBe(94.5)
        expect(body.custom_records[2]).toMatchObject({ cadet_name: "Без попытки", final_score: null })
        if (scope === "all") {
          expect(body.custom_records[3].lesson_date).toBe("2026-10-18T10:00:00Z")
          expect(body.custom_records[4].lesson_date).toBe("2026-10-19T10:00:00Z")
        }
        const [, init] = request.mock.calls.find(([url]) => url === "/api/reports/generate")!
        expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer teacher-token")
        expect(downloads).toEqual([`gradebook_2026-10-21.${format === "excel" ? "xlsx" : "pdf"}`])
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:gradebook-test")
      })
    }
  }

  it("keeps report scope independent of history group, search and hidden completed lessons", async () => {
    const { request, downloads } = setup()
    await mount()
    fireEvent.click(screen.getByRole("checkbox", { name: "Скрыть завершённые уроки" }))
    fireEvent.change(screen.getByLabelText("Группа:"), { target: { value: "group-b" } })
    fireEvent.click(screen.getByRole("button", { name: "Экспорт в Excel" }))
    await waitFor(() => expect(downloads).toHaveLength(1))
    expect(generationBody(request).custom_records).toHaveLength(5)
  })

  it("resets the lesson selection when the report group changes", async () => {
    setup()
    await mount()
    fireEvent.change(screen.getByLabelText("Занятие отчёта"), { target: { value: "lesson-a1" } })
    fireEvent.change(screen.getByLabelText("Группа отчёта"), { target: { value: "group-b" } })
    expect(screen.getByLabelText("Занятие отчёта")).toHaveValue("ALL")
    expect(screen.getByLabelText("Занятие отчёта")).not.toHaveTextContent("lesson-a1")
  })

  it("reports an empty scope without starting generation", async () => {
    const { request } = setup({ empty: true })
    await mount()
    fireEvent.click(screen.getByRole("button", { name: "Экспорт в PDF" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("нет записей")
    expect(request.mock.calls.some(([url]) => url === "/api/reports/generate")).toBe(false)
  })

  for (const failure of ["failed", "downloadError", "generationError"] as const) {
    it(`shows ${failure} inline and allows retry`, async () => {
      const { downloads } = setup({ [failure]: true })
      await mount()
      fireEvent.click(screen.getByRole("button", { name: "Экспорт в PDF" }))
      expect(await screen.findByRole("alert")).not.toBeEmptyDOMElement()
      expect(downloads).toHaveLength(0)
      expect(screen.getByRole("button", { name: "Экспорт в PDF" })).not.toBeDisabled()
    })
  }
})
