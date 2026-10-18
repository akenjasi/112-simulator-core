import React from "react"
import {act, cleanup, fireEvent, render, screen, within} from "@testing-library/react"
import {afterEach, beforeEach, expect, it, vi} from "vitest"
import {DDSAssignedConsole} from "@/components/dispatcher/dds-assigned-console"
import {DDSSelfTraining} from "@/components/dispatcher/dds-self-training"
import {OrderedDDSTickets} from "@/components/dispatcher/ordered-dds-tickets"
import {getDDSServiceResponse} from "@/lib/dds-service-response"
import {validateDDSSessionState} from "@/lib/dds-cycle"

const push = vi.fn()
vi.mock("next/navigation", () => ({useRouter: () => ({push})}))
vi.mock("next/link", () => ({default: ({children, ...props}: any) => <a {...props}>{children}</a>}))
vi.mock("@/components/dispatcher/top-bar", () => ({TopBar: () => null}))
vi.mock("@/components/dispatcher/caller-panel", () => ({CallerPanel: ({data}: any) => <p>{data.caller.address}</p>}))
vi.mock("@/components/dispatcher/incident-panel", () => ({IncidentPanel: ({data}: any) => <p>{data.description}</p>}))
const incoming = {phones: {aon: "000", provided: "000"}, incident: {number: "1", savedAt: "", operator: "112"},
  caller: {name: "Учебный", role: "Очевидец", address: "Учебный адрес"}, description: "Первая карточка",
  statuses: {injured: "нет", ambulanceRefusal: "нет", blocked: "нет"}, emergency: {cs: false, cp: false},
  classification: {section: "ЖКХ", title: "Водопровод", class: "Авария"},
  services: [{id: "water", name: "Аварийная служба", status: "Проведение работ", history: []}]}
const state = (extra = {}) => ({session_id: "s1", lesson_id: "l1", ticket_id: "t1", card_id: "c1",
  session_status: "ACTIVE", lesson_status: "ACTIVE", incoming_card: incoming, actions: [], submitted_at: null, score: null,
  total_cards: 3, current_index: 0, completed_cards: 0, can_complete: true, readonly: false, ...extra})
const response = (data: unknown, status = 200) => ({ok: status < 400, status, json: async () => data}) as Response
const flush = async () => {await act(async () => {for (let i = 0; i < 10; i++) await Promise.resolve()})}
let network: ReturnType<typeof vi.fn>
beforeEach(() => {localStorage.setItem("token", "queue-ui-test"); network = vi.fn(); vi.stubGlobal("fetch", network); push.mockReset()})
afterEach(() => {cleanup(); localStorage.clear(); vi.unstubAllGlobals()})

it("closes only the current card, resets drafts, and restores the advanced card after reload", async () => {
  const next = state({ticket_id: "t2", card_id: "c2", current_index: 1, completed_cards: 1,
    incoming_card: {...incoming, description: "Вторая карточка"}, can_complete: false})
  network.mockResolvedValueOnce(response(state())).mockResolvedValueOnce(response(next)).mockResolvedValueOnce(response(next))
  const view = render(<DDSAssignedConsole sessionId="s1"/>); await flush()
  fireEvent.change(screen.getByRole("textbox", {name: "Кто принял"}), {target: {value: "Черновик первой"}})
  fireEvent.click(screen.getByRole("button", {name: "Отработана"})); await flush()
  expect(network.mock.calls[1][0]).toBe("/api/dds/sessions/s1/cards/c1/complete")
  expect(JSON.parse(network.mock.calls[1][1].body).request_id).toBeTruthy()
  expect(screen.getByText("Вторая карточка")).toBeTruthy()
  expect(screen.queryByDisplayValue("Черновик первой")).toBeNull()
  expect(screen.getByRole("button", {name: "Завершить смену"})).not.toBeDisabled()
  expect(screen.getByRole("button", {name: "Отработана"})).toBeDisabled()
  view.unmount(); render(<DDSAssignedConsole sessionId="s1"/>); await flush()
  expect(screen.getByText("Вторая карточка")).toBeTruthy()
  expect(network).toHaveBeenCalledTimes(3)
})

it("retries an uncertain completion with the same card and request key", async () => {
  network.mockResolvedValueOnce(response(state())).mockRejectedValueOnce(new Error("network lost"))
    .mockResolvedValueOnce(response(state({card_id: "c2", ticket_id: "t2", current_index: 1, completed_cards: 1})))
  render(<DDSAssignedConsole sessionId="s1"/>); await flush()
  fireEvent.click(screen.getByRole("button", {name: "Отработана"})); await flush()
  expect(screen.getByRole("button", {name: "Завершить смену"})).toBeDisabled()
  fireEvent.click(screen.getByRole("button", {name: "Повторить сохранение"})); await flush()
  expect(network.mock.calls[2][0]).toBe(network.mock.calls[1][0])
  expect(network.mock.calls[2][1].body).toBe(network.mock.calls[1][1].body)
  expect(document.body.textContent).toContain("Карточка 2 из 3")
})

