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
  time: string
  cpu: number
  ram: number
}

export default function AdminDashboardPage() {
  const [health, setHealth] = useState<HealthCheckData>({
    cpu_percent: 18.5,
    ram_percent: 42.1,
    db_status: "ok",
  })
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loadHistory, setLoadHistory] = useState<LoadMetricPoint[]>([
    { time: "11:00", cpu: 12, ram: 40 },
    { time: "11:05", cpu: 19, ram: 41 },
    { time: "11:10", cpu: 25, ram: 43 },
    { time: "11:15", cpu: 16, ram: 42 },
    { time: "11:20", cpu: 22, ram: 44 },
    { time: "11:25", cpu: 18.5, ram: 42.1 },
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [backupSuccessMessage, setBackupSuccessMessage] = useState<string | null>(null)
  const [backupError, setBackupError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [healthData, usersData] = await Promise.allSettled([
        fetchHealthcheck(),
        fetchUsers(),
      ])

      if (healthData.status === "fulfilled") {
        setHealth(healthData.value)
        const now = new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
        setLoadHistory((prev) => {
          const updated = [
            ...prev.slice(-9),
            {
              time: now,
              cpu: healthData.value.cpu_percent,
              ram: healthData.value.ram_percent,
            },
          ]
          return updated
        })
      }

      if (usersData.status === "fulfilled") {
        setUsers(usersData.value)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const timer = setInterval(() => {
      fetchHealthcheck()
        .then((data) => {
          setHealth(data)
          const now = new Date().toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
          setLoadHistory((prev) => [
            ...prev.slice(-9),
            { time: now, cpu: data.cpu_percent, ram: data.ram_percent },
          ])
        })
        .catch(() => {})
    }, 15000)

    return () => clearInterval(timer)
  }, [loadData])

  const handleCreateBackup = async () => {
    try {
      setIsBackingUp(true)
      setBackupError(null)
      const res = await triggerBackup()
      setBackupSuccessMessage(`Резервная копия успешно создана: ${res.backup_file}`)
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

        <div className="flex items-center gap-3">
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
            <div className="text-2xl font-black text-slate-900">{health.cpu_percent.toFixed(1)}%</div>
            <Progress
              value={health.cpu_percent}
              className="h-2 mt-3"
            />
            <p className="text-xs text-slate-500 mt-2">
              {health.cpu_percent < 70 ? "Нормальная нагрузка" : "Повышенная нагрузка"}
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
            <div className="text-2xl font-black text-slate-900">{health.ram_percent.toFixed(1)}%</div>
            <Progress
              value={health.ram_percent}
              className="h-2 mt-3"
            />
            <p className="text-xs text-slate-500 mt-2">
              {health.ram_percent < 80 ? "Достаточно памяти" : "Требуется оптимизация"}
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
                {health.db_status === "ok" ? "Подключена" : "Ошибка"}
              </span>
              <Badge
                className={
                  health.db_status === "ok"
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : "bg-red-100 text-red-800 border-red-300"
                }
              >
                {health.db_status === "ok" ? "Active" : "Down"}
              </Badge>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-500 mt-3">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>PostgreSQL Connection OK</span>
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
        <Card className="lg:col-span-2 bg-white border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">
              График нагрузки сервера (CPU и RAM)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Динамика использования ресурсов в реальном времени (%)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
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
                <span className="text-slate-600">CPU: {health.cpu_percent.toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" />
                <span className="text-slate-600">RAM: {health.ram_percent.toFixed(1)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Roles Distribution Bar Chart */}
        <Card className="bg-white border-slate-200 shadow-sm flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">
              Распределение пользователей
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Структура учетных записей по ролям
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center">
            <div className="h-48 w-full">
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
