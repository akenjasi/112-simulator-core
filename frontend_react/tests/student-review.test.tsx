import React from "react"
import {act, cleanup, fireEvent, render, screen, within} from "@testing-library/react"
import {afterEach, beforeEach, expect, it, vi} from "vitest"
import {StudentAttemptReview} from "@/components/student/student-review"
import {validateStudentReview} from "@/lib/student-review"
import {DDSAssignedConsole} from "@/components/dispatcher/dds-assigned-console"

let query = new URLSearchParams("session_id=s1&card_id=c1")
const push = vi.fn()
vi.mock("next/navigation", () => ({useSearchParams: () => query, useRouter: () => ({push})}))
vi.mock("next/link", () => ({default: ({children, ...props}: any) => <a {...props}>{children}</a>}))
vi.mock("@/components/dispatcher/top-bar", () => ({TopBar: () => null}))
vi.mock("@/components/dispatcher/caller-panel", () => ({CallerPanel: () => null}))
vi.mock("@/components/dispatcher/incident-panel", () => ({IncidentPanel: () => null}))
const incoming = {
  phones: {aon: "000", provided: "000"}, incident: {number: "17", savedAt: "", operator: "ДДС"},
  caller: {name: "Учебный", role: "Очевидец", address: "Учебный адрес"}, description: "Учебная авария",
  statuses: {injured: "нет", ambulanceRefusal: "нет", blocked: "нет"}, emergency: {cs: false, cp: false},
  classification: {section: "ЖКХ", title: "Авария водопровода", class: "Авария"},
  services: [{id: "water", name: "Водоканал", status: "Работы завершены", history: []}],
}
const state = (extra: Record<string, unknown> = {}) => ({session_id: "s1", lesson_id: "l1", ticket_id: "t1", card_id: "c1",
  session_status: "COMPLETED", lesson_status: "COMPLETED", incoming_card: incoming, actions: [], score: 100,
  received_at: "2026-10-19T10:00:00Z", card_submitted_at: "2026-10-19T10:05:00Z", submitted_at: "2026-10-19T10:05:00Z", readonly: true, ...extra})
const criterion = (key = "confirmation", status = "completed", evidence: unknown[] = []) => ({key, label: key, status, evidence})
const response = (data: unknown, status = 200) => ({ok: status < 400, status, json: async () => data}) as Response
let network: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>
beforeEach(() => {
  query = new URLSearchParams("session_id=s1&card_id=c1")
  localStorage.setItem("token", "review-test")
  network = vi.fn(async url => response(url.includes("students/me/lessons") ? [] : state()))
  vi.stubGlobal("fetch", network)
  push.mockReset()
})
afterEach(() => {cleanup(); vi.unstubAllGlobals(); localStorage.clear()})

it("loads the exact owned card with auth, shows criterion evidence and preserves the workplace identity", async () => {
  network.mockResolvedValue(response(state({criteria: [criterion("confirmation", "not_completed", [{service_name: "Водоканал", seconds: 38.2}]),
    criterion("service", "completed_after_correction", [{service_name: "Водоканал", at: "2026-10-19T10:01:00Z", message: "Доклад другой службы", action: {status: "Прибытие"}}])]})))
  render(<StudentAttemptReview/>)
  expect(await screen.findByText(/Подтверждение через 38,2 с/)).toBeInTheDocument()
  expect(screen.getByText("Выполнено после исправления")).toBeInTheDocument()
  expect(screen.getByText("Статус: Прибытие")).toBeInTheDocument()
  expect(screen.getByRole("link", {name: "Открыть сохранённую карточку"})).toHaveAttribute("href", "/dds?session_id=s1&ticket_id=t1&card_id=c1")
  expect(network).toHaveBeenCalledWith("/api/dds/sessions/s1/cards/c1", expect.objectContaining({headers: {Authorization: "Bearer review-test"}, cache: "no-store"}))
  expect(network.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true)
  expect(document.body.textContent).not.toMatch(/100|\/ 100|Оценка:/)
})

it("shows all five criteria as unevaluated for legacy data without claiming success or zero errors", async () => {
  render(<StudentAttemptReview/>)
  await screen.findByText(/Проверка по критериям недоступна/)
  expect(screen.getAllByText("Не оценено")).toHaveLength(5)
  expect(screen.getByText(/Отсутствие результата не означает/)).toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/Ошибок: 0|Без ошибок|Проверка пройдена/)
})

