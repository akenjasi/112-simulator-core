import React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import { DDSLessonReport } from "@/components/teacher/dds-lesson-report"

describe("DDSLessonReport Component (A-05)", () => {
  const originalFetch = global.fetch
  const lessonId = "lesson-dds-001"
  const mockToken = "teacher-jwt-token-xyz"

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    localStorage.setItem("token", mockToken)
  })

  afterEach(() => {
    global.fetch = originalFetch
    localStorage.clear()
    vi.useRealTimers()
  })

  it("1. Renders unauthorized prompt when no token is present and does not send API requests", async () => {
    localStorage.clear()
    const fetchMock = vi.fn()
    global.fetch = fetchMock

    render(<DDSLessonReport lessonId={lessonId} />)

    expect(await screen.findByTestId("dds-report-unauthorized")).toBeInTheDocument()
    expect(screen.getByText(/Требуется авторизация/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Войти в систему/i })).toBeInTheDocument()

    // No network requests should have been made
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("2. Handles 404 on initial GET: shows 'not started' state without auto-generating", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 404,
      ok: false,
      json: async () => ({ detail: "Not found" }),
    })
    global.fetch = fetchMock

    render(<DDSLessonReport lessonId={lessonId} />)

    // Initial check sends GET with Bearer
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    const [calledUrl, calledOptions] = fetchMock.mock.calls[0]
    expect(calledUrl).toBe(`/api/ai-analytics/lessons/${lessonId}/report`)
    expect(calledOptions.headers.Authorization).toBe(`Bearer ${mockToken}`)
    expect(calledOptions.method).toBeUndefined() // GET

    // Shows not-started UI and generate button
    expect(await screen.findByTestId("dds-report-not-started")).toBeInTheDocument()
    expect(screen.getByTestId("dds-report-generate-btn")).toBeInTheDocument()
    expect(screen.getByText(/Нейроотчёт по этому занятию ещё не сформирован/i)).toBeInTheDocument()

    // Verify it NEVER automatically triggered POST
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("3. Synchronous lock prevents double POST on rapid clicks", async () => {
    let resolvePost: (value: any) => void
    const postPromise = new Promise((resolve) => {
      resolvePost = resolve
    })

    const fetchMock = vi.fn().mockImplementation((url, options) => {
      if (!options || options.method === undefined) {
        return Promise.resolve({
          status: 404,
          ok: false,
          json: async () => ({ detail: "Not found" }),
        })
      }
      if (options.method === "POST") {
        return postPromise
      }
      return Promise.reject(new Error("unexpected call"))
    })
    global.fetch = fetchMock

    render(<DDSLessonReport lessonId={lessonId} />)

    const generateBtn = await screen.findByTestId("dds-report-generate-btn")
    expect(generateBtn).toBeEnabled()

    // Synchronous multiple clicks in same tick
    fireEvent.click(generateBtn)
    fireEvent.click(generateBtn)
    fireEvent.click(generateBtn)

    // Verify POST was called EXACTLY ONCE
    expect(fetchMock).toHaveBeenCalledTimes(2) // 1 GET + 1 POST
    const [postUrl, postOptions] = fetchMock.mock.calls[1]
    expect(postUrl).toBe(`/api/ai-analytics/lessons/${lessonId}/report`)
    expect(postOptions.method).toBe("POST")
    expect(JSON.parse(postOptions.body)).toEqual({ retry: false })

    // Resolve POST response with pending job
    await act(async () => {
      resolvePost!({
        status: 202,
        ok: true,
        json: async () => ({
          job_id: "job-001",
          lesson_id: lessonId,
          status: "pending",
          attempt: 1,
        }),
      })
    })

    expect(await screen.findByTestId("dds-report-progress")).toBeInTheDocument()
  })

  it("4. Polls sequentially every 2s for pending/running and stops on completed", async () => {
    vi.useFakeTimers()

    let callCount = 0
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // Initial GET -> 200 with pending status
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({
            job_id: "job-101",
            lesson_id: lessonId,
            status: "pending",
            attempt: 1,
          }),
        })
      }
      if (callCount === 2) {
        // First poll -> running
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({
            job_id: "job-101",
            lesson_id: lessonId,
            status: "running",
            attempt: 1,
          }),
        })
      }
      // Second poll -> completed
      return Promise.resolve({
        status: 200,
        ok: true,
        json: async () => ({
          job_id: "job-101",
          lesson_id: lessonId,
          status: "completed",
          attempt: 1,
          model_used: "Qwen 2.5 7B",
          created_at: "2026-10-17T05:00:00Z",
          updated_at: "2026-10-17T05:00:15Z",
          report_text: "Анализ занятия:\n1. Курсант соблюдал регламенты.\n2. Время реакции в норме.",
        }),
      })
    })
    global.fetch = fetchMock

    render(<DDSLessonReport lessonId={lessonId} />)

    await act(async () => {
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("dds-report-progress")).toBeInTheDocument()

    // Advance 2s -> poll 1
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Advance 2s -> poll 2 (completes)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // Completed state
    expect(screen.getByTestId("dds-report-completed")).toBeInTheDocument()
    const reportEl = screen.getByTestId("dds-report-text")
    expect(reportEl.textContent).toContain("Анализ занятия:\n1. Курсант соблюдал регламенты.")

    // Advance more time: polling MUST have stopped!
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("5. Displays AI disclaimer, model, date and safely renders text with line breaks (no dangerouslySetInnerHTML)", async () => {
    const reportText = "Отчёт по занятию ДДС:\n• Первое замечание\n• Второе замечание\n<script>alert('xss')</script>"
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        job_id: "job-done-1",
        lesson_id: lessonId,
        status: "completed",
        attempt: 1,
        model_used: "Qwen 2.5 7B",
        created_at: "2026-10-17T04:30:00Z",
        updated_at: "2026-10-17T04:30:12Z",
        report_text: reportText,
      }),
    })
    global.fetch = fetchMock

    render(<DDSLessonReport lessonId={lessonId} />)

    const disclaimer = await screen.findByTestId("dds-report-disclaimer")
    expect(disclaimer).toHaveTextContent("Сформировано ИИ. Проверьте выводы по исходным данным занятия")

    expect(screen.getByText(/Модель: Qwen 2.5 7B/i)).toBeInTheDocument()
    const textContainer = screen.getByTestId("dds-report-text")
    expect(textContainer).toBeInTheDocument()
    expect(textContainer.textContent).toContain("• Первое замечание")

    // Verifying text is rendered safely as string text, not executed as HTML script
    expect(textContainer.textContent).toContain("<script>alert('xss')</script>")
    expect(document.querySelector("script[src='xss']")).toBeNull()
  })

  it("6. Handles failed status and allows explicit retry with { retry: true }", async () => {
    let callCount = 0
    const fetchMock = vi.fn().mockImplementation((url, options) => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({
            job_id: "job-fail-1",
            lesson_id: lessonId,
            status: "failed",
            attempt: 1,
            error_code: "timeout",
          }),
        })
      }
      if (callCount === 2) {
        return Promise.resolve({
          status: 202,
          ok: true,
          json: async () => ({
            job_id: "job-fail-1",
            lesson_id: lessonId,
            status: "pending",
            attempt: 2,
          }),
        })
      }
      return Promise.reject(new Error("unexpected"))
    })
    global.fetch = fetchMock

    render(<DDSLessonReport lessonId={lessonId} />)

    expect(await screen.findByTestId("dds-report-failed")).toBeInTheDocument()
    expect(screen.getByText(/Не удалось сформировать нейроотчёт/i)).toBeInTheDocument()
    expect(screen.getByText(/Код ошибки: timeout/i)).toBeInTheDocument()

    const retryBtn = screen.getByTestId("dds-report-retry-btn")
    expect(retryBtn).toBeInTheDocument()

    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    const [retryUrl, retryOptions] = fetchMock.mock.calls[1]
    expect(retryUrl).toBe(`/api/ai-analytics/lessons/${lessonId}/report`)
    expect(retryOptions.method).toBe("POST")
    expect(JSON.parse(retryOptions.body)).toEqual({ retry: true })

    expect(await screen.findByTestId("dds-report-progress")).toBeInTheDocument()
  })

  it("7. Strict payload validation: missing lesson_id, foreign lesson_id, unknown status or empty completed text produces safe error, never not_started nor foreign text", async () => {
    // 7.1 Missing lesson_id (must be strictly required)
    const fetchMockMissing = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        job_id: "job-no-id",
        status: "completed",
        report_text: "Отчёт без идентификатора",
      }),
    })
    global.fetch = fetchMockMissing

    const { unmount: unmount0 } = render(<DDSLessonReport lessonId={lessonId} />)
    expect(await screen.findByTestId("dds-report-error")).toBeInTheDocument()
    expect(screen.getByText(/Получены некорректные данные отчёта/i)).toBeInTheDocument()
    expect(screen.queryByTestId("dds-report-not-started")).toBeNull()
    unmount0()

    // 7.2 Foreign lesson_id
    const fetchMock1 = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        job_id: "job-foreign",
        lesson_id: "other-lesson-999",
        status: "completed",
        report_text: "Чужой секретный отчёт",
      }),
    })
    global.fetch = fetchMock1

    const { unmount } = render(<DDSLessonReport lessonId={lessonId} />)

    expect(await screen.findByTestId("dds-report-error")).toBeInTheDocument()
    expect(screen.getByText(/Получены некорректные данные отчёта или данные для другого занятия/i)).toBeInTheDocument()
    expect(screen.queryByText(/Чужой секретный отчёт/i)).toBeNull()
    expect(screen.queryByTestId("dds-report-not-started")).toBeNull()
    unmount()

    // 7.3 Unknown status
    const fetchMock2 = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        job_id: "job-unknown",
        lesson_id: lessonId,
        status: "mystery_status",
      }),
    })
    global.fetch = fetchMock2

    const { unmount: unmount2 } = render(<DDSLessonReport lessonId={lessonId} />)
    expect(await screen.findByTestId("dds-report-error")).toBeInTheDocument()
    expect(screen.getByText(/Сервер вернул неизвестный статус отчёта/i)).toBeInTheDocument()
    expect(screen.queryByTestId("dds-report-not-started")).toBeNull()
    unmount2()

    // 7.4 Completed status with empty text
    const fetchMock3 = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        job_id: "job-empty-text",
        lesson_id: lessonId,
        status: "completed",
        report_text: "   ",
      }),
    })
    global.fetch = fetchMock3

    render(<DDSLessonReport lessonId={lessonId} />)
    expect(await screen.findByTestId("dds-report-error")).toBeInTheDocument()
    expect(screen.getByText(/текст отчёта пуст или некорректен/i)).toBeInTheDocument()
    expect(screen.queryByTestId("dds-report-not-started")).toBeNull()
  })

  it("8. Monotonically increasing scope generation: A -> B -> A switching ignores late response from first A", async () => {
    let resolveFirstA: (value: any) => void
    const firstAPromise = new Promise((resolve) => {
      resolveFirstA = resolve
    })

    let resolveB: (value: any) => void
    const bPromise = new Promise((resolve) => {
      resolveB = resolve
    })

    let resolveSecondA: (value: any) => void
    const secondAPromise = new Promise((resolve) => {
      resolveSecondA = resolve
    })

    let callCount = 0
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return firstAPromise
      }
      if (callCount === 2) {
        return bPromise
      }
      return secondAPromise
    })
    global.fetch = fetchMock

    // 1. Mount with lesson-A
    const { rerender } = render(<DDSLessonReport lessonId="lesson-A" />)
    expect(screen.getByTestId("dds-report-loading")).toBeInTheDocument()

    // 2. Switch to lesson-B
    rerender(<DDSLessonReport lessonId="lesson-B" />)
    expect(screen.getByTestId("dds-report-loading")).toBeInTheDocument()

    // 3. Switch back to lesson-A
    rerender(<DDSLessonReport lessonId="lesson-A" />)
    expect(screen.getByTestId("dds-report-loading")).toBeInTheDocument()

    // Now resolve first A call with completed text "First A stale"
    await act(async () => {
      resolveFirstA!({
        status: 200,
        ok: true,
        json: async () => ({
          job_id: "job-A1",
          lesson_id: "lesson-A",
          status: "completed",
          report_text: "Устаревший первый отчёт A",
        }),
      })
    })

    // It MUST NOT show "Устаревший первый отчёт A" because generation counter invalidated it!
    expect(screen.queryByText(/Устаревший первый отчёт A/i)).toBeNull()

    // Now resolve second A call with completed text "Fresh A"
    await act(async () => {
      resolveSecondA!({
        status: 200,
        ok: true,
        json: async () => ({
          job_id: "job-A2",
          lesson_id: "lesson-A",
          status: "completed",
          report_text: "Свежий актуальный отчёт A",
        }),
      })
    })

    expect(await screen.findByTestId("dds-report-completed")).toBeInTheDocument()
    expect(screen.getByTestId("dds-report-text").textContent).toContain("Свежий актуальный отчёт A")
  })

  it("9. Immediate state reset on lesson change: old pending status cannot poll new lesson", async () => {
    vi.useFakeTimers()

    let resolveFirstA: (value: any) => void
    const firstAPromise = new Promise((resolve) => {
      resolveFirstA = resolve
    })

    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes("lesson-A")) {
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({
            job_id: "job-A",
            lesson_id: "lesson-A",
            status: "pending",
          }),
        })
      }
      // lesson-B hangs
      return firstAPromise
    })
    global.fetch = fetchMock

    const { rerender } = render(<DDSLessonReport lessonId="lesson-A" />)

    await act(async () => {
      await Promise.resolve()
    })
    // lesson-A is pending
    expect(screen.getByTestId("dds-report-progress")).toBeInTheDocument()

    // Switch to lesson-B
    rerender(<DDSLessonReport lessonId="lesson-B" />)

    // State MUST immediately be reset to loading, NOT pending!
    expect(screen.getByTestId("dds-report-loading")).toBeInTheDocument()
    expect(screen.queryByTestId("dds-report-progress")).toBeNull()

    // Advance timers by 2 seconds: MUST NOT poll lesson-B as pending!
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    // Fetch calls must only be initial lesson-A and initial lesson-B, no premature poll
    const bCalls = fetchMock.mock.calls.filter((c) => c[0].includes("lesson-B"))
    expect(bCalls.length).toBe(1)
  })

  it("10. Manual refresh cancels active polling request, clears timer and avoids overlapping requests", async () => {
    vi.useFakeTimers()

    let abortCalled = false
    let callCount = 0

    const fetchMock = vi.fn().mockImplementation((url, options) => {
      callCount++
      if (callCount === 1) {
        // 1. Initial GET succeeds with pending -> refresh button becomes visible in header!
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({
            job_id: "job-p1",
            lesson_id: lessonId,
            status: "pending",
          }),
        })
      }
      if (callCount === 2) {
        // 2. Polling request hangs, listen for abort
        const signal = options?.signal as AbortSignal | undefined
        if (signal) {
          signal.addEventListener("abort", () => {
            abortCalled = true
          })
        }
        return new Promise(() => {}) // in-flight request
      }
      // 3. Request triggered by manual refresh succeeds with completed
      return Promise.resolve({
        status: 200,
        ok: true,
        json: async () => ({
          job_id: "job-refreshed",
          lesson_id: lessonId,
          status: "completed",
          report_text: "Отчёт после ручного обновления",
        }),
      })
    })
    global.fetch = fetchMock

    render(<DDSLessonReport lessonId={lessonId} />)

    // Wait for initial pending state to resolve
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId("dds-report-progress")).toBeInTheDocument()

    // Now refresh button is rendered and visible
    const refreshBtn = screen.getByTestId("dds-report-refresh-btn")
    expect(refreshBtn).toBeVisible()

    // Advance timer by 2000ms to trigger the polling request (callCount === 2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // While polling request is in flight, click manual refresh
    await act(async () => {
      fireEvent.click(refreshBtn)
    })

    // The in-flight polling request must have been aborted
    expect(abortCalled).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // Assert completed state is shown and no stale writes
    expect(screen.getByTestId("dds-report-completed")).toBeInTheDocument()
    expect(screen.getByTestId("dds-report-text").textContent).toContain("Отчёт после ручного обновления")
  })

  it("11. Request cancellation / abort is never displayed as network error", async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      const err = new Error("The operation was aborted")
      err.name = "AbortError"
      return Promise.reject(err)
    })
    global.fetch = fetchMock

    render(<DDSLessonReport lessonId={lessonId} />)

    await act(async () => {
      await Promise.resolve()
    })

    // Error alert must NOT be shown when error is AbortError
    expect(screen.queryByTestId("dds-report-error")).toBeNull()
  })

  it("12. POST 409 sets jobStatus=error with message advising to use 'Обновить', not remaining not_started", async () => {
    let callCount = 0
    const fetchMock = vi.fn().mockImplementation((url, options) => {
      callCount++
      if (callCount === 1) {
        // Initial GET returns 404 (not started)
        return Promise.resolve({
          status: 404,
          ok: false,
          json: async () => ({ detail: "Not found" }),
        })
      }
      if (callCount === 2) {
        // POST returns 409 conflict
        return Promise.resolve({
          status: 409,
          ok: false,
          json: async () => ({ detail: "Job already exists" }),
        })
      }
      // Manual refresh GET returns failed job
      return Promise.resolve({
        status: 200,
        ok: true,
        json: async () => ({
          job_id: "job-existing",
          lesson_id: lessonId,
          status: "failed",
          error_code: "timeout",
        }),
      })
    })
    global.fetch = fetchMock

    render(<DDSLessonReport lessonId={lessonId} />)

    const generateBtn = await screen.findByTestId("dds-report-generate-btn")
    fireEvent.click(generateBtn)

    // Must transition to error state, NOT remain not_started
    expect(await screen.findByTestId("dds-report-error")).toBeInTheDocument()
    expect(screen.queryByTestId("dds-report-not-started")).toBeNull()
    expect(screen.getByText(/Нажмите «Обновить»/i)).toBeInTheDocument()

    // Clicking refresh in error state triggers GET, which reveals actual failed job
    const refreshBtn = screen.getByRole("button", { name: /Попробовать снова/i })
    fireEvent.click(refreshBtn)

    expect(await screen.findByTestId("dds-report-failed")).toBeInTheDocument()
    expect(screen.getByTestId("dds-report-retry-btn")).toBeInTheDocument()
  })
})
