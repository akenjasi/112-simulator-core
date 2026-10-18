/** Independent lobby acceptance for the Gemini handoff; no console changes allowed. */
import React from "react"
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {DDSAssignments} from "@/components/dispatcher/dds-assignments"

vi.mock("next/link", () => ({default: ({children, ...props}: any) => <a {...props}>{children}</a>}))

const incoming = {
  connection: "Установлено", phones: {aon: "000", provided: "000", onSite: ""},
  incident: {number: "WORKFLOW", savedAt: "", operator: "112"},
  caller: {name: "Учебный заявитель", role: "очевидец", address: "Учебная улица, 1"},
  description: "Назначенная карточка", statuses: {injured: "нет", ambulanceRefusal: "нет", blocked: "нет"},
  emergency: {cs: false, cp: false}, classification: {section: "ЖКХ", title: "Водопровод", class: "Авария", visClass: ""},
  services: [{id: "water", name: "Аварийная служба", time: "10:00", status: "Получена службой", isRejected: false, history: []}],
}
function session(index: number, archived = false) {
  return {
    session_id: `session-${index}`, lesson_id: `lesson-${index}`, ticket_id: `ticket-${index}`, card_id: `card-${index}`,
    session_status: archived ? "COMPLETED" : "ACTIVE", lesson_status: archived ? "COMPLETED" : "ACTIVE",
    incoming_card: {...incoming, incident: {...incoming.incident, number: `${archived ? "ARCHIVE" : "ACTIVE"}-${index}`}},
    actions: [], submitted_at: archived ? "2026-10-18T09:00:00Z" : null, score: null,
    total_cards: 1, current_index: 0, completed_cards: archived ? 1 : 0,
    readonly: archived, can_complete: false,
    started_at: `2026-10-18T08:${String(index % 60).padStart(2, "0")}:00Z`,
  }
}
const reply = (body: unknown) => new Response(JSON.stringify(body), {status: 200, headers: {"Content-Type": "application/json"}})
const workLinks = () => screen.queryAllByRole("link").filter(link => link.getAttribute("href")?.startsWith("/dds?"))
const linkedSessions = () => workLinks().map(link => new URL(link.getAttribute("href")!, "http://test").searchParams.get("session_id"))
let network: ReturnType<typeof vi.fn>
beforeEach(() => {localStorage.setItem("token", "workflow-cadet-token"); network = vi.fn(); vi.stubGlobal("fetch", network)})
afterEach(() => {cleanup(); localStorage.clear(); vi.unstubAllGlobals()})

describe("Assigned DDS lesson lobby contract", () => {
  it("keeps old lessons out of the default list and limits visible work links to five", async () => {
    network.mockImplementation(async () => reply([
      ...Array.from({length: 8}, (_, index) => session(index)),
      ...Array.from({length: 20}, (_, index) => session(index + 20, true)),
    ]))
    render(<DDSAssignments />)
    await waitFor(() => expect(workLinks().length).toBeGreaterThan(0))
    expect(workLinks().length).toBeLessThanOrEqual(5)
    expect(document.body.textContent).not.toContain("ARCHIVE-")
    expect(linkedSessions().every(id => Number(id?.split("-")[1]) < 8)).toBe(true)
  })

  it("makes the remaining active lessons reachable with pagination", async () => {
    network.mockImplementation(async () => reply(Array.from({length: 8}, (_, index) => session(index))))
    render(<DDSAssignments />)
    await waitFor(() => expect(workLinks().length).toBeGreaterThan(0))
    const firstPage = new Set(linkedSessions())
    const next = screen.getByRole("button", {name: /следующ|далее|впер[её]д/i})
    fireEvent.click(next)
    await waitFor(() => expect(linkedSessions().some(id => !firstPage.has(id))).toBe(true))
    expect(workLinks().length).toBeLessThanOrEqual(5)
    expect(new Set([...firstPage, ...linkedSessions()]).size).toBe(8)
  })

  it("keeps completed lessons in an explicitly opened, paginated history", async () => {
    network.mockImplementation(async () => reply(Array.from({length: 12}, (_, index) => session(index + 20, true))))
    render(<DDSAssignments />)
    await waitFor(() => expect(network).toHaveBeenCalled())
    await act(async () => {for (let index = 0; index < 8; index++) await Promise.resolve()})
    expect(workLinks()).toHaveLength(0)
    const history = screen.queryByRole("tab", {name: /история|заверш[её]нн/i})
      || screen.getByRole("button", {name: /история|заверш[её]нн/i})
    fireEvent.click(history)
    await waitFor(() => expect(workLinks().length).toBeGreaterThan(0))
    expect(workLinks().length).toBeLessThanOrEqual(5)
    expect(screen.getByRole("button", {name: /следующ|далее|впер[её]д/i})).toBeEnabled()
  })

  it("opens the exact saved attempt and current ticket with authorization, without creating a replacement", async () => {
    const saved = {...session(1), ticket_id: "next-ticket", current_index: 1, total_cards: 3, completed_cards: 1}
    network.mockImplementation(async () => reply([saved]))
    render(<DDSAssignments />)
    await waitFor(() => expect(workLinks()).toHaveLength(1))
    const target = new URL(workLinks()[0].getAttribute("href")!, "http://test")
    expect(target.searchParams.get("session_id")).toBe("session-1")
    expect(target.searchParams.get("ticket_id")).toBe("next-ticket")
    expect(new Headers(network.mock.calls[0][1].headers).get("Authorization")).toBe("Bearer workflow-cadet-token")
    expect(network.mock.calls.every(([, init]) => (init?.method || "GET") === "GET")).toBe(true)
    expect(document.body.textContent).not.toMatch(/100\s*балл/)
  })

  it("can refresh newly started teacher lessons without losing the existing attempt", async () => {
    let rows = [session(1)]
    network.mockImplementation(async () => reply(rows))
    render(<DDSAssignments />)
    await waitFor(() => expect(workLinks()).toHaveLength(1))
    rows = [session(2), session(1)]
    fireEvent.click(screen.getByRole("button", {name: /обновить/i}))
    await waitFor(() => expect(workLinks()).toHaveLength(2))
    expect(new Set(linkedSessions())).toEqual(new Set(["session-1", "session-2"]))
  })
})
