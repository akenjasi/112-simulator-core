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

function session(index: number, archived = false, isTraining = false) {
  return {
    session_id: `session-${index}`, lesson_id: `lesson-${index}`, ticket_id: `ticket-${index}`, card_id: `card-${index}`,
    session_status: archived ? "COMPLETED" : "ACTIVE", lesson_status: archived ? "COMPLETED" : "ACTIVE",
    incoming_card: {...incoming, incident: {...incoming.incident, number: `${isTraining ? "SELF" : archived ? "ARCHIVE" : "ACTIVE"}-${index}`}},
    actions: [], submitted_at: archived ? "2026-10-18T09:00:00Z" : null, score: null,
    total_cards: 1, current_index: 0, completed_cards: archived ? 1 : 0,
    readonly: archived, can_complete: false,
    started_at: `2026-10-18T08:${String(index % 60).padStart(2, "0")}:00Z`,
    is_self_training: isTraining,
    card_pool_source: isTraining ? "self_training" : null,
  }
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: {"Content-Type": "application/json"}})

const workLinks = () => screen.queryAllByRole("link").filter(link => link.getAttribute("href")?.startsWith("/dds?"))
const linkedSessions = () => workLinks().map(link => new URL(link.getAttribute("href")!, "http://test").searchParams.get("session_id"))

let network: ReturnType<typeof vi.fn>
beforeEach(() => {
  localStorage.setItem("token", "workflow-cadet-token")
  network = vi.fn()
  vi.stubGlobal("fetch", network)
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("DDS Lobby Extensions", () => {
  it("filters out self-training sessions from assigned teacher lessons", async () => {
    network.mockImplementation(async () => reply([
      session(1, false, false), // teacher assignment
      session(2, false, true),  // self training
      session(3, false, true),  // self training
    ]))
    render(<DDSAssignments />)
    await waitFor(() => expect(workLinks().length).toBe(1))
    expect(linkedSessions()).toEqual(["session-1"])
    expect(document.body.textContent).not.toContain("SELF-2")
    expect(document.body.textContent).not.toContain("SELF-3")
  })

  it("handles network errors and provides working retry button", async () => {
    network.mockRejectedValueOnce(new Error("Failed to fetch"))
    render(<DDSAssignments />)
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
    expect(screen.getByText(/ошибка|failed/i)).toBeTruthy()
    expect(workLinks()).toHaveLength(0)

    // Now mock success for retry
    network.mockImplementationOnce(async () => reply([session(1)]))
    const retryButton = screen.getByRole("button", {name: /повторить загрузку/i})
    fireEvent.click(retryButton)
    await waitFor(() => expect(workLinks()).toHaveLength(1))
    expect(linkedSessions()).toEqual(["session-1"])
  })

  it("preserves active page and history tab during polling refreshes", async () => {
    const eightSessions = Array.from({length: 8}, (_, index) => session(index))
    network.mockImplementation(async () => reply(eightSessions))
    render(<DDSAssignments />)
    await waitFor(() => expect(workLinks().length).toBeGreaterThan(0))

    // Go to page 2
    const next = screen.getByRole("button", {name: /следующ|далее|впер[её]д/i})
    fireEvent.click(next)
    await waitFor(() => expect(linkedSessions().length).toBe(3))
    const page2Sessions = linkedSessions()

    // Trigger refresh button (or simulated polling)
    const refreshBtn = screen.getByRole("button", {name: /обновить/i})
    fireEvent.click(refreshBtn)
    await waitFor(() => expect(network).toHaveBeenCalledTimes(2))

    // Page must still be 2, not reset to page 1
    expect(linkedSessions()).toEqual(page2Sessions)
  })

  it("preserves history tab selection during refresh", async () => {
    network.mockImplementation(async () => reply([
      session(1, false),
      session(2, true),
      session(3, true),
    ]))
    render(<DDSAssignments />)
    await waitFor(() => expect(workLinks().length).toBe(1))

    // Switch to history tab
    const historyTab = screen.getByRole("tab", {name: /история|заверш[её]нн/i})
    fireEvent.click(historyTab)
    await waitFor(() => expect(workLinks().length).toBe(2))
    expect(linkedSessions()).toEqual(["session-3", "session-2"])

    // Refresh
    const refreshBtn = screen.getByRole("button", {name: /обновить/i})
    fireEvent.click(refreshBtn)
    await waitFor(() => expect(network).toHaveBeenCalledTimes(2))

    // Still on history tab
    expect(linkedSessions()).toEqual(["session-3", "session-2"])
  })
})
