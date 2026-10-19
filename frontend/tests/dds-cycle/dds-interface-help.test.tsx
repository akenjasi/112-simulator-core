import React from "react"
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import DDSPage from "@/app/dds/page"
import {DDSAssignedConsole} from "@/components/dispatcher/dds-assigned-console"
import {DDSHelp} from "@/components/dds-help"
import {DDS_HELP} from "@/lib/dds-interface-help"
import {dispatcherData} from "@/lib/dispatcher-data"

let query = "guide=true"
let tour: {run: boolean; steps: {target: string; content: string; before?: () => Promise<void>}[]; options: {blockTargetInteraction: boolean}} | null = null
const navigation = vi.hoisted(() => ({push: vi.fn(), replace: vi.fn()}))
vi.mock("next/navigation", () => ({useSearchParams: () => new URLSearchParams(query), useRouter: () => navigation}))
vi.mock("react-joyride", () => ({
  STATUS: {FINISHED: "finished", SKIPPED: "skipped"},
  Joyride: (props: any) => {
    tour = props
    return props.run ? <div role="dialog" aria-label="Пошаговое знакомство">
      <p>{props.steps[0]?.content}</p>
      <button onClick={() => props.onEvent({status: "skipped"})}>Пропустить</button>
      <button onClick={() => props.onEvent({status: "finished"})}>Завершить знакомство</button>
    </div> : null
  },
}))

const card = {...dispatcherData, description: "Сохранённая карточка", services: [{
  id: "water", name: "Аварийная служба", time: "10:00", status: "Получена службой", history: [],
}]}
const state = (extra = {}) => ({session_id: "s1", lesson_id: "l1", ticket_id: "t1", card_id: "c1",
  session_status: "ACTIVE", lesson_status: "ACTIVE", incoming_card: card, actions: [],
  started_at: "2026-01-01T12:00:00Z", score: null, submitted_at: null, ...extra})
const response = (value: unknown) => ({ok: true, json: async () => value})
const flush = async () => {await act(async () => {for (let i = 0; i < 8; i++) await Promise.resolve()})}
const prepareStep = async (target: string) => {
  const step = tour?.steps.find(step => step.target === `[data-dds-help="${target}"]`)
  expect(step).toBeTruthy()
  await act(async () => {await step?.before?.()})
}
let network: ReturnType<typeof vi.fn>

beforeEach(() => {
  query = "guide=true"; tour = null; navigation.replace.mockClear()
  localStorage.setItem("token", "interface-help-test")
  network = vi.fn().mockResolvedValue(response(state()))
  vi.stubGlobal("fetch", network)
})
afterEach(() => {cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear()})

