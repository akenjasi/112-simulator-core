"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Info,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react"
import {
  fetchAuditLogs,
  fetchErrorLogs,
  SystemErrorLogItem,
  UserActionLogItem,
} from "@/lib/admin-api"

const PAGE_SIZE = 20

function formatLocalDateTime(isoString?: string | null): string {
  if (!isoString) return "—"
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

function parseJsonDetails(details?: string | null): { isJson: boolean; content: unknown } {
  if (!details) return { isJson: false, content: null }
  try {
    const trimmed = details.trim()
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      const parsed = JSON.parse(trimmed)
      return { isJson: true, content: parsed }
    }
  } catch {
    // plain string
  }
  return { isJson: false, content: details }
}

export default function AdminLogsPage() {
  const [activeTab, setActiveTab] = useState<"audit" | "errors">("audit")

  // Log lists
  const [auditLogs, setAuditLogs] = useState<UserActionLogItem[]>([])
  const [errorLogs, setErrorLogs] = useState<SystemErrorLogItem[]>([])
  const [hasNextPage, setHasNextPage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Pagination
  const [offset, setOffset] = useState(0)

  // Filters inputs
  const [fromInput, setFromInput] = useState("")
  const [toInput, setToInput] = useState("")
  const [userInput, setUserInput] = useState("")
  const [filterError, setFilterError] = useState<string | null>(null)

  // Applied filters state
  const [appliedFilters, setAppliedFilters] = useState<{
    from_at?: string
    to_at?: string
    user_id?: string
  }>({})

  // Modal inspection
  const [selectedAudit, setSelectedAudit] = useState<UserActionLogItem | null>(null)
  const [selectedError, setSelectedError] = useState<SystemErrorLogItem | null>(null)

  // Race condition protection ref
  const requestIdRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const loadData = useCallback(async () => {
    const currentReqId = ++requestIdRef.current
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoading(true)
    setErrorMessage(null)

    try {
      if (activeTab === "audit") {
        const data = await fetchAuditLogs(
          {
            limit: PAGE_SIZE + 1,
            offset,
            from_at: appliedFilters.from_at,
            to_at: appliedFilters.to_at,
            user_id: appliedFilters.user_id,
          },
          controller.signal
        )
        if (currentReqId !== requestIdRef.current) return
        setHasNextPage(data.length > PAGE_SIZE)
        setAuditLogs(data.slice(0, PAGE_SIZE))
      } else {
        const data = await fetchErrorLogs(
          {
            limit: PAGE_SIZE + 1,
            offset,
            from_at: appliedFilters.from_at,
            to_at: appliedFilters.to_at,
          },
          controller.signal
        )
        if (currentReqId !== requestIdRef.current) return
        setHasNextPage(data.length > PAGE_SIZE)
        setErrorLogs(data.slice(0, PAGE_SIZE))
      }
    } catch (err: unknown) {
      if (currentReqId !== requestIdRef.current) return
      if (err instanceof DOMException && err.name === "AbortError") {
        return
      }
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Ошибка загрузки данных журнала"
      )
    } finally {
      if (currentReqId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [activeTab, offset, appliedFilters])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Escape key listener for details modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedAudit(null)
        setSelectedError(null)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const handleTabChange = (tab: "audit" | "errors") => {
    if (tab === activeTab) return
    setActiveTab(tab)
    setOffset(0)
    setFilterError(null)
  }

  const handleApplyFilter = () => {
    setFilterError(null)

    let fromUtc: string | undefined
    let toUtc: string | undefined

    if (fromInput) {
      const dFrom = new Date(fromInput)
      if (isNaN(dFrom.getTime())) {
        setFilterError("Некорректная дата «С»")
        return
      }
      fromUtc = dFrom.toISOString()
    }

    if (toInput) {
      const dTo = new Date(toInput)
      if (isNaN(dTo.getTime())) {
        setFilterError("Некорректная дата «По»")
        return
      }
      toUtc = dTo.toISOString()
    }

    if (fromUtc && toUtc && fromUtc > toUtc) {
      setFilterError("Дата «С» не может быть позже «По»")
      return
    }

    setOffset(0)
    setAppliedFilters({
      from_at: fromUtc,
      to_at: toUtc,
      user_id: userInput.trim() ? userInput.trim() : undefined,
    })
  }

  const handleResetFilter = () => {
    setFromInput("")
    setToInput("")
    setUserInput("")
    setFilterError(null)
    setOffset(0)
    setAppliedFilters({})
  }

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Журналы
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Просмотр действий пользователей и системных ошибок комплекса
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadData()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition shadow-xs disabled:opacity-50 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-purple-700" : ""}`} />
          <span>Обновить</span>
        </button>
      </div>

      {/* Audit Disclaimer Banner */}
      <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-900 text-xs sm:text-sm">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p>
          Журнал действий не всегда подтверждает успешное выполнение запроса. Записи фиксируют факт обращения к серверу.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "audit"}
          onClick={() => handleTabChange("audit")}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-all cursor-pointer ${
            activeTab === "audit"
              ? "border-purple-700 text-purple-700"
              : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
          }`}
        >
          Действия пользователей
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "errors"}
          onClick={() => handleTabChange("errors")}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-all cursor-pointer ${
            activeTab === "errors"
              ? "border-purple-700 text-purple-700"
              : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
          }`}
        >
          Ошибки
        </button>
      </div>

      {/* Filter Section */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label
              htmlFor="from-input"
              className="block text-xs font-bold text-slate-700 mb-1"
            >
              С
            </label>
            <input
              id="from-input"
              type="datetime-local"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white"
            />
          </div>
          <div>
            <label
              htmlFor="to-input"
              className="block text-xs font-bold text-slate-700 mb-1"
            >
              По
            </label>
            <input
              id="to-input"
              type="datetime-local"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white"
            />
          </div>
          {activeTab === "audit" && (
            <div>
              <label
                htmlFor="user-input"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                Пользователь (ID)
              </label>
              <input
                id="user-input"
                type="text"
                placeholder="ID пользователя (UUID)"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white"
              />
            </div>
          )}
        </div>

        {filterError && (
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{filterError}</span>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleApplyFilter}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-700 text-white rounded-lg text-sm font-semibold hover:bg-purple-800 transition cursor-pointer"
          >
            <Search className="w-4 h-4" />
            <span>Применить</span>
          </button>
          <button
            type="button"
            onClick={handleResetFilter}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-200 transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Сбросить</span>
          </button>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading && (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-purple-700" />
            <p className="text-sm font-medium">Загрузка журнала…</p>
          </div>
        )}

        {!loading && errorMessage && (
          <div className="p-8 text-center text-slate-800 space-y-3">
            <div className="inline-flex p-3 bg-red-100 text-red-600 rounded-full mb-1">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-red-700">Ошибка загрузки данных</h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto">{errorMessage}</p>
            <button
              type="button"
              onClick={() => loadData()}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-purple-700 text-white rounded-lg text-sm font-semibold hover:bg-purple-800 transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Повторить</span>
            </button>
          </div>
        )}

        {!loading && !errorMessage && activeTab === "audit" && auditLogs.length === 0 && (
          <div className="p-12 text-center text-slate-500">
            <p className="text-sm font-medium">Записей не найдено</p>
          </div>
        )}

        {!loading && !errorMessage && activeTab === "errors" && errorLogs.length === 0 && (
          <div className="p-12 text-center text-slate-500">
            <p className="text-sm font-medium">Записей не найдено</p>
          </div>
        )}

        {/* Audit Logs Table */}
        {!loading && !errorMessage && activeTab === "audit" && auditLogs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700 border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Дата и время (местное)
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Пользователь
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Роль
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Действие
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {auditLogs.map((log) => {
                  const userDisplay = log.username || log.user_id || "Не указан"
                  return (
                    <tr key={log.log_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-900">
                        {formatLocalDateTime(log.timestamp)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-800">
                        {userDisplay}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-semibold">
                          {log.role || "Не указана"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-900 font-mono text-xs max-w-xs truncate">
                        {log.action}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedAudit(log)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-purple-700 hover:text-purple-900 hover:bg-purple-50 rounded-lg transition cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Подробнее</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Error Logs Table */}
        {!loading && !errorMessage && activeTab === "errors" && errorLogs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700 border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-4 py-3 w-48">
                    Дата и время (местное)
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Сообщение об ошибке
                  </th>
                  <th scope="col" className="px-4 py-3 text-right w-28">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {errorLogs.map((err) => (
                  <tr key={err.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-900">
                      {formatLocalDateTime(err.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-red-700 font-mono text-xs break-words">
                      {err.error_message}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedError(err)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-purple-700 hover:text-purple-900 hover:bg-purple-50 rounded-lg transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Подробнее</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && !errorMessage && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-sm">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Назад</span>
            </button>
            <span className="text-xs font-bold text-slate-600">
              Страница {currentPage}
            </span>
            <button
              type="button"
              disabled={!hasNextPage}
              onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <span>Далее</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Audit Log Details Modal */}
      {selectedAudit && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="text-base font-extrabold text-slate-900">
                Подробности действия
              </h2>
              <button
                type="button"
                onClick={() => setSelectedAudit(null)}
                aria-label="Закрыть"
                className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-sm text-slate-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase block">ID записи:</span>
                  <span className="font-mono text-xs text-slate-900 break-all">{selectedAudit.log_id}</span>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase block">Дата и время:</span>
                  <span className="text-slate-900">{formatLocalDateTime(selectedAudit.timestamp)}</span>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase block">Пользователь:</span>
                  <span className="text-slate-900">{selectedAudit.username || selectedAudit.user_id || "Не указан"}</span>
                </div>
                {selectedAudit.role && (
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase block">Роль:</span>
                    <span className="text-slate-900">{selectedAudit.role}</span>
                  </div>
                )}
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase block">Действие:</span>
                  <span className="font-mono text-xs text-slate-900 font-semibold">{selectedAudit.action}</span>
                </div>
                {selectedAudit.endpoint && (
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase block">Endpoint:</span>
                    <span className="font-mono text-xs text-slate-900">{selectedAudit.endpoint}</span>
                  </div>
                )}
                {selectedAudit.target_entity && (
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase block">Объект:</span>
                    <span className="text-slate-900">{selectedAudit.target_entity}</span>
                  </div>
                )}
                {selectedAudit.target_id && (
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase block">ID объекта:</span>
                    <span className="font-mono text-xs text-slate-900">{selectedAudit.target_id}</span>
                  </div>
                )}
                {selectedAudit.ip_address && (
                  <div>
                    <span className="text-xs font-bold text-slate-500 uppercase block">IP-адрес:</span>
                    <span className="font-mono text-xs text-slate-900">{selectedAudit.ip_address}</span>
                  </div>
                )}
              </div>

              {selectedAudit.details && (
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Детали (Details)</span>
                  {(() => {
                    const parsed = parseJsonDetails(selectedAudit.details)
                    if (parsed.isJson) {
                      return (
                        <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs overflow-x-auto whitespace-pre font-mono">
                          {JSON.stringify(parsed.content, null, 2)}
                        </pre>
                      )
                    }
                    return (
                      <pre className="p-3 bg-slate-100 text-slate-800 rounded-lg text-xs whitespace-pre-wrap break-words font-mono">
                        {selectedAudit.details}
                      </pre>
                    )
                  })()}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedAudit(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-semibold rounded-lg transition cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Log Details Modal */}
      {selectedError && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h2 className="text-base font-extrabold text-slate-900">
                Подробности ошибки
              </h2>
              <button
                type="button"
                onClick={() => setSelectedError(null)}
                aria-label="Закрыть"
                className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-sm text-slate-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase block">ID записи:</span>
                  <span className="font-mono text-xs text-slate-900 break-all">{selectedError.id}</span>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase block">Дата и время:</span>
                  <span className="text-slate-900">{formatLocalDateTime(selectedError.timestamp)}</span>
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-500 uppercase block mb-1">Сообщение об ошибке:</span>
                <p className="p-3 bg-red-50 text-red-900 border border-red-200 rounded-lg text-xs font-mono break-words">
                  {selectedError.error_message}
                </p>
              </div>

              {selectedError.traceback && (
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase block mb-1">Стек вызова (Traceback):</span>
                  <pre className="p-3 bg-slate-900 text-red-200 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-words font-mono max-h-60">
                    {selectedError.traceback}
                  </pre>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedError(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-semibold rounded-lg transition cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
