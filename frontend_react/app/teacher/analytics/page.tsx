"use client"

import React, { useState, useEffect, useCallback } from "react"
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
  Flame,
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
  avg_score: number
  total_sessions: number
  passed_count: number
  failed_count: number
  pass_rate: number
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

export interface ErrorTypeInfo {
  key: string
  label: string
  category: string
  severity?: string
}

export interface EntityErrorInfo {
  id: string
  name: string
  group_name?: string | null
  error_counts: Record<string, number>
  total_errors: number
}

export interface ErrorHeatmapData {
  error_types: ErrorTypeInfo[]
  entities: EntityErrorInfo[]
  totals_by_error: Record<string, number>
}

function getHeatmapColor(count: number, maxCount: number): string {
  if (!count || count === 0) return "bg-muted/15 text-muted-foreground/40 border border-transparent"
  const ratio = maxCount > 0 ? count / maxCount : 0
  if (ratio < 0.3) {
    return "bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/35 font-medium"
  } else if (ratio < 0.7) {
    return "bg-orange-500/35 text-orange-950 dark:text-orange-100 border border-orange-500/50 font-semibold"
  } else {
    return "bg-red-500/50 text-red-950 dark:text-red-100 border border-red-500/70 font-bold shadow-xs"
  }
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
  success_rate: number
  records: CadetRecordSummary[]
}

export interface SessionData {
  session_id: string
  title: string
  created_at?: string
  cadets: CadetSummary[]
}

