import React from "react"
import {act, cleanup, fireEvent, render, screen, within} from "@testing-library/react"
import {afterEach, beforeEach, expect, it, vi} from "vitest"
import {StudentAttemptReview, PersonalRecommendations, LessonPersonalRecommendations} from "@/components/student/student-review"
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

it("shows accepted inaccurate notes as content errors, with the trainee's original record", async () => {
  const mistake = {id: "content-error", kind: "mistake", card_id: "c1", at: "2026-10-19T10:03:00Z",
    blocking: false, message: "В записи доклада неверно записано ФИО докладчика.",
    action: {status: "Начало реагирования", note: "Пупкин, бригада 99"}}
  network.mockResolvedValue(response(state({criteria: [criterion("accuracy", "not_completed", [mistake])],
    exercise: {source: "prepared", contacts: [], outgoing: {}, events: [mistake]}})))
  render(<StudentAttemptReview/>)
  expect(await screen.findByText("Ошибка в записи · действие сохранено")).toBeInTheDocument()
  expect(screen.getByText("Не выполнено")).toBeInTheDocument()
  expect(screen.getAllByText(/Запись доклада: Пупкин, бригада 99/)).toHaveLength(2)
  expect(screen.getAllByText(/неверно записано ФИО докладчика/)).toHaveLength(2)
  expect(screen.queryByText("Ошибочная попытка")).not.toBeInTheDocument()
})

const assessment = (extra: Record<string, unknown> = {}) => ({source: "rules", version: 1, status: "needs_review",
  completed_criteria: 3, corrected_criteria: 1, total_criteria: 5, mistakes_count: 2,
  recommendations: [{criterion: "accuracy", text: "Сверяйте номер бригады с услышанным сообщением."}], ...extra})

it("shows immediate recommendations even when teacher metadata is unavailable", async () => {
  network.mockImplementation(async url => url.includes("students/me/lessons") ? response({}, 503) : response(state({assessment: assessment()})))
  render(<StudentAttemptReview/>)
  const block = await screen.findByRole("region", {name: "Автоматический разбор"})
  expect(block).toHaveTextContent("Выполнено критериев: 4 из 5; после исправления: 1. Ошибок в протоколе: 2.")
  expect(block).toHaveTextContent("Сверяйте номер бригады с услышанным сообщением.")
  expect(block).not.toHaveTextContent("ИИ")
  expect(screen.queryByText(/Все пять критериев выполнены/)).not.toBeInTheDocument()
  expect(network.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true)
})

it.each([
  ["passed", "Все пять критериев выполнены без зафиксированных ошибок"],
  ["incomplete", "Карточка не завершена"],
  ["insufficient_data", "Не все критерии оценены"],
  ["in_progress", "Предварительный разбор"],
])("renders the %s assessment with its real limitation", async (status, text) => {
  network.mockResolvedValue(response(state({assessment: assessment({status, ...(status === "passed" ? {completed_criteria: 5, corrected_criteria: 0, mistakes_count: 0, recommendations: []} : {})})})))
  render(<StudentAttemptReview/>)
  expect(await screen.findByRole("region", {name: "Автоматический разбор"})).toHaveTextContent(text)
})

it("displays the trainee's saved incoming note in audio mode", async () => {
  network.mockResolvedValue(response(state({exercise: {source: "prepared", contacts: [], outgoing: {}, events: [
    {id: "call", kind: "answered", card_id: "c1", text: null},
    {id: "note", kind: "note", card_id: "c1", note: "Петров Пётр Петрович, бригада 2 прибыла"},
  ]}})))
  render(<StudentAttemptReview/>)
  expect(await screen.findByText("Входящий доклад принят.")).toBeInTheDocument()
  expect(screen.getByText("Запись доклада: Петров Пётр Петрович, бригада 2 прибыла")).toBeInTheDocument()
  expect(screen.queryByText("Текст сообщения не сохранён.")).not.toBeInTheDocument()
})

