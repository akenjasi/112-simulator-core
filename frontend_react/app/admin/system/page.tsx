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
  FileCheck,
  Archive,
  Download,
  Info,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
} from "lucide-react"
import {
  fetchHealthcheck,
  triggerBackup,
  fetchBackups,
  downloadBackupFile,
  checkBackendIntegrity,
  HealthCheckData,
  BackupResult,
  BackupItem,
  IntegrityCheckResponse,
} from "@/lib/admin-api"

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Б"
  const k = 1024
  const sizes = ["Б", "КБ", "МБ", "ГБ"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return isoString
    return d.toLocaleString("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  } catch {
    return isoString
  }
}

function formatUtcDate(isoString: string): string {
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return isoString
    return (
      d.toLocaleString("ru-RU", {
        timeZone: "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }) + " UTC"
    )
  } catch {
    return isoString
  }
}

export default function AdminSystemPage() {
  const [health, setHealth] = useState<HealthCheckData | null>(null)
  const [isLoadingHealth, setIsLoadingHealth] = useState(false)
  const [lastHealthCheckTime, setLastHealthCheckTime] = useState<string | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [lastBackup, setLastBackup] = useState<BackupResult | null>(null)

  // Server-persisted backups list state
  const [backups, setBackups] = useState<BackupItem[]>([])
  const [isLoadingBackups, setIsLoadingBackups] = useState(false)
  const [backupsError, setBackupsError] = useState<string | null>(null)
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null)

  // Backend integrity check state
  const [integrityResult, setIntegrityResult] = useState<IntegrityCheckResponse | null>(null)
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(false)
  const [integrityError, setIntegrityError] = useState<string | null>(null)

  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const loadHealth = useCallback(async () => {
    setIsLoadingHealth(true)
    setHealthError(null)
    try {
      const data = await fetchHealthcheck()
      setHealth(data)
      const now = new Date().toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
      setLastHealthCheckTime(now)
    } catch (err: any) {
      const msg = err.message || "Связь с сервером нарушена"
      setHealthError("Связь с сервером нарушена")
      setErrorMessage(msg)
    } finally {
      setIsLoadingHealth(false)
    }
  }, [])

  const loadBackups = useCallback(async () => {
    setIsLoadingBackups(true)
    setBackupsError(null)
    try {
      const data = await fetchBackups()
      setBackups(data.backups || [])
    } catch (err: any) {
      setBackupsError(err.message || "Ошибка загрузки списка резервных копий")
    } finally {
      setIsLoadingBackups(false)
    }
  }, [])

  useEffect(() => {
    loadHealth()
    loadBackups()
  }, [loadHealth, loadBackups])

  const handleCheckIntegrity = async () => {
    setIsCheckingIntegrity(true)
    setIntegrityError(null)
    try {
      const res = await checkBackendIntegrity()
      setIntegrityResult(res)
    } catch (err: any) {
      setIntegrityError(err.message || "Проверка временно недоступна")
    } finally {
      setIsCheckingIntegrity(false)
    }
  }

  const handleCreateBackup = async () => {
    setIsBackingUp(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      const result = await triggerBackup()
      setLastBackup(result)
      const displayFile = result.filename || result.backup_file
      setSuccessMessage(`Дамп базы данных успешно сформирован: ${displayFile}`)

      // Refresh real backups list from server
      try {
        const data = await fetchBackups()
        setBackups(data.backups || [])
      } catch (listErr: any) {
        setErrorMessage("Резервная копия создана, но не удалось обновить список копий")
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Не удалось создать резервную копию базы данных")
    } finally {
      setIsBackingUp(false)
    }
  }

  const handleDownload = async (filename: string) => {
    setDownloadingFile(filename)
    setErrorMessage(null)
    try {
      await downloadBackupFile(filename)
    } catch (err: any) {
      setErrorMessage(err.message || `Ошибка скачивания файла ${filename}`)
    } finally {
      setDownloadingFile(null)
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
            Диагностика компонентов сервера и создание снимков базы данных
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
                {lastHealthCheckTime && ` • Обновлено в ${lastHealthCheckTime}`}
              </CardDescription>
            </div>
            {isLoadingHealth ? (
              <Badge className="bg-slate-100 text-slate-700 border-slate-300 gap-1.5 py-1 px-3">
                <RefreshCw className="w-3 h-3 animate-spin text-slate-500" />
                <span>Проверка...</span>
              </Badge>
            ) : healthError ? (
              <Badge className="bg-red-100 text-red-800 border-red-300 gap-1.5 py-1 px-3">
                <AlertTriangle className="w-3 h-3 text-red-600" />
                <span>Ошибка связи</span>
              </Badge>
            ) : health ? (
              health.db_status === "ok" ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1.5 py-1 px-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Сервер активен</span>
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 border-amber-300 gap-1.5 py-1 px-3">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  <span>Сбой компонентов</span>
                </Badge>
              )
            ) : (
              <Badge className="bg-slate-100 text-slate-600 border-slate-300 gap-1.5 py-1 px-3">
                <span>Статус неизвестен</span>
              </Badge>
            )}
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
                  {health === null ? "—" : health.db_status === "ok" ? "Подключена" : "Недоступна"}
                </span>
              </div>
            </div>
          </div>

          {healthError && health && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center justify-between">
              <span>Связь с сервером нарушена. Отображаются данные последнего успешного замера.</span>
              {lastHealthCheckTime && <span className="font-semibold">{lastHealthCheckTime}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Backend Integrity Check Card */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  Целостность файлов backend
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Побайтовая сверка SHA-256 исполняемого кода и скриптов с Docker-манифестом
                </CardDescription>
              </div>
            </div>

            {/* Status Badge */}
            {isCheckingIntegrity ? (
              <Badge className="bg-slate-100 text-slate-700 border-slate-300 gap-1.5 py-1 px-3">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-500" />
                <span>Проверка...</span>
              </Badge>
            ) : integrityError ? (
              <Badge className="bg-red-100 text-red-800 border-red-300 gap-1.5 py-1 px-3">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                <span>Ошибка проверки</span>
              </Badge>
            ) : integrityResult?.status === "ok" ? (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1.5 py-1 px-3">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Целостность подтверждена</span>
              </Badge>
            ) : integrityResult?.status === "deviation" ? (
              <Badge className="bg-red-100 text-red-800 border-red-300 gap-1.5 py-1 px-3">
                <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                <span>Обнаружены отклонения</span>
              </Badge>
            ) : integrityResult?.status === "unavailable" ? (
              <Badge className="bg-slate-100 text-slate-700 border-slate-300 gap-1.5 py-1 px-3">
                <ShieldX className="w-3.5 h-3.5 text-slate-500" />
                <span>Недоступно</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="text-slate-600 bg-slate-50 border-slate-300 py-1 px-3">
                Проверка не выполнялась
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-900">
                Контроль неизменности среды выполнения
              </h4>
              <p className="text-xs text-slate-600">
                Сверяет SHA-256 хэши Python-кода, скриптов запуска и нативных библиотек bin/ с манифестом сборки.
              </p>
            </div>
            <Button
              onClick={handleCheckIntegrity}
              disabled={isCheckingIntegrity}
              className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isCheckingIntegrity ? "animate-spin" : ""}`} />
              <span>{isCheckingIntegrity ? "Проверка..." : "Проверить целостность файлов"}</span>
            </Button>
          </div>

          {integrityError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{integrityError}</span>
            </div>
          )}

          {!integrityError && integrityResult && integrityResult.status === "unavailable" && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 flex items-center gap-3">
              <Info className="w-5 h-5 text-slate-500 shrink-0" />
              <div>
                <p className="font-medium text-slate-800">
                  {integrityResult.error || "Проверка недоступна (манифест отсутствует; создаётся при сборке Docker-образа)"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Манифест генерируется автоматически при сборке production-образа через Dockerfile.backend.
                </p>
              </div>
            </div>
          )}

          {!integrityError && integrityResult && (integrityResult.status === "ok" || integrityResult.status === "deviation") && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-white border border-slate-200 rounded-lg">
                  <span className="text-slate-500 block">Время проверки (UTC)</span>
                  <span className="font-semibold text-slate-800">{formatUtcDate(integrityResult.checked_at)}</span>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-lg">
                  <span className="text-slate-500 block">Проверено файлов</span>
                  <span className="font-semibold text-slate-800">{integrityResult.checked_files_count}</span>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-lg">
                  <span className="text-slate-500 block">Дайджест манифеста</span>
                  <span className="font-mono text-slate-800 truncate block" title={integrityResult.manifest_digest || ""}>
                    {integrityResult.manifest_digest ? `${integrityResult.manifest_digest.slice(0, 16)}...` : "—"}
                  </span>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-lg">
                  <span className="text-slate-500 block">Область проверки</span>
                  <span className="font-semibold text-slate-800 truncate block" title={integrityResult.scope_summary || ""}>
                    {integrityResult.scope_summary || "Python, скрипты, bin/"}
                  </span>
                </div>
              </div>

              {integrityResult.deviations && integrityResult.deviations.length > 0 && (
                <div className="border border-red-200 rounded-xl overflow-hidden bg-red-50/30">
                  <div className="p-3 bg-red-100/60 border-b border-red-200 text-xs font-bold text-red-900 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-red-600" />
                    <span>Обнаружены отклонения целостности ({integrityResult.deviations.length})</span>
                  </div>
                  <div className="divide-y divide-red-100 max-h-60 overflow-y-auto">
                    {integrityResult.deviations.map((dev, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between gap-4 text-xs">
                        <div className="font-mono text-slate-800 font-medium truncate flex-1" title={dev.path}>
                          {dev.path}
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            dev.reason === "modified"
                              ? "bg-amber-50 text-amber-800 border-amber-300 font-mono"
                              : dev.reason === "missing"
                              ? "bg-red-50 text-red-800 border-red-300 font-mono"
                              : "bg-slate-50 text-slate-800 border-slate-300 font-mono"
                          }
                        >
                          {dev.reason}
                        </Badge>
                        {dev.details && (
                          <span className="text-slate-500 text-xs truncate max-w-xs" title={dev.details}>
                            {dev.details}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
                Резервное копирование базы данных
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Инициирование снимка таблиц базы данных и скачивание сохранённых копий
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Scope Disclaimer Banner */}
          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3 text-blue-900 text-xs sm:text-sm">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <p>
              Резервная копия содержит только структуры и данные таблиц базы данных. Аудиозаписи, пользовательские загрузки на диске, веса моделей и конфигурационные файлы в дамп не входят.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <h4 className="font-bold text-slate-900 text-base">
                Создать резервную копию базы данных
              </h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Снимок сохраняет состояние пользователей, групп, сценариев, журнала вызовов и оценок на момент создания. Созданная копия доступна в списке ниже для скачивания.
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
                  {lastBackup.filename || lastBackup.backup_file}
                </span>
              </div>
            </div>
          )}

          {/* Server Backups List Section */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-4">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Archive className="w-4 h-4 text-slate-500" />
                <span>Сохранённые резервные копии базы данных</span>
              </h4>

              <Button
                variant="outline"
                size="sm"
                onClick={loadBackups}
                disabled={isLoadingBackups}
                className="flex items-center gap-1.5 text-xs bg-white cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBackups ? "animate-spin" : ""}`} />
                <span>Обновить список</span>
              </Button>
            </div>

            {/* List Loading */}
            {isLoadingBackups && (
              <div className="p-6 text-center text-sm text-slate-500 border border-slate-200 rounded-xl bg-slate-50">
                Загрузка списка резервных копий...
              </div>
            )}

            {/* List Error with Retry */}
            {!isLoadingBackups && backupsError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-4">
                <div className="text-sm text-red-700">{backupsError}</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadBackups}
                  className="bg-white text-xs shrink-0 cursor-pointer"
                >
                  Повторить
                </Button>
              </div>
            )}

            {/* Empty State */}
            {!isLoadingBackups && !backupsError && backups.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-500 border border-slate-200 rounded-xl bg-slate-50">
                Резервные копии базы данных ещё не создавались
              </div>
            )}

            {/* Backups Table */}
            {!isLoadingBackups && !backupsError && backups.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-x-auto divide-y divide-slate-200">
                {backups.map((item) => (
                  <div
                    key={item.filename}
                    className="p-3 bg-white flex items-center justify-between gap-4 text-xs min-w-[550px] hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden flex-1">
                      <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-mono text-slate-800 font-medium truncate" title={item.filename}>
                        {item.filename}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-slate-500">{formatDate(item.created_at)}</span>
                      <Badge variant="outline" className="text-slate-600 font-mono">
                        {formatBytes(item.size_bytes)}
                      </Badge>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(item.filename)}
                        disabled={downloadingFile === item.filename}
                        className="flex items-center gap-1.5 text-xs text-purple-700 hover:text-purple-900 border-purple-200 hover:border-purple-300 hover:bg-purple-50 cursor-pointer"
                      >
                        <Download className={`w-3.5 h-3.5 ${downloadingFile === item.filename ? "animate-pulse" : ""}`} />
                        <span>{downloadingFile === item.filename ? "Скачивание..." : "Скачать"}</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
