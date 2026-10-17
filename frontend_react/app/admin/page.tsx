"use client"

import React, { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts"
import {
  Cpu,
  Server,
  Database,
  Users,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  DownloadCloud,
  FileCheck,
  UserCheck,
  GraduationCap,
} from "lucide-react"
import {
  fetchHealthcheck,
  triggerBackup,
  fetchUsers,
  HealthCheckData,
  AdminUser,
} from "@/lib/admin-api"

interface LoadMetricPoint {
  measuredAt: number
  time: string
  cpu: number
  ram: number
}

const LOAD_HISTORY_KEY = "admin-server-load-history-v1"
const HISTORY_WINDOW_MS = 15 * 60 * 1000
const MAX_HISTORY_POINTS = 60

function recentHistory(points: LoadMetricPoint[]): LoadMetricPoint[] {
  const now = Date.now()
  return points.filter((point) => point && Number.isFinite(point.measuredAt) &&
    point.measuredAt <= now && point.measuredAt >= now - HISTORY_WINDOW_MS &&
    typeof point.time === "string" && Number.isFinite(point.cpu) &&
    Number.isFinite(point.ram) && point.cpu >= 0 && point.cpu <= 100 &&
    point.ram >= 0 && point.ram <= 100).slice(-MAX_HISTORY_POINTS)
}

export default function AdminDashboardPage() {
  const [health, setHealth] = useState<HealthCheckData | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loadHistory, setLoadHistory] = useState<LoadMetricPoint[]>([])
  const [lastSuccessTime, setLastSuccessTime] = useState<string | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [backupSuccessMessage, setBackupSuccessMessage] = useState<string | null>(null)
  const [backupError, setBackupError] = useState<string | null>(null)

  const acceptHealth = useCallback((data: HealthCheckData) => {
    setHealth(data)
    setHealthError(null)
    const measuredAt = Date.now()
    const time = new Date(measuredAt).toLocaleTimeString("ru-RU", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    })
    setLastSuccessTime(time)
    setLoadHistory((previous) => {
      const history = recentHistory([...previous, {
        measuredAt, time, cpu: data.cpu_percent, ram: data.ram_percent,
      }])
      try { sessionStorage.setItem(LOAD_HISTORY_KEY, JSON.stringify(history)) } catch {}
      return history
    })
  }, [])

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setHealthError(null)
    try {
      const [healthData, usersData] = await Promise.allSettled([
        fetchHealthcheck(),
        fetchUsers(),
      ])

      if (healthData.status === "fulfilled") {
        acceptHealth(healthData.value)
      } else {
        setHealthError(
          healthData.reason?.message || "Ошибка получения статуса системы"
        )
      }

      if (usersData.status === "fulfilled" && Array.isArray(usersData.value)) {
        setUsers(usersData.value)
      }
    } finally {
      setIsLoading(false)
    }
  }, [acceptHealth])

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(LOAD_HISTORY_KEY) || "[]")
      if (Array.isArray(saved)) setLoadHistory(recentHistory(saved))
    } catch {}
    loadData()
    const timer = setInterval(() => {
      fetchHealthcheck()
        .then(acceptHealth)
        .catch((err) => {
          setHealthError(err?.message || "Ошибка опроса состояния сервера")
        })
    }, 15000)

    return () => clearInterval(timer)
  }, [loadData, acceptHealth])

  const handleCreateBackup = async () => {
    try {
      setIsBackingUp(true)
      setBackupError(null)
      const res = await triggerBackup()
      const displayFile = res.filename || res.backup_file
      setBackupSuccessMessage(`Резервная копия успешно создана: ${displayFile}`)
      setTimeout(() => {
        setBackupSuccessMessage(null)
      }, 7000)
    } catch (err: any) {
      setBackupError(err.message || "Не удалось создать резервную копию базы данных")
    } finally {
      setIsBackingUp(false)
    }
  }

  // Calculated user stats
  const totalUsers = users.length
  const cadetsCount = users.filter((u) => u.role?.toUpperCase() === "CADET").length
  const teachersCount = users.filter((u) => u.role?.toUpperCase() === "TEACHER").length
  const adminsCount = users.filter((u) => u.role?.toUpperCase() === "ADMIN").length
  const activeCount = users.filter((u) => u.is_active !== false).length
  const blockedCount = users.filter((u) => u.is_active === false).length

  const roleDistributionData = [
    { role: "Курсанты", count: cadetsCount, fill: "#10b981" },
    { role: "Преподаватели", count: teachersCount, fill: "#3b82f6" },
    { role: "Администраторы", count: adminsCount, fill: "#8b5cf6" },
  ]

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Панель управления системой
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Мониторинг нагрузки сервера, управление пользователями и резервным копированием
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-2 cursor-pointer bg-white"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            <span>Обновить</span>
          </Button>

          <Button
            onClick={handleCreateBackup}
            disabled={isBackingUp}
            className="bg-purple-700 hover:bg-purple-800 text-white flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <DownloadCloud className={`w-4 h-4 ${isBackingUp ? "animate-bounce" : ""}`} />
            <span>{isBackingUp ? "Создание бэкапа..." : "Создать бэкап"}</span>
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {healthError && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 animate-in fade-in">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="text-sm font-medium">{healthError}</div>
          </div>
          {lastSuccessTime && (
            <div className="text-xs text-amber-700 font-medium shrink-0">
              Последний успешный опрос: {lastSuccessTime}
            </div>
          )}
        </div>
      )}

      {backupSuccessMessage && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 flex items-center gap-3 text-emerald-800 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="text-sm font-medium">{backupSuccessMessage}</div>
        </div>
      )}

      {backupError && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4 flex items-center gap-3 text-red-800 animate-in fade-in">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <div className="text-sm font-medium">{backupError}</div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU */}
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Нагрузка CPU</CardTitle>
            <Cpu className="w-4 h-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900">
              {health ? `${health.cpu_percent.toFixed(1)}%` : "—"}
            </div>
            <Progress
              value={health ? health.cpu_percent : 0}
              className="h-2 mt-3"
            />
            <p className="text-xs text-slate-500 mt-2">
              {!health
                ? "Данные не получены"
                : health.cpu_percent < 70
                ? "Нормальная нагрузка"
                : "Повышенная нагрузка"}
            </p>
          </CardContent>
        </Card>

        {/* RAM */}
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Оперативная память RAM</CardTitle>
            <HardDrive className="w-4 h-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900">
              {health ? `${health.ram_percent.toFixed(1)}%` : "—"}
            </div>
            <Progress
              value={health ? health.ram_percent : 0}
              className="h-2 mt-3"
            />
            <p className="text-xs text-slate-500 mt-2">
              {!health
                ? "Данные не получены"
                : health.ram_percent < 80
                ? "Достаточно памяти"
                : "Требуется оптимизация"}
            </p>
          </CardContent>
        </Card>

        {/* DB Status */}
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">База данных</CardTitle>
            <Database className="w-4 h-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-slate-900">
                {!health
                  ? "—"
                  : health.db_status === "ok"
                  ? "Подключена"
                  : "Ошибка"}
              </span>
              <Badge
                className={
                  !health
                    ? "bg-slate-100 text-slate-700 border-slate-300"
                    : health.db_status === "ok"
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : "bg-red-100 text-red-800 border-red-300"
                }
              >
                {!health ? "Нет данных" : health.db_status === "ok" ? "Active" : "Down"}
              </Badge>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-500 mt-3">
              {!health ? (
                <span>Статус БД неизвестен</span>
              ) : health.db_status === "ok" ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>PostgreSQL Connection OK</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  <span>PostgreSQL Connection Error</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Users Count */}
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Пользователи</CardTitle>
            <Users className="w-4 h-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900">{totalUsers}</div>
            <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
              <span className="text-emerald-600 font-semibold">{activeCount} активных</span>
              {blockedCount > 0 && (
                <span className="text-red-500 font-semibold">• {blockedCount} заблок.</span>
              )}
            </div>
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-900 mt-2"
            >
              <span>Управление</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Load History Chart (AreaChart) */}
        <Card className="lg:col-span-2 bg-white border-slate-200 shadow-sm min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">
              График нагрузки сервера (CPU и RAM)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Динамика использования ресурсов в реальном времени (%)
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <div className="h-64 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={loadHistory}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cpu"
                    name="CPU (%)"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorCpu)"
                  />
                  <Area
                    type="monotone"
                    dataKey="ram"
                    name="RAM (%)"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorRam)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 mt-4 text-xs font-semibold">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-purple-600 inline-block" />
                <span className="text-slate-600">
                  CPU: {health ? `${health.cpu_percent.toFixed(1)}%` : "—"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" />
                <span className="text-slate-600">
                  RAM: {health ? `${health.ram_percent.toFixed(1)}%` : "—"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Roles Distribution Bar Chart */}
        <Card className="bg-white border-slate-200 shadow-sm flex flex-col justify-between min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">
              Распределение пользователей
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Структура учетных записей по ролям
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center min-w-0">
            <div className="h-48 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roleDistributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="role" stroke="#94a3b8" fontSize={11} />
                  <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="count" name="Пользователей" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-around text-center">
              <div>
                <p className="text-xs text-slate-500">Курсантов</p>
                <p className="text-base font-bold text-emerald-600">{cadetsCount}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Преподавателей</p>
                <p className="text-base font-bold text-blue-600">{teachersCount}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Администраторов</p>
                <p className="text-base font-bold text-purple-600">{adminsCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Navigation Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* User Management Tile */}
        <Link
          href="/admin/users"
          className="group block p-6 bg-white border border-slate-200 hover:border-purple-500 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 text-purple-700 rounded-xl group-hover:scale-105 transition-transform">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
                  Управление учениками и пользователями
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Смена ролей, сброс паролей, блокировка и регистрация новых курсантов
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all" />
          </div>
        </Link>

        {/* System & Backup Tile */}
        <Link
          href="/admin/system"
          className="group block p-6 bg-white border border-slate-200 hover:border-purple-500 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 text-blue-700 rounded-xl group-hover:scale-105 transition-transform">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                  Резервное копирование и статус системы
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Создание дампов PostgreSQL, диагностика соединений и журналы бэкапов
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
          </div>
        </Link>
      </div>
    </div>
  )
}
