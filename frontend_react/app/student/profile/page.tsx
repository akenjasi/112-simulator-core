"use client"

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import {
  Headphones,
  Radio,
  Award,
  AlertTriangle,
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Download,
  BookOpen,
  Target,
  Zap,
  Sparkles,
  Bot,
} from "lucide-react"

export interface AIAdviceItem {
  id: string
  advice_id: string
  cadet_id?: string
  analysis_text: string
  date: string
  is_read: boolean
  model_used: string
}

export interface CompetenceItem {
  category: string
  score: number
}

export interface TopErrorItem {
  text: string
  frequency_percent: number
  is_fatal: boolean
}

export interface StudentStats {
  average_score: number
  average_score_week: number
  average_score_month?: number
  average_score_all_time: number
  average_score_7_days: number
  score_trend: number
  average_processing_time_seconds: number
  time_trend: number
  service_accuracy_percent: number
  cards_solved: number
  lessons_completed: number
  competence_matrix: CompetenceItem[]
  top_errors: TopErrorItem[]
  student_id?: string
  full_name?: string
}

export interface HistoryTicket {
  ticket_id: string
  title: string
  category?: string
  status: string
  score?: number
  errors_count: number
  errors: string[]
  completed_at?: string
}

export interface HistoryLesson {
  session_id: string
  lesson_id?: string
  title: string
  target_role: string
  session_type: string
  status: string
  score?: number
  date?: string
  tickets: HistoryTicket[]
}

export interface UserProfile {
  user_id?: string
  student_id?: string
  full_name?: string
  username: string
  role: string
}

interface ReferenceDoc {
  id: string
  title: string
  size: string
  tag: string
  description: string
}

const REFERENCE_DOCS: ReferenceDoc[] = [
  {
    id: "doc-1",
    title: "Алгоритм опроса при ДТП.pdf",
    size: "1.8 МБ",
    tag: "Оператор 112",
    description: "Пошаговый регламент первичного сбора сведений о пострадавших и перекрытии полос",
  },
  {
    id: "doc-2",
    title: "Памятка по службам.pdf",
    size: "840 КБ",
    tag: "Маршрутизация",
    description: "Критерии одновременного привлечения 01, 02, 03, 04 и аварийно-спасательных отрядов",
  },
  {
    id: "doc-3",
    title: "Классификатор происшествий Системы-112.pdf",
    size: "3.2 МБ",
    tag: "Справочник",
    description: "Стандартизированные наименования и категоризация угроз для карточки вызова",
  },
  {
    id: "doc-4",
    title: "Регламент межведомственного взаимодействия ДДС.pdf",
    size: "1.4 МБ",
    tag: "Диспетчер ДДС",
    description: "Порядок передачи сведений реагирующим бригадам и временные нормативы SLA",
  },
]

const DEFAULT_CATEGORIES: CompetenceItem[] = [
  { category: "ДТП", score: 85 },
  { category: "Пожары", score: 78 },
  { category: "ЖКХ", score: 92 },
  { category: "Медицина", score: 65 },
  { category: "Правопорядок", score: 88 },
  { category: "Газ / Взрывы", score: 70 },
]