it("keeps an early stop separate from criterion results", async () => {
  network.mockResolvedValue(response(state({card_submitted_at: null, submitted_at: null})))
  render(<StudentAttemptReview/>)
  expect(await screen.findByText(/Это статус выполнения, а не оценка/)).toBeInTheDocument()
  expect(screen.getAllByText("Не оценено")).toHaveLength(5)
})

it("does not turn unevidenced criteria on an unfinished card into a negative assessment", async () => {
  network.mockResolvedValue(response(state({card_submitted_at: null, submitted_at: null, criteria: [
    criterion("confirmation", "completed", [{service_name: "Водоканал", seconds: 13.4}]),
    ...["service", "stage", "accuracy", "completion"].map(key => criterion(key, "not_completed")),
  ]})))
  render(<StudentAttemptReview/>)
  expect(await screen.findAllByText("Проверка не завершена")).toHaveLength(3)
  expect(screen.getByText("Не завершено")).toBeInTheDocument()
  expect(screen.queryByText("Не выполнено")).not.toBeInTheDocument()
})

it("does not call a completed student's live group lesson finished", async () => {
  network.mockResolvedValue(response(state({lesson_status: "ACTIVE"})))
  render(<StudentAttemptReview/>)
  expect(await screen.findByText("Ваша работа завершена, общее занятие ещё идёт.")).toBeInTheDocument()
})

it("labels a live card as provisional and offers return to work without any mutation", async () => {
  network.mockResolvedValue(response(state({session_status: "ACTIVE", lesson_status: "ACTIVE", readonly: false, card_submitted_at: null, submitted_at: null})))
  render(<StudentAttemptReview/>)
  expect(await screen.findByText(/Разбор предварительный/)).toBeInTheDocument()
  expect(screen.getByRole("link", {name: "Вернуться к работе"})).toBeInTheDocument()
  expect(network).toHaveBeenCalledTimes(2)
})

it("shows only this card's received reports, saved actions and rejected attempts", async () => {
  network.mockResolvedValue(response(state({actions: [{request_id: "a1", kind: "dispatch", service_name: "Водоканал", who_accepted: "Диспетчер Иванов", summary: "Утечка", at: "2026-10-19T10:01:00Z"}], exercise: {source: "prepared", contacts: [], outgoing: {}, incoming: null, due_at: null, processed_reports: 0, total_reports: 0, events: [
    {id: "r1", kind: "answered", card_id: "c1", at: "2026-10-19T10:02:00Z", service_name: "Водоканал", text: "Бригада прибыла"},
    {id: "m1", kind: "mistake", card_id: "c1", at: "2026-10-19T10:03:00Z", message: "Нет принятого доклада", action: {status: "Работы завершены"}},
    {id: "future", kind: "incoming_scheduled", card_id: "c1", at: "2026-10-19T10:04:00Z", text: "Скрытое будущее сообщение"},
  ]}})))
  render(<StudentAttemptReview/>)
  expect(await screen.findByText(/Исполнитель: Диспетчер Иванов/)).toBeInTheDocument()
  expect(screen.getByText("Бригада прибыла")).toBeInTheDocument()
  expect(screen.getByText("Ошибочная попытка")).toBeInTheDocument()
  expect(screen.queryByText("Скрытое будущее сообщение")).not.toBeInTheDocument()
})

it("rejects another card, another session, malformed statuses, duplicate criteria and invalid time evidence", () => {
  expect(() => validateStudentReview(state({card_id: "other"}), "s1", "c1")).toThrow(/другую карточку/)
  expect(() => validateStudentReview(state({session_id: "other"}), "s1", "c1")).toThrow()
  for (const criteria of [[criterion("stage", "passed")], [criterion(), criterion()], [criterion("confirmation", "completed", [{seconds: -1}])], [criterion("confirmation", "completed", [null])]]) {
    expect(() => validateStudentReview(state({criteria}), "s1", "c1")).toThrow()
  }
  expect(() => validateStudentReview(state({exercise: {source: "prepared", contacts: [], outgoing: {}, incoming: null, due_at: null, processed_reports: 0, total_reports: 0, events: [{id: "x", kind: "answered", card_id: "other"}]}}), "s1", "c1")).toThrow()
})