it("uses early finish separately and does not invent a grade", async () => {
  network.mockResolvedValueOnce(response(state())).mockResolvedValueOnce(response(state({session_status: "COMPLETED", readonly: true, stop_reason: "cadet"})))
  render(<DDSAssignedConsole sessionId="s1"/>); await flush()
  fireEvent.click(screen.getByRole("button", {name: "Завершить смену"})); await flush()
  expect(network.mock.calls[1][0]).toBe("/api/dds/sessions/s1/finish")
  expect(screen.getByText(/Выполнение не завершено/)).toBeTruthy()
  expect(screen.getByRole("button", {name: "Отработана"})).toBeDisabled()
})

it("policy rejections allow correction instead of locking all controls for retry", async () => {
  network.mockResolvedValueOnce(response(state())).mockResolvedValueOnce(response({detail: {code: "DDS_CARD_NOT_READY"}}, 409))
  render(<DDSAssignedConsole sessionId="s1"/>); await flush()
  fireEvent.click(screen.getByRole("button", {name: "Отработана"})); await flush()
  expect(screen.getByRole("alert")).toHaveTextContent("Завершите работу")
  expect(screen.queryByRole("button", {name: "Повторить сохранение"})).toBeNull()
  expect(screen.getByRole("button", {name: "Завершить смену"})).not.toBeDisabled()
})

it("loads an archived card read-only and uses receipt time for the new card deadline", async () => {
  network.mockResolvedValue(response(state({readonly: true, current_index: 2,
    cards: [{card_id: "c1", ticket_id: "t1", status: "completed"}, {card_id: "c2", ticket_id: "t2", status: "completed"}, {card_id: "c3", ticket_id: "t3", status: "active"}],
    card_submitted_at: "2026-10-18T10:00:00Z"})))
  render(<DDSAssignedConsole sessionId="s1" cardId="c1"/>); await flush()
  expect(network.mock.calls[0][0]).toBe("/api/dds/sessions/s1/cards/c1")
  expect(screen.getByRole("button", {name: "Отработана"})).toBeDisabled()
  expect(document.body.textContent).toContain("Карточка 1 из 3")
  const value = validateDDSSessionState(state({incoming_card: {...incoming, services: [{...incoming.services[0], status: "Получена службой"}]},
    started_at: "2026-10-18T09:00:00Z", received_at: "2026-10-18T10:00:00Z"}))
  expect(getDDSServiceResponse(value, "Аварийная служба", Date.parse("2026-10-18T10:00:05Z")).remaining).toBe(25)
})

it("self-training retains selection across filters and submits the chosen order", async () => {
  network.mockResolvedValueOnce(response([{ticket_id: "a", title: "Вода", category: "ЖКХ", complexity: 1},
    {ticket_id: "b", title: "Газ", category: "Газ", complexity: 2}])).mockResolvedValueOnce(response(state()))
  render(<DDSSelfTraining/>); await flush()
  fireEvent.click(screen.getByRole("checkbox", {name: /Вода/}))
  fireEvent.change(screen.getByRole("combobox", {name: "Категория самостоятельной тренировки"}), {target: {value: "Газ"}})
  fireEvent.click(screen.getByRole("checkbox", {name: /Газ/}))
  fireEvent.click(screen.getByRole("button", {name: "Выше: Газ"}))
  fireEvent.click(screen.getByRole("button", {name: "Начать тренировку"})); await flush()
  expect(network.mock.calls[1][0]).toBe("/api/dds/training")
  expect(JSON.parse(network.mock.calls[1][1].body).ticket_ids).toEqual(["b", "a"])
  expect(push).toHaveBeenCalledWith("/dds/journal?focus_session_id=s1&focus_ticket_id=t1")
})

it("selection controls never submit their containing teacher form", () => {
  const submit = vi.fn(event => event.preventDefault()), change = vi.fn()
  render(<form onSubmit={submit}><OrderedDDSTickets tickets={[]} selected={[{ticket_id: "a", title: "Вода"}]} onChange={change}/></form>)
  fireEvent.click(screen.getByRole("button", {name: "Убрать: Вода"}))
  expect(change).toHaveBeenCalledWith([]); expect(submit).not.toHaveBeenCalled()
})