export default function StudentProfilePage() {
  const [role, setRole] = useState<"OPERATOR_112" | "DISPATCHER_DDS">("OPERATOR_112")
  const [activeTab, setActiveTab] = useState<"lessons" | "docs" | "ai_advice">("lessons")
  const [userProfile, setUserProfile] = useState<UserProfile>({
    username: "cadet@system112.ru",
    full_name: "Иванов Иван Иванович",
    student_id: "СМ1-12",
    role: "CADET",
  })

  const [aiAdvices, setAiAdvices] = useState<AIAdviceItem[]>([])
  const [isLoadingAi, setIsLoadingAi] = useState<boolean>(false)
  const [isTriggeringAi, setIsTriggeringAi] = useState<boolean>(false)

  const [stats, setStats] = useState<StudentStats>({
    average_score: 84.5,
    average_score_week: 86.0,
    average_score_all_time: 84.5,
    average_score_7_days: 86.0,
    score_trend: 3.2,
    average_processing_time_seconds: 68,
    time_trend: -15,
    service_accuracy_percent: 94.8,
    cards_solved: 28,
    lessons_completed: 12,
    competence_matrix: DEFAULT_CATEGORIES,
    top_errors: [
      {
        text: "Задержка передачи карточки в службу 03 более 45 сек",
        frequency_percent: 85,
        is_fatal: true,
      },
      {
        text: "Не уточнено наличие пострадавших и угрозы жизни",
        frequency_percent: 72,
        is_fatal: true,
      },
      {
        text: "Не уточнен точный номер подъезда / этаж",
        frequency_percent: 45,
        is_fatal: false,
      },
      {
        text: "Не продублирован номер телефона заявителя",
        frequency_percent: 28,
        is_fatal: false,
      },
    ],
  })

  const [lessons, setLessons] = useState<HistoryLesson[]>([])
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // Fetch AI advice for cadet
  const loadAiAdvice = useCallback(async (cadetId?: string) => {
    const idToUse = cadetId || userProfile.user_id
    if (!idToUse) return
    setIsLoadingAi(true)
    try {
      const res = await fetch(`/api/ai-analytics/student/${idToUse}`)
      if (res.ok) {
        const data = await res.json()
        setAiAdvices(Array.isArray(data) ? data : [])
      }
    } catch (err) {
      console.warn("Could not load AI advice:", err)
    } finally {
      setIsLoadingAi(false)
    }
  }, [userProfile.user_id])

  const handleTriggerAiAnalysis = async () => {
    const idToUse = userProfile.user_id
    if (!idToUse) return
    setIsTriggeringAi(true)
    try {
      const res = await fetch(`/api/ai-analytics/trigger?cadet_id=${idToUse}&background=false`, {
        method: "POST",
      })
      if (res.ok) {
        await loadAiAdvice(idToUse)
      }
    } catch (err) {
      console.warn("Failed to trigger AI analysis:", err)
    } finally {
      setIsTriggeringAi(false)
    }
  }

  const handleMarkAdviceRead = async (adviceId: string) => {
    try {
      const res = await fetch(`/api/ai-analytics/student/advice/${adviceId}/read`, {
        method: "PATCH",
      })
      if (res.ok) {
        setAiAdvices((prev) =>
          prev.map((item) =>
            item.advice_id === adviceId ? { ...item, is_read: true } : item
          )
        )
      }
    } catch (err) {
      console.warn("Failed to mark advice as read:", err)
    }
  }

  // Fetch student profile & current user info
  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/users/me")
      if (res.ok) {
        const data = await res.json()
        setUserProfile((prev) => ({
          ...prev,
          user_id: data.user_id,
          student_id: data.student_id || prev.student_id || "СМ1-12",
          username: data.username || prev.username,
          full_name: data.full_name || prev.full_name,
          role: data.role || prev.role,
        }))
        if (data.user_id) {
          loadAiAdvice(data.user_id)
        }
      }
    } catch {
      // Fallback defaults remain
    }
  }, [loadAiAdvice])

  // Fetch statistics based on active role
  const loadStats = useCallback(async (currentRole: string) => {
    try {
      const res = await fetch(`/api/v1/students/me/stats?role=${currentRole}`)
      if (res.ok) {
        const data = await res.json()

        const formattedErrors: TopErrorItem[] = Array.isArray(data.top_errors)
          ? data.top_errors.map((e: any) =>
              typeof e === "string"
                ? { text: e, frequency_percent: 50, is_fatal: false }
                : {
                    text: e.text || "Ошибка",
                    frequency_percent: e.frequency_percent ?? 50,
                    is_fatal: Boolean(e.is_fatal),
                  }
            )
          : []

        setStats({
          average_score: data.average_score ?? 0,
          average_score_week: data.average_score_week ?? 0,
          average_score_all_time: data.average_score_all_time ?? data.average_score ?? 0,
          average_score_7_days:
            data.average_score_7_days ?? data.average_score_week ?? data.average_score ?? 0,
          score_trend: data.score_trend ?? 0,
          average_processing_time_seconds: data.average_processing_time_seconds ?? 68,
          time_trend: data.time_trend ?? -15,
          service_accuracy_percent: data.service_accuracy_percent ?? 94.0,
          cards_solved: data.cards_solved ?? 0,
          lessons_completed: data.lessons_completed ?? 0,
          competence_matrix:
            data.competence_matrix && data.competence_matrix.length > 0
              ? data.competence_matrix
              : DEFAULT_CATEGORIES,
          top_errors:
            formattedErrors.length > 0
              ? formattedErrors
              : [
                  {
                    text: "Задержка передачи карточки в службу 03 более 45 сек",
                    frequency_percent: 85,
                    is_fatal: true,
                  },
                  {
                    text: "Не уточнен номер квартиры / подъезда",
                    frequency_percent: 45,
                    is_fatal: false,
                  },
                ],
          student_id: data.student_id,
          full_name: data.full_name,
        })

        if (data.student_id || data.full_name) {
          setUserProfile((prev) => ({
            ...prev,
            student_id: data.student_id || prev.student_id,
            full_name: data.full_name || prev.full_name,
          }))
        }
      }
    } catch {
      // Keep state
    }
  }, [])

  // Fetch lessons history based on active role
  const loadLessons = useCallback(async (currentRole: string) => {
    try {
      const res = await fetch(`/api/v1/students/me/lessons?role=${currentRole}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setLessons(data)
          if (data.length > 0 && !expandedLessonId) {
            setExpandedLessonId(data[0].session_id)
          }
        }
      }
    } catch {
      // Keep state
    }
  }, [expandedLessonId])

  // Initial data load and on role toggle
  useEffect(() => {
    setIsLoading(true)
    Promise.all([loadProfile(), loadStats(role), loadLessons(role)]).finally(() => {
      setIsLoading(false)
    })
  }, [role, loadProfile, loadStats, loadLessons])

  const toggleLesson = (sessionId: string) => {
    setExpandedLessonId((prev) => (prev === sessionId ? null : sessionId))
  }

  // Error color calculation: from yellow (rare) to dark red (frequent) - no green!
  const getErrorBarClass = (freq: number) => {
    if (freq >= 80) return "bg-red-700 dark:bg-red-600"
    if (freq >= 55) return "bg-red-500 dark:bg-red-500"
    if (freq >= 35) return "bg-amber-500 dark:bg-amber-500"
    return "bg-yellow-500 dark:bg-yellow-400"
  }

  const getErrorTextClass = (freq: number) => {
    if (freq >= 80) return "text-red-700 dark:text-red-400 font-bold"
    if (freq >= 55) return "text-red-600 dark:text-red-400 font-bold"
    if (freq >= 35) return "text-amber-600 dark:text-amber-400 font-bold"
    return "text-yellow-600 dark:text-yellow-400 font-bold"
  }

  const fatalErrors = stats.top_errors.filter((e) => e.is_fatal)
  const minorErrors = stats.top_errors.filter((e) => !e.is_fatal)

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-foreground flex flex-col justify-between">
      {/* 1. Ultra-compact horizontal header row (no avatar, FIO + short ID + role toggle) */}
      <header className="border-b bg-card sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          {/* Left: Brand badge, FIO and short student ID */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
              112
            </div>
            <div className="flex items-center gap-2 truncate">
              <span className="font-bold text-sm text-foreground truncate">
                {userProfile.full_name || "Иванов Иван Иванович"}
              </span>
              <Badge
                variant="outline"
                className="font-mono text-[11px] font-bold px-2 py-0 border-primary/30 text-primary shrink-0 bg-primary/5"
              >
                ID: {userProfile.student_id || "СМ1-12"}
              </Badge>
              <span className="hidden md:inline-block text-xs text-muted-foreground">• Личный кабинет курсанта</span>
            </div>
          </div>

          {/* Center / Right: Compact Role toggle (112 / DDS) and quick actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Role Switcher */}
            <div className="bg-muted p-1 rounded-lg border flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRole("OPERATOR_112")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  role === "OPERATOR_112"
                    ? "bg-background text-primary shadow-xs ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Headphones className="h-3.5 w-3.5" />
                <span>Оператор 112</span>
              </button>

              <button
                type="button"
                onClick={() => setRole("DISPATCHER_DDS")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  role === "DISPATCHER_DDS"
                    ? "bg-background text-primary shadow-xs ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Radio className="h-3.5 w-3.5" />
                <span>Диспетчер ДДС</span>
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsLoading(true)
                Promise.all([loadProfile(), loadStats(role), loadLessons(role)]).finally(() =>
                  setIsLoading(false)
                )
              }}
              className="h-8 px-2.5 text-xs gap-1.5"
              title="Обновить данные"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Обновить</span>
            </Button>

            <Link href="/student/lobby">
              <Button size="sm" className="h-8 px-3 text-xs font-semibold gap-1.5 shadow-xs">
                <span>В лобби</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area - Clean, tightly spaced to fit on screen */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 space-y-4 flex-1">
        {/* Section 1: Practical Metrics with Trends (Month score removed) */}
        <div
          className={`grid gap-3 ${
            role === "OPERATOR_112"
              ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
              : "grid-cols-2 sm:grid-cols-2 lg:grid-cols-4"
          }`}
        >
          {/* Metric 1: Average Score All-time */}
          <Card className="border shadow-2xs p-3">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                За всё время
              </span>
              <Award className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-1">
              <div className="text-2xl font-black text-foreground">
                {stats.average_score_all_time.toFixed(1)}
                <span className="text-xs font-normal text-muted-foreground"> / 100</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Общая успеваемость за курс</p>
            </div>
          </Card>

          {/* Metric 2: Average Score 7 Days with Trend */}
          <Card className="border shadow-2xs p-3">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                За 7 дней
              </span>
              <div className="flex items-center gap-1 font-mono text-xs font-bold">
                {stats.score_trend >= 0 ? (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center">
                    <TrendingUp className="h-3.5 w-3.5 mr-0.5 inline" />
                    +{stats.score_trend > 0 ? stats.score_trend : 0}%
                  </span>
                ) : (
                  <span className="text-red-600 dark:text-red-400 flex items-center">
                    <TrendingDown className="h-3.5 w-3.5 mr-0.5 inline" />
                    {stats.score_trend}%
                  </span>
                )}
              </div>
            </div>
            <div className="mt-1">
              <div className="text-2xl font-black text-foreground">
                {stats.average_score_7_days.toFixed(1)}
                <span className="text-xs font-normal text-muted-foreground"> / 100</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Текущий недельный срез</p>
            </div>
          </Card>

          {/* Metric 3: Solved Cards Count */}
          <Card className="border shadow-2xs p-3">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                Решено карточек
              </span>
              <Target className="h-4 w-4 text-blue-500" />
            </div>
            <div className="mt-1">
              <div className="text-2xl font-black text-foreground">
                {stats.cards_solved}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">Всего билетов и заданий</p>
            </div>
          </Card>

          {/* Metric 4: Average Processing Time with Trend */}
          <Card className="border shadow-2xs p-3">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                Время обработки
              </span>
              <div className="flex items-center gap-1 font-mono text-xs font-bold">
                {stats.time_trend <= 0 ? (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center">
                    <TrendingDown className="h-3.5 w-3.5 mr-0.5 inline" />
                    {stats.time_trend} сек
                  </span>
                ) : (
                  <span className="text-red-600 dark:text-red-400 flex items-center">
                    <TrendingUp className="h-3.5 w-3.5 mr-0.5 inline" />
                    +{stats.time_trend} сек
                  </span>
                )}
              </div>
            </div>
            <div className="mt-1">
              <div className="text-2xl font-black text-foreground">
                {stats.average_processing_time_seconds}{" "}
                <span className="text-xs font-normal text-muted-foreground">сек</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">В среднем на карточку</p>
            </div>
          </Card>

          {/* Metric 5: Service Accuracy Percent (Only for OPERATOR_112) */}
          {role === "OPERATOR_112" && (
            <Card className="border shadow-2xs p-3">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-semibold uppercase tracking-wider">
                  Точность служб
                </span>
                <Zap className="h-4 w-4 text-amber-500" />
              </div>
              <div className="mt-1">
                <div className="text-2xl font-black text-foreground">
                  {stats.service_accuracy_percent.toFixed(1)}%
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Выбор экстренных служб</p>
              </div>
            </Card>
          )}
        </div>

        {/* Section 2: Competence Matrix & Top Errors (Fatal vs Minor) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Competence Matrix (RadarChart) */}
          <Card className="lg:col-span-6 border shadow-xs flex flex-col justify-between">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <span>Матрица компетенций</span>
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {role === "OPERATOR_112" ? "Оператор 112" : "Диспетчер ДДС"}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Успеваемость по категориям происшествий (0 – 100 баллов)
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="h-[250px] w-full flex items-center justify-center p-2">
              {stats.competence_matrix && stats.competence_matrix.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="75%" data={stats.competence_matrix}>
                    <PolarGrid stroke="#94a3b8" strokeDasharray="3 3" opacity={0.35} />
                    <PolarAngleAxis
                      dataKey="category"
                      tick={{ fill: "currentColor", fontSize: 11, fontWeight: 600 }}
                    />
                    <PolarRadiusAxis
                      angle={30}
                      domain={[0, 100]}
                      tick={{ fill: "#64748b", fontSize: 9 }}
                      stroke="#94a3b8"
                      opacity={0.3}
                    />
                    <Tooltip
                      formatter={(val: any) => [`${val} баллов`, "Успеваемость"]}
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        borderRadius: "8px",
                        color: "#f8fafc",
                        fontSize: "12px",
                      }}
                      itemStyle={{ color: "#38bdf8" }}
                      labelStyle={{ color: "#f8fafc", fontWeight: 600 }}
                    />
                    <Radar
                      name="Успеваемость"
                      dataKey="score"
                      stroke="#2563eb"
                      fill="#3b82f6"
                      fillOpacity={0.4}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-muted-foreground text-xs py-8">
                  Нет данных для построения матрицы компетенций
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t py-1.5 px-4 bg-muted/20 text-[11px] text-muted-foreground flex justify-between">
              <span>Норматив: не менее 75 баллов</span>
              <span>Формируется по результатам сданных билетов</span>
            </CardFooter>
          </Card>

          {/* Top Errors: Split into Fatal and Minor */}
          <Card className="lg:col-span-6 border shadow-xs flex flex-col justify-between">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span>Топ частых ошибок</span>
                </CardTitle>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold">
                    <span className="h-2 w-2 rounded-full bg-red-600 inline-block" /> Фатальные
                  </span>
                  <span className="text-muted-foreground">•</span>
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                    <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" /> Мелкие
                  </span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 px-4 py-2 flex-1">
              {stats.top_errors && stats.top_errors.length > 0 ? (
                <div className="space-y-3">
                  {/* Block 1: Fatal Errors */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-bold text-red-700 dark:text-red-400 flex items-center gap-1 uppercase tracking-wider">
                      <AlertOctagon className="h-3.5 w-3.5" />
                      <span>Фатальные ошибки ({fatalErrors.length})</span>
                    </div>

                    {fatalErrors.length > 0 ? (
                      fatalErrors.map((err, idx) => (
                        <div key={idx} className="p-2 rounded-lg border border-red-200 dark:border-red-950/60 bg-red-50/40 dark:bg-red-950/20 space-y-1">
                          <div className="flex items-start justify-between gap-2 text-xs">
                            <span className="font-semibold text-foreground leading-tight">
                              {err.text}
                            </span>
                            <span className={`font-mono text-xs ${getErrorTextClass(err.frequency_percent)} shrink-0`}>
                              {err.frequency_percent}%
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${getErrorBarClass(err.frequency_percent)}`}
                              style={{ width: `${err.frequency_percent}%` }}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground italic py-1">
                        Фатальных ошибок не зафиксировано
                      </div>
                    )}
                  </div>

                  {/* Block 2: Minor Errors */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1 uppercase tracking-wider">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Мелкие недочеты ({minorErrors.length})</span>
                    </div>

                    {minorErrors.length > 0 ? (
                      minorErrors.map((err, idx) => (
                        <div key={idx} className="p-2 rounded-lg border border-amber-200 dark:border-amber-950/60 bg-amber-50/30 dark:bg-amber-950/20 space-y-1">
                          <div className="flex items-start justify-between gap-2 text-xs">
                            <span className="font-medium text-foreground leading-tight">
                              {err.text}
                            </span>
                            <span className={`font-mono text-xs ${getErrorTextClass(err.frequency_percent)} shrink-0`}>
                              {err.frequency_percent}%
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${getErrorBarClass(err.frequency_percent)}`}
                              style={{ width: `${err.frequency_percent}%` }}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground italic py-1">
                        Мелких недочетов не зафиксировано
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  Замечаний не зафиксировано
                </div>
              )}
            </CardContent>

            <CardFooter className="border-t py-1.5 px-4 bg-muted/20 text-[11px] text-muted-foreground">
              Цветовая индикация: от желтого (редко) до темно-красного (критично)
            </CardFooter>
          </Card>
        </div>

        {/* Section 3: Tabs - Training History & Reference Materials */}
        <Card className="border shadow-xs">
          <CardHeader className="py-2.5 px-4 border-b bg-muted/10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("lessons")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    activeTab === "lessons"
                      ? "bg-background text-primary shadow-xs ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>История обучения и билеты</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {lessons.length}
                  </Badge>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("docs")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    activeTab === "docs"
                      ? "bg-background text-primary shadow-xs ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>Справочные материалы</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {REFERENCE_DOCS.length}
                  </Badge>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("ai_advice")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    activeTab === "ai_advice"
                      ? "bg-background text-primary shadow-xs ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  <span>Советы ИИ</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    Qwen 9B
                  </Badge>
                  {aiAdvices.filter((a) => !a.is_read).length > 0 && (
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                  )}
                </button>
              </div>

              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                {activeTab === "lessons"
                  ? "Протоколы завершенных занятий и оценки"
                  : activeTab === "docs"
                  ? "Методические инструкции и регламенты"
                  : "Интеллектуальный разбор диалогов и методические указания нейросети"}
              </span>
            </div>
          </CardHeader>

          <CardContent className="p-4">
            {/* Tab 1: Lessons Accordion */}
            {activeTab === "lessons" && (
              <div className="space-y-2.5">
                {lessons.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed rounded-xl bg-muted/20">
                    <FileText className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm font-semibold text-foreground">
                      История занятий пока пуста
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-3">
                      Пройдите первый урок в тренажере или выполните тестовый запуск в лобби
                    </p>
                    <Link href="/student/lobby">
                      <Button size="sm" variant="default" className="text-xs font-semibold gap-2">
                        <span>Перейти в лобби</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                ) : (
                  lessons.map((lesson) => {
                    const isExpanded = expandedLessonId === lesson.session_id
                    const score = lesson.score
                    const isPassed = score !== undefined && score !== null ? score >= 70 : true

                    return (
                      <div
                        key={lesson.session_id}
                        className="border rounded-xl overflow-hidden transition-all bg-card"
                      >
                        {/* Accordion Header */}
                        <button
                          type="button"
                          onClick={() => toggleLesson(lesson.session_id)}
                          className="w-full p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-left hover:bg-muted/40 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                                isPassed
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-red-500/10 text-red-600 dark:text-red-400"
                              }`}
                            >
                              {isPassed ? (
                                <CheckCircle2 className="h-4 w-4" />
                              ) : (
                                <XCircle className="h-4 w-4" />
                              )}
                            </div>

                            <div>
                              <div className="font-bold text-xs sm:text-sm text-foreground flex items-center gap-2">
                                <span>{lesson.title || `Урок #${lesson.session_id.slice(0, 8)}`}</span>
                                <Badge variant="outline" className="text-[10px] font-normal py-0">
                                  {lesson.target_role === "DISPATCHER_DDS" ? "ДДС" : "112"}
                                </Badge>
                              </div>
                              <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                                {lesson.date && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {lesson.date}
                                  </span>
                                )}
                                <span>• Билетов: {lesson.tickets ? lesson.tickets.length : 0}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-center">
                            {score !== undefined && score !== null && (
                              <div className="text-right">
                                <span className="text-[10px] text-muted-foreground block">Оценка</span>
                                <span
                                  className={`text-sm font-extrabold font-mono ${
                                    isPassed
                                      ? "text-emerald-600 dark:text-emerald-400"
                                      : "text-red-600 dark:text-red-400"
                                  }`}
                                >
                                  {score.toFixed(1)} / 100
                                </span>
                              </div>
                            )}

                            <div className="p-1 rounded-md text-muted-foreground">
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </div>
                          </div>
                        </button>

                        {/* Accordion Body: Tickets List */}
                        {isExpanded && (
                          <div className="p-3 border-t bg-muted/15 space-y-2">
                            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                              Результаты билетов в уроке:
                            </div>

                            {lesson.tickets && lesson.tickets.length > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                {lesson.tickets.map((ticket, tIdx) => {
                                  const tScore = ticket.score ?? 0
                                  const tPassed = ticket.status === "passed" || tScore >= 70

                                  return (
                                    <div
                                      key={ticket.ticket_id || tIdx}
                                      className="p-2.5 rounded-lg border bg-background space-y-1.5 shadow-2xs"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div>
                                          <div className="font-semibold text-xs text-foreground">
                                            {ticket.title || `Билет #${ticket.ticket_id?.slice(0, 8)}`}
                                          </div>
                                          {ticket.category && (
                                            <Badge variant="secondary" className="text-[10px] mt-0.5 py-0">
                                              {ticket.category}
                                            </Badge>
                                          )}
                                        </div>
                                        <Badge
                                          variant="outline"
                                          className={`text-[10px] font-mono font-bold py-0 ${
                                            tPassed
                                              ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                                              : "border-red-500/50 text-red-600 dark:text-red-400 bg-red-500/10"
                                          }`}
                                        >
                                          {ticket.score !== undefined && ticket.score !== null
                                            ? `${ticket.score.toFixed(0)} б.`
                                            : tPassed
                                            ? "Сдан"
                                            : "Не сдан"}
                                        </Badge>
                                      </div>

                                      {/* Ticket Errors */}
                                      {ticket.errors && ticket.errors.length > 0 ? (
                                        <div className="pt-1 border-t space-y-0.5">
                                          <div className="text-[11px] font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
                                            <AlertTriangle className="h-3 w-3" />
                                            <span>Ошибки ({ticket.errors.length}):</span>
                                          </div>
                                          <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
                                            {ticket.errors.map((err, eIdx) => (
                                              <li key={eIdx}>{err}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      ) : (
                                        <div className="pt-1 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                          <CheckCircle2 className="h-3 w-3" />
                                          <span>Билет выполнен без ошибок</span>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground py-1">
                                Нет детализированных записей по билетам для этого занятия.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* Tab 2: Reference Materials (Stub Section) */}
            {activeTab === "docs" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {REFERENCE_DOCS.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-3 rounded-xl border bg-card hover:border-primary/50 transition-colors flex items-start justify-between gap-3 shadow-2xs group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-bold text-xs sm:text-sm text-foreground group-hover:text-primary transition-colors">
                          {doc.title}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                          {doc.description}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-[10px] py-0 font-normal">
                            {doc.tag}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {doc.size}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs shrink-0 text-muted-foreground hover:text-foreground gap-1"
                      onClick={() => alert(`Загрузка документа: ${doc.title}`)}
                      title="Скачать документ"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Открыть</span>
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Tab 3: AI Advice (Qwen 3.5 9B / Qwen 2.5 9B) */}
            {activeTab === "ai_advice" && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border bg-gradient-to-r from-amber-500/10 via-primary/5 to-transparent">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                        Глубокий анализ сессий
                        <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400 text-[10px]">
                          Qwen 3.5 9B
                        </Badge>
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Автономный разбор речевых логов, выявление ошибок адресации и советы по стрессоустойчивости
                      </p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={handleTriggerAiAnalysis}
                    disabled={isTriggeringAi}
                    className="shrink-0 gap-2 text-xs font-semibold cursor-pointer bg-primary hover:bg-primary/90"
                  >
                    {isTriggeringAi ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Анализ сессий...</span>
                      </>
                    ) : (
                      <>
                        <Bot className="h-3.5 w-3.5" />
                        <span>Запросить анализ ИИ</span>
                      </>
                    )}
                  </Button>
                </div>

                {isLoadingAi ? (
                  <div className="text-center py-10">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
                    <p className="text-xs text-muted-foreground">Загрузка рекомендаций нейросети...</p>
                  </div>
                ) : aiAdvices.length === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed rounded-xl bg-muted/20 space-y-2">
                    <Bot className="h-10 w-10 mx-auto text-muted-foreground/40 mb-1" />
                    <p className="text-sm font-semibold text-foreground">Пока нет рекомендаций от ИИ</p>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                      Пройдите несколько тренировочных сессий или нажмите кнопку «Запросить анализ ИИ» выше для формирования первичного методического отчета.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {aiAdvices.map((adv) => (
                      <div
                        key={adv.advice_id}
                        className={`p-4 rounded-xl border transition-all shadow-2xs ${
                          adv.is_read
                            ? "bg-card border-border/70"
                            : "bg-amber-500/5 border-amber-500/30 ring-1 ring-amber-500/20"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 border-b pb-2 mb-3">
                          <div className="flex items-center gap-2">
                            <Bot className="h-4 w-4 text-amber-500" />
                            <span className="font-semibold text-xs text-foreground">
                              Методический отчет ИИ
                            </span>
                            <Badge variant="outline" className="text-[10px] py-0 font-mono">
                              {adv.model_used || "Qwen 3.5 9B"}
                            </Badge>
                            {!adv.is_read ? (
                              <Badge className="bg-amber-500 text-white text-[10px] py-0">
                                Новое
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] py-0 text-muted-foreground">
                                Прочитано
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground">
                              {new Date(adv.date).toLocaleString("ru-RU", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {!adv.is_read && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleMarkAdviceRead(adv.advice_id)}
                                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                                <span>Прочитано</span>
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="text-xs sm:text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed font-sans">
                          {adv.analysis_text}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t py-3 text-center text-xs text-muted-foreground bg-card/50">
        Автоматизированный комплекс Системы-112 • Личный кабинет курсанта
      </footer>
    </div>
  )
}

