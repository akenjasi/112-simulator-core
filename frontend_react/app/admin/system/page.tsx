"use client"

import React, { useState, useEffect, useCallback } from "react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Database,
  Cpu,
  HardDrive,
  RefreshCw,
  DownloadCloud,
  CheckCircle2,
  AlertTriangle,
  Server,
  ShieldCheck,
  FileCheck,
  Clock,
  Archive,
} from "lucide-react"
import {
  fetchHealthcheck,
  triggerBackup,
  HealthCheckData,
  BackupResult,
} from "@/lib/admin-api"

interface BackupRecord {
  file: string
  created_at: string
  status: string
}

export default function AdminSystemPage() {
  const [health, setHealth] = useState<HealthCheckData | null>(null)
  const [isLoadingHealth, setIsLoadingHealth] = useState(false)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [lastBackup, setLastBackup] = useState<BackupResult | null>(null)
  const [backupHistory, setBackupHistory] = useState<BackupRecord[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const loadHealth = useCallback(async () => {
    setIsLoadingHealth(true)
    try {
      const data = await fetchHealthcheck()
      setHealth(data)
    } catch (err: any) {
      setErrorMessage(err.message || "Ошибка получения статуса системы")
    } finally {
      setIsLoadingHealth(false)
    }
  }, [])

  useEffect(() => {
    loadHealth()
  }, [loadHealth])

  const handleCreateBackup = async () => {
    setIsBackingUp(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      const result = await triggerBackup()
      setLastBackup(result)
      const now = new Date().toLocaleString("ru-RU")
      setBackupHistory((prev) => [
        {
          file: result.backup_file,
          created_at: now,
          status: result.status,
        },
        ...prev,
      ])
      setSuccessMessage(`Дамп базы данных успешно сформирован: ${result.backup_file}`)
    } catch (err: any) {
      setErrorMessage(err.message || "Не удалось создать резервную копию")
    } finally {
      setIsBackingUp(false)
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Система и резервное копирование
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Диагностика компонентов сервера и создание снимков базы данных PostgreSQL
          </p>
        </div>

        <Button
          variant="outline"
          onClick={loadHealth}
          disabled={isLoadingHealth}
          className="flex items-center gap-2 cursor-pointer bg-white"
        >
          <RefreshCw className={`w-4 h-4 ${isLoadingHealth ? "animate-spin" : ""}`} />
          <span>Проверить статус</span>
        </Button>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 flex items-center gap-3 text-emerald-800 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="text-sm font-medium">{successMessage}</div>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4 flex items-center gap-3 text-red-800 animate-in fade-in">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <div className="text-sm font-medium">{errorMessage}</div>
        </div>
      )}

      {/* System Diagnostic Status Card */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-slate-900">
                Диагностика сервера
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Текущие показатели производительности и доступность БД
              </CardDescription>
            </div>
            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1.5 py-1 px-3">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Сервер активен</span>
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* CPU */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-4">
              <div className="p-3 bg-purple-100 text-purple-700 rounded-xl">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs text-slate-500 font-semibold uppercase block">
                  Процессор (CPU)
                </span>
                <span className="text-xl font-black text-slate-900">
                  {health ? `${health.cpu_percent.toFixed(1)}%` : "—"}
                </span>
              </div>
            </div>

            {/* RAM */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-4">
              <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
                <HardDrive className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs text-slate-500 font-semibold uppercase block">
                  Оперативная память (RAM)
                </span>
                <span className="text-xl font-black text-slate-900">
                  {health ? `${health.ram_percent.toFixed(1)}%` : "—"}
                </span>
              </div>
            </div>

            {/* DB */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-4">
              <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs text-slate-500 font-semibold uppercase block">
                  База данных (PostgreSQL)
                </span>
                <span className="text-xl font-black text-slate-900">
                  {health?.db_status === "ok" ? "Подключена" : "Недоступна"}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Database Backup Section */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-100 text-purple-700 rounded-xl">
              <Archive className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-slate-900">
                Резервное копирование БД
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Инициирование дампа данных без прерывания обслуживания сессий
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <h4 className="font-bold text-slate-900 text-base">
                Создать мгновенный снимок БД
              </h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Снимок включает таблицы пользователей, учебных групп, сценариев, журнала вызовов и оценок. Дамп сохраняется в серверное хранилище бэкапов с фиксацией времени.
              </p>
            </div>

            <Button
              size="lg"
              onClick={handleCreateBackup}
              disabled={isBackingUp}
              className="bg-purple-700 hover:bg-purple-800 text-white font-bold px-6 py-6 rounded-xl shadow-md flex items-center gap-2 cursor-pointer shrink-0"
            >
              <DownloadCloud className={`w-5 h-5 ${isBackingUp ? "animate-bounce" : ""}`} />
              <span>{isBackingUp ? "Создание дампа..." : "Создать Backup базы данных"}</span>
            </Button>
          </div>

          {/* Last created backup information */}
          {lastBackup && (
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-center gap-4">
              <FileCheck className="w-8 h-8 text-purple-700 shrink-0" />
              <div className="overflow-hidden">
                <span className="text-xs font-bold text-purple-800 uppercase tracking-wider block">
                  Последний созданный файл
                </span>
                <span className="text-sm font-mono text-slate-800 font-semibold break-all">
                  {lastBackup.backup_file}
                </span>
              </div>
            </div>
          )}

          {/* Backup History in Current Session */}
          {backupHistory.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-500" />
                <span>Созданные дампы в текущей сессии</span>
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-x-auto divide-y divide-slate-200">
                {backupHistory.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-white flex items-center justify-between gap-4 text-xs min-w-[500px]"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-mono text-slate-700 truncate">{item.file}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-slate-400">{item.created_at}</span>
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
