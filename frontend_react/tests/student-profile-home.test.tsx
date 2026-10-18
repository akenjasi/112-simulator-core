import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import StudentProfilePage from "@/app/student/profile/page"

const push = vi.fn()
vi.mock("next/navigation", () => ({useRouter: () => ({push, replace: vi.fn()})}))
vi.mock("next/link", () => ({default: ({children, ...props}: any) => <a {...props}>{children}</a>}))
const incoming = {
  phones: {aon: "000", provided: "000"}, incident: {number: "17", savedAt: "", operator: "112"},
  caller: {name: "Учебный", role: "Очевидец", address: "Учебный адрес"}, description: "Назначенная авария",
  statuses: {injured: "нет", ambulanceRefusal: "нет", blocked: "нет"}, emergency: {cs: false, cp: false},
  classification: {section: "ЖКХ", title: "Вода", class: "Авария"},
  services: [{id: "water", name: "Аварийная служба", status: "Получена службой", history: []}],
}
const assignment = (extra = {}) => ({session_id: "s1", lesson_id: "l1", ticket_id: "t1", card_id: "c1",
  session_status: "ACTIVE", lesson_status: "ACTIVE", incoming_card: incoming, actions: [], submitted_at: null,
  score: 100, total_cards: 3, completed_cards: 1, ...extra})
const ticket = (extra = {}) => ({ticket_id: "t1", card_id: "c1", title: "Авария водопровода", status: "ungraded", score: null, errors_count: 0, errors: [], ...extra})
const lesson = (extra = {}) => ({session_id: "s1", title: "Занятие #12345678", target_role: "DISPATCHER_DDS", session_type: "CARD_ACTIONS", status: "COMPLETED", score: null, date: "19.10.2026 10:00", tickets: [ticket()], ...extra})
const response = (body: unknown, status = 200) => ({ok: status < 400, status, json: async () => body}) as Response
let assignments: unknown[], history: unknown[], historyStatus: number, assignmentsStatus: number, adviceStatus: number
let network: ReturnType<typeof vi.fn>
const flush = () => act(async () => {for (let i = 0; i < 10; i++) await Promise.resolve()})

