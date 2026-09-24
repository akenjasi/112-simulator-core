"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  LayoutGrid,
  List,
  Loader2,
  RefreshCw,
  Search,
  User,
  Users,
  XCircle,
  GraduationCap,
  Sparkles,
} from "lucide-react"

export interface CadetStats {
  cadet_id: string
  cadet_name: string
  status: "IN_PROGRESS" | "PASSED" | "FAILED" | "IDLE" | string
  current_ticket?: string | null
  in_progress: number
  passed: number
  failed: number
  progress: number
  score?: number | null
  last_activity?: string | null
}

export interface SessionStats {
  session_id: string
  session_name?: string
  group_name?: string
  status: string
  overall_progress: number
  total_cadets: number
  total_in_progress: number
  total_passed: number
  total_failed: number
  cadets: CadetStats[]
}

export interface LiveDashboardProps {
  sessionId?: string
  params?: Promise<{ id: string }> | { id: string }
}

export default function LiveDashboardPage(props: LiveDashboardProps = {}) {
  // Determine sessionId
  let initialId = props.sessionId || "session-1"
  if (props.params) {
    if (typeof (props.params as any)?.then !== "function" && (props.params as { id: string })?.id) {
      initialId = (props.params as { id: string }).id
    }
  }

  const [sessionId, setSessionId] = useState<string>(initialId)
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid")
  const [searchQuery, setSearchQuery] = useState<string>("")

  // Resolve async params or URL path if in browser
  useEffect(() => {
    if (props.sessionId) {
      setSessionId(props.sessionId)
      return
    }
    if (props.params) {
      if (typeof (props.params as any)?.then === "function") {
        ;(props.params as Promise<{ id: string }>).then((p) => {
          if (p?.id) setSessionId(p.id)
        })
      } else if ((props.params as { id: string })?.id) {
        setSessionId((props.params as { id: string }).id)
      }
    } else if (typeof window !== "undefined") {
      const match = window.location.pathname.match(/\/teacher\/sessions\/([^/]+)\/live/)
      if (match && match[1]) {
        setSessionId(match[1])
      }
    }
  }, [props.sessionId, props.params])

  // Fetch stats from API
  const fetchStats = useCallback(
    async (isInitial = false) => {
      try {
        if (isInitial) setIsLoading(true)
        setError(null)

        const res = await fetch(`/api/v1/sessions/${sessionId}/stats`)
        if (!res.ok) {
          throw new Error(`Ошибка загрузки статистики (${res.status})`)
        }
        const data: SessionStats = await res.json()
        setStats(data)
        setLastUpdated(new Date())
      } catch (err: any) {
        setError(err.message || "Не удалось загрузить данные мониторинга")
      } finally {
        if (isInitial) setIsLoading(false)
      }
    },
    [sessionId]
  )

  // Polling every 3 seconds
  useEffect(() => {
    fetchStats(true)

    const intervalId = setInterval(() => {
      fetchStats(false)
    }, 3000)

    return () => {
      clearInterval(intervalId)
    }
  }, [fetchStats])

  // Filter cadets by search query
  const cadets = stats?.cadets || []
  const filteredCadets = cadets.filter((cadet) =>
    cadet.cadet_name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  )

  const overallProgress = stats?.overall_progress ?? 0
  const totalCadets = stats?.total_cadets ?? cadets.length
  const totalInProgress = stats?.total_in_progress ?? cadets.reduce((acc, c) => acc + (c.in_progress || 0), 0)
  const totalPassed = stats?.total_passed ?? cadets.reduce((acc, c) => acc + (c.passed || 0), 0)
  const totalFailed = stats?.total_failed ?? cadets.reduce((acc, c) => acc + (c.failed || 0), 0)

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-8">
      {/* Header section with live indicator and read-only notice */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Live Мониторинг сессии
            </h1>
            <span
              role="status"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              В эфире
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {stats?.group_name ? `${stats.group_name} • ` : ""}Сессия #{sessionId} • Отслеживание выполнения билетов в реальном времени
          </p>
        </div>

        {/* Read-only badge and refresh control */}
        <div className="flex items-center gap-3">
          <div
            title="Режим наблюдателя: вмешательство и пауза отключены"
            className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-lg border"
          >
            <Eye className="h-3.5 w-3.5 text-primary" />
            <span>Режим наблюдения (только чтение)</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchStats(false)}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Обновить</span>
          </Button>
        </div>
      </div>

      {/* Error alert if any */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* Overall Progress and Key Metrics Banner */}
      <Card className="shadow-sm border bg-gradient-to-br from-card to-muted/20">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Общий прогресс сессии
              </CardTitle>
              <CardDescription>
                Суммарная динамика прохождения сценариев курсантами
              </CardDescription>
            </div>
            <div className="text-right">
              <span className="text-3xl font-extrabold text-primary">{overallProgress}%</span>
              <span className="text-xs text-muted-foreground block">
                {lastUpdated ? `Обновлено: ${lastUpdated.toLocaleTimeString()}` : "Ожидание данных..."}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Main Progress Bar */}
          <div className="space-y-2">
            <Progress value={overallProgress} max={100} className="h-3.5" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Старт</span>
              <span>Автообновление каждые 3 сек</span>
              <span>100% Завершение</span>
            </div>
          </div>

          {/* Session Summary Counters Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            <div className="p-4 rounded-xl border bg-background/60 shadow-xs flex flex-col">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Users className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-medium">Всего курсантов</span>
              </div>
              <span className="text-2xl font-bold">{totalCadets}</span>
            </div>

            <div className="p-4 rounded-xl border border-blue-200/60 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 shadow-xs flex flex-col">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-semibold">В процессе</span>
              </div>
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {totalInProgress}
              </span>
            </div>

            <div className="p-4 rounded-xl border border-green-200/60 dark:border-green-900/40 bg-green-50/40 dark:bg-green-950/20 shadow-xs flex flex-col">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs font-semibold">Сдано</span>
              </div>
              <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                {totalPassed}
              </span>
            </div>

            <div className="p-4 rounded-xl border border-red-200/60 dark:border-red-900/40 bg-red-50/40 dark:bg-red-950/20 shadow-xs flex flex-col">
              <div className="flex items-center gap-2 text-destructive mb-1">
                <XCircle className="h-4 w-4" />
                <span className="text-xs font-semibold">Провалено</span>
              </div>
              <span className="text-2xl font-bold text-destructive">
                {totalFailed}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cadets List Controls: View Mode & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Поиск курсанта по имени..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* View Toggle: Grid vs Table */}
        <div className="flex items-center rounded-lg border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            aria-label="Сетка"
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === "grid"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>Сетка</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            aria-label="Таблица"
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === "table"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            <span>Таблица</span>
          </button>
        </div>
      </div>

      {/* Cadets Display: Grid View or Table View */}
      {isLoading && cadets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Загрузка данных сессии...</p>
        </div>
      ) : filteredCadets.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-2">
            <Users className="h-10 w-10 text-muted-foreground/50 mx-auto" />
            <h3 className="font-semibold text-lg">Курсанты не найдены</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {searchQuery
                ? `По запросу "${searchQuery}" ничего не найдено`
                : "В данной сессии пока нет зарегистрированных курсантов"}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        /* Grid-сетка со списком курсантов */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCadets.map((cadet) => (
            <Card
              key={cadet.cadet_id}
              className="flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow border"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
                      {cadet.cadet_name.charAt(0)}
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">
                        {cadet.cadet_name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {cadet.current_ticket || "Ожидает билет"}
                      </CardDescription>
                    </div>
                  </div>

                  {cadet.status === "PASSED" || cadet.passed > 0 && cadet.in_progress === 0 && cadet.failed === 0 ? (
                    <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-xs">
                      Сдано
                    </Badge>
                  ) : cadet.status === "FAILED" || cadet.failed > 0 ? (
                    <Badge variant="destructive" className="text-xs">
                      Провалено
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 text-xs">
                      В процессе
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* 3 Metric Counters: В процессе, Сдано, Провалено */}
                <div className="grid grid-cols-3 gap-2 py-3 px-3 bg-muted/30 rounded-lg border text-center">
                  <div className="flex flex-col">
                    <span className="text-[11px] text-muted-foreground font-medium">В процессе</span>
                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {cadet.in_progress}
                    </span>
                  </div>
                  <div className="flex flex-col border-x">
                    <span className="text-[11px] text-muted-foreground font-medium">Сдано</span>
                    <span className="text-lg font-bold text-green-600 dark:text-green-400">
                      {cadet.passed}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] text-muted-foreground font-medium">Провалено</span>
                    <span className="text-lg font-bold text-destructive">
                      {cadet.failed}
                    </span>
                  </div>
                </div>

                {/* Cadet Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-medium">Прогресс курсанта</span>
                    <span className="font-semibold text-foreground">{cadet.progress}%</span>
                  </div>
                  <Progress value={cadet.progress} max={100} className="h-2" />
                </div>

                {/* Footer info: score & last activity */}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
                  <span>Балл: {cadet.score !== undefined && cadet.score !== null ? `${cadet.score}/100` : "—"}</span>
                  <span>{cadet.last_activity || "В сети"}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* Табличный вид со списком курсантов */
        <Card className="shadow-xs border">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Курсант</TableHead>
                  <TableHead>Текущий билет</TableHead>
                  <TableHead className="text-center">В процессе</TableHead>
                  <TableHead className="text-center">Сдано</TableHead>
                  <TableHead className="text-center">Провалено</TableHead>
                  <TableHead className="w-[180px]">Прогресс</TableHead>
                  <TableHead className="text-right">Балл</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCadets.map((cadet) => (
                  <TableRow key={cadet.cadet_id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                          {cadet.cadet_name.charAt(0)}
                        </div>
                        <span>{cadet.cadet_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                      {cadet.current_ticket || "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        {cadet.in_progress}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/10 text-green-600 dark:text-green-400">
                        {cadet.passed}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-full text-xs font-semibold bg-destructive/10 text-destructive">
                        {cadet.failed}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={cadet.progress} max={100} className="h-2 flex-1" />
                        <span className="text-xs font-medium text-muted-foreground w-8 text-right">
                          {cadet.progress}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {cadet.score !== undefined && cadet.score !== null ? `${cadet.score}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
