import React from "react"
import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react"
import {afterEach, beforeEach, expect, it, vi} from "vitest"
import AnalyticsPage from "@/app/teacher/analytics/page"

const lessons = [
  {id: "past-001", group_id: "a", group_name: "Группа А", status: "COMPLETED", students: [{cadet_id: "past", cadet_name: "Прошедший", score: 55}]},
  {id: "live-001", group_id: "a", group_name: "Группа А", status: "ACTIVE", students: [{cadet_id: "live", cadet_name: "Текущий", score: null}]},
  {id: "wait-001", group_id: "b", group_name: "Группа Б", status: "WAITING", students: []},
]
function setup() {
  const request = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    if (String(input) === "/api/v1/lessons") return {ok: true, json: async () => lessons}
    if (String(input) === "/api/reports/generate") return {ok: false, status: 503}
    return {ok: true, json: async () => ({daily_dynamics: []})}
  })
  vi.stubGlobal("fetch", request)
  return request
}
beforeEach(() => {localStorage.clear(); localStorage.setItem("token", "teacher-token")})
afterEach(() => {cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear()})

it("reversibly hides only completed lessons and restores the preference on remount", async () => {
  const request = setup()
  const view = render(<AnalyticsPage initialTab="history" />)
  await screen.findByText("Урок #past-001")
  fireEvent.click(screen.getByRole("checkbox", {name: "Скрыть завершённые уроки"}))
  expect(screen.queryByText("Урок #past-001")).not.toBeInTheDocument()
  expect(screen.getByText("Урок #live-001")).toBeInTheDocument()
  expect(screen.getByText("Урок #wait-001")).toBeInTheDocument()
  view.unmount()
  render(<AnalyticsPage initialTab="history" />)
  await screen.findByText("Урок #live-001")
  expect(screen.getByRole("checkbox", {name: "Скрыть завершённые уроки"})).toBeChecked()
  expect(screen.queryByText("Урок #past-001")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("checkbox", {name: "Скрыть завершённые уроки"}))
  expect(screen.getByText("Урок #past-001")).toBeInTheDocument()
  expect(request.mock.calls.every(([, init]) => (init?.method || "GET") === "GET")).toBe(true)
})

it("applies group and completion filters to the Excel export without deleting history", async () => {
  const request = setup()
  vi.spyOn(window, "alert").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  render(<AnalyticsPage initialTab="history" />)
  await screen.findByText("Урок #past-001")
  fireEvent.click(screen.getByRole("checkbox", {name: "Скрыть завершённые уроки"}))
  fireEvent.change(screen.getByLabelText("Группа:"), {target: {value: "a"}})
  expect(screen.queryByText("Урок #wait-001")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", {name: "Экспорт в Excel"}))
  await waitFor(() => expect(request.mock.calls.some(([url]) => url === "/api/reports/generate")).toBe(true))
  const [, init] = request.mock.calls.find(([url]) => url === "/api/reports/generate")!
  expect(JSON.parse(String(init?.body)).custom_records).toEqual([
    {cadet_name: "Текущий", ticket_id: "Группа А", final_score: null},
  ])
  fireEvent.click(screen.getByRole("checkbox", {name: "Скрыть завершённые уроки"}))
  expect(screen.getByText("Урок #past-001")).toBeInTheDocument()
})
