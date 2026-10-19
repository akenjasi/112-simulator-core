"use client"

import { apiFetch as fetch } from "@/lib/api-fetch"

import React, { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import {
  SplitScreen,
  RecordDetail,
  ErrorDetailItem,
} from "@/components/teacher/split-screen"
import { DDSLessonReport } from "@/components/teacher/dds-lesson-report"
import { GradeDialog } from "@/components/teacher/grade-dialog"
import { getStoredToken } from "@/lib/auth-session"
import {
  Users,
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Search,
  BookOpen,
  Filter,
  BarChart3,
  FileText,
  History,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  FileEdit,
  ExternalLink,
  GraduationCap,
  Loader2,
  Ticket,
  FileSpreadsheet,
  Bot,
  TrendingUp,
  AlertTriangle,
} from "lucide-react"

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
} from "recharts"

export interface DailyDynamicsPoint {
  date: string
  avg_score: number | null
  total_sessions: number
  graded_count?: number
  pending_count?: number
  passed_count: number
  failed_count: number
  pass_rate: number | null
}

export interface AnalyticsOverview {
  total_sessions: number
  total_attempts: number
  graded_attempts: number
  pending_attempts: number
  avg_score: number | null
  passed_count: number
  failed_count: number
  pass_rate: number | null
  total_errors: number
  active_cadets_count: number
  trend_direction?: "positive" | "negative" | "stable" | null
  daily_dynamics: DailyDynamicsPoint[]
}


export interface GroupComparisonItem {
  group_id: string
  group_name: string
  student_count: number
  avg_score: number
  pass_rate: number
  total_sessions: number
  total_errors: number
}

export interface CadetRecordSummary {
  record_id: string
  ticket_id?: string
  title?: string
  status: "passed" | "failed" | string
  score?: number
  is_appealed?: boolean
  teacher_comment?: string | null
  errors_count?: number
  etalon?: Record<string, any>
  student_answer?: Record<string, any>
  error_details?: ErrorDetailItem[] | Record<string, any> | string[]
}

export interface CadetSummary {
  cadet_id: string
  cadet_name: string
  success_rate: number | null
  records: CadetRecordSummary[]
}

export interface SessionData {
  session_id: string
  title: string
  created_at?: string
  cadets: CadetSummary[]
}

export interface CadetTicketAction {
  actor_id?: string
  at?: string
  service_name?: string
  status?: string
  comment?: string
  order_number?: string
  who_accepted?: string
  summary?: string
}

export interface CadetTicketSummary {
  ticket_id: string
  title: string
  status: "passed" | "failed" | "in_progress" | "completed" | "incomplete" | string
  score?: number | null
  record_id?: string
  card_id?: string
  automatic_score?: number | null
  expert_score?: number | null
  teacher_comment?: string | null
  errors_count: number
  errors?: string[]
  completed_at?: string | null
  actions?: CadetTicketAction[]
}

export interface LessonHistoryCadet {
  cadet_id: string
  cadet_name: string
  status: string
  progress: number
  score?: number | null
  passed: number
  failed: number
  current_ticket?: string | null
  tickets?: CadetTicketSummary[]
}

export interface LessonHistoryItem {
  id: string
  group_id: string
  group_name?: string
  target_role: string
  mode?: string
  status: string
  complexity?: string
  categories?: string[]
  total_cadets: number
  passed_count: number
  failed_count: number
  avg_score?: number | null
  teacher_notes?: string
  created_at?: string
  started_at?: string
  completed_at?: string
  students?: LessonHistoryCadet[]
}

const DEFAULT_DYNAMICS_DATA: DailyDynamicsPoint[] = [
  { date: "2026-09-01", avg_score: 74.2, total_sessions: 24, passed_count: 17, failed_count: 7, pass_rate: 70.8 },
  { date: "2026-09-05", avg_score: 77.0, total_sessions: 28, passed_count: 22, failed_count: 6, pass_rate: 78.6 },
  { date: "2026-09-10", avg_score: 80.5, total_sessions: 32, passed_count: 26, failed_count: 6, pass_rate: 81.3 },
  { date: "2026-09-15", avg_score: 82.8, total_sessions: 35, passed_count: 30, failed_count: 5, pass_rate: 85.7 },
  { date: "2026-09-20", avg_score: 85.1, total_sessions: 31, passed_count: 28, failed_count: 3, pass_rate: 90.3 },
  { date: "2026-09-24", avg_score: 87.4, total_sessions: 33, passed_count: 30, failed_count: 3, pass_rate: 90.9 },
  { date: "2026-09-27", avg_score: 89.0, total_sessions: 26, passed_count: 24, failed_count: 2, pass_rate: 92.3 },
]

const DEFAULT_GROUPS_COMPARISON: GroupComparisonItem[] = [
  { group_id: "grp-1", group_name: "Группа 101-П", student_count: 14, avg_score: 87.5, pass_rate: 89.2, total_sessions: 210, total_errors: 42 },
  { group_id: "grp-2", group_name: "Группа 102-П", student_count: 14, avg_score: 82.1, pass_rate: 81.5, total_sessions: 195, total_errors: 68 },
  { group_id: "grp-3", group_name: "Группа 201-С", student_count: 14, avg_score: 85.0, pass_rate: 86.0, total_sessions: 205, total_errors: 51 },
  { group_id: "grp-4", group_name: "Группа 202-С", student_count: 13, avg_score: 79.8, pass_rate: 78.4, total_sessions: 180, total_errors: 79 },
]

export interface AnalyticsPageProps {
  initialTab?: "history" | "split" | "all" | "ai_report" | "charts"
}

const HIDE_COMPLETED_LESSONS_KEY = "teacher.analytics.hideCompletedLessons"

