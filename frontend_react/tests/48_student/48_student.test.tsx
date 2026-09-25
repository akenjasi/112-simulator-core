import React from "react"
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import StudentProfilePage from "@/app/student/profile/page"
import StudentLobbyPage from "@/app/student/lobby/page"
import DdsPage from "@/app/dds/page"

const pushMock = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  useSearchParams: () => new URLSearchParams("session_id=session-demo-123&ticket_id=ticket-demo-456"),
}))

// Recharts ResponsiveContainer mock for jsdom
vi.mock("recharts", async () => {
  const original = await vi.importActual("recharts")
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => (
      <div data-testid="radar-container" style={{ width: 500, height: 300 }}>
        {children}
      </div>
    ),
  }
})

describe("ТЗ 48: Личный кабинет ученика и Лобби (Фронтенд)", () => {
  const mockUser = {
    user_id: "user-cadet-01",
    student_id: "СМ1-12",
    username: "ivanov@test.com",
    full_name: "Иванов Иван Иванович",
    role: "CADET",
  }

  const mockStats112 = {
    average_score: 88.5,
    average_score_week: 91.0,
    average_score_all_time: 88.5,
    average_score_7_days: 91.0,
    score_trend: 3.5,
    average_processing_time_seconds: 65,
    time_trend: -15,
    service_accuracy_percent: 96.2,
    cards_solved: 24,
    lessons_completed: 14,
    student_id: "СМ1-12",
    competence_matrix: [
      { category: "ДТП", score: 90 },
      { category: "Пожары", score: 85 },
      { category: "Медицина", score: 75 },
    ],
    top_errors: [
      { text: "Не спросил номер квартиры", frequency_percent: 60, is_fatal: false },
      { text: "Долго вызывал скорую", frequency_percent: 85, is_fatal: true },
      { text: "Ошибочная квалификация категории", frequency_percent: 40, is_fatal: true },
    ],
  }

  const mockStatsDDS = {
    average_score: 81.0,
    average_score_week: 84.0,
    average_score_all_time: 81.0,
    average_score_7_days: 84.0,
    score_trend: -1.2,
    average_processing_time_seconds: 70,
    time_trend: 5,
    service_accuracy_percent: 91.0,
    cards_solved: 16,
    lessons_completed: 9,
    student_id: "СМ1-12",
    competence_matrix: [
      { category: "ЖКХ", score: 88 },
      { category: "Пожары", score: 82 },
      { category: "ДТП", score: 72 },
    ],
    top_errors: [
      { text: "Нарушен регламент SLA передачи службе", frequency_percent: 75, is_fatal: true },
      { text: "Не указан наряд дежурной бригады", frequency_percent: 35, is_fatal: false },
    ],
  }

  const mockLessons = [
    {
      session_id: "sess-abc-001",
      lesson_id: "lesson-01",
      title: "Занятие 1: Экстренное реагирование ДТП",
      target_role: "OPERATOR_112",
      session_type: "CALL_SIMULATION",
      status: "COMPLETED",
      score: 92.5,
      date: "25.09.2026 14:30",
      tickets: [
        {
          ticket_id: "ticket-101",
          title: "Билет #1: Столкновение на МКАД",
          category: "ДТП",
          status: "passed",
          score: 95,
          errors_count: 0,
          errors: [],
        },
        {
          ticket_id: "ticket-102",
          title: "Билет #2: Пожар в квартире",
          category: "Пожары",
          status: "passed",
          score: 90,
          errors_count: 1,
          errors: ["Задержка передачи информации"],
        },
      ],
    },
  ]

  beforeEach(() => {
    pushMock.mockClear()
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        const urlStr = url.toString()

        if (urlStr.includes("/api/v1/users/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockUser,
          })
        }

        if (urlStr.includes("/api/v1/students/me/stats")) {
          const isDds = urlStr.includes("role=DISPATCHER_DDS")
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => (isDds ? mockStatsDDS : mockStats112),
          })
        }

        if (urlStr.includes("/api/v1/students/me/lessons")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockLessons,
          })
        }

        if (urlStr.includes("/api/v1/sessions/demo")) {
          const body = init?.body ? JSON.parse(init.body as string) : {}
          const isDds = body.target_role === "DISPATCHER_DDS"
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              session_id: "sess-demo-777",
              ticket_id: "ticket-demo-888",
              role: body.target_role || "OPERATOR_112",
              redirect_url: isDds
                ? "/dds?session_id=sess-demo-777&ticket_id=ticket-demo-888"
                : "/operator?session_id=sess-demo-777&ticket_id=ticket-demo-888",
            }),
          })
        }

        if (urlStr.includes("/api/dds/scenarios")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ scenarios: [] }),
          })
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({}),
        })
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("1. Личный кабинет ученика (/student/profile)", () => {
    it("renders cadet profile compact header with FIO, short ID, role toggle, and no avatars", async () => {
      render(<StudentProfilePage />)

      // Header title, FIO and short ID
      expect(screen.getAllByText(/Личный кабинет курсанта/i).length).toBeGreaterThan(0)
      await waitFor(() => {
        expect(screen.getByText("Иванов Иван Иванович")).toBeInTheDocument()
        expect(screen.getByText("ID: СМ1-12")).toBeInTheDocument()
      })

      // Role buttons
      expect(screen.getByRole("button", { name: /Оператор 112/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Диспетчер ДДС/i })).toBeInTheDocument()

      // Absence of avatar change button or gamification
      expect(screen.queryByText(/Сменить фото/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Уровень \d+/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/\bXP\b/i)).not.toBeInTheDocument()
    })

    it("renders professional metrics summary cards with trends and without month score", async () => {
      render(<StudentProfilePage />)

      await waitFor(() => {
        expect(screen.getByText("За всё время")).toBeInTheDocument()
        expect(screen.getByText("За 7 дней")).toBeInTheDocument()
        expect(screen.getByText("Решено карточек")).toBeInTheDocument()
        expect(screen.getByText("Время обработки")).toBeInTheDocument()
        expect(screen.getByText("Точность служб")).toBeInTheDocument()
      })

      // Check values for 112
      await waitFor(() => {
        expect(screen.getByText("88.5")).toBeInTheDocument()
        expect(screen.getByText("91.0")).toBeInTheDocument()
        expect(screen.getByText("24")).toBeInTheDocument()
        expect(screen.getByText("65")).toBeInTheDocument()
        expect(screen.getByText("96.2%")).toBeInTheDocument()
      })
    })

    it("renders competence matrix (RadarChart) and top errors divided into fatal and minor", async () => {
      render(<StudentProfilePage />)

      await waitFor(() => {
        expect(screen.getByText("Матрица компетенций")).toBeInTheDocument()
        expect(screen.getByText("Топ частых ошибок")).toBeInTheDocument()
        expect(screen.getByTestId("radar-container")).toBeInTheDocument()
      })

      // Check fatal and minor error sections and items
      await waitFor(() => {
        expect(screen.getByText(/Фатальные ошибки/i)).toBeInTheDocument()
        expect(screen.getByText(/Мелкие недочеты/i)).toBeInTheDocument()
        expect(screen.getByText("Долго вызывал скорую")).toBeInTheDocument()
        expect(screen.getByText("Не спросил номер квартиры")).toBeInTheDocument()
      })
    })

    it("toggles roles and dynamically updates statistics from API", async () => {
      render(<StudentProfilePage />)

      await waitFor(() => {
        expect(screen.getByText("88.5")).toBeInTheDocument()
      })

      // Switch to DISPATCHER_DDS
      const ddsBtn = screen.getByRole("button", { name: /Диспетчер ДДС/i })
      await act(async () => {
        fireEvent.click(ddsBtn)
      })

      // Should load mockStatsDDS
      await waitFor(() => {
        expect(screen.getByText("81.0")).toBeInTheDocument()
        expect(screen.getByText("16")).toBeInTheDocument()
        expect(screen.getByText("Нарушен регламент SLA передачи службе")).toBeInTheDocument()
      })
    })

    it("renders learning history and reference materials tabs", async () => {
      render(<StudentProfilePage />)

      await waitFor(() => {
        expect(screen.getByText("История обучения и билеты")).toBeInTheDocument()
        expect(screen.getByText("Справочные материалы")).toBeInTheDocument()
      })

      // Switch to docs tab
      const docsBtn = screen.getByRole("button", { name: /Справочные материалы/i })
      await act(async () => {
        fireEvent.click(docsBtn)
      })

      // Check reference materials stub list
      await waitFor(() => {
        expect(screen.getByText("Алгоритм опроса при ДТП.pdf")).toBeInTheDocument()
        expect(screen.getByText("Памятка по службам.pdf")).toBeInTheDocument()
      })

      // Switch back to lessons tab
      const lessonsBtn = screen.getByRole("button", { name: /История обучения и билеты/i })
      await act(async () => {
        fireEvent.click(lessonsBtn)
      })

      await waitFor(() => {
        expect(screen.getByText("Занятие 1: Экстренное реагирование ДТП")).toBeInTheDocument()
      })

      // Expand accordion
      const lessonBtn = screen.getByText("Занятие 1: Экстренное реагирование ДТП")
      await act(async () => {
        fireEvent.click(lessonBtn)
      })

      // Tickets inside should be visible
      await waitFor(() => {
        expect(screen.getByText("Билет #1: Столкновение на МКАД")).toBeInTheDocument()
        expect(screen.getByText("Билет #2: Пожар в квартире")).toBeInTheDocument()
        expect(screen.getByText("Задержка передачи информации")).toBeInTheDocument()
      })
    })
  })

  describe("2. Лобби и Демо-запуск (/student/lobby)", () => {
    it("renders waiting screen with required text and role toggle", () => {
      render(<StudentLobbyPage />)

      expect(
        screen.getByText(/Ожидание старта\. Преподаватель подготавливает занятие\.\.\./i)
      ).toBeInTheDocument()
      expect(screen.getByText("Целевая учебная роль:")).toBeInTheDocument()
      expect(screen.getByText("Оператор 112")).toBeInTheDocument()
      expect(screen.getByText("Диспетчер ДДС")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Демо-запуск/i })).toBeInTheDocument()
      expect(screen.getByText("Личный кабинет")).toBeInTheDocument()
    })

    it("triggers POST /api/v1/sessions/demo for OPERATOR_112 and redirects to /operator", async () => {
      render(<StudentLobbyPage />)

      const demoBtn = screen.getByRole("button", { name: /Демо-запуск/i })
      await act(async () => {
        fireEvent.click(demoBtn)
      })

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/v1/sessions/demo",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ target_role: "OPERATOR_112" }),
          })
        )
        expect(pushMock).toHaveBeenCalledWith(
          "/operator?session_id=sess-demo-777&ticket_id=ticket-demo-888"
        )
      })
    })

    it("triggers POST /api/v1/sessions/demo for DISPATCHER_DDS and redirects to /dds", async () => {
      render(<StudentLobbyPage />)

      // Switch to DDS
      const ddsBtn = screen.getByText("Диспетчер ДДС")
      await act(async () => {
        fireEvent.click(ddsBtn)
      })

      const demoBtn = screen.getByRole("button", { name: /Демо-запуск/i })
      await act(async () => {
        fireEvent.click(demoBtn)
      })

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/v1/sessions/demo",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ target_role: "DISPATCHER_DDS" }),
          })
        )
        expect(pushMock).toHaveBeenCalledWith(
          "/dds?session_id=sess-demo-777&ticket_id=ticket-demo-888"
        )
      })
    })
  })

  describe("3. Рабочее место ДДС (/dds) при переходе", () => {
    it("immediately shows active incident card without waiting offline state", async () => {
      render(<DdsPage />)

      // Check active state
      await waitFor(() => {
        expect(screen.getByText(/Смена активна \(ДДС-112\)/i)).toBeInTheDocument()
        expect(screen.getByText(/Сессия #session-/i)).toBeInTheDocument()
      })

      // Incident card panels should be visible immediately
      expect(screen.getByText(/очевидец/i)).toBeInTheDocument()
    })
  })
})