beforeEach(() => {
  assignments = []; history = []; historyStatus = 200; assignmentsStatus = 200; adviceStatus = 200
  localStorage.setItem("token", "profile-test-token")
  push.mockReset()
  network = vi.fn(async (url: string) => {
    if (url === "/api/v1/knowledge/files") return response([])
    if (url === "/api/v1/users/me") return response({user_id: "cadet", student_id: "CM1-12", full_name: "Учебный курсант", username: "cadet", role: "CADET"})
    if (url === "/api/dds/assignments") return response(assignments, assignmentsStatus)
    if (url.includes("/students/me/lessons")) return response(history, historyStatus)
    if (url.includes("/api/dds/training/tickets")) return response([{ticket_id: "t1", title: "Учебная вода", category: "ЖКХ", complexity: 1}])
    if (url === "/api/dds/training") return response(assignment())
    if (url.includes("/api/ai-analytics/student/")) return response([], adviceStatus)
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal("fetch", network)
})
afterEach(() => {cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear()})

it("shows a real assignment and a direct lesson action without exposing its legacy score", async () => {
  assignments = [assignment()]
  render(<StudentProfilePage />)
  const link = await screen.findByRole("link", {name: "Продолжить занятие"})
  expect(link).toHaveAttribute("href", "/dds?session_id=s1&ticket_id=t1")
  expect(screen.getByText("Завершено карточек: 1 из 3")).toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/100|\/ 100|б\./)
  expect(network.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true)
  expect(network).toHaveBeenCalledWith("/api/dds/assignments", expect.objectContaining({headers: {Authorization: "Bearer profile-test-token"}}))
})

it("keeps completed assignments in history and uses readable titles", async () => {
  assignments = [assignment({session_status: "COMPLETED", submitted_at: "2026-10-19T10:00:00Z"})]
  history = [lesson()]
  render(<StudentProfilePage />)
  expect(await screen.findByText("Пока нет назначенных занятий")).toBeInTheDocument()
  expect(await screen.findByRole("heading", {name: "Авария водопровода", level: 3})).toBeInTheDocument()
  expect(screen.queryByText("Занятие #12345678")).not.toBeInTheDocument()
  expect(screen.queryByRole("link", {name: "Продолжить занятие"})).not.toBeInTheDocument()
})

it("does not call missing evaluation a success and preserves the archived card identity", async () => {
  history = [lesson()]
  render(<StudentProfilePage />)
  fireEvent.click(await screen.findByRole("heading", {name: "Авария водопровода", level: 3}))
  expect(screen.getByText("Результаты проверки по критериям смотрите в карточке.")).toBeInTheDocument()
  expect(screen.getByRole("link", {name: "Открыть карточку"})).toHaveAttribute("href", "/dds?session_id=s1&ticket_id=t1&card_id=c1")
  expect(document.body.textContent).not.toMatch(/Ошибок не|100|Сдан/)
})

it("retains error counts even when detailed messages are missing", async () => {
  history = [lesson({tickets: [ticket({errors_count: 2, errors: []})]})]
  render(<StudentProfilePage />)
  fireEvent.click(await screen.findByRole("heading", {name: "Авария водопровода", level: 3}))
  expect(screen.getByText("Ошибок в сохранённой проверке: 2")).toBeInTheDocument()
  expect(screen.queryByText(/Результаты проверки по критериям смотрите/)).not.toBeInTheDocument()
})

it("keeps incomplete cards and unavailable results neutral", async () => {
  history = [lesson({status: "INCOMPLETE", tickets: [ticket({status: "incomplete", card_id: null})]})]
  render(<StudentProfilePage />)
  fireEvent.click(await screen.findByRole("heading", {name: "Авария водопровода", level: 3}))
  expect(screen.getByText("Завершено досрочно")).toBeInTheDocument()
  expect(screen.getByText("Не завершена")).toBeInTheDocument()
  expect(screen.getByText("Результаты проверки по критериям пока недоступны.")).toBeInTheDocument()
  expect(screen.queryByRole("link", {name: "Открыть карточку"})).not.toBeInTheDocument()
})

it("distinguishes an assignments failure from an empty list and supports retry", async () => {
  assignmentsStatus = 503
  render(<StudentProfilePage />)
  expect(await screen.findByRole("alert")).toBeInTheDocument()
  expect(screen.queryByText("Пока нет назначенных занятий")).not.toBeInTheDocument()
  assignmentsStatus = 200; assignments = [assignment()]
  fireEvent.click(screen.getByRole("button", {name: "Повторить загрузку"}))
  expect(await screen.findByRole("link", {name: "Продолжить занятие"})).toBeInTheDocument()
})

it("keeps training available if history fails and reloads history on retry", async () => {
  historyStatus = 500
  render(<StudentProfilePage />)
  expect(await screen.findByText(/Не удалось загрузить историю занятий/)).toBeInTheDocument()
  expect(screen.queryByText("История занятий пока пуста")).not.toBeInTheDocument()
  expect(screen.getByRole("button", {name: "Выбрать задания"})).toBeEnabled()
  historyStatus = 200
  fireEvent.click(screen.getByRole("button", {name: "Повторить загрузку истории"}))
  expect(await screen.findByText("История занятий пока пуста")).toBeInTheDocument()
})

it("loads the existing training selector only on demand and preserves its launch workflow", async () => {
  render(<StudentProfilePage />); await flush()
  expect(network.mock.calls.some(([url]) => url.includes("/training/tickets"))).toBe(false)
  fireEvent.click(screen.getByRole("button", {name: "Выбрать задания"}))
  const checkbox = await screen.findByRole("checkbox", {name: /Учебная вода/})
  fireEvent.click(checkbox)
  fireEvent.click(screen.getByRole("button", {name: "Начать тренировку"}))
  await waitFor(() => expect(push).toHaveBeenCalledWith("/dds/journal?focus_session_id=s1&focus_ticket_id=t1"))
  const call = network.mock.calls.find(([url]) => url === "/api/dds/training")!
  expect(JSON.parse(call[1].body).ticket_ids).toEqual(["t1"])
})

it("shows recent history first and can reveal older lessons", async () => {
  history = [1, 2, 3, 4].map(i => lesson({session_id: `s${i}`, title: `Учебное занятие ${i}`}))
  render(<StudentProfilePage />)
  await screen.findByText("Учебное занятие 1")
  expect(screen.queryByText("Учебное занятие 4")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", {name: "Вся история занятий (4)"}))
  expect(screen.getByText("Учебное занятие 4")).toBeInTheDocument()
})

it("reads saved advice lazily and does not start legacy AI generation", async () => {
  render(<StudentProfilePage />); await flush()
  expect(network.mock.calls.some(([url]) => url.includes("ai-analytics"))).toBe(false)
  fireEvent.click(screen.getByRole("button", {name: "Рекомендации ИИ"}))
  expect(await screen.findByText("Сохранённых рекомендаций пока нет.")).toBeInTheDocument()
  expect(network.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true)
})

it("shows advice errors with a retry instead of claiming no advice exists", async () => {
  adviceStatus = 503
  render(<StudentProfilePage />); await flush()
  fireEvent.click(screen.getByRole("button", {name: "Рекомендации ИИ"}))
  expect(await screen.findByText(/Не удалось загрузить рекомендации/)).toBeInTheDocument()
  adviceStatus = 200
  fireEvent.click(screen.getByRole("button", {name: "Повторить загрузку"}))
  expect(await screen.findByText("Сохранённых рекомендаций пока нет.")).toBeInTheDocument()
})

it("updates assignments quietly and stops polling after leaving the page", async () => {
  vi.useFakeTimers()
  const view = render(<StudentProfilePage />); await flush()
  const calls = network.mock.calls.filter(([url]) => url === "/api/dds/assignments").length
  assignments = [assignment()]
  await act(async () => {await vi.advanceTimersByTimeAsync(5000)})
  expect(network.mock.calls.filter(([url]) => url === "/api/dds/assignments")).toHaveLength(calls + 1)
  expect(screen.getByRole("link", {name: "Продолжить занятие"})).toBeInTheDocument()
  view.unmount()
  await act(async () => {await vi.advanceTimersByTimeAsync(10000)})
  expect(network.mock.calls.filter(([url]) => url === "/api/dds/assignments")).toHaveLength(calls + 1)
})

it("keeps the initial assignment list compact and reveals the remaining assignments", async () => {
  assignments = [1, 2, 3].map(i => assignment({session_id: `s${i}`, incoming_card: {...incoming, classification: {...incoming.classification, title: `Учебное происшествие ${i}`}}}))
  render(<StudentProfilePage />)
  await screen.findByRole("heading", {name: "Учебное происшествие 1"})
  expect(screen.queryByRole("heading", {name: "Учебное происшествие 3"})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", {name: "Все назначенные занятия (3)"}))
  expect(screen.getByRole("heading", {name: "Учебное происшествие 3"})).toBeInTheDocument()
})