describe("Interface familiarization", () => {
  it("opens the current workspace without creating a lesson, playing audio, or saving actions", async () => {
    const audio = vi.fn(), audioContext = vi.fn(); vi.stubGlobal("Audio", audio); vi.stubGlobal("AudioContext", audioContext)
    render(<DDSPage />); await flush()
    expect(screen.getByTestId("dds-interface-guide")).toBeTruthy()
    expect(screen.getByRole("heading", {name: "Знакомство с интерфейсом ДДС"})).toBeTruthy()
    expect(screen.queryByRole("dialog", {name: "Учебный телефон ДДС"})).toBeNull()
    await prepareStep("dial")
    expect(screen.getByRole("button", {name: "Набрать"})).toBeDisabled()
    expect(screen.getByRole("button", {name: "Сохранено"})).toBeDisabled()
    expect(screen.getByRole("button", {name: "Отработана"})).toBeDisabled()
    fireEvent.click(screen.getByRole("button", {name: "Набрать"}))
    fireEvent.click(screen.getByRole("button", {name: "Сохранено"}))
    expect(network).not.toHaveBeenCalled(); expect(audio).not.toHaveBeenCalled(); expect(audioContext).not.toHaveBeenCalled()
    expect(navigation.replace).not.toHaveBeenCalled()
    expect(screen.getByRole("link", {name: "В личный кабинет"})).toHaveAttribute("href", "/student/profile")
    expect(tour?.options.blockTargetInteraction).toBe(true)
    expect(tour?.steps.some(step => step.target === '[data-dds-help="record"]')).toBe(true)
    expect(screen.getByLabelText("Кто доложил")).toHaveValue("Учебный начальник бригады")
    expect(screen.getByLabelText("Номер бригады в докладе")).toHaveValue("УЧ-001")
    await prepareStep("directory")
    expect(screen.getByRole("button", {name: "0000"})).toBeDisabled()
    expect(screen.getByLabelText("Справочник телефонов")).toBeTruthy()
    await prepareStep("record")
    expect(screen.getByLabelText("Содержание доклада")).toBeDisabled()
    await prepareStep("complete")
    expect(screen.queryByRole("dialog", {name: "Учебный телефон ДДС"})).toBeNull()
    expect(network).not.toHaveBeenCalled(); expect(audio).not.toHaveBeenCalled(); expect(audioContext).not.toHaveBeenCalled()
  })

  it("allows finishing, repeating, and Escape with focus restored to its launcher", async () => {
    render(<DDSPage />); await flush()
    fireEvent.click(screen.getByRole("button", {name: "Завершить знакомство"}))
    const launcher = screen.getByRole("button", {name: "Повторить знакомство"})
    await waitFor(() => expect(launcher).toHaveFocus())
    fireEvent.click(launcher)
    expect(screen.getByRole("dialog", {name: "Пошаговое знакомство"})).toBeTruthy()
    fireEvent.keyDown(document, {key: "Escape"})
    await waitFor(() => expect(launcher).toHaveFocus())
    expect(screen.queryByRole("dialog", {name: "Пошаговое знакомство"})).toBeNull()
    fireEvent.click(launcher); fireEvent.click(screen.getByRole("button", {name: "Пропустить"}))
    expect(launcher).not.toBeDisabled(); expect(network).not.toHaveBeenCalled()
  })

  it("cannot substitute a real session with the guide query flag", async () => {
    query = "guide=true&session_id=s1"
    render(<DDSPage />); await flush()
    expect(screen.queryByTestId("dds-interface-guide")).toBeNull()
    expect(screen.getByText("Сохранённая карточка")).toBeTruthy()
    expect(network.mock.calls[0][0]).toBe("/api/dds/sessions/s1")
  })

  it("preserves drafts and service selection across help without posting anything", async () => {
    network.mockResolvedValue(response(state({actions: [{request_id: "accepted", kind: "status", service_name: "Аварийная служба", status: "Принята", at: "2026-01-01T12:00:01Z"}]})))
    render(<DDSAssignedConsole sessionId="s1" />); await flush()
    fireEvent.change(screen.getByLabelText("Кто принял"), {target: {value: "Учебный дежурный"}})
    fireEvent.change(screen.getByLabelText("Суть сообщения"), {target: {value: "Черновик поручения"}})
    fireEvent.click(screen.getByRole("button", {name: "Помощь по интерфейсу"}))
    expect(screen.getByRole("dialog", {name: "Пошаговое знакомство"})).toHaveTextContent("Время занятия продолжает идти")
    expect(screen.getByRole("button", {name: "Сохранить"})).toBeDisabled()
    fireEvent.click(screen.getByRole("button", {name: "Сохранить"}))
    fireEvent.keyDown(document, {key: "Escape"})
    expect(screen.getByLabelText("Кто принял")).toHaveValue("Учебный дежурный")
    expect(screen.getByLabelText("Суть сообщения")).toHaveValue("Черновик поручения")
    expect(network.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true)
    expect(tour?.steps.some(step => step.target === '[data-dds-help="directory"]')).toBe(false)
  })

  it("shows phone steps in the new portal and restores its directory, number and three-field draft", async () => {
    const contact = {id: "a", service_name: "Аварийная служба", number: "7000", full_name: "", position: "", brigade: ""}
    network.mockResolvedValue(response(state({exercise: {
      version: 2, presentation: "audio_only", source: "prepared", contacts: [contact], notes: {},
      incoming: {id: "departure", contact, ringing: false, direction: "outgoing", text: null, audio: null},
      outgoing: {[contact.service_name]: {contact_id: "a", call_id: "call-a", report_id: "departure", text: null, audio: null}},
      events: [{id: "call-a", kind: "dialed", service_name: contact.service_name, report_id: "departure", at: "now", card_id: "c1"}],
      due_at: null, processed_reports: 0, total_reports: 4,
    }, actions: [{request_id: "accepted", kind: "status", service_name: contact.service_name, status: "Принята", at: "now"}]})))
    render(<DDSAssignedConsole sessionId="s1" />); await flush()
    fireEvent.click(screen.getByRole("button", {name: "☎ Телефон"}))
    fireEvent.change(screen.getByLabelText("Номер учебного телефона"), {target: {value: "7000"}})
    fireEvent.change(screen.getByLabelText("Кто доложил"), {target: {value: "Черновик ФИО"}})
    fireEvent.change(screen.getByLabelText("Номер бригады в докладе"), {target: {value: "17"}})
    fireEvent.change(screen.getByLabelText("Содержание доклада"), {target: {value: "Бригада выехала"}})
    fireEvent.click(screen.getByRole("button", {name: "Справочник"}))
    fireEvent.click(screen.getByRole("button", {name: "Помощь по интерфейсу"}))
    expect(screen.queryByRole("dialog", {name: "Учебный телефон ДДС"})).toBeNull()
    await prepareStep("directory")
    expect(screen.getByLabelText("Справочник телефонов")).toBeTruthy()
    await prepareStep("record")
    expect(screen.getByLabelText("Кто доложил")).toBeDisabled()
    expect(screen.getByLabelText("Кто доложил")).toHaveValue("Черновик ФИО")
    expect(screen.getByRole("button", {name: "Сохранить телефонограмму"})).toBeDisabled()
    await prepareStep("complete")
    expect(screen.queryByRole("dialog", {name: "Учебный телефон ДДС"})).toBeNull()
    fireEvent.keyDown(document, {key: "Escape"})
    expect(screen.getByLabelText("Справочник телефонов")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", {name: "Телефон"}))
    expect(screen.getByLabelText("Номер учебного телефона")).toHaveValue("7000")
    expect(screen.getByLabelText("Кто доложил")).toHaveValue("Черновик ФИО")
    expect(screen.getByLabelText("Номер бригады в докладе")).toHaveValue("17")
    expect(screen.getByLabelText("Содержание доклада")).toHaveValue("Бригада выехала")
    expect(network.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true)
  })

  it("continues the server-based SLA clock while lesson help is open", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T12:00:15Z"))
    render(<DDSAssignedConsole sessionId="s1" />); await flush()
    expect(screen.getByText("15 сек")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", {name: "Помощь по интерфейсу"}))
    await act(async () => {vi.advanceTimersByTime(2000)})
    expect(screen.getByText("13 сек")).toBeTruthy()
    expect(network).toHaveBeenCalledTimes(1)
  })

  it("cannot open help during a save or while its result remains uncertain", async () => {
    let complete!: (value: unknown) => void
    network.mockResolvedValueOnce(response(state({actions: [{request_id: "accepted", kind: "status", service_name: "Аварийная служба", status: "Принята", at: "2026-01-01T12:00:01Z"}]})))
      .mockImplementationOnce(() => new Promise(resolve => {complete = resolve}))
    render(<DDSAssignedConsole sessionId="s1" />); await flush()
    fireEvent.change(screen.getByLabelText("Кто принял"), {target: {value: "Дежурный"}})
    fireEvent.change(screen.getByLabelText("Суть сообщения"), {target: {value: "Поручение"}})
    fireEvent.click(screen.getByRole("button", {name: "Сохранить"})); await flush()
    const help = screen.getByRole("button", {name: "Помощь по интерфейсу"})
    expect(help).toBeDisabled()
    await act(async () => complete({ok: false, status: 503, json: async () => ({detail: "Недоступно"})}))
    expect(screen.getByRole("button", {name: "Повторить сохранение"})).toBeTruthy()
    expect(help).toBeDisabled()
    fireEvent.click(help)
    expect(screen.queryByRole("dialog", {name: "Пошаговое знакомство"})).toBeNull()
  })

  it("opens contextual help by focus or touch without triggering a working control", async () => {
    const parent = vi.fn()
    render(<div onClick={parent}><DDSHelp topic="order" /></div>)
    const trigger = screen.getByRole("button", {name: "Справка: Номер наряда"})
    fireEvent.click(trigger)
    expect(await screen.findByRole("tooltip")).toHaveTextContent(DDS_HELP.order.text)
    expect(parent).not.toHaveBeenCalled()
    fireEvent.keyDown(trigger, {key: "Escape"})
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull())
    act(() => {trigger.blur(); trigger.focus()})
    expect(await screen.findByRole("tooltip")).toHaveTextContent(DDS_HELP.order.text)
    expect(parent).not.toHaveBeenCalled()
  })
})
