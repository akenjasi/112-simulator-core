import React from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import StudentProfilePage from "@/app/student/profile/page"
import { DDSLessonReport } from "@/components/teacher/dds-lesson-report"

vi.mock("next/navigation", () => ({useRouter: () => ({push: vi.fn(), replace: vi.fn()})}))
vi.mock("next/link", () => ({default: ({children, ...props}: any) => <a {...props}>{children}</a>}))
const response = (data: unknown, status = 200) => ({ok: status < 400, status, json: async () => data}) as Response
const report = {job_id: "r1", status: "pending", waiting_reason: "learning_active",
  period_start: "2026-10-11T21:00:00Z", period_end: "2026-10-18T21:00:00Z", snapshot_at: null}
let saved = [report]
let network: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>

beforeEach(() => {
  localStorage.setItem("token", "report-test-token")
  saved = [report]
  network = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/v1/users/me") return response({user_id: "cadet", role: "CADET", username: "student"})
    if (url === "/api/dds/student-workspace") return response({activities: [], can_start_training: true})
    if (url === "/api/ai-analytics/students/me/reports") return response(init?.method === "POST" ? report : saved)
    if (url.includes("/lessons/") && url.endsWith("/report")) return response({...report, lesson_id: "lesson"})
    return response([])
  })
  vi.stubGlobal("fetch", network)
})
afterEach(() => {cleanup(); localStorage.clear(); vi.unstubAllGlobals()})

it("shows the saved student period and waiting reason without generating on read", async () => {
  render(<StudentProfilePage />)
  fireEvent.click(await screen.findByRole("button", {name: "Рекомендации ИИ"}))
  expect(await screen.findByText("Ожидает завершения занятий")).toBeInTheDocument()
  expect(screen.getByText("Период: 12.10.2026 — 18.10.2026")).toBeInTheDocument()
  expect(screen.getByText("Прежние рекомендации · история")).toBeInTheDocument()
  expect(network.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false)
})

it("locks double clicks and retries through the same student endpoint", async () => {
  let resolve: (value: Response) => void = () => {}
  const original = network.getMockImplementation()!
  network.mockImplementation((url, init) => init?.method === "POST" ? new Promise<Response>(done => {resolve = done}) : original(url, init))
  render(<StudentProfilePage />)
  fireEvent.click(await screen.findByRole("button", {name: "Рекомендации ИИ"}))
  const button = await screen.findByRole("button", {name: "Сформировать отчёт"})
  fireEvent.click(button); fireEvent.click(button)
  expect(network.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1)
  const post = network.mock.calls.find(([, init]) => init?.method === "POST")!
  expect(post[0]).toBe("/api/ai-analytics/students/me/reports")
  expect(post[1]?.body).toBe(JSON.stringify({retry: true}))
  resolve(response(report, 202))
  expect(await screen.findByText(/Запрос принят/)).toBeInTheDocument()
})

it("keeps a completed student report visible with snapshot time", async () => {
  saved = [{...report, status: "completed", waiting_reason: null, report_text: "Повторите точную регистрацию докладов.",
    snapshot_at: "2026-10-19T00:15:00Z"} as any]
  render(<StudentProfilePage />)
  fireEvent.click(await screen.findByRole("button", {name: "Рекомендации ИИ"}))
  expect(await screen.findByText("Повторите точную регистрацию докладов.")).toBeInTheDocument()
  expect(screen.getByText(/Данные на/)).toHaveTextContent("03:15")
  await waitFor(() => expect(network.mock.calls.filter(([url]) => url === "/api/ai-analytics/students/me/reports")).toHaveLength(1))
})

it("shows the teacher resource reason without sending POST", async () => {
  const original = network.getMockImplementation()!
  network.mockImplementation((url, init) => url.includes("/lessons/") && url.endsWith("/report")
    ? Promise.resolve(response({...report, lesson_id: "lesson", waiting_reason: "memory_low"})) : original(url, init))
  render(<DDSLessonReport lessonId="lesson" />)
  expect(await screen.findAllByText("Недостаточно ресурсов")).not.toHaveLength(0)
  expect(screen.getByText("Недостаточно свободной оперативной памяти для модели и резерва сервера.")).toBeInTheDocument()
  expect(network.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false)
})

it("explains the specific student memory wait while preserving the queued report", async () => {
  saved = [{...report, waiting_reason: "memory_low"}]
  render(<StudentProfilePage />)
  fireEvent.click(await screen.findByRole("button", {name: "Рекомендации ИИ"}))
  expect(await screen.findByText("Недостаточно ресурсов")).toBeInTheDocument()
  expect(screen.getByText("Недостаточно свободной оперативной памяти для модели и резерва сервера.")).toBeInTheDocument()
  expect(network.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false)
})
