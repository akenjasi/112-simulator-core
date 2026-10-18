/** Independent review: exercise the real polling interval, rather than manual refresh. */
import React from "react"
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react"
import {afterEach, beforeEach, expect, it, vi} from "vitest"
import {DDSAssignments} from "@/components/dispatcher/dds-assignments"

vi.mock("next/link", () => ({default: ({children, ...props}: any) => <a {...props}>{children}</a>}))
const incoming = {
  phones: {aon: "000", provided: "000", onSite: ""}, incident: {number: "REVIEW", savedAt: "", operator: "112"},
  caller: {name: "Учебный", role: "очевидец", address: "Учебная улица, 1"}, description: "Учебная карточка",
  statuses: {injured: "нет", ambulanceRefusal: "нет", blocked: "нет"}, emergency: {cs: false, cp: false},
  classification: {section: "ЖКХ", title: "Водопровод", class: "Авария"},
  services: [{id: "water", name: "Аварийная служба", time: "10:00", status: "Получена службой", isRejected: false, history: []}],
}
const session = (index: number, archived = false) => ({
  session_id: `review-${index}`, lesson_id: `lesson-${index}`, ticket_id: `ticket-${index}`, card_id: `card-${index}`,
  session_status: archived ? "COMPLETED" : "ACTIVE", lesson_status: archived ? "COMPLETED" : "ACTIVE",
  started_at: `2026-10-18T08:${String(index).padStart(2, "0")}:00Z`, incoming_card: incoming, actions: [],
  submitted_at: archived ? "2026-10-18T09:00:00Z" : null, score: null,
})
const reply = (rows: unknown) => new Response(JSON.stringify(rows), {status: 200})
const links = () => screen.queryAllByRole("link").map(link => link.getAttribute("href"))
const flush = async () => {await act(async () => {for (let index = 0; index < 15; index++) await Promise.resolve()})}

beforeEach(() => {
  localStorage.setItem("token", "review-token")
  vi.useFakeTimers()
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
})
afterEach(() => {cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear()})

it("preserves both page selections and the history tab across actual five-second polls", async () => {
  const rows = [...Array.from({length: 8}, (_, index) => session(index)),
    ...Array.from({length: 7}, (_, index) => session(index + 20, true))]
  const network = vi.fn(async () => reply(rows))
  vi.stubGlobal("fetch", network)
  render(<DDSAssignments />)
  await flush()
  fireEvent.click(screen.getByRole("button", {name: "Следующая"}))
  const activePageTwo = links()
  expect(activePageTwo).toHaveLength(3)
  await act(async () => {await vi.advanceTimersByTimeAsync(5000)})
  expect(network).toHaveBeenCalledTimes(2)
  expect(links()).toEqual(activePageTwo)

  fireEvent.click(screen.getByRole("tab", {name: /История/}))
  fireEvent.click(screen.getByRole("button", {name: "Следующая"}))
  const historyPageTwo = links()
  expect(historyPageTwo).toHaveLength(2)
  await act(async () => {await vi.advanceTimersByTimeAsync(5000)})
  expect(network).toHaveBeenCalledTimes(3)
  expect(screen.getByRole("tab", {name: /История/})).toHaveAttribute("aria-selected", "true")
  expect(links()).toEqual(historyPageTwo)
  fireEvent.click(screen.getByRole("tab", {name: /Текущие/}))
  expect(links()).toEqual(activePageTwo)
})

it("ignores an old response after polling has loaded a newer assignment list", async () => {
  let finishOld!: (response: Response) => void
  const network = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => {finishOld = resolve}))
    .mockImplementation(async () => reply([session(2)]))
  vi.stubGlobal("fetch", network)
  render(<DDSAssignments />)
  await flush()
  await act(async () => {await vi.advanceTimersByTimeAsync(5000)})
  expect(links()).toHaveLength(1)
  expect(links()[0]).toContain("session_id=review-2")
  await act(async () => {finishOld(reply([session(1)]))})
  await flush()
  expect(links()).toHaveLength(1)
  expect(links()[0]).toContain("session_id=review-2")
})