it("rejects malformed automatic assessments without fabricating feedback", () => {
  for (const extra of [{source: "llm"}, {status: "unknown"}, {mistakes_count: -1}, {total_criteria: 0},
    {completed_criteria: 5, corrected_criteria: 1}, {status: "passed"}, {recommendations: [{criterion: "unknown", text: "Совет"}]}]) {
    expect(() => validateStudentReview(state({assessment: assessment(extra)}), "s1", "c1")).toThrow(/автоматический разбор/)
  }
})

const personalReport = (extra: Record<string, unknown> = {}) => ({session_id: "s1", status: "completed",
  report_text: "Потренируйтесь сверять этап с принятым докладом.", model_used: "dds-qwen",
  snapshot_at: "2026-10-19T21:15:00Z", ...extra})

it("reads saved personal AI recommendations without starting inference", async () => {
  network.mockResolvedValue(response(personalReport()))
  render(<PersonalRecommendations sessionId="s1"/>)
  expect(await screen.findByText("Потренируйтесь сверять этап с принятым докладом.")).toBeInTheDocument()
  expect(screen.getByText(/По всем вашим карточкам/)).toHaveTextContent("00:15")
  expect(network).toHaveBeenCalledTimes(1)
  expect(network.mock.calls[0][0]).toBe("/api/ai-analytics/sessions/s1/recommendation")
  expect(network.mock.calls[0][1]?.method).toBeUndefined()
})

it("polls an immediate generation and displays its completed result", async () => {
  vi.useFakeTimers()
  try {
    network.mockResolvedValueOnce(response(personalReport({status: "generating", report_text: null})))
      .mockResolvedValue(response(personalReport()))
    render(<PersonalRecommendations sessionId="s1"/>)
    await act(async () => {await Promise.resolve()})
    expect(screen.getByRole("status")).toHaveTextContent("ИИ анализирует занятие")
    await act(async () => {await vi.advanceTimersByTimeAsync(2000)})
    expect(screen.getByText("Потренируйтесь сверять этап с принятым докладом.")).toBeInTheDocument()
    expect(network).toHaveBeenCalledTimes(2)
    await act(async () => {await vi.advanceTimersByTimeAsync(10000)})
    expect(network).toHaveBeenCalledTimes(2)
  } finally {vi.useRealTimers()}
})

it("waits for the teacher to finish the group lesson without a generation POST", async () => {
  network.mockResolvedValue(response(personalReport({status: "awaiting_lesson", report_text: null})))
  render(<PersonalRecommendations sessionId="s1"/>)
  expect(await screen.findByText(/после завершения всего занятия преподавателем/)).toBeInTheDocument()
  expect(network.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false)
})

it("retries a failed personal report once while keeping saved lesson results explicit", async () => {
  let resolve!: (response: Response) => void
  network.mockImplementation(async (_url, init) => init?.method === "POST" ? new Promise(r => {resolve = r}) :
    response(personalReport({status: "failed", report_text: null})))
  render(<PersonalRecommendations sessionId="s1"/>)
  expect(await screen.findByRole("alert")).toHaveTextContent("Результаты занятия сохранены")
  const button = screen.getByRole("button", {name: "Повторить анализ ИИ"})
  fireEvent.click(button); fireEvent.click(button)
  expect(network.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1)
  expect(network.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body).toBe(JSON.stringify({retry: true}))
  await act(async () => {resolve(response(personalReport({status: "generating"}), 202))})
})

it("discards a delayed personal report after changing session", async () => {
  let resolve!: (response: Response) => void
  network.mockImplementationOnce(() => new Promise(r => {resolve = r}))
    .mockResolvedValue(response(personalReport({session_id: "s2", report_text: "Советы для второго курсанта."})))
  const view = render(<PersonalRecommendations sessionId="s1"/>)
  view.rerender(<PersonalRecommendations sessionId="s2"/>)
  expect(await screen.findByText("Советы для второго курсанта.")).toBeInTheDocument()
  await act(async () => {resolve(response(personalReport()))})
  expect(screen.queryByText("Потренируйтесь сверять этап с принятым докладом.")).not.toBeInTheDocument()
})

