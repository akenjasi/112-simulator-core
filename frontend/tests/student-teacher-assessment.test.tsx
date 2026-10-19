import React from "react"
import {cleanup, fireEvent, render, screen} from "@testing-library/react"
import {afterEach, beforeEach, expect, it, vi} from "vitest"
import StudentProfilePage from "@/app/student/profile/page"
import {StudentAttemptReview} from "@/components/student/student-review"

let query = new URLSearchParams("session_id=s1&card_id=c1")
vi.mock("next/navigation", () => ({useSearchParams: () => query, useRouter: () => ({push: vi.fn(), replace: vi.fn()})}))
vi.mock("next/link", () => ({default: ({children, ...props}: any) => <a {...props}>{children}</a>}))
const incoming = {
  phones: {aon: "000", provided: "000"}, incident: {number: "17", savedAt: "", operator: "112"},
  caller: {name: "Учебный", role: "Очевидец", address: "Учебный адрес"}, description: "Назначенная авария",
  statuses: {injured: "нет", ambulanceRefusal: "нет", blocked: "нет"}, emergency: {cs: false, cp: false},
  classification: {section: "ЖКХ", title: "Авария водопровода", class: "Авария"},
  services: [{id: "water", name: "Водоканал", status: "Работы завершены", history: []}],
}
const state = (extra: Record<string, unknown> = {}) => ({session_id: "s1", lesson_id: "l1", ticket_id: "t1", card_id: "c1",
  session_status: "COMPLETED", lesson_status: "COMPLETED", incoming_card: incoming, actions: [], score: 100,
  received_at: "2026-10-19T10:00:00Z", card_submitted_at: "2026-10-19T10:05:00Z", submitted_at: "2026-10-19T10:05:00Z", readonly: true,
  criteria: [
    {key: "confirmation", label: "Подтверждение", status: "completed", evidence: []},
    ...["service", "stage", "accuracy", "completion"].map(key => ({key, label: key, status: "not_evaluated", evidence: []})),
  ], ...extra})
const assessment = (score: number | null, is_passed: boolean | null, comment: string | null) => ({score, is_passed, comment, graded_at: "2026-10-19T10:06:00Z"})
const response = (body: unknown, status = 200) => ({ok: status < 400, status, json: async () => body}) as Response
let history: unknown[], historyStatus: number
let network: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>

beforeEach(() => {
  query = new URLSearchParams("session_id=s1&card_id=c1")
  history = []
  historyStatus = 200
  localStorage.setItem("token", "teacher-assessment-test")
  network = vi.fn(async (url: string) => {
    if (url === "/api/dds/sessions/s1/cards/c1") return response(state())
    if (url === "/api/dds/student-workspace") return response({activities: [], can_start_training: true})
    if (url === "/api/v1/knowledge/files") return response([])
    if (url === "/api/v1/users/me") return response({user_id: "cadet", username: "cadet", full_name: "Учебный курсант", role: "CADET"})
    if (url.includes("students/me/lessons")) return response(history, historyStatus)
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal("fetch", network)
})
afterEach(() => {cleanup(); vi.unstubAllGlobals(); localStorage.clear()})

it("shows the selected card's zero teacher grade beside the five-criterion review", async () => {
  history = [{session_id: "s1", tickets: [
    {card_id: "other-card", errors_count: 0, errors: [], teacher_assessment: assessment(91, true, "Комментарий другой карточки")},
    {card_id: "c1", errors_count: 0, errors: [], teacher_assessment: assessment(0, false, "Ручная нулевая оценка")},
  ]}]
  render(<StudentAttemptReview />)
  expect(await screen.findByText(/Комментарий преподавателя: Ручная нулевая оценка/)).toBeInTheDocument()
  expect(screen.getByText(/Баллы:/).parentElement).toHaveTextContent(/Баллы:\s*0/)
  expect(screen.getByText("Не зачёт")).toBeInTheDocument()
  expect(screen.getByText("Выполнено")).toBeInTheDocument()
  expect(screen.queryByText("Комментарий другой карточки")).not.toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/Баллы: 100/)
  expect(network.mock.calls.some(([url]) => url.includes("students/me/lessons"))).toBe(true)
})

it("keeps five-criterion results visible when the student history request fails", async () => {
  historyStatus = 503
  render(<StudentAttemptReview />)
  expect(await screen.findByText("Выполнено")).toBeInTheDocument()
  expect(await screen.findByText(/Оценку преподавателя для этой карточки не удалось загрузить/)).toBeInTheDocument()
  expect(screen.getAllByText("Не оценено")).toHaveLength(4)
})

it("keeps an automatic 100 out of the teacher assessment when the teacher has not graded", async () => {
  history = [{session_id: "s1", title: "Занятие по воде", status: "COMPLETED", score: 100, date: "19.10.2026 10:00", tickets: [
    {ticket_id: "t1", card_id: "c1", title: "Авария водопровода", status: "passed", score: 100, errors_count: 0, errors: [],
      teacher_assessment: null},
  ]}]
  render(<StudentProfilePage />)
  fireEvent.click(await screen.findByRole("heading", {name: "Занятие по воде", level: 3}))
  expect(await screen.findByText("Оценка преподавателя")).toBeInTheDocument()
  expect(screen.getByText("Преподаватель ещё не выставил оценку.")).toBeInTheDocument()
  expect(screen.queryByText("Баллы: 100")).not.toBeInTheDocument()
})

it("shows a zero teacher grade in the collapsed profile summary and its comment after opening", async () => {
  history = [{session_id: "s1", title: "Занятие по воде", status: "COMPLETED", score: 100, date: "19.10.2026 10:00", tickets: [
    {ticket_id: "t1", card_id: "c1", title: "Авария водопровода", status: "passed", score: 100, errors_count: 0, errors: [],
      teacher_assessment: assessment(0, false, "Комментарий нулевой оценки")},
  ]}]
  render(<StudentProfilePage />)
  const lesson = await screen.findByRole("heading", {name: "Занятие по воде", level: 3})
  expect(screen.getByText(/Оценка преподавателя: Баллы: 0/)).toBeInTheDocument()
  const comment = screen.getByText("Комментарий нулевой оценки")
  expect(comment).not.toBeVisible()
  fireEvent.click(lesson)
  expect(comment).toBeVisible()
  expect(screen.queryByText(/Баллы:\s*100/)).not.toBeInTheDocument()
})