it.each([403, 404, 503])("shows a %s failure without stale or fabricated results and supports retry", async code => {
  network.mockResolvedValueOnce(response({}, code)).mockResolvedValueOnce(response(state()))
  render(<StudentAttemptReview/>)
  await screen.findByRole("alert")
  expect(screen.queryByText("Не оценено")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", {name: "Повторить загрузку"}))
  expect(await screen.findByText(/Проверка по критериям недоступна/)).toBeInTheDocument()
})

it("requires a session and authentication before sending requests", async () => {
  query = new URLSearchParams()
  const view = render(<StudentAttemptReview/>)
  expect(screen.getByRole("alert")).toHaveTextContent("Не указано занятие")
  expect(network).not.toHaveBeenCalled()
  view.unmount(); localStorage.clear(); query = new URLSearchParams("session_id=s1")
  render(<StudentAttemptReview/>)
  expect(await screen.findByRole("alert")).toHaveTextContent("необходимо войти")
  expect(network).not.toHaveBeenCalled()
})

it("discards a delayed response when the selected card changes", async () => {
  let resolve!: (response: Response) => void
  network.mockImplementationOnce(() => new Promise(r => {resolve = r})).mockResolvedValueOnce(response(state({card_id: "c2", incoming_card: {...incoming, classification: {...incoming.classification, title: "Вторая карточка"}}})))
  const view = render(<StudentAttemptReview/>)
  query = new URLSearchParams("session_id=s1&card_id=c2"); view.rerender(<StudentAttemptReview/>)
  await screen.findByText("Вторая карточка")
  await act(async () => {resolve(response(state()))})
  expect(screen.queryByText("Авария водопровода")).not.toBeInTheDocument()
  expect(screen.getByRole("link", {name: "Открыть сохранённую карточку"})).toHaveAttribute("href", "/dds?session_id=s1&ticket_id=t1&card_id=c2")
  expect(network.mock.calls[0][1]?.signal?.aborted).toBe(true)
})

it("links other saved cards by their exact identities", async () => {
  network.mockResolvedValue(response(state({cards: [{card_id: "c1", ticket_id: "t1", status: "completed"}, {card_id: "c2", ticket_id: "t2", status: "active"}]})))
  render(<StudentAttemptReview/>)
  const navigation = await screen.findByRole("navigation", {name: "Карточки занятия"})
  expect(within(navigation).getByRole("link", {name: "Карточка 2"})).toHaveAttribute("href", "/student/review?session_id=s1&card_id=c2")
})

it("preserves old saved errors without treating them as five-criterion results", async () => {
  network.mockImplementation(async url => response(url.includes("students/me/lessons") ? [{session_id: "s1", tickets: [
    {card_id: "other", errors_count: 9, errors: ["Замечание другой карточки"]},
    {card_id: "c1", errors_count: 2, errors: ["Не записан исполнитель"]},
  ]}] : state()))
  render(<StudentAttemptReview/>)
  expect(await screen.findByText(/Сохранённых ошибок: 2/)).toBeInTheDocument()
  expect(screen.getByText("Не записан исполнитель")).toBeInTheDocument()
  expect(screen.queryByText("Замечание другой карточки")).not.toBeInTheDocument()
  expect(screen.getAllByText("Не оценено")).toHaveLength(5)
})

it("does not turn a history-loading failure into zero errors", async () => {
  network.mockImplementation(async url => response(url.includes("students/me/lessons") ? {} : state(), url.includes("students/me/lessons") ? 503 : 200))
  render(<StudentAttemptReview/>)
  expect(await screen.findByText(/Сохранённые замечания из истории не удалось загрузить/)).toBeInTheDocument()
  expect(screen.queryByText(/Сохранённых ошибок: 0/)).not.toBeInTheDocument()
})

it("opens the existing next-training dialog lazily without starting a session", async () => {
  network.mockImplementation(async url => response(url.includes("training/tickets") ? [{ticket_id: "t1", title: "Учебное задание", category: "ЖКХ", complexity: 1}] : url.includes("students/me/lessons") ? [] : state()))
  render(<StudentAttemptReview/>); await screen.findByText(/Проверка по критериям недоступна/)
  expect(network).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole("button", {name: "Выбрать следующую тренировку"}))
  expect(await screen.findByRole("checkbox", {name: /Учебное задание/})).toBeInTheDocument()
  expect(screen.getByRole("dialog")).toBeInTheDocument()
  expect(network.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true)
})

it("offers a review after finishing and preserves the exact completed card", async () => {
  render(<DDSAssignedConsole sessionId="s1"/>)
  expect(await screen.findByRole("link", {name: "Разбор карточки"})).toHaveAttribute("href", "/student/review?session_id=s1&card_id=c1")
})
