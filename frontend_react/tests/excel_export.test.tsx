import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import AnalyticsPage from "@/app/teacher/analytics/page"

describe("Journal Excel export", () => {
  beforeEach(() => {
    localStorage.setItem("token", "teacher-token")
    vi.spyOn(window, "alert").mockImplementation(() => {})
  })
  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("exports filtered lesson grades and preserves unmarked work", async () => {
    const lessons = [
      { id: "lesson-a", group_id: "group-a", group_name: "Группа А", students: [
        { cadet_id: "cadet-a", cadet_name: "Курсант А", tickets: [
          { ticket_id: "ticket-1", title: "Билет 1", score: 42, errors: ["Ошибка адреса"] },
          { ticket_id: "ticket-2", title: "Билет 2", score: null },
        ] },
      ] },
      { id: "lesson-b", group_id: "group-b", group_name: "Группа Б", students: [
        { cadet_id: "cadet-b", cadet_name: "Курсант Б", score: 90 },
      ] },
    ]
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/v1/lessons") return { ok: true, json: async () => lessons }
      // Stop before polling; this test checks the data submitted for export.
      if (url === "/api/reports/generate") return { ok: false, status: 503 }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal("fetch", request)
    render(<AnalyticsPage initialTab="history" />)
    await screen.findByRole("option", { name: "Группа А" })
    fireEvent.change(screen.getByLabelText("Группа:"), { target: { value: "group-a" } })
    fireEvent.click(screen.getByRole("button", { name: "Экспорт в Excel" }))
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/reports/generate", expect.anything()))
    const [, init] = request.mock.calls.find(([url]) => url === "/api/reports/generate") as unknown as [string, RequestInit]
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer teacher-token")
    expect(JSON.parse(String(init.body))).toMatchObject({
      format: "excel",
      group_id: "group-a",
      custom_records: [
        { cadet_name: "Курсант А", ticket_id: "Билет 1", final_score: 42, penalties_list: ["Ошибка адреса"] },
        { cadet_name: "Курсант А", ticket_id: "Билет 2", final_score: null },
      ],
    })
  })

  it("exports only the answer opened directly from lesson history", async () => {
    const lessons = [{
      id: "lesson-demo-1", group_id: "group-a", group_name: "Группа А", status: "COMPLETED",
      students: [
        { cadet_id: "cadet-a", cadet_name: "Курсант А", progress: 100, passed: 0, failed: 1, tickets: [
          { ticket_id: "ticket-1", record_id: "record-1", title: "Билет 1", score: 42, status: "failed" },
        ] },
        { cadet_id: "cadet-b", cadet_name: "Курсант Б", progress: 100, passed: 1, failed: 0, score: 90 },
      ],
    }]
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/v1/lessons") return { ok: true, json: async () => lessons }
      if (url === "/api/v1/analytics/records/record-1") return { ok: true, json: async () => ({
        record_id: "record-1", ticket_id: "ticket-1", title: "Билет 1", score: 55,
        status: "failed", etalon: {}, student_answer: {}, error_details: [],
      }) }
      if (url === "/api/reports/generate") return { ok: false, status: 503 }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal("fetch", request)
    render(<AnalyticsPage initialTab="history" />)
    fireEvent.click(await screen.findByText("Курсант А"))
    fireEvent.click(await screen.findByRole("button", { name: "Разобрать ответ" }))
    await screen.findByRole("heading", { name: "Эталон" })
    fireEvent.click(screen.getByRole("button", { name: "Экспорт в Excel" }))
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/reports/generate", expect.anything()))
    const [, init] = request.mock.calls.find(([url]) => url === "/api/reports/generate") as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body)).custom_records).toEqual([
      { cadet_name: "Курсант А", ticket_id: "Билет 1", final_score: 55 },
    ])
  })

  it("exports an empty detail view without falling back to unrelated lessons", async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "/api/v1/lessons") return { ok: true, json: async () => [{
        id: "lesson-a", group_id: "group-a", group_name: "Группа А", students: [{ cadet_id: "cadet-a", cadet_name: "Другой курсант", score: 90 }],
      }] }
      if (url === "/api/reports/generate") return { ok: false, status: 503 }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal("fetch", request)
    render(<AnalyticsPage initialTab="history" />)
    await screen.findByRole("option", { name: "Группа А" })
    fireEvent.click(screen.getByRole("button", { name: /Журнал разбора/ }))
    fireEvent.click(screen.getByRole("button", { name: "Экспорт в Excel" }))
    await waitFor(() => expect(request).toHaveBeenCalledWith("/api/reports/generate", expect.anything()))
    const [, init] = request.mock.calls.find(([url]) => url === "/api/reports/generate") as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body)).custom_records).toEqual([])
  })
})