export interface CadetTicketSummary {
  ticket_id: string
  title: string
  status: "passed" | "failed" | "in_progress" | string
  score?: number | null
  errors_count: number
  errors?: string[]
  completed_at?: string | null
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

// Initial demo/fallback state for instant rendering and resilient testing
const DEFAULT_SESSION_DATA: SessionData = {
  session_id: "session-1",
  title: "Сессия аттестации: Экстренное реагирование 112",
  created_at: "2026-09-24T10:00:00Z",
  cadets: [
    {
      cadet_id: "cadet-101",
      cadet_name: "Иванов Иван Алексеевич",
      success_rate: 50,
      records: [
        {
          record_id: "rec-1",
          ticket_id: "ticket-42",
          title: "Билет №42: ДТП с пострадавшими на Ленина",
          status: "failed",
          score: 50,
          is_appealed: false,
          errors_count: 2,
          etalon: {
            caller_name: "Сергей Петрович",
            phone: "+7 (999) 111-22-33",
            address: "ул. Ленина, д. 15",
            incident_type: "ДТП с пострадавшими",
            services: ["01 (Пожарные)", "02 (Полиция)", "03 (Скорая)"],
            description: "Столкновение легкового авто и грузовика, заблокирован водитель",
          },
          student_answer: {
            caller_name: "Сергей Петрович",
            phone: "+7 (999) 111-22-33",
            address: "ул. Лермонтова, д. 15",
            incident_type: "ДТП с пострадавшими",
            services: ["02 (Полиция)"],
            description: "Авария на дороге",
          },
          error_details: [
            {
              field: "address",
              severity: "error",
              message: "Неверный адрес: указана 'ул. Лермонтова' вместо правильного 'ул. Ленина'",
            },
            {
              field: "services",
              severity: "warning",
              message: "Не все службы вызваны: '01', '03'",
            },
          ],
        },
        {
          record_id: "rec-2",
          ticket_id: "ticket-10",
          title: "Билет №10: Запах газа в подъезде",
          status: "passed",
          score: 100,
          is_appealed: false,
          errors_count: 0,
          etalon: {
            caller_name: "Мария Ивановна",
            phone: "+7 (911) 555-44-33",
            address: "пр. Мира, д. 8, под. 2",
            incident_type: "Утечка газа",
            services: ["04 (Газовая служба)"],
            description: "Сильный запах газа на 3 этаже",
          },
          student_answer: {
            caller_name: "Мария Ивановна",
            phone: "+7 (911) 555-44-33",
            address: "пр. Мира, д. 8, под. 2",
            incident_type: "Утечка газа",
            services: ["04 (Газовая служба)"],
            description: "Сильный запах газа на 3 этаже",
          },
          error_details: [],
        },
      ],
    },
    {
      cadet_id: "cadet-102",
      cadet_name: "Петрова Анна Сергеевна",
      success_rate: 100,
      records: [
        {
          record_id: "rec-3",
          ticket_id: "ticket-05",
          title: "Билет №05: Возгорание в жилом доме",
          status: "passed",
          score: 95,
          is_appealed: false,
          errors_count: 0,
          etalon: {
            caller_name: "Николай",
            phone: "+7 (900) 333-22-11",
            address: "ул. Садовая, д. 4",
            incident_type: "Пожар",
            services: ["01", "03"],
            description: "Дым из окна 2 этажа",
          },
          student_answer: {
            caller_name: "Николай",
            phone: "+7 (900) 333-22-11",
            address: "ул. Садовая, д. 4",
            incident_type: "Пожар",
            services: ["01", "03"],
            description: "Дым из окна 2 этажа",
          },
          error_details: [],
        },
      ],
    },
  ],
}

const DEFAULT_LESSONS_HISTORY: LessonHistoryItem[] = [
  {
    id: "lesson-demo-1",
    group_id: "group-101",
    group_name: "Группа 101",
    target_role: "OPERATOR_112",
    status: "COMPLETED",
    complexity: "level_2",
    categories: ["Пожары", "ДТП"],
    total_cadets: 4,
    passed_count: 3,
    failed_count: 1,
    avg_score: 87.5,
    teacher_notes: "Группа в целом показала хорошую скорость реакции на ДТП. Требуется повторить регламент вызова службы газа.",
    created_at: "2026-09-24T14:30:00Z",
    completed_at: "2026-09-24T15:15:00Z",
    students: [
      {
        cadet_id: "cadet-1",
        cadet_name: "Иванов Иван",
        status: "PASSED",
        progress: 100,
        score: 92,
        passed: 2,
        failed: 0,
        tickets: [
          {
            ticket_id: "ticket-101",
            title: "Билет №1: Пожар в жилом помещении на 4 этаже",
            status: "passed",
            score: 95,
            errors_count: 0,
            errors: [],
          },
          {
            ticket_id: "ticket-102",
            title: "Билет №2: Запах газа в подъезде многоквартирного дома",
            status: "passed",
            score: 89,
            errors_count: 0,
            errors: [],
          },
        ],
      },
      {
        cadet_id: "cadet-2",
        cadet_name: "Петров Петр",
        status: "PASSED",
        progress: 100,
        score: 98,
        passed: 3,
        failed: 0,
        tickets: [
          {
            ticket_id: "ticket-103",
            title: "Билет №1: Возгорание электрощитовой в подвале",
            status: "passed",
            score: 100,
            errors_count: 0,
            errors: [],
          },
          {
            ticket_id: "ticket-104",
            title: "Билет №2: ДТП без пострадавших на трассе",
            status: "passed",
            score: 96,
            errors_count: 0,
            errors: [],
          },
        ],
      },
      {
        cadet_id: "cadet-3",
        cadet_name: "Сидорова Анна",
        status: "FAILED",
        progress: 100,
        score: 64,
        passed: 1,
        failed: 1,
        tickets: [
          {
            ticket_id: "ticket-105",
            title: "Билет №1: Ложное срабатывание пожарной сигнализации",
            status: "passed",
            score: 88,
            errors_count: 0,
            errors: [],
          },
          {
            ticket_id: "ticket-106",
            title: "Билет №2: ДТП с пострадавшими на перекрестке",
            status: "failed",
            score: 40,
            errors_count: 2,
            errors: [
              "Не передана карточка происшествия в службу скорой помощи (03)",
              "Превышено допустимое время опроса заявителя (более 75 секунд)",
            ],
          },
        ],
      },
      {
        cadet_id: "cadet-4",
        cadet_name: "Кузнецов Алексей",
        status: "PASSED",
        progress: 100,
        score: 86,
        passed: 2,
        failed: 0,
        tickets: [
          {
            ticket_id: "ticket-107",
            title: "Билет №1: Задымление в торговом центре",
            status: "passed",
            score: 86,
            errors_count: 0,
            errors: [],
          },
        ],
      },
    ],
  },
]

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

const DEFAULT_HEATMAP_DATA: ErrorHeatmapData = {
  error_types: [
    { key: "comm_rude_tone", label: "Грубый тон", category: "communication", severity: "high" },
    { key: "comm_interruption", label: "Перебивание", category: "communication", severity: "medium" },
    { key: "comm_clarification_missed", label: "Пропуск уточнения", category: "communication", severity: "medium" },
    { key: "card_wrong_address", label: "Ошибка адреса", category: "card", severity: "critical" },
    { key: "card_wrong_services", label: "Неверные службы", category: "card", severity: "critical" },
    { key: "card_missing_caller", label: "Данные заявителя", category: "card", severity: "medium" },
    { key: "sla_dispatch_delay", label: "Задержка ДДС", category: "sla", severity: "high" },
    { key: "sla_call_duration_exceeded", label: "Время звонка", category: "sla", severity: "medium" },
  ],
  entities: [
    {
      id: "cadet-101",
      name: "Денисов Д. А.",
      group_name: "Группа 101-П",
      error_counts: { comm_rude_tone: 1, card_wrong_address: 3, sla_dispatch_delay: 2 },
      total_errors: 6,
    },
    {
      id: "cadet-102",
      name: "Соколов А. В.",
      group_name: "Группа 101-П",
      error_counts: { card_wrong_services: 1, comm_interruption: 1 },
      total_errors: 2,
    },
    {
      id: "cadet-103",
      name: "Волков М. С.",
      group_name: "Группа 102-П",
      error_counts: { sla_dispatch_delay: 4, sla_call_duration_exceeded: 3, card_wrong_address: 2 },
      total_errors: 9,
    },
    {
      id: "cadet-104",
      name: "Кузнецова Е. Д.",
      group_name: "Группа 201-С",
      error_counts: { comm_clarification_missed: 2, card_missing_caller: 1 },
      total_errors: 3,
    },
  ],
  totals_by_error: {
    comm_rude_tone: 18,
    comm_interruption: 24,
    comm_clarification_missed: 15,
    card_wrong_address: 34,
    card_wrong_services: 22,
    card_missing_caller: 19,
    sla_dispatch_delay: 29,
    sla_call_duration_exceeded: 27,
  },
}

export interface AnalyticsPageProps {
  initialTab?: "history" | "split" | "all" | "ai_report" | "charts"
}

export default function AnalyticsPage({ initialTab = "all" }: AnalyticsPageProps = {}) {
  const [activeTab, setActiveTab] = useState<"history" | "split" | "all" | "ai_report" | "charts">(initialTab)
  const [sessionId, setSessionId] = useState<string>("session-1")
  const [sessionData, setSessionData] = useState<SessionData>({ session_id: "", title: "", created_at: "", cadets: [] })
  const [selectedRecord, setSelectedRecord] = useState<RecordDetail | null>(
    DEFAULT_SESSION_DATA.cadets[0]?.records[0] as unknown as RecordDetail
  )
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(false)
  const [isLoadingRecord, setIsLoadingRecord] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
  const [availableGroups, setAvailableGroups] = useState<{ id: string; name: string }[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>("ALL")
  const [expandedCadetId, setExpandedCadetId] = useState<string | null>(null)
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [editingNotesText, setEditingNotesText] = useState<string>("")
  const [isSavingNotes, setIsSavingNotes] = useState<boolean>(false)

  // Charts & Dashboards state (ТЗ 75)
  const [isMounted, setIsMounted] = useState<boolean>(false)
  const [dynamicsDays, setDynamicsDays] = useState<number>(30)
  const [dynamicsGroupId, setDynamicsGroupId] = useState<string>("ALL")
  const [dynamicsData, setDynamicsData] = useState<DailyDynamicsPoint[]>([])
  const [groupComparisonData, setGroupComparisonData] = useState<GroupComparisonItem[]>([])
  const [heatmapData, setHeatmapData] = useState<ErrorHeatmapData>({ error_types: [], entities: [], totals_by_error: {} })
  const [heatmapEntityType, setHeatmapEntityType] = useState<"students" | "groups">("students")
  const [heatmapCategory, setHeatmapCategory] = useState<string>("ALL")
  const [heatmapSearch, setHeatmapSearch] = useState<string>("")
  const [isLoadingCharts, setIsLoadingCharts] = useState<boolean>(false)

  const fetchChartsData = useCallback(async () => {
    try {
      setIsLoadingCharts(true)
      const dynGroupParam = dynamicsGroupId !== "ALL" ? `&group_id=${encodeURIComponent(dynamicsGroupId)}` : ""
      const dynRes = await fetch(`/api/analytics/dynamics?days=${dynamicsDays}${dynGroupParam}`)
      if (dynRes.ok) {
        const dJson = await dynRes.json()
        if (Array.isArray(dJson) && dJson.length > 0) {
          setDynamicsData(dJson)
        }
      }

      const compRes = await fetch("/api/analytics/groups-comparison")
      if (compRes.ok) {
        const cJson = await compRes.json()
        if (Array.isArray(cJson) && cJson.length > 0) {
          setGroupComparisonData(cJson)
        }
      }

      const hmCatParam = heatmapCategory !== "ALL" ? `&category=${encodeURIComponent(heatmapCategory)}` : ""
      const hmGroupParam = dynamicsGroupId !== "ALL" ? `&group_id=${encodeURIComponent(dynamicsGroupId)}` : ""
      const hmRes = await fetch(
        `/api/analytics/errors-heatmap?entity_type=${heatmapEntityType}${hmCatParam}${hmGroupParam}`
      )
      if (hmRes.ok) {
        const hJson = await hmRes.json()
        if (hJson && Array.isArray(hJson.entities) && hJson.entities.length > 0) {
          setHeatmapData(hJson)
        }
      }
    } catch (err) {
      console.warn("Could not load charts data from API:", err)
    } finally {
      setIsLoadingCharts(false)
    }
  }, [dynamicsDays, dynamicsGroupId, heatmapEntityType, heatmapCategory])

  useEffect(() => {
    setIsMounted(true)
    fetchChartsData()
  }, [fetchChartsData])

  const filteredHeatmapEntities = React.useMemo(() => {
    if (!heatmapData || !Array.isArray(heatmapData.entities)) return []
    let list = heatmapData.entities
    if (heatmapSearch.trim()) {
      const q = heatmapSearch.toLowerCase()
      list = list.filter(
        (e) => e.name.toLowerCase().includes(q) || (e.group_name && e.group_name.toLowerCase().includes(q))
      )
    }
    return list
  }, [heatmapData, heatmapSearch])


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

  // Fetch session analytics
  const fetchSessionAnalytics = useCallback(async (sid: string) => {
    try {
      setIsLoadingSession(true)
      setErrorMessage(null)
      const res = await fetch(`/api/v1/analytics/sessions/${sid}`)
      if (res.ok) {
        const data = await res.json()
        setSessionData(data)
        const firstCadet = data.cadets?.[0]
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
            loadRecordDetail(firstRec.record_id, firstCadet.cadet_name)
          }
        }
      }
    } catch (err: any) {
      console.warn("Could not load session from API:", err)
    } finally {
      setIsLoadingSession(false)
    }
  }, [])