it("rejects another session's result instead of displaying it", async () => {
  network.mockResolvedValue(response(personalReport({session_id: "other"})))
  render(<PersonalRecommendations sessionId="s1"/>)
  expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить рекомендации")
  expect(screen.queryByText("Потренируйтесь сверять этап с принятым докладом.")).not.toBeInTheDocument()
})

it("shows individual reports to the teacher in the completed lesson", async () => {
  network.mockImplementation(async url => response(url.endsWith('/personal-reports') ? {lesson_id: "l1", reports: [
    {session_id: "s1", cadet_name: "Курсант Петров"}, {session_id: "s2", cadet_name: "Курсант Сидоров"},
  ]} : personalReport({session_id: url.includes("/s2/") ? "s2" : "s1"})))
  render(<LessonPersonalRecommendations lessonId="l1"/>)
  expect(await screen.findByText("Курсант Петров")).toBeInTheDocument()
  expect(screen.getByText("Курсант Сидоров")).toBeInTheDocument()
  expect(await screen.findAllByText("Потренируйтесь сверять этап с принятым докладом.")).toHaveLength(2)
})

it("refreshes the active lesson review after teacher completion and then stops polling", async () => {
  vi.useFakeTimers()
  try {
    network.mockResolvedValueOnce(response(state({lesson_status: "ACTIVE"})))
      .mockResolvedValue(response(state({lesson_status: "COMPLETED"})))
    render(<StudentAttemptReview/>)
    await act(async () => {await Promise.resolve()})
    expect(screen.getByText("Ваша работа завершена, общее занятие ещё идёт.")).toBeInTheDocument()
    await act(async () => {await vi.advanceTimersByTimeAsync(3000)})
    expect(screen.queryByText("Ваша работа завершена, общее занятие ещё идёт.")).not.toBeInTheDocument()
    expect(network.mock.calls.filter(([url]) => url === "/api/dds/sessions/s1/cards/c1")).toHaveLength(2)
    await act(async () => {await vi.advanceTimersByTimeAsync(10000)})
    expect(network.mock.calls.filter(([url]) => url === "/api/dds/sessions/s1/cards/c1")).toHaveLength(2)
  } finally {vi.useRealTimers()}
})

it("resumes report reads after a temporary gateway failure without regenerating the report", async () => {
  vi.useFakeTimers()
  try {
    network.mockResolvedValueOnce(response({}, 502)).mockResolvedValue(response(personalReport()))
    render(<PersonalRecommendations sessionId="s1"/>)
    await act(async () => {await Promise.resolve()})
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось загрузить рекомендации ИИ")
    await act(async () => {await vi.advanceTimersByTimeAsync(2000)})
    expect(screen.getByText("Потренируйтесь сверять этап с принятым докладом.")).toBeInTheDocument()
    expect(network).toHaveBeenCalledTimes(2)
    expect(network.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false)
  } finally {vi.useRealTimers()}
})

it("does not retry unauthorized report reads automatically", async () => {
  vi.useFakeTimers()
  try {
    network.mockResolvedValue(response({}, 403))
    render(<PersonalRecommendations sessionId="s1"/>)
    await act(async () => {await Promise.resolve()})
    await act(async () => {await vi.advanceTimersByTimeAsync(10000)})
    expect(network).toHaveBeenCalledTimes(1)
  } finally {vi.useRealTimers()}
})


it("keeps code facts visible when a short AI summary fails", async () => {
  const facts = "Карточек завершено: 2 из 2. Средний сохранённый балл: 80 из 100."
  network.mockResolvedValue(response(personalReport({status: "failed", report_text: null, facts_text: facts})))
  render(<PersonalRecommendations sessionId="s1"/>)
  expect(await screen.findByText(facts)).toBeInTheDocument()
  expect(screen.getByRole("alert")).toHaveTextContent("Результаты занятия сохранены")
  expect(network).toHaveBeenCalledTimes(1)
})