export default function AnalyticsPage({ initialTab = "split" }: AnalyticsPageProps = {}) {
  const [activeTab, setActiveTab] = useState<"history" | "split" | "all" | "ai_report" | "charts">(initialTab)
  const [sessionId, setSessionId] = useState<string>("")
  const [selectedLessonId, setSelectedLessonId] = useState<string>("")
  const [sessionData, setSessionData] = useState<SessionData>({ session_id: "", title: "", cadets: [] })
  const [selectedRecord, setSelectedRecord] = useState<RecordDetail | null>(null)
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(false)
  const [isLoadingRecord, setIsLoadingRecord] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const sessionRequestRef = useRef(0)
  const recordRequestRef = useRef(0)

  // Group AI reports state
  const [groupAiReports, setGroupAiReports] = useState<any[]>([])
  const [selectedAiGroup, setSelectedAiGroup] = useState<string>("")
  const [isLoadingAiReport, setIsLoadingAiReport] = useState<boolean>(false)
  const [isTriggeringGroupAi, setIsTriggeringGroupAi] = useState<boolean>(false)

  // Lesson history state
  const [lessonsList, setLessonsList] = useState<LessonHistoryItem[]>([])
  const [isLoadingLessons, setIsLoadingLessons] = useState<boolean>(false)
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>("lesson-demo-1")
  const [historySearchQuery, setHistorySearchQuery] = useState<string>("")
  const [selectedGroupId, setSelectedGroupId] = useState<string>("ALL")
  const [hideCompletedLessons, setHideCompletedLessons] = useState(false)
  const [expandedCadetId, setExpandedCadetId] = useState<string | null>(null)
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [editingNotesText, setEditingNotesText] = useState<string>("")
  const [isSavingNotes, setIsSavingNotes] = useState<boolean>(false)
  const [lessonsAuthError, setLessonsAuthError] = useState<string | null>(null)
  const [gradingState, setGradingState] = useState<{
    isOpen: boolean
    recordId: string
    cadetName: string
    ticketTitle: string
    isEdit: boolean
    initialScore?: number | null
    initialComment?: string | null
    initialAutomaticScore?: number | null
    initialExpertScore?: number | null
  }>({
    isOpen: false,
    recordId: "",
    cadetName: "",
    ticketTitle: "",
    isEdit: false,
  })

  // Charts & Dashboards state (ТЗ 75 & Verified Analytics)
  const [isMounted, setIsMounted] = useState<boolean>(false)
  const [dynamicsDays, setDynamicsDays] = useState<number>(30)
  const [dynamicsGroupId, setDynamicsGroupId] = useState<string>("ALL")
  const [dynamicsData, setDynamicsData] = useState<DailyDynamicsPoint[]>([])
  const [overviewData, setOverviewData] = useState<AnalyticsOverview>({
    total_sessions: 0,
    total_attempts: 0,
    graded_attempts: 0,
    pending_attempts: 0,
    avg_score: null,
    passed_count: 0,
    failed_count: 0,
    pass_rate: null,
    total_errors: 0,
    active_cadets_count: 0,
    trend_direction: null,
    daily_dynamics: [],
  })
  const [chartsError, setChartsError] = useState<string | null>(null)
  const fetchChartsRequestIdRef = useRef<number>(0)
  const [groupComparisonData, setGroupComparisonData] = useState<GroupComparisonItem[]>([])
  const [isLoadingCharts, setIsLoadingCharts] = useState<boolean>(false)

  const fetchChartsData = useCallback(async () => {
    fetchChartsRequestIdRef.current += 1
    const reqId = fetchChartsRequestIdRef.current

    try {
      setIsLoadingCharts(true)
      setChartsError(null)
      setDynamicsData([])
      setOverviewData({
        total_sessions: 0, total_attempts: 0, graded_attempts: 0, pending_attempts: 0,
        avg_score: null, passed_count: 0, failed_count: 0, pass_rate: null,
        total_errors: 0, active_cadets_count: 0, trend_direction: null, daily_dynamics: [],
      })

      const dynGroupParam = dynamicsGroupId !== "ALL" ? `&group_id=${encodeURIComponent(dynamicsGroupId)}` : ""
      const token = getStoredToken()
      const authHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}

      // 1. Fetch server overview
      const overviewRes = await fetch(`/api/analytics/overview?days=${dynamicsDays}${dynGroupParam}`, {
        headers: authHeaders,
      })

      if (reqId !== fetchChartsRequestIdRef.current) return
      if (overviewRes.ok) {
        const oJson: AnalyticsOverview = await overviewRes.json()
        if (reqId !== fetchChartsRequestIdRef.current) return
        setOverviewData(oJson)
        setDynamicsData(Array.isArray(oJson.daily_dynamics) ? oJson.daily_dynamics : [])
      } else {
        setChartsError(`Ошибка загрузки данных аналитики (${overviewRes.status})`)
      }

      // 2. Fetch group comparison
      const compRes = await fetch("/api/analytics/groups-comparison", { headers: authHeaders })
      if (reqId !== fetchChartsRequestIdRef.current) return
      if (compRes.ok) {
        const cJson = await compRes.json()
        if (reqId !== fetchChartsRequestIdRef.current) return
        setGroupComparisonData(Array.isArray(cJson) ? cJson : [])
      } else {
        setGroupComparisonData([])
      }

    } catch (err: any) {
      if (reqId === fetchChartsRequestIdRef.current) {
        console.warn("Could not load charts data from API:", err)
        setChartsError("Не удалось загрузить данные аналитики. Проверьте сетевое соединение.")
        setDynamicsData([])
        setOverviewData({
          total_sessions: 0,
          total_attempts: 0,
          graded_attempts: 0,
          pending_attempts: 0,
          avg_score: null,
          passed_count: 0,
          failed_count: 0,
          pass_rate: null,
          total_errors: 0,
          active_cadets_count: 0,
          trend_direction: null,
          daily_dynamics: [],
        })
      }
    } finally {
      if (reqId === fetchChartsRequestIdRef.current) {
        setIsLoadingCharts(false)
      }
    }
  }, [dynamicsDays, dynamicsGroupId])

  useEffect(() => {
    setIsMounted(true)
    fetchChartsData()
  }, [fetchChartsData])

  const fetchGroupAiReports = useCallback(async (grpId: string) => {
    if (!grpId || grpId === "ALL") return
    setIsLoadingAiReport(true)
    try {
      const res = await fetch(`/api/ai-analytics/group/${grpId}`)
      if (res.ok) {
        const data = await res.json()
        setGroupAiReports(Array.isArray(data) ? data : [])
      }
    } catch (err) {
      console.warn("Failed to load group AI reports:", err)
    } finally {
      setIsLoadingAiReport(false)
    }
  }, [])

  const handleTriggerGroupAi = async () => {
    if (!selectedAiGroup || selectedAiGroup === "ALL") return
    setIsTriggeringGroupAi(true)
    try {
      const res = await fetch(`/api/ai-analytics/trigger?group_id=${selectedAiGroup}&background=false`, {
        method: "POST",
      })
      if (res.ok) {
        await fetchGroupAiReports(selectedAiGroup)
      }
    } catch (err) {
      console.warn("Failed to trigger group AI analysis:", err)
    } finally {
      setIsTriggeringGroupAi(false)
    }
  }

  const loadRecordDetail = useCallback(async (recordId: string, cadetName?: string) => {
    const requestId = ++recordRequestRef.current
    setSelectedRecord(null)
    setIsLoadingRecord(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/v1/analytics/records/${encodeURIComponent(recordId)}`)
      if (requestId !== recordRequestRef.current) return
      if (!res.ok) {
        setErrorMessage(res.status === 403
          ? "Доступ к этому ответу ограничен."
          : res.status === 404 ? "Ответ курсанта не найден." : `Не удалось загрузить ответ (${res.status}).`)
        return
      }
      const data: RecordDetail = await res.json()
      if (requestId !== recordRequestRef.current) return
      setSelectedRecord({ ...data, cadet_name: data.cadet_name || cadetName })
    } catch {
      if (requestId === recordRequestRef.current) {
        setErrorMessage("Ошибка сети при загрузке ответа. Попробуйте открыть его ещё раз.")
      }
    } finally {
      if (requestId === recordRequestRef.current) setIsLoadingRecord(false)
    }
  }, [])

  // Fetch session analytics
  const fetchSessionAnalytics = useCallback(async (sid: string) => {
    if (!sid.trim()) return
    setSelectedLessonId("")
    const requestId = ++sessionRequestRef.current
    ++recordRequestRef.current
    setSelectedRecord(null)
    setIsLoadingRecord(false)
    setSessionData({ session_id: sid, title: "", cadets: [] })
    try {
      setIsLoadingSession(true)
      setErrorMessage(null)
      const token = getStoredToken()
      const authHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`/api/v1/analytics/sessions/${encodeURIComponent(sid.trim())}`, {
        headers: authHeaders,
      })
      if (requestId !== sessionRequestRef.current) return
      if (res.ok) {
        const data = await res.json()
        if (requestId !== sessionRequestRef.current) return
        if (data && Array.isArray(data.cadets)) {
          setSessionData(data)
          const firstCadet = data.cadets[0]
          if (firstCadet && firstCadet.records?.length > 0) {
            const firstRec = firstCadet.records[0]
            if (firstRec.etalon && firstRec.student_answer) {
              setSelectedRecord({
                ...firstRec,
                cadet_name: firstCadet.cadet_name,
                cadet_id: firstCadet.cadet_id,
                error_details: firstRec.error_details || [],
              } as RecordDetail)
            } else {
              await loadRecordDetail(firstRec.record_id, firstCadet.cadet_name)
            }
          }
        } else {
          setErrorMessage("Не удалось прочитать данные сессии.")
        }
      } else {
        if (sid && sid.trim()) {
          setSessionData({ session_id: sid, title: "Сессия не найдена", created_at: "", cadets: [] })
          setSelectedRecord(null)
          if (res.status === 404) {
            setErrorMessage("Сессия не найдена или не содержит записей.")
          } else if (res.status === 403) {
            setErrorMessage("Доступ к этой сессии ограничен (сессия другой группы или преподавателя).")
          } else {
            setErrorMessage(`Ошибка загрузки сессии (${res.status})`)
          }
        }
      }
    } catch (err: any) {
      if (requestId !== sessionRequestRef.current) return
      console.warn("Could not load session from API:", err)
      if (sid && sid.trim()) {
        setSessionData({ session_id: sid, title: "Ошибка загрузки", created_at: "", cadets: [] })
        setSelectedRecord(null)
        setErrorMessage("Ошибка сети при загрузке сессии.")
      }
    } finally {
      if (requestId === sessionRequestRef.current) setIsLoadingSession(false)
    }
  }, [loadRecordDetail])

  // Fetch lesson analytics & cadets breakdown
  const handleSelectLesson = useCallback(async (lessonId: string) => {
    setSelectedLessonId(lessonId)
    setSessionId("")
    const requestId = ++sessionRequestRef.current
    ++recordRequestRef.current
    setSelectedRecord(null)
    setIsLoadingRecord(false)
    setErrorMessage(null)

    if (!lessonId) {
      setSessionData({ session_id: "", title: "", cadets: [] })
      return
    }

    setSessionData({ session_id: lessonId, title: "", cadets: [] })
    setIsLoadingSession(true)

    try {
      const token = getStoredToken()
      const authHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}

      let res = await fetch(`/api/v1/analytics/lessons/${encodeURIComponent(lessonId)}`, { headers: authHeaders })
      if (!res.ok && res.status === 404) {
        res = await fetch(`/api/v1/lessons/${encodeURIComponent(lessonId)}`, { headers: authHeaders })
      }

      if (requestId !== sessionRequestRef.current) return

      if (res.ok) {
        const data = await res.json()
        if (requestId !== sessionRequestRef.current) return

        let parsedCadets: Array<any> = []

        if (Array.isArray(data.cadets) && data.cadets.length > 0 && Array.isArray(data.cadets[0]?.records)) {
          parsedCadets = data.cadets
        } else {
          const rawStudents = data.students || data.cadets || []
          parsedCadets = rawStudents.map((st: any) => {
            let successRate: number | null = null
            if (st.passed != null && st.failed != null && (st.passed + st.failed) > 0) {
              successRate = Math.round((st.passed / (st.passed + st.failed)) * 100)
            }

            const records = (st.tickets || []).filter((t: any) => t.record_id || t.card_id).map((t: any) => ({
              record_id: t.record_id || t.card_id,
              ticket_id: t.ticket_id,
              title: t.title || `Билет #${(t.ticket_id || '').slice(0, 8)}`,
              status: t.status || (t.score != null ? (t.score >= 70 ? 'passed' : 'failed') : 'ungraded'),
              score: t.score ?? null,
              is_appealed: Boolean(t.is_appealed),
              errors_count: t.errors_count ?? (Array.isArray(t.errors) ? t.errors.length : 0),
              etalon: t.etalon,
              student_answer: t.student_answer,
              error_details: t.error_details || (Array.isArray(t.errors) ? t.errors.map((e: any) => typeof e === 'string' ? { message: e } : e) : []),
            }))

            return {
              cadet_id: st.cadet_id,
              cadet_name: st.cadet_name || `Курсант ${st.cadet_id?.slice(0, 6)}`,
              success_rate: successRate,
              records,
            }
          })
        }

        setSessionData({
          session_id: data.id || data.session_id || lessonId,
          title: data.group_name ? `Урок: ${data.group_name}` : data.title || `Урок #${lessonId.slice(0, 8)}`,
          created_at: data.created_at || "",
          cadets: parsedCadets,
        })

        const firstCadetWithRecord = parsedCadets.find((c: any) => c.records && c.records.length > 0)
        if (firstCadetWithRecord) {
          const firstRec = firstCadetWithRecord.records[0]
          if (firstRec.etalon && firstRec.student_answer) {
            setSelectedRecord({
              ...firstRec,
              cadet_name: firstCadetWithRecord.cadet_name,
              cadet_id: firstCadetWithRecord.cadet_id,
              error_details: firstRec.error_details || [],
            } as RecordDetail)
          } else if (firstRec.record_id) {
            await loadRecordDetail(firstRec.record_id, firstCadetWithRecord.cadet_name)
          }
        }
      } else {
        setSessionData({ session_id: lessonId, title: "Занятие не найдено", created_at: "", cadets: [] })
        setSelectedRecord(null)
        if (res.status === 404) {
          setErrorMessage("Занятие не найдено или не содержит записей.")
        } else if (res.status === 403) {
          setErrorMessage("Доступ к этому занятию ограничен (занятие другой группы или преподавателя).")
        } else if (res.status === 401) {
          setErrorMessage("Требуется авторизация для просмотра занятия.")
        } else {
          setErrorMessage(`Ошибка загрузки занятия (${res.status})`)
        }
      }
    } catch (err) {
      if (requestId !== sessionRequestRef.current) return
      setSessionData({ session_id: lessonId, title: "Ошибка загрузки", created_at: "", cadets: [] })
      setSelectedRecord(null)
      setErrorMessage("Ошибка сети при загрузке занятия.")
    } finally {
      if (requestId === sessionRequestRef.current) {
        setIsLoadingSession(false)
      }
    }
  }, [loadRecordDetail])

  // Fetch available groups for filter

  // Fetch lesson history (optionally with group_id filter)
  const fetchLessonsHistory = useCallback(async () => {
    const token = getStoredToken()
    if (!token) {
      setLessonsAuthError("Для загрузки истории уроков требуется авторизация. Пожалуйста, войдите в систему.")
      return
    }
    try {
      setIsLoadingLessons(true)
      setLessonsAuthError(null)
      const res = await fetch(`/api/v1/lessons`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setLessonsList(data)
        }
      } else if (res.status === 401 || res.status === 403) {
        setLessonsAuthError("Сессия истекла или недостаточно прав для просмотра истории занятий (войдите в систему).")
      }
    } catch (err) {
      console.warn("Could not load lessons history from API:", err)
    } finally {
      setIsLoadingLessons(false)
    }
  }, [])

  useEffect(() => {
    fetchLessonsHistory()
  }, [fetchLessonsHistory])

  useEffect(() => {
    try {
      setHideCompletedLessons(localStorage.getItem(HIDE_COMPLETED_LESSONS_KEY) === "true")
    } catch {
      // Filtering remains available when browser storage is disabled.
    }
  }, [])

  const handleSelectRecord = loadRecordDetail

  const openRecordFromHistory = (recordId: string, cadetName?: string) => {
    ++sessionRequestRef.current
    setIsLoadingSession(false)
    setSelectedLessonId("")
    setSessionId("")
    setSessionData({ session_id: "", title: "", cadets: [] })
    setActiveTab("split")
    loadRecordDetail(recordId, cadetName)
  }

  const handleGradingSuccess = useCallback(async () => {
    await fetchLessonsHistory()
    if (selectedLessonId) {
      await handleSelectLesson(selectedLessonId)
    } else if (sessionId) {
      await fetchSessionAnalytics(sessionId)
    }
    await fetchChartsData()
    if (selectedRecord?.record_id) {
      await handleSelectRecord(selectedRecord.record_id, selectedRecord.cadet_name)
    }
  }, [fetchLessonsHistory, selectedLessonId, handleSelectLesson, sessionId, fetchSessionAnalytics, fetchChartsData, selectedRecord, handleSelectRecord])

  // Save updated teacher notes for a lesson
  const handleSaveLessonNotes = async (lessonId: string) => {
    try {
      setIsSavingNotes(true)
      const token = getStoredToken()
      const res = await fetch(`/api/v1/lessons/${lessonId}/notes`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ teacher_notes: editingNotesText }),
      })
      if (res.ok) {
        setLessonsList((prev) =>
          prev.map((l) => (l.id === lessonId ? { ...l, teacher_notes: editingNotesText } : l))
        )
        setEditingNotesId(null)
      }
    } catch (err) {
      console.error("Error saving lesson notes", err)
    } finally {
      setIsSavingNotes(false)
    }
  }

  // Handle appeal submission
  const handleAppeal = async (
    recordId: string,
    payload: { status: string; comment: string; score?: number; reason?: string }
  ) => {
    const token = getStoredToken()
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    const res = await fetch(`/api/v1/analytics/records/${encodeURIComponent(recordId)}/grade-override`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        status: payload.status,
        ...(payload.score !== undefined ? { score: payload.score } : {}),
        reason: payload.reason || payload.comment || "Пересмотр оценки преподавателем",
        comment: payload.comment,
      }),
    })

    if (!res.ok) {
      throw new Error(`Ошибка при отправке апелляции (${res.status})`)
    }

    const updatedData = await res.json().catch(() => null)
    const effectiveScore = updatedData?.new_score !== undefined ? updatedData.new_score : payload.score

    setSelectedRecord((prev) => {
      if (!prev) return null
      return {
        ...prev,
        score: effectiveScore !== undefined ? effectiveScore : prev.score,
        expert_score: payload.score !== undefined ? payload.score : prev.expert_score,
        teacher_comment: payload.comment || prev.teacher_comment,
        is_appealed: true,
      }
    })

    // Re-fetch fresh record details from server for real consistency
    try {
      const recRes = await fetch(`/api/v1/analytics/records/${encodeURIComponent(recordId)}`, { headers })
      if (recRes.ok) {
        const freshRecord = await recRes.json()
        if (freshRecord) {
          setSelectedRecord(freshRecord)
        }
      }
    } catch (e) {
      console.warn("Could not reload record after appeal:", e)
    }

    setSessionData((prev) => {
      const updatedCadets = prev.cadets.map((cadet) => {
        const hasRecord = cadet.records.some((r) => r.record_id === recordId)
        if (!hasRecord) return cadet

        const updatedRecords = cadet.records.map((r) => {
          if (r.record_id === recordId) {
            return {
              ...r,
              score: effectiveScore !== undefined ? effectiveScore : r.score,
              status: payload.status,
              is_appealed: true,
              teacher_comment: payload.comment,
            }
          }
          return r
        })

        const passedCount = updatedRecords.filter((r) => r.status === "passed").length
        const totalCount = updatedRecords.length
        const success_rate = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0

        return {
          ...cadet,
          success_rate,
          records: updatedRecords,
        }
      })

      return {
        ...prev,
        cadets: updatedCadets,
      }
    })

    if (selectedLessonId) {
      await handleSelectLesson(selectedLessonId)
    } else if (sessionId) {
      await fetchSessionAnalytics(sessionId)
    }
    await fetchLessonsHistory()
    await fetchChartsData()
  }

  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false)

  const handleExportExcel = async () => {
    try {
      setIsExportingExcel(true)

      // Export recorded journal grades, including teacher overrides. Unmarked
      // work remains blank rather than receiving a fabricated perfect score.
      const customRecords: Record<string, unknown>[] = []
      if (activeTab === "split") {
        for (const cadet of sessionData.cadets) {
          for (const record of cadet.records || []) {
            customRecords.push({
              cadet_name: cadet.cadet_name,
              ticket_id: record.title || record.ticket_id || "Билет",
              final_score: record.score ?? null,
            })
          }
        }
        if (sessionData.cadets.length === 0 && selectedRecord) {
          customRecords.push({
            cadet_name: selectedRecord.cadet_name || "Курсант",
            ticket_id: selectedRecord.title || selectedRecord.ticket_id || "Билет",
            final_score: selectedRecord.score ?? null,
          })
        }
      } else {
        for (const lesson of filteredLessons) {
          for (const student of lesson.students || []) {
            if (student.tickets?.length) {
              for (const ticket of student.tickets) {
                customRecords.push({
                  cadet_name: student.cadet_name,
                  ticket_id: ticket.title || ticket.ticket_id,
                  final_score: ticket.score ?? null,
                  penalties_list: ticket.errors || [],
                })
              }
            } else {
              customRecords.push({
                cadet_name: student.cadet_name,
                ticket_id: lesson.group_name || `Урок #${lesson.id.slice(0, 6)}`,
                final_score: student.score ?? null,
              })
            }
          }
        }
      }

      // 2. Start generation request
      const genRes = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: selectedGroupId !== "ALL" ? selectedGroupId : undefined,
          session_ids: sessionId ? [sessionId] : undefined,
          custom_records: customRecords,
          format: "excel",
        }),
      })

      if (!genRes.ok) {
        throw new Error(`Ошибка запуска генерации (${genRes.status})`)
      }

      const { task_id } = await genRes.json()

      // 3. Poll for readiness
      let isReady = false
      for (let attempt = 0; attempt < 25; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 600))
        const statusRes = await fetch(`/api/reports/status/${task_id}`)
        if (!statusRes.ok) continue
        const statusData = await statusRes.json()
        if (statusData.status === "ready") {
          isReady = true
          break
        }
        if (statusData.status === "failed") {
          throw new Error(statusData.error || "Ошибка фоновой генерации")
        }
      }

      if (!isReady) {
        throw new Error("Таймаут генерации файла отчета")
      }

      // 4. Download file
      const downloadRes = await fetch(`/api/reports/download?task_id=${encodeURIComponent(task_id)}&format=excel`)
      if (!downloadRes.ok) {
        throw new Error(`Не удалось скачать файл (${downloadRes.status})`)
      }

      const blob = await downloadRes.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `analytics_report_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error("Failed to export Excel report:", err)
      alert(err?.message || "Ошибка при формировании Excel отчета")
    } finally {
      setIsExportingExcel(false)
    }
  }

  const allGroupOptions = React.useMemo(() => {
    const map = new Map<string, string>()
    lessonsList.forEach((l) => {
      if (l.group_id) {
        map.set(l.group_id, l.group_name || `Группа ${l.group_id.slice(0, 6)}`)
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [lessonsList])

  const filteredCadets = sessionData.cadets.filter((c) =>
    c.cadet_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredLessons = lessonsList.filter((l) => {
    if (hideCompletedLessons && l.status?.toUpperCase() === "COMPLETED") return false
    const matchesGroup = selectedGroupId === "ALL" || l.group_id === selectedGroupId
    const query = historySearchQuery.toLowerCase().trim()
    const matchesQuery =
      !query ||
      (l.group_name || "").toLowerCase().includes(query) ||
      l.id.toLowerCase().includes(query) ||
      (l.teacher_notes || "").toLowerCase().includes(query) ||
      (l.students || []).some((s) => s.cadet_name.toLowerCase().includes(query))
    return matchesGroup && matchesQuery
  })

  return (
    <div className="teacher-page space-y-5">
      {/* ────────────────── Header & Tab Navigation ────────────────── */}
      <div className="teacher-page-header flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><GraduationCap className="h-6 w-6 text-primary" /></div>
            <div>
              <h1 className="text-2xl md:text-[28px] font-bold tracking-tight">Журнал оценок</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                История групповых уроков, детальная статистика курсантов и экспертный разбор карточек
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons & Tab Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={isExportingExcel}
            className="flex items-center gap-2 border-emerald-600/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-semibold shadow-xs"
            data-testid="export-excel-btn"
          >
            {isExportingExcel ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            )}
            <span>{isExportingExcel ? "Генерация Excel..." : "Экспорт в Excel"}</span>
          </Button>

          {/* Tab Switcher */}
          <div className="flex flex-wrap items-center gap-1 bg-muted/50 p-1 rounded-xl border border-border/70">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "all"
                ? "bg-white dark:bg-card text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>Все разделы</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "history"
                ? "bg-white dark:bg-card text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <History className="h-4 w-4 text-primary" />
            <span>История уроков</span>
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
              {lessonsList.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("split")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "split"
                ? "bg-white dark:bg-card text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart3 className="h-4 w-4 text-primary" />
            <span>Журнал разбора (Сплит-скрин)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("charts")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "charts"
                ? "bg-white dark:bg-card text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-charts"
          >
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <span>Графика и дашборды</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ai_report")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
              activeTab === "ai_report"
                ? "bg-white dark:bg-card text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="h-4 w-4 text-amber-500" />
            <span>Отчет ИИ по группе</span>
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400">
              Qwen 9B
            </Badge>
          </button>
        </div>
      </div>
    </div>

      {/* ────────────────── SECTION 0: ДАШБОРДЫ И ГРАФИКИ (ТЗ 75) ────────────────── */}
      {(activeTab === "all" || activeTab === "charts") && (
        <div className="space-y-5 mb-8" data-testid="analytics-dashboards">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-card/60 backdrop-blur-xs p-5 rounded-2xl border">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-bold tracking-tight">Дашборды успеваемости и статистика</h2>
                {overviewData.active_cadets_count > 0 ? (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs">
                    {overviewData.active_cadets_count} {overviewData.active_cadets_count === 1 ? "курсант" : overviewData.active_cadets_count < 5 ? "курсанта" : "курсантов"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground border-muted-foreground/30 text-xs">
                    Нет активных курсантов
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Динамика результатов курсантов и сравнение учебных групп
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Group Filter */}
              <div className="flex items-center gap-2 text-xs">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <select
                  value={dynamicsGroupId}
                  onChange={(e) => setDynamicsGroupId(e.target.value)}
                  className="h-8 px-2.5 rounded-lg border text-xs bg-background font-medium focus:ring-1 focus:ring-primary"
                  data-testid="filter-charts-group"
                >
                  <option value="ALL">Все группы</option>
                  {allGroupOptions.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Refresh button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchChartsData()}
                disabled={isLoadingCharts}
                className="h-8 gap-1.5 text-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingCharts ? "animate-spin" : ""}`} />
                <span>Обновить</span>
              </Button>
            </div>
          </div>

          {chartsError && (
            <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{chartsError}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchChartsData()}
                className="h-7 text-xs border-destructive/40 hover:bg-destructive/20"
              >
                Повторить
              </Button>
            </div>
          )}

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 bg-card/60 backdrop-blur-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Средний балл</span>
                <Award className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-foreground">
                  {overviewData.avg_score != null ? overviewData.avg_score.toFixed(1) : "—"}
                </span>
                <span className="text-xs text-muted-foreground">/ 100</span>
              </div>
              <p className={`text-[11px] mt-1 font-medium ${
                overviewData.graded_attempts === 0
                  ? "text-muted-foreground"
                  : overviewData.trend_direction === "positive"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : overviewData.trend_direction === "negative"
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-muted-foreground"
              }`}>
                {overviewData.graded_attempts === 0
                  ? "Нет оценок"
                  : overviewData.trend_direction === "positive"
                  ? "Положительная динамика"
                  : overviewData.trend_direction === "negative"
                  ? "Отрицательная динамика"
                  : "Стабильный результат"}
              </p>
            </Card>

            <Card className="p-4 bg-card/60 backdrop-blur-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Сессии и попытки</span>
                <History className="h-4 w-4 text-blue-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-foreground">
                  {overviewData.total_sessions}
                </span>
                <span className="text-xs text-muted-foreground">сессий</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {overviewData.graded_attempts} оценённых попыток
                {overviewData.pending_attempts > 0 ? ` (${overviewData.pending_attempts} в процессе)` : ""}
              </p>
            </Card>

            <Card className="p-4 bg-card/60 backdrop-blur-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Успешная сдача</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-foreground">
                  {overviewData.pass_rate != null ? `${overviewData.pass_rate.toFixed(1)}%` : "—"}
                </span>
                <span className="text-xs text-muted-foreground">от оценённых</span>
              </div>
              <p className={`text-[11px] mt-1 font-medium ${
                overviewData.pass_rate == null
                  ? "text-muted-foreground"
                  : overviewData.pass_rate >= 75
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
              }`}>
                {overviewData.pass_rate == null
                  ? (overviewData.graded_attempts > 0 ? "Результат сдачи не определён" : "Нет оценённых попыток")
                  : overviewData.pass_rate >= 75
                  ? "Норматив соблюден (≥ 75%)"
                  : "Ниже норматива (< 75%)"}
              </p>
            </Card>

            <Card className="p-4 bg-card/60 backdrop-blur-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Зафиксировано ошибок</span>
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-foreground">
                  {overviewData.total_errors}
                </span>
                <span className="text-xs text-muted-foreground">инцидентов</span>
              </div>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 font-medium">
                {overviewData.total_errors > 0 ? "Требуют разбора" : "Ошибок не зафиксировано"}
              </p>
            </Card>
          </div>

          {/* Grid of Chart 1 (Line) & Chart 2 (Bar) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. LINE CHART: Динамика среднего балла */}
            <Card className="p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                      Динамика среднего балла
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Изменение успеваемости по дням (за неделю или месяц)
                    </CardDescription>
                  </div>
                  {/* Period switcher */}
                  <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border text-xs">
                    <button
                      type="button"
                      onClick={() => setDynamicsDays(7)}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                        dynamicsDays === 7 ? "bg-white dark:bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      7 дней
                    </button>
                    <button
                      type="button"
                      onClick={() => setDynamicsDays(30)}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                        dynamicsDays === 30 ? "bg-white dark:bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      30 дней
                    </button>
                  </div>
                </div>

                <div className="h-[290px] w-full mt-2" data-testid="line-chart-container">
                  {isMounted ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dynamicsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(val) => {
                            if (!val) return ""
                            const parts = val.split("-")
                            return parts.length === 3 ? `${parts[2]}.${parts[1]}` : val
                          }}
                          tick={{ fontSize: 11 }}
                          stroke="var(--muted-foreground)"
                          strokeOpacity={0.7}
                        />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" strokeOpacity={0.7} />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "var(--card)",
                            borderColor: "var(--border)",
                            color: "var(--card-foreground)",
                            borderRadius: "0.75rem",
                            fontSize: "12px",
                            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
                          }}
                          itemStyle={{ color: "var(--card-foreground)" }}
                          labelStyle={{ color: "var(--muted-foreground)" }}
                          formatter={(value: any, name: any) => [
                            value != null ? `${value} баллов` : "Нет данных",
                            name === "avg_score" ? "Средний балл" : name,
                          ]}
                          labelFormatter={(label) => `Дата: ${label}`}
                        />
                        <Line
                          type="monotone"
                          dataKey="avg_score"
                          name="Средний балл"
                          stroke="#10b981"
                          strokeWidth={3}
                          dot={{ r: 3, fill: "#10b981" }}
                          activeDot={{ r: 6 }}
                          connectNulls={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  )}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground mt-3 pt-3 border-t flex items-center justify-between">
                <span>🟢 Зеленая линия: динамика среднего балла за тест</span>
                <span>Целевой показатель: ≥ 80 б.</span>
              </div>
            </Card>

            {/* 2. BAR CHART: Сравнение успеваемости между группами */}
            <Card className="p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-blue-600" />
                      Сравнение успеваемости групп
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Средний балл и процент успешности по учебным группам
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono">
                    {groupComparisonData.length} группы
                  </Badge>
                </div>

                <div className="h-[290px] w-full mt-2" data-testid="bar-chart-container">
                  {isMounted ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={groupComparisonData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                        <XAxis
                          dataKey="group_name"
                          tick={{ fontSize: 11 }}
                          stroke="var(--muted-foreground)"
                          strokeOpacity={0.7}
                        />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" strokeOpacity={0.7} />
                        <RechartsTooltip
                          cursor={false}
                          contentStyle={{
                            backgroundColor: "var(--card)",
                            borderColor: "var(--border)",
                            color: "var(--card-foreground)",
                            borderRadius: "0.75rem",
                            fontSize: "12px",
                            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
                          }}
                          itemStyle={{ color: "var(--card-foreground)" }}
                          labelStyle={{ color: "var(--muted-foreground)" }}
                          formatter={(value: any, name: any) => [
                            `${value}${name === "pass_rate" ? "%" : " б."}`,
                            name === "avg_score" ? "Средний балл" : "Успешность (с 1 попытки)",
                          ]}
                        />
                        <RechartsLegend
                          wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                          formatter={(value) => (value === "avg_score" ? "Средний балл" : "Успешность (%)")}
                        />
                        <Bar dataKey="avg_score" name="avg_score" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="pass_rate" name="pass_rate" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  )}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground mt-3 pt-3 border-t flex items-center justify-between">
                <span>🔵 Синий: средний балл &bull; 🟢 Зеленый: % успешных прохождений</span>
                <span>3–5 учебных групп</span>
              </div>
            </Card>
          </div>


        </div>
      )}

      {/* ────────────────── SECTION 1: ИСТОРИЯ УРОКОВ (ACCORDION) ────────────────── */}
      {(activeTab === "all" || activeTab === "history") && (
        <div className="space-y-5">
          <div className="teacher-toolbar flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div className="flex flex-col md:flex-row md:items-center gap-3 w-full">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по группе, ID или заметкам..."
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  className="pl-9 h-10 text-sm"
                />
              </div>

              {/* Group Select */}
              <div className="flex items-center gap-2 shrink-0">
                <label htmlFor="group-filter-select" className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                  Группа:
                </label>
                <select
                  id="group-filter-select"
                  value={selectedGroupId}
                  onChange={(e) => {
                    setSelectedGroupId(e.target.value)

                  }}
                  className="h-10 rounded-lg border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="ALL">Все группы</option>
                  {allGroupOptions.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchLessonsHistory()}
              disabled={isLoadingLessons}
              className="gap-2 shrink-0"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingLessons ? "animate-spin" : ""}`} />
              <span>Обновить список</span>
            </Button>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer w-fit rounded-lg border border-border/70 bg-card px-3 py-2">
            <input
              type="checkbox"
              checked={hideCompletedLessons}
              onChange={(event) => {
                const hide = event.target.checked
                setHideCompletedLessons(hide)
                try {
                  localStorage.setItem(HIDE_COMPLETED_LESSONS_KEY, String(hide))
                } catch {
                  // Keep the selected filter for this visit if storage is unavailable.
                }
              }}
              className="h-4 w-4 accent-primary"
            />
            Скрыть завершённые уроки
          </label>

          {lessonsAuthError && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-sm flex items-center justify-between gap-3">
              <span>{lessonsAuthError}</span>
              <Link href="/login">
                <Button size="sm" variant="default" className="h-8 text-xs shrink-0">
                  Войти в систему
                </Button>
              </Link>
            </div>
          )}

          {isLoadingLessons && lessonsList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Загрузка истории уроков...</p>
            </div>
          ) : filteredLessons.length === 0 ? (
            <Card className="text-center py-12 border-dashed">
              <CardContent className="space-y-3">
                <BookOpen className="h-10 w-10 text-muted-foreground/60 mx-auto" />
                <h3 className="font-semibold text-lg">Уроки не найдены</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  {historySearchQuery
                    ? `По запросу "${historySearchQuery}" ничего не найдено`
                    : hideCompletedLessons && lessonsList.length > 0
                    ? "Нет уроков по выбранным фильтрам. Снимите флажок «Скрыть завершённые уроки», чтобы увидеть завершённые занятия."
                    : "Пока нет сохраненных уроков. Запустите урок через раздел «Начать урок»."}
                </p>
                <Link href="/teacher/sessions/new">
                  <Button size="sm" className="mt-2">
                    Создать новый урок
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            /* Accordion list of lessons */
            <div className="space-y-4">
              {filteredLessons.map((lesson) => {
                const isExpanded = expandedLessonId === lesson.id
                const isCompleted = lesson.status === "COMPLETED"
                const isActive = lesson.status === "ACTIVE"
                const isWaiting = lesson.status === "WAITING"

                const createdDate = lesson.created_at
                  ? new Date(lesson.created_at).toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Недавно"

                return (
                  <Card
                    key={lesson.id}
                    className={`transition-all border rounded-2xl shadow-none ${
                      isExpanded ? "border-primary/40 ring-1 ring-primary/20" : "hover:border-primary/30"
                    }`}
                  >
                    {/* Accordion Header / Summary Card */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedLessonId(isExpanded ? null : lesson.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          setExpandedLessonId(isExpanded ? null : lesson.id)
                        }
                      }}
                      className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-bold text-lg text-foreground">
                            {lesson.group_name || "Групповой урок"}
                          </span>

                          {isCompleted && (
                            <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-xs">
                              Завершен
                            </Badge>
                          )}
                          {isActive && (
                            <Badge variant="default" className="bg-blue-600 text-white text-xs animate-pulse">
                              Активен сейчас
                            </Badge>
                          )}
                          {isWaiting && (
                            <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-500/10 text-xs">
                              Ожидание
                            </Badge>
                          )}

                          <Badge variant="secondary" className="text-xs">
                            {lesson.target_role === "DISPATCHER_DDS" ? "Диспетчер ДДС" : "Оператор 112"}
                          </Badge>

                          {lesson.complexity && (
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                              Сложность: {lesson.complexity}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {createdDate}
                          </span>
                          <span>•</span>
                          <span>Урок #{lesson.id.slice(0, 8)}</span>
                          {lesson.categories && lesson.categories.length > 0 && (
                            <>
                              <span>•</span>
                              <span>Категории: {lesson.categories.slice(0, 3).join(", ")}</span>
                            </>
                          )}
                        </p>
                      </div>

                      {/* Quick summary badges & toggle button */}
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="flex items-center gap-3 text-xs">
                          <div className="text-center px-2 py-1 bg-muted/50 rounded">
                            <span className="text-muted-foreground block text-[10px]">Курсантов</span>
                            <span className="font-bold">{lesson.total_cadets}</span>
                          </div>
                          <div className="text-center px-2 py-1 bg-green-500/10 text-green-700 dark:text-green-300 rounded">
                            <span className="block text-[10px]">Сдали</span>
                            <span className="font-bold">{lesson.passed_count}</span>
                          </div>
                          <div className="text-center px-2 py-1 bg-red-500/10 text-destructive rounded">
                            <span className="block text-[10px]">Провалили</span>
                            <span className="font-bold">{lesson.failed_count}</span>
                          </div>
                          {lesson.avg_score !== undefined && lesson.avg_score !== null && (
                            <div className="text-center px-2.5 py-1 bg-primary/10 text-primary rounded font-bold">
                              <span className="block text-[10px] text-muted-foreground">Ср. балл</span>
                              <span>{lesson.avg_score}</span>
                            </div>
                          )}
                        </div>

                        <Button
                          variant={isExpanded ? "default" : "outline"}
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedLessonId(isExpanded ? null : lesson.id)
                          }}
                          className="h-8 text-xs font-semibold gap-1.5"
                        >
                          <span>{isExpanded ? "Скрыть" : "Подробнее"}</span>
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>

                    {/* Accordion Body / Detailed view per cadet & notes */}
                    {isExpanded && (
                      <div className="border-t bg-muted/10 p-5 space-y-6 animate-in fade-in-50 duration-150">
                        {/* DDS Lesson Report for COMPLETED DISPATCHER_DDS */}
                        {isCompleted && lesson.target_role === "DISPATCHER_DDS" && (
                          <DDSLessonReport lessonId={lesson.id} />
                        )}

                        {/* 1. Teacher Notes Block */}
                        <div className="bg-background rounded-xl p-4 border shadow-xs space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                              <FileEdit className="h-4 w-4 text-primary" />
                              <span>Заметки преподавателя к этому уроку</span>
                            </div>

                            {editingNotesId !== lesson.id ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingNotesId(lesson.id)
                                  setEditingNotesText(lesson.teacher_notes || "")
                                }}
                                className="h-7 text-xs gap-1.5"
                              >
                                <FileEdit className="h-3 w-3" />
                                <span>Редактировать заметки</span>
                              </Button>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingNotesId(null)}
                                  className="h-7 text-xs"
                                >
                                  Отмена
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveLessonNotes(lesson.id)}
                                  disabled={isSavingNotes}
                                  className="h-7 text-xs gap-1"
                                >
                                  {isSavingNotes && <Loader2 className="h-3 w-3 animate-spin" />}
                                  <span>Сохранить</span>
                                </Button>
                              </div>
                            )}
                          </div>

                          {editingNotesId === lesson.id ? (
                            <Textarea
                              value={editingNotesText}
                              onChange={(e) => setEditingNotesText(e.target.value)}
                              placeholder="Введите заметки к уроку..."
                              className="text-sm min-h-[80px]"
                            />
                          ) : (
                            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap bg-muted/20 p-3 rounded-lg border">
                              {lesson.teacher_notes?.trim()
                                ? lesson.teacher_notes
                                : "Заметки отсутствуют. Нажмите «Редактировать заметки», чтобы оставить комментарий."}
                            </p>
                          )}
                        </div>

                        {/* 2. Cadets Roster & Results Table */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold flex items-center gap-2">
                              <Users className="h-4 w-4 text-primary" />
                              <span>Курсанты урока ({lesson.students?.length || 0})</span>
                            </h4>

                            <Link href={`/teacher/sessions/live?id=${lesson.id}&status=${lesson.status}`}>
                              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                                <ExternalLink className="h-3.5 w-3.5" />
                                <span>Открыть Live-дашборд урока</span>
                              </Button>
                            </Link>
                          </div>

                          <div className="rounded-xl border bg-background overflow-x-auto w-full">
                            <Table className="min-w-[650px]">
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Курсант</TableHead>
                                  <TableHead>Статус</TableHead>
                                  <TableHead className="text-center">Сдано билетов</TableHead>
                                  <TableHead className="text-center">Провалено</TableHead>
                                  <TableHead className="w-36">Прогресс</TableHead>
                                  <TableHead className="text-right">Итоговый балл</TableHead>
                                  <TableHead className="text-center w-28">Билеты</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {!lesson.students || lesson.students.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-sm">
                                      Нет данных о курсантах для этого урока
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  lesson.students.map((student) => {
                                    const cadetKey = `${lesson.id}-${student.cadet_id}`
                                    const isCadetExpanded = expandedCadetId === cadetKey
                                    const ticketCount = student.tickets?.length || (student.passed + student.failed) || 0

                                    return (
                                      <React.Fragment key={student.cadet_id}>
                                        <TableRow
                                          onClick={() => setExpandedCadetId(isCadetExpanded ? null : cadetKey)}
                                          className="cursor-pointer hover:bg-muted/40 transition-colors"
                                        >
                                          <TableCell className="font-semibold text-sm">
                                            <div className="flex items-center gap-2">
                                              <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                                                {student.cadet_name.charAt(0)}
                                              </div>
                                              <span>{student.cadet_name}</span>
                                            </div>
                                          </TableCell>
                                          <TableCell>
                                            {(() => {
                                              const sStatus = student.status?.toUpperCase()
                                              if (sStatus === "COMPLETED") {
                                                return <Badge variant="default" className="bg-emerald-600 text-xs">Выполнено</Badge>
                                              }
                                              if (sStatus === "INCOMPLETE") {
                                                return <Badge variant="outline" className="text-amber-600 border-amber-500/30 text-xs">Не завершено</Badge>
                                              }
                                              if (sStatus === "UNGRADED") {
                                                return <Badge variant="outline" className="text-xs text-muted-foreground border-border">Выполнено, нет оценки</Badge>
                                              }
                                              if (sStatus === "PASSED") {
                                                return <Badge variant="default" className="bg-emerald-600 text-xs">Сдал</Badge>
                                              }
                                              if (sStatus === "FAILED") {
                                                return <Badge variant="destructive" className="text-xs">Провалил</Badge>
                                              }
                                              if (sStatus === "IN_PROGRESS") {
                                                return <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 text-xs">В процессе</Badge>
                                              }
                                              return <Badge variant="outline" className="text-xs text-muted-foreground">{student.status || "—"}</Badge>
                                            })()}
                                          </TableCell>
                                          <TableCell className="text-center font-medium text-green-600 dark:text-green-400">
                                            {student.passed}
                                          </TableCell>
                                          <TableCell className="text-center font-medium text-destructive">
                                            {student.failed}
                                          </TableCell>
                                          <TableCell>
                                            <div className="flex items-center gap-2">
                                              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                                                <div
                                                  className="bg-primary h-full transition-all"
                                                  style={{ width: `${student.progress}%` }}
                                                />
                                              </div>
                                              <span className="text-xs text-muted-foreground w-8 text-right font-medium">
                                                {student.progress}%
                                              </span>
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-right font-bold text-sm">
                                            {student.score !== undefined && student.score !== null ? `${student.score}/100` : "Нет оценки"}
                                          </TableCell>
                                          <TableCell className="text-center">
                                            <Button
                                              variant={isCadetExpanded ? "secondary" : "ghost"}
                                              size="sm"
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                setExpandedCadetId(isCadetExpanded ? null : cadetKey)
                                              }}
                                              className="h-7 text-xs gap-1 px-2"
                                            >
                                              <Ticket className="h-3 w-3" />
                                              <span>Билеты ({ticketCount})</span>
                                              {isCadetExpanded ? (
                                                <ChevronUp className="h-3 w-3" />
                                              ) : (
                                                <ChevronDown className="h-3 w-3" />
                                              )}
                                            </Button>
                                          </TableCell>
                                        </TableRow>

                                        {/* Detailed Tickets Sub-Row */}
                                        {isCadetExpanded && (
                                          <TableRow className="bg-muted/20 hover:bg-muted/20">
                                            <TableCell colSpan={7} className="p-4">
                                              <div className="space-y-3 bg-card p-4 rounded-xl border shadow-xs">
                                                <div className="flex items-center justify-between border-b pb-2">
                                                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                                                    <Ticket className="h-4 w-4 text-primary" />
                                                    <span>Пройденные билеты курсанта: {student.cadet_name}</span>
                                                  </div>
                                                  <Badge variant="outline" className="text-xs">
                                                    Всего билетов: {student.tickets?.length || 0}
                                                  </Badge>
                                                </div>

                                                {!student.tickets || student.tickets.length === 0 ? (
                                                  <p className="text-xs text-muted-foreground py-2 italic">
                                                    Курсант пока не решил ни одного билета в рамках этого урока.
                                                  </p>
                                                ) : (
                                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                                    {student.tickets.map((t) => (
                                                      <div
                                                        key={t.ticket_id}
                                                        className="p-3.5 rounded-lg border bg-background space-y-2.5 shadow-2xs hover:border-primary/30 transition-colors"
                                                      >
                                                        <div className="flex items-start justify-between gap-2">
                                                          <div className="space-y-0.5">
                                                            <h5 className="font-semibold text-sm leading-snug text-foreground">
                                                              {t.title}
                                                            </h5>
                                                            <span className="text-[10px] text-muted-foreground font-mono block">
                                                              ID: {t.ticket_id} {t.card_id ? `• Карточка: ${t.card_id}` : ""}
                                                            </span>
                                                          </div>

                                                          {(() => {
                                                            const tStatus = t.status?.toLowerCase()
                                                            if (tStatus === "ungraded") {
                                                              return <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground border-border">Выполнено, нет оценки</Badge>
                                                            }
                                                            if (tStatus === "completed") {
                                                              return <Badge variant="outline" className="text-xs shrink-0 text-slate-700 dark:text-slate-300 border-slate-500/30">Выполнено</Badge>
                                                            }
                                                            if (tStatus === "incomplete") {
                                                              return <Badge variant="outline" className="text-amber-600 border-amber-500/30 text-xs shrink-0">Не завершено</Badge>
                                                            }
                                                            if (tStatus === "passed") {
                                                              return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-xs shrink-0">Сдан</Badge>
                                                            }
                                                            if (tStatus === "failed") {
                                                              return <Badge variant="destructive" className="text-xs shrink-0">Провален</Badge>
                                                            }
                                                            if (tStatus === "in_progress") {
                                                              return <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 text-xs shrink-0">В процессе</Badge>
                                                            }
                                                            return <Badge variant="outline" className="text-xs shrink-0">{t.status || "—"}</Badge>
                                                          })()}
                                                        </div>

                                                        <div className="flex items-center justify-between text-xs pt-1.5 border-t gap-2 flex-wrap">
                                                          <div className="flex items-center gap-1.5">
                                                            <span className="text-muted-foreground font-medium">Оценка за билет:</span>
                                                            <span className="font-bold text-foreground">
                                                              {t.score !== undefined && t.score !== null ? `${t.score}/100` : "Нет оценки"}
                                                            </span>
                                                          </div>

                                                          {(t.record_id || t.card_id) && (
                                                            <Button
                                                              type="button"
                                                              size="sm"
                                                              variant="outline"
                                                              className="h-7 text-xs"
                                                              onClick={() => openRecordFromHistory((t.record_id || t.card_id)!, student.cadet_name)}
                                                            >
                                                              Разобрать ответ
                                                            </Button>
                                                          )}

                                                          {(() => {
                                                            const isTicketActiveOrUnsubmitted =
                                                              t.status?.toLowerCase() === "in_progress" ||
                                                              t.status?.toLowerCase() === "incomplete" ||
                                                              student.status?.toUpperCase() === "IN_PROGRESS" ||
                                                              student.status?.toLowerCase() === "in_progress" ||
                                                              student.status?.toUpperCase() === "INCOMPLETE" ||
                                                              student.status?.toLowerCase() === "incomplete"
                                                            if (isTicketActiveOrUnsubmitted) return null

                                                            const recId = t.record_id || t.card_id
                                                            if (!recId) return null
                                                            const isEdit = t.score !== null && t.score !== undefined

                                                            return (
                                                              <Button
                                                                type="button"
                                                                size="sm"
                                                                variant={isEdit ? "outline" : "default"}
                                                                onClick={() => {
                                                                  setGradingState({
                                                                    isOpen: true,
                                                                    recordId: recId,
                                                                    cadetName: student.cadet_name,
                                                                    ticketTitle: t.title,
                                                                    isEdit,
                                                                    initialScore: t.score,
                                                                    initialComment: t.teacher_comment,
                                                                    initialAutomaticScore: t.automatic_score,
                                                                    initialExpertScore: t.expert_score,
                                                                  })
                                                                }}
                                                                className="h-7 text-xs font-semibold"
                                                              >
                                                                {isEdit ? "Изменить оценку" : "Выставить оценку"}
                                                              </Button>
                                                            )
                                                          })()}
                                                        </div>

                                                        {/* Errors List */}
                                                        <div className="text-xs pt-1 border-t space-y-1">
                                                          <div className="flex items-center justify-between text-muted-foreground font-medium">
                                                            <span>Ошибки:</span>
                                                            <span>{t.errors?.length || t.errors_count || 0}</span>
                                                          </div>

                                                          {t.score === null || t.score === undefined ? (
                                                            <div className="text-[11px] text-muted-foreground italic py-0.5">
                                                              Оценивание не производилось (нет оценки)
                                                            </div>
                                                          ) : !t.errors || t.errors.length === 0 ? (
                                                            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium py-0.5">
                                                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                                              <span>Ошибок не обнаружено</span>
                                                            </div>
                                                          ) : (
                                                            <ul className="space-y-1 pl-0.5 pt-0.5">
                                                              {t.errors.map((err, errIdx) => (
                                                                <li key={errIdx} className="flex items-start gap-1.5 text-destructive leading-tight">
                                                                  <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                                                  <span>{err}</span>
                                                                </li>
                                                              ))}
                                                            </ul>
                                                          )}
                                                        </div>

                                                        {/* Actions Journal */}
                                                        {t.actions && t.actions.length > 0 && (
                                                          <div className="text-xs pt-2 border-t space-y-1.5">
                                                            <div className="flex items-center justify-between text-muted-foreground font-semibold text-[11px]">
                                                              <span>Журнал действий ({t.actions.length}):</span>
                                                            </div>
                                                            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                                                              {t.actions.map((act, actIdx) => (
                                                                <div key={actIdx} className="p-1.5 rounded bg-muted/40 border border-border/50 text-[11px] space-y-0.5">
                                                                  <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                                                                    <span className="font-semibold text-foreground">{act.service_name || "Служба"}</span>
                                                                    <span>{act.at ? new Date(act.at).toLocaleTimeString() : ""}</span>
                                                                  </div>
                                                                  {act.status && (
                                                                    <div className="text-foreground">
                                                                      Статус: <span className="font-medium">{act.status}</span>
                                                                      {act.order_number ? ` (наряд: ${act.order_number})` : ""}
                                                                    </div>
                                                                  )}
                                                                  {act.who_accepted && (
                                                                    <div className="text-muted-foreground">
                                                                      Принял: <span className="text-foreground">{act.who_accepted}</span>
                                                                    </div>
                                                                  )}
                                                                  {act.summary && (
                                                                    <div className="text-muted-foreground">
                                                                      Суть: <span className="text-foreground">{act.summary}</span>
                                                                    </div>
                                                                  )}
                                                                  {act.comment && (
                                                                    <div className="text-muted-foreground italic">
                                                                      «{act.comment}»
                                                                    </div>
                                                                  )}
                                                                </div>
                                                              ))}
                                                            </div>
                                                          </div>
                                                        )}
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        )}
                                      </React.Fragment>
                                    )
                                  })
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ────────────────── SECTION 2: ЖУРНАЛ РАЗБОРА (СПЛИТ-СКРИН) ────────────────── */}
      {(activeTab === "all" || activeTab === "split") && (
        <div className="space-y-6">
          <div className="rounded-xl border p-4 space-y-2 text-sm">
            <p>Здесь можно сравнить ответ курсанта с правильным образцом, разобрать ошибки и выставить или изменить оценку.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setActiveTab("history")}>
              Выбрать ответ из истории уроков
            </Button>
            <p className="text-muted-foreground">В истории откройте урок и билеты курсанта, затем нажмите «Разобрать ответ».</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 p-3 rounded-xl border">
            <div className="space-y-1.5">
              <label htmlFor="lesson-select" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <BookOpen className="h-4 w-4 text-primary" />
                Выбор занятия для разбора:
              </label>
              <div className="flex items-center gap-2">
                <select
                  id="lesson-select"
                  aria-label="Выбор урока"
                  value={selectedLessonId}
                  onChange={(e) => handleSelectLesson(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">-- Выберите занятие для разбора ответов --</option>
                  {filteredLessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.group_name || `Урок #${l.id.slice(0, 8)}`} — {l.mode === "EXAM" ? "Экзамен" : "Тренировка"} ({l.status === "COMPLETED" ? "Завершён" : l.status === "ACTIVE" ? "В процессе" : "Ожидание"})
                    </option>
                  ))}
                </select>
                {selectedLessonId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectLesson(selectedLessonId)}
                    disabled={isLoadingSession}
                    title="Обновить данные занятия"
                    aria-label="Обновить занятие"
                    className="h-8 px-2 shrink-0"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingSession ? "animate-spin" : ""}`} />
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="session-id-input" className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                Или ID конкретной сессии:
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="session-id-input"
                  aria-label="Идентификатор сессии"
                  placeholder="ID сессии..."
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  className="h-8 text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedLessonId("")
                    fetchSessionAnalytics(sessionId)
                  }}
                  disabled={isLoadingSession || !sessionId.trim()}
                  className="flex items-center gap-1.5 h-8 text-xs shrink-0"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoadingSession ? "animate-spin" : ""}`} />
                  Обновить
                </Button>
              </div>
            </div>
          </div>

          {errorMessage && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{errorMessage}</p>}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Sidebar: Детализация по курсантам */}
            <div className="lg:col-span-4 space-y-4">
              <Card className="h-full rounded-2xl shadow-none">
                <CardHeader className="pb-3 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">Детализация по курсантам</CardTitle>
                    </div>
                    <Badge variant="secondary">{filteredCadets.length} курсантов</Badge>
                  </div>
                  <CardDescription>
                    Список курсантов с процентом успеха
                  </CardDescription>

                  <div className="relative mt-2">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Поиск курсанта..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 text-sm h-9"
                    />
                  </div>
                </CardHeader>

                <CardContent className="pt-4 px-4 space-y-3">
                  {filteredCadets.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      {isLoadingSession
                        ? "Загрузка сессии..."
                        : sessionData.session_id
                        ? (selectedLessonId ? "В выбранном занятии пока нет ответов курсантов" : "Курсанты не найдены")
                        : "Выберите занятие из списка выше или загрузите сессию по её ID"}
                    </div>
                  ) : (
                    filteredCadets.map((cadet) => {
                      const isHighRate = cadet.success_rate != null && cadet.success_rate >= 80
                      const isMidRate = cadet.success_rate != null && cadet.success_rate >= 50 && cadet.success_rate < 80

                      return (
                        <div
                          key={cadet.cadet_id}
                          className="border rounded-lg p-3 bg-card hover:bg-accent/40 transition-colors space-y-2.5"
                          data-testid={`cadet-card-${cadet.cadet_id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-semibold text-sm text-foreground">
                              {cadet.cadet_name}
                            </div>
                            <Badge
                              className={
                                cadet.success_rate == null
                                  ? "bg-muted text-muted-foreground"
                                  : isHighRate
                                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                  : isMidRate
                                  ? "bg-amber-500 text-white hover:bg-amber-600"
                                  : "bg-rose-600 text-white hover:bg-rose-700"
                              }
                              data-testid={`success-rate-${cadet.cadet_id}`}
                            >
                              {cadet.success_rate == null ? "Нет оценки" : `${cadet.success_rate}% успеха`}
                            </Badge>
                          </div>

                          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                isHighRate
                                  ? "bg-emerald-600"
                                  : isMidRate
                                  ? "bg-amber-500"
                                  : "bg-rose-600"
                              }`}
                              style={{ width: `${Math.max(0, Math.min(100, cadet.success_rate ?? 0))}%` }}
                            />
                          </div>

                          <div className="space-y-1.5 pt-1">
                            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                              Ответы на билеты:
                            </span>
                            {cadet.records.map((rec) => {
                              const isSelected = selectedRecord?.record_id === rec.record_id

                              return (
                                <button
                                  key={rec.record_id}
                                  type="button"
                                  onClick={() => {
                                    if (rec.etalon && rec.student_answer) {
                                      ++recordRequestRef.current
                                      setIsLoadingRecord(false)
                                      setErrorMessage(null)
                                      setSelectedRecord({
                                        ...rec,
                                        cadet_name: cadet.cadet_name,
                                        cadet_id: cadet.cadet_id,
                                        error_details: rec.error_details || [],
                                      } as RecordDetail)
                                    } else {
                                      loadRecordDetail(rec.record_id, cadet.cadet_name)
                                    }
                                  }}
                                  className={`w-full text-left p-2 rounded-md border text-xs flex items-center justify-between transition-all ${
                                    isSelected
                                      ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40 font-medium"
                                      : "border-border/70 hover:border-primary/50 bg-background hover:bg-muted/40"
                                  }`}
                                  data-testid={`record-item-${rec.record_id}`}
                                >
                                  <div className="truncate pr-2">
                                    <div className="font-medium text-foreground truncate">
                                      {rec.title || `Ответ #${rec.record_id}`}
                                    </div>
                                    <div className="text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                      <span>{rec.status === "passed" ? "Зачтено" : rec.status === "failed" ? "Не зачтено" : rec.status === "in_progress" ? "В процессе" : rec.status === "incomplete" ? "Не завершено" : rec.score == null ? "Ожидает проверки" : "Проверено"}</span>
                                      {rec.is_appealed && (
                                        <span className="text-purple-600 dark:text-purple-400 font-semibold">
                                          • Апелляция
                                        </span>
                                      )}
                                      {rec.errors_count !== undefined && rec.errors_count > 0 && (
                                        <span className="text-rose-500">
                                          • Ошибок: {rec.errors_count}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Split Screen Panel */}
            <div className="lg:col-span-8">
              {isLoadingRecord ? (
                <Card className="flex items-center justify-center gap-2 p-12 text-muted-foreground" role="status">
                  <Loader2 className="h-5 w-5 animate-spin" /> Загрузка ответа курсанта...
                </Card>
              ) : selectedRecord ? (
                <SplitScreen
                  record={selectedRecord}
                  onAppeal={handleAppeal}
                  onClose={() => {
                    ++recordRequestRef.current
                    setSelectedRecord(null)
                  }}
                />
              ) : (
                <Card className="h-full flex items-center justify-center p-12 text-center text-muted-foreground border-dashed">
                  <div className="space-y-3 max-w-sm">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground/60" />
                    <h3 className="font-semibold text-lg text-foreground">Ответ не выбран</h3>
                    <p className="text-sm">
                      Выберите ответ курсанта из списка слева, чтобы открыть сплит-скрин карточки и правильного образца.
                    </p>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── SECTION 3: ОТЧЕТ ИИ ПО ГРУППЕ (QWEN 3.5 9B) ────────────────── */}
      {(activeTab === "all" || activeTab === "ai_report") && (
        <Card className="border rounded-2xl shadow-none">
          <CardHeader className="bg-muted/15 border-b p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    Отчет ИИ по группе
                    <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400 text-xs">
                      Qwen 3.5 9B
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Фоновый анализ системных ошибок, динамики освоения регламентов и рекомендации для преподавателя
                  </CardDescription>
                </div>
              </div>

              {/* Group Selector and Action Button */}
              <div className="flex items-center gap-3">
                <select
                  value={selectedAiGroup}
                  onChange={(e) => {
                    setSelectedAiGroup(e.target.value)
                    fetchGroupAiReports(e.target.value)
                  }}
                  className="h-9 px-3 rounded-lg border bg-background text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                >
                  <option value="" disabled>Выберите группу</option>
                  {allGroupOptions.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>

                <Button
                  size="sm"
                  onClick={handleTriggerGroupAi}
                  disabled={isTriggeringGroupAi || !selectedAiGroup}
                  className="gap-2 text-xs font-semibold bg-primary hover:bg-primary/90 cursor-pointer"
                >
                  {isTriggeringGroupAi ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Анализ группы...</span>
                    </>
                  ) : (
                    <>
                      <Bot className="h-3.5 w-3.5" />
                      <span>Сформировать отчет ИИ</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5">
            {isLoadingAiReport ? (
              <div className="text-center py-12">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
                <p className="text-xs text-muted-foreground">Загрузка аналитических отчетов ИИ...</p>
              </div>
            ) : groupAiReports.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-xl bg-muted/20 space-y-2">
                <Bot className="h-10 w-10 mx-auto text-muted-foreground/40 mb-1" />
                <p className="text-sm font-semibold text-foreground">Отчеты ИИ по выбранной группе отсутствуют</p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Выберите группу и нажмите «Сформировать отчет ИИ», чтобы запустить фоновый синтез глубокого методического разбора (Qwen 3.5 9B).
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {groupAiReports.map((report) => (
                  <div
                    key={report.advice_id}
                    className="p-5 rounded-xl border bg-card hover:border-primary/40 transition-all shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between border-b pb-3">
                      <div className="flex items-center gap-2">
                        <Bot className="h-5 w-5 text-amber-500" />
                        <span className="font-bold text-sm text-foreground">
                          Сводный отчет по группе
                        </span>
                        <Badge variant="outline" className="text-xs py-0 font-mono">
                          {report.model_used || "Qwen 3.5 9B"}
                        </Badge>
                      </div>

                      <span className="text-xs text-muted-foreground">
                        {new Date(report.date).toLocaleString("ru-RU", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <div className="text-xs sm:text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                      {report.analysis_text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Teacher Grading Dialog */}
      <GradeDialog
        isOpen={gradingState.isOpen}
        onClose={() => setGradingState((prev) => ({ ...prev, isOpen: false }))}
        onSuccess={handleGradingSuccess}
        onOpenSplitScreen={(recId) => {
          openRecordFromHistory(recId, gradingState.cadetName)
        }}
        recordId={gradingState.recordId}
        cadetName={gradingState.cadetName}
        ticketTitle={gradingState.ticketTitle}
        isEdit={gradingState.isEdit}
        initialScore={gradingState.initialScore}
        initialComment={gradingState.initialComment}
        initialAutomaticScore={gradingState.initialAutomaticScore}
        initialExpertScore={gradingState.initialExpertScore}
      />
    </div>
  )
}
