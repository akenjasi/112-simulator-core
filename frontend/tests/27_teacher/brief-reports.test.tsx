import React from "react"
import {cleanup, render, screen} from "@testing-library/react"
import {afterEach, beforeEach, expect, it, vi} from "vitest"
import {DDSLessonReport} from "@/components/teacher/dds-lesson-report"

beforeEach(() => window.localStorage.setItem("token", "test-token"))
afterEach(() => {cleanup(); vi.unstubAllGlobals(); window.localStorage.clear()})

it.each(["completed", "failed"])("shows code facts separately for a %s group summary without starting inference", async status => {
  const facts = "Карточек завершено: 4 из 4. Средний сохранённый балл: 80 из 100."
  const text = "Группа соблюдает этапы. Отработайте запись докладов."
  const network = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({group_id: "group", status,
    facts_text: facts, report_format: "brief_v1", report_text: status === "completed" ? text : null})))
  vi.stubGlobal("fetch", network)
  render(<DDSLessonReport lessonId="group" scope="groups"/>)
  expect(await screen.findByTestId("dds-report-facts")).toHaveTextContent(facts)
  if (status === "completed") expect(screen.getByTestId("dds-report-text")).toHaveTextContent(text)
  else expect(screen.queryByText(text)).not.toBeInTheDocument()
  expect(network).toHaveBeenCalledTimes(1)
  expect(network.mock.calls[0][1]?.method).toBeUndefined()
})