  // Fetch available groups for filter
  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/groups")
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setAvailableGroups(
            data.map((g: any) => ({
              id: g.group_id || g.id,
              name: g.group_name || g.name || "Группа",
            }))
          )
        }
      }
    } catch (err) {
      console.warn("Could not load groups from API:", err)
    }
  }, [])

  // Fetch lesson history (optionally with group_id filter)
  const fetchLessonsHistory = useCallback(async (groupId?: string) => {
    try {
      setIsLoadingLessons(true)
      const targetGroup = groupId !== undefined ? groupId : selectedGroupId
      const queryParam = targetGroup && targetGroup !== "ALL" ? `?group_id=${encodeURIComponent(targetGroup)}` : ""
      const res = await fetch(`/api/v1/lessons${queryParam}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setLessonsList(data)
          if (!expandedLessonId && data[0]?.id) {
            setExpandedLessonId(data[0].id)
          }
        }
      }
    } catch (err) {
      console.warn("Could not load lessons history from API:", err)
    } finally {
      setIsLoadingLessons(false)
    }
  }, [expandedLessonId, selectedGroupId])

  useEffect(() => {
    fetchSessionAnalytics(sessionId)
    fetchLessonsHistory()
    fetchGroups()
  }, [fetchSessionAnalytics, fetchLessonsHistory, fetchGroups, sessionId])

  // Save updated teacher notes for a lesson
  const handleSaveLessonNotes = async (lessonId: string) => {
    try {
      setIsSavingNotes(true)
      const res = await fetch(`/api/v1/lessons/${lessonId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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

  // Load single record details
  const loadRecordDetail = async (recordId: string, cadetName?: string) => {
    try {
      setIsLoadingRecord(true)
      const res = await fetch(`/api/v1/analytics/records/${recordId}`)
      if (res.ok) {
        const data: RecordDetail = await res.json()
        if (cadetName && !data.cadet_name) {
          data.cadet_name = cadetName
        }
        setSelectedRecord(data)
      } else {
        for (const cadet of sessionData.cadets) {
          const rec = cadet.records.find((r) => r.record_id === recordId)
          if (rec && rec.etalon && rec.student_answer) {
            setSelectedRecord({
              ...rec,
              cadet_name: cadet.cadet_name,
              cadet_id: cadet.cadet_id,
              error_details: rec.error_details || [],
            } as RecordDetail)
            break
          }
        }
      }
    } catch (err) {
      console.warn("Could not load record details from API:", err)
    } finally {
      setIsLoadingRecord(false)
    }
  }

  // Handle appeal submission
  const handleAppeal = async (recordId: string, payload: { status: string; comment: string }) => {
    const res = await fetch(`/api/v1/analytics/records/${recordId}/appeal`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      throw new Error(`Ошибка при отправке апелляции (${res.status})`)
    }

    const updatedData = await res.json().catch(() => null)

    setSelectedRecord((prev) => {
      if (!prev) return null
      return {
        ...prev,
        status: payload.status,
        teacher_comment: payload.comment,
        is_appealed: true,
        ...(updatedData && typeof updatedData === "object" ? updatedData : {}),
      }
    })

    setSessionData((prev) => {
      const updatedCadets = prev.cadets.map((cadet) => {
        const hasRecord = cadet.records.some((r) => r.record_id === recordId)
        if (!hasRecord) return cadet

        const updatedRecords = cadet.records.map((r) => {
          if (r.record_id === recordId) {
            return {
              ...r,
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
  }

  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false)

  const handleExportExcel = async () => {
    try {
      setIsExportingExcel(true)

      // 1. Gather records from active session or lessons history
      const customRecords: any[] = []

      // Add cadets from current session
      if (sessionData && sessionData.cadets && sessionData.cadets.length > 0) {
        for (const cadet of sessionData.cadets) {
          if (cadet.records && cadet.records.length > 0) {
            for (const r of cadet.records) {
              customRecords.push({
                cadet_name: cadet.cadet_name,
                ticket_id: r.title || r.ticket_id || "Билет",
                comm_metrics: {
                  greeting_success: true,
                  filler_words: 0,
                  script_followed_pct: 100,
                },
                card_metrics: {
                  address_correct: true,
                  services_matched: true,
                  over_dispatched_services: [],
                  missed_critical_factoids: [],
                },
                sla_metrics: {
                  sla_breached_count: 0,
                  time_to_first_dispatch_sec: 40,
                },
              })
            }
          } else {
            customRecords.push({
              cadet_name: cadet.cadet_name,
              ticket_id: "Билет",
              comm_metrics: { greeting_success: true, filler_words: 0, script_followed_pct: 100 },
              card_metrics: {
                address_correct: true,
                services_matched: true,
                over_dispatched_services: [],
                missed_critical_factoids: [],
              },
              sla_metrics: { sla_breached_count: 0, time_to_first_dispatch_sec: 35 },
            })
          }
        }
      }

      // Add students from lessons if sessionData had no records
      if (customRecords.length === 0 && lessonsList && lessonsList.length > 0) {
        for (const lesson of lessonsList) {
          for (const student of lesson.students || []) {
            customRecords.push({
              cadet_name: student.cadet_name,
              ticket_id: lesson.group_name || `Урок #${lesson.id.slice(0, 6)}`,
              comm_metrics: { greeting_success: true, filler_words: 0, script_followed_pct: 100 },
              card_metrics: {
                address_correct: true,
                services_matched: true,
                over_dispatched_services: [],
                missed_critical_factoids: [],
              },
              sla_metrics: { sla_breached_count: 0, time_to_first_dispatch_sec: 30 },
            })
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
          custom_records: customRecords.length > 0 ? customRecords : undefined,
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
    availableGroups.forEach((g) => {
      if (g.id) map.set(g.id, g.name)
    })
    lessonsList.forEach((l) => {
      if (l.group_id) {
        map.set(l.group_id, l.group_name || `Группа ${l.group_id.slice(0, 6)}`)
      }
    })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [availableGroups, lessonsList])

  const filteredCadets = sessionData.cadets.filter((c) =>
    c.cadet_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredLessons = lessonsList.filter((l) => {
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
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
      {/* ────────────────── Header & Tab Navigation ────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-3">
            <GraduationCap className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Журнал оценок</h1>
              <p className="text-muted-foreground mt-0.5 text-sm md:text-base">
                История групповых уроков, детальная статистика курсантов и экспертный разбор карточек
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons & Tab Switcher */}
        <div className="flex flex-wrap items-center gap-3">
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
          <div className="flex items-center bg-muted/60 p-1 rounded-xl border">
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
        <div className="space-y-8 mb-10" data-testid="analytics-dashboards">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-card/60 backdrop-blur-xs p-5 rounded-2xl border">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-bold tracking-tight">Дашборды успеваемости и статистика</h2>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs">
                  50+ курсантов
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Мониторинг динамики баллов, сравнительный анализ учебных подразделений и карта нарушений регламентов вызова 112
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
                  {availableGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                  {availableGroups.length === 0 && (
                    <>
                      <option value="grp-1">Группа 101-П</option>
                      <option value="grp-2">Группа 102-П</option>
                      <option value="grp-3">Группа 201-С</option>
                      <option value="grp-4">Группа 202-С</option>
                    </>
                  )}
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

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 bg-card/60 backdrop-blur-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Средний балл</span>
                <Award className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-foreground">
                  {dynamicsData.length > 0
                    ? (dynamicsData.reduce((acc, d) => acc + d.avg_score, 0) / dynamicsData.length).toFixed(1)
                    : "84.5"}
                </span>
                <span className="text-xs text-muted-foreground">/ 100</span>
              </div>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                Положительная динамика
              </p>
            </Card>

            <Card className="p-4 bg-card/60 backdrop-blur-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Всего сессий</span>
                <History className="h-4 w-4 text-blue-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-foreground">
                  {dynamicsData.reduce((acc, d) => acc + d.total_sessions, 0) || 821}
                </span>
                <span className="text-xs text-muted-foreground">билетов</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">За выбранный период</p>
            </Card>

            <Card className="p-4 bg-card/60 backdrop-blur-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Успешная сдача</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-foreground">
                  {dynamicsData.length > 0
                    ? (dynamicsData.reduce((acc, d) => acc + d.pass_rate, 0) / dynamicsData.length).toFixed(1)
                    : "86.2"}%
                </span>
                <span className="text-xs text-muted-foreground">с 1-й попытки</span>
              </div>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">Норматив соблюден</p>
            </Card>

            <Card className="p-4 bg-card/60 backdrop-blur-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Зафиксировано ошибок</span>
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-foreground">
                  {Object.values(heatmapData.totals_by_error).reduce((a, b) => a + b, 0) || 565}
                </span>
                <span className="text-xs text-muted-foreground">инцидентов</span>
              </div>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 font-medium">Требуют разбора</p>
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
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground)/0.15)" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(val) => {
                            if (!val) return ""
                            const parts = val.split("-")
                            return parts.length === 3 ? `${parts[2]}.${parts[1]}` : val
                          }}
                          tick={{ fontSize: 11 }}
                          stroke="hsl(var(--muted-foreground)/0.5)"
                        />
                        <YAxis domain={[40, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground)/0.5)" />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "0.75rem",
                            fontSize: "12px",
                            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                          }}
                          formatter={(value: any, name: any) => [
                            `${value} баллов`,
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
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground)/0.15)" />
                        <XAxis
                          dataKey="group_name"
                          tick={{ fontSize: 11 }}
                          stroke="hsl(var(--muted-foreground)/0.5)"
                        />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground)/0.5)" />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "0.75rem",
                            fontSize: "12px",
                            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                          }}
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

          {/* 3. HEATMAP: Тепловая матрица частоты ошибок */}
          <Card className="p-5" data-testid="heatmap-card">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 pb-4 border-b">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-600" />
                  Тепловая карта девиаций и ошибок
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Частота конкретных ошибок у конкретных учеников или групп с цветовой индикацией интенсивности
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative w-44">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Поиск..."
                    value={heatmapSearch}
                    onChange={(e) => setHeatmapSearch(e.target.value)}
                    className="h-8 pl-8 text-xs"
                  />
                </div>

                {/* Entity switch: Students vs Groups */}
                <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border text-xs">
                  <button
                    type="button"
                    onClick={() => setHeatmapEntityType("students")}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                      heatmapEntityType === "students"
                        ? "bg-white dark:bg-card text-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    По курсантам
                  </button>
                  <button
                    type="button"
                    onClick={() => setHeatmapEntityType("groups")}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                      heatmapEntityType === "groups"
                        ? "bg-white dark:bg-card text-foreground shadow-xs font-bold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    По группам
                  </button>
                </div>

                {/* Category Filter Pills */}
                <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border text-xs">
                  {[
                    { id: "ALL", label: "Все" },
                    { id: "communication", label: "Коммуникация" },
                    { id: "card", label: "Карточка" },
                    { id: "sla", label: "SLA" },
                  ].map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setHeatmapCategory(c.id)}
                      className={`px-2 py-1 rounded-md font-medium text-[11px] transition-all ${
                        heatmapCategory === c.id
                          ? "bg-white dark:bg-card text-foreground shadow-xs font-bold"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Heatmap Legend */}
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-3 px-1">
              <span className="text-[11px]">
                Отображено: {filteredHeatmapEntities.length} {heatmapEntityType === "students" ? "курсантов" : "групп"}
              </span>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground">Интенсивность:</span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-xs bg-muted/30 border border-muted" /> 0
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-xs bg-amber-500/20 border border-amber-500/40" /> 1–2
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-xs bg-orange-500/35 border border-orange-500/50" /> 3–5
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-xs bg-red-500/50 border border-red-500/70" /> 6+
                </span>
              </div>
            </div>

            {/* Heatmap Table Matrix */}
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-56 font-bold text-xs sticky left-0 bg-muted/90 backdrop-blur-xs z-10">
                      {heatmapEntityType === "students" ? "Курсант / Группа" : "Учебная группа"}
                    </TableHead>
                    {heatmapData.error_types.map((et) => (
                      <TableHead key={et.key} className="text-center text-xs px-2 py-3 min-w-[110px]">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-semibold text-foreground leading-tight text-[11px]">
                            {et.label}
                          </span>
                          <Badge
                            variant="secondary"
                            className={`text-[9px] px-1 py-0 ${
                              et.category === "communication"
                                ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                                : et.category === "card"
                                ? "bg-purple-500/10 text-purple-700 dark:text-purple-300"
                                : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            }`}
                          >
                            {et.category === "communication" ? "комм" : et.category === "card" ? "карта" : "sla"}
                          </Badge>
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="text-center font-bold text-xs w-20 bg-muted/60">
                      Итого
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHeatmapEntities.slice(0, 15).map((entity) => {
                    const maxVal = Math.max(
                      ...heatmapData.error_types.map((et) => entity.error_counts[et.key] || 0),
                      1
                    )
                    return (
                      <TableRow key={entity.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-medium text-xs sticky left-0 bg-card/95 backdrop-blur-xs z-10 border-r">
                          <div className="font-bold text-foreground truncate max-w-[200px]" title={entity.name}>
                            {entity.name}
                          </div>
                          {entity.group_name && (
                            <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                              {entity.group_name}
                            </div>
                          )}
                        </TableCell>
                        {heatmapData.error_types.map((et) => {
                          const count = entity.error_counts[et.key] || 0
                          return (
                            <TableCell key={et.key} className="p-1.5 text-center">
                              <div
                                className={`h-8 rounded-lg flex items-center justify-center text-xs transition-all ${getHeatmapColor(
                                  count,
                                  maxVal
                                )}`}
                                title={`${entity.name}: ${et.label} — ${count} раз`}
                              >
                                {count > 0 ? count : <span className="opacity-30">—</span>}
                              </div>
                            </TableCell>
                          )
                        })}
                        <TableCell className="text-center font-bold text-xs bg-muted/20 border-l">
                          <Badge
                            variant={entity.total_errors > 5 ? "destructive" : "secondary"}
                            className="font-mono text-[11px]"
                          >
                            {entity.total_errors}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {/* Summary Totals Row */}
                  <TableRow className="bg-muted/50 font-bold border-t-2">
                    <TableCell className="sticky left-0 bg-muted/90 backdrop-blur-xs z-10 text-xs font-bold border-r">
                      Всего по ошибкам
                    </TableCell>
                    {heatmapData.error_types.map((et) => {
                      const colTotal = heatmapData.totals_by_error[et.key] || 0
                      return (
                        <TableCell key={et.key} className="text-center text-xs font-bold p-2 text-foreground font-mono">
                          {colTotal}
                        </TableCell>
                      )
                    })}
                    <TableCell className="text-center font-black text-xs bg-muted/80 text-foreground border-l font-mono">
                      {Object.values(heatmapData.totals_by_error).reduce((a, b) => a + b, 0)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            {filteredHeatmapEntities.length > 15 && (
              <p className="text-[11px] text-muted-foreground text-center mt-3">
                Показаны первые 15 записей из {filteredHeatmapEntities.length}. Используйте поиск для точной фильтрации.
              </p>
            )}
          </Card>
        </div>
      )}

      {/* ────────────────── SECTION 1: ИСТОРИЯ УРОКОВ (ACCORDION) ────────────────── */}
      {(activeTab === "all" || activeTab === "history") && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:max-w-xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по группе, ID или заметкам..."
                  value={historySearchQuery}
                  onChange={(e) => setHistorySearchQuery(e.target.value)}
                  className="pl-9 text-sm"
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
                    fetchLessonsHistory(e.target.value)
                  }}
                  className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
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
                    className={`transition-all border shadow-xs ${
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
                                            {student.status === "PASSED" || (student.passed > 0 && student.failed === 0) ? (
                                              <Badge variant="default" className="bg-emerald-600 text-xs">
                                                Сдал
                                              </Badge>
                                            ) : student.status === "FAILED" || student.failed > 0 ? (
                                              <Badge variant="destructive" className="text-xs">
                                                Провалил
                                              </Badge>
                                            ) : student.status === "IN_PROGRESS" ? (
                                              <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 text-xs">
                                                В процессе
                                              </Badge>
                                            ) : (
                                              <Badge variant="outline" className="text-xs text-muted-foreground">
                                                {student.status}
                                              </Badge>
                                            )}
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
                                            {student.score !== undefined && student.score !== null ? `${student.score}/100` : "—"}
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
                                                              ID: {t.ticket_id}
                                                            </span>
                                                          </div>

                                                          {t.status === "passed" ? (
                                                            <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-xs shrink-0">
                                                              Сдан
                                                            </Badge>
                                                          ) : t.status === "failed" ? (
                                                            <Badge variant="destructive" className="text-xs shrink-0">
                                                              Провален
                                                            </Badge>
                                                          ) : (
                                                            <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 text-xs shrink-0">
                                                              В процессе
                                                            </Badge>
                                                          )}
                                                        </div>

                                                        <div className="flex items-center justify-between text-xs pt-1.5 border-t">
                                                          <span className="text-muted-foreground font-medium">Оценка за билет:</span>
                                                          <span className="font-bold text-foreground">
                                                            {t.score !== undefined && t.score !== null ? `${t.score}/100` : "—"}
                                                          </span>
                                                        </div>

                                                        {/* Errors List */}
                                                        <div className="text-xs pt-1 border-t space-y-1">
                                                          <div className="flex items-center justify-between text-muted-foreground font-medium">
                                                            <span>Ошибки:</span>
                                                            <span>{t.errors?.length || t.errors_count || 0}</span>
                                                          </div>

                                                          {!t.errors || t.errors.length === 0 ? (
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
          <div className="flex items-center justify-between gap-4 bg-muted/30 p-3 rounded-xl border">
            <span className="text-sm font-medium text-muted-foreground">
              Разбор карточек сценариев конкретной сессии:
            </span>
            <div className="flex items-center gap-2">
              <Input
                aria-label="Идентификатор сессии"
                placeholder="ID сессии..."
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className="w-36 md:w-44 h-8 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchSessionAnalytics(sessionId)}
                disabled={isLoadingSession}
                className="flex items-center gap-1.5 h-8 text-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingSession ? "animate-spin" : ""}`} />
                Обновить
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Sidebar: Детализация по курсантам */}
            <div className="lg:col-span-4 space-y-4">
              <Card className="h-full">
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

                <CardContent className="pt-4 px-3 space-y-3 max-h-[750px] overflow-y-auto">
                  {filteredCadets.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      Курсанты не найдены
                    </div>
                  ) : (
                    filteredCadets.map((cadet) => {
                      const isHighRate = cadet.success_rate >= 80
                      const isMidRate = cadet.success_rate >= 50 && cadet.success_rate < 80

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
                                isHighRate
                                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                  : isMidRate
                                  ? "bg-amber-500 text-white hover:bg-amber-600"
                                  : "bg-rose-600 text-white hover:bg-rose-700"
                              }
                              data-testid={`success-rate-${cadet.cadet_id}`}
                            >
                              {cadet.success_rate}% успеха
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
                              style={{ width: `${Math.max(0, Math.min(100, cadet.success_rate))}%` }}
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
                                      <span>{rec.status === "passed" ? "Зачтено" : "Не зачтено"}</span>
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
              {selectedRecord ? (
                <SplitScreen
                  record={selectedRecord}
                  onAppeal={handleAppeal}
                  onClose={() => setSelectedRecord(null)}
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
        <Card className="border shadow-md">
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
                  {availableGroups.map((g) => (
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
    </div>
  )
}
