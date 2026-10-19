import React from "react"
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react"
import {afterEach, beforeEach, expect, it, vi} from "vitest"
import {DDSAssignedConsole} from "@/components/dispatcher/dds-assigned-console"

vi.mock("next/link", () => ({default: ({children, ...props}: any) => <a {...props}>{children}</a>}))
vi.mock("@/components/dispatcher/top-bar", () => ({TopBar: () => null}))
vi.mock("@/components/dispatcher/caller-panel", () => ({CallerPanel: () => null}))
vi.mock("@/components/dispatcher/incident-panel", () => ({IncidentPanel: () => null}))
vi.mock("@/components/dispatcher/dispatch-panel", () => ({DispatchPanel: () => null}))
vi.mock("@/components/dispatcher/services-bar", () => ({ServicesBar: ({disabled, onStatusChange}: any) =>
  <button disabled={disabled} onClick={() => onStatusChange("01 Пожарные", "Принята", "", "П-101")}>Сохранить статус</button>}))

const incoming = {phones: {aon: "", provided: ""}, incident: {number: "1", savedAt: "", operator: "112"},
  caller: {name: "", role: "", address: ""}, description: "Пожар",
  statuses: {injured: "нет", ambulanceRefusal: "нет", blocked: "нет"}, emergency: {cs: false, cp: false},
  classification: {section: "Пожар", title: "Пожар", class: "Пожар"},
  services: [{id: "fire", name: "01 Пожарные", status: "Получена службой", history: []}]}
const state = (extra = {}) => ({session_id: "s1", lesson_id: "l1", ticket_id: "t1", card_id: "c1",
  session_status: "ACTIVE", lesson_status: "ACTIVE", incoming_card: incoming, actions: [],
  submitted_at: null, score: null, readonly: false, ...extra})
const response = (data: unknown, status = 200) => ({ok: status < 400, status, json: async () => data}) as Response
const flush = async () => {await act(async () => {for (let i = 0; i < 10; i++) await Promise.resolve()})}
let network: ReturnType<typeof vi.fn>
beforeEach(() => {localStorage.setItem("token", "tester-exam"); network = vi.fn(); vi.stubGlobal("fetch", network)})
afterEach(() => {cleanup(); localStorage.clear(); vi.unstubAllGlobals()})

it("exam timeout 409 does not leave controls saving; clear message explains reason and refresh updates to terminal state", async () => {
  network.mockResolvedValueOnce(response(state()))
    .mockResolvedValueOnce(response({detail: {code: "DDS_EXAM_TIME_EXPIRED", message: "Время выполнения экзамена истекло"}}, 409))
    .mockResolvedValueOnce(response(state({is_expired: true, time_remaining_seconds: 0, session_status: "COMPLETED", readonly: true, stop_reason: "exam_timeout"})))
  render(<DDSAssignedConsole sessionId="s1"/>); await flush()
  fireEvent.click(screen.getByRole("button", {name: "Сохранить статус"})); await flush()
  expect(screen.getByRole("alert")).toHaveTextContent("Время выполнения экзамена истекло")
  expect(screen.getByRole("button", {name: "Сохранить статус"})).not.toBeDisabled()
  expect(screen.getByRole("button", {name: "Завершить смену"})).not.toBeDisabled()
  expect(screen.queryByRole("button", {name: "Повторить сохранение"})).toBeNull()
  fireEvent.click(screen.getByRole("button", {name: "Обновить"})); await flush()
  expect(network).toHaveBeenCalledTimes(3)
  expect(screen.queryByRole("alert")).toBeNull()
  expect(screen.getByRole("button", {name: "Сохранить статус"})).toBeDisabled()
  expect(screen.getByText(/Время выполнения экзамена истекло/)).toBeTruthy()
})

it("cadet can explicitly finish after exam timeout instead of being trapped on the card", async () => {
  network.mockResolvedValueOnce(response(state()))
    .mockResolvedValueOnce(response({detail: "Время выполнения экзамена истекло"}, 409))
    .mockResolvedValueOnce(response(state({session_status: "COMPLETED", readonly: true, stop_reason: "cadet"})))
  render(<DDSAssignedConsole sessionId="s1"/>); await flush()
  fireEvent.click(screen.getByRole("button", {name: "Сохранить статус"})); await flush()
  fireEvent.click(screen.getByRole("button", {name: "Завершить смену"})); await flush()
  expect(network.mock.calls[2][0]).toBe("/api/dds/sessions/s1/finish")
  expect(screen.getByText(/Выполнение не завершено/)).toBeTruthy()
  expect(screen.getByRole("button", {name: "Сохранить статус"})).toBeDisabled()
})
