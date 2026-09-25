"use client"

import React, { useState } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Save,
  X,
  FileCheck,
  UserCheck,
  Scale,
  Sparkles,
} from "lucide-react"

export interface ErrorDetailItem {
  field?: string
  error?: string
  message?: string
  severity?: "error" | "warning" | string
  etalon_value?: any
  student_value?: any
}

export interface RecordDetail {
  record_id: string
  cadet_id?: string
  cadet_name?: string
  ticket_id?: string
  title?: string
  status: "passed" | "failed" | string
  score?: number
  is_appealed?: boolean
  teacher_comment?: string | null
  etalon: Record<string, any>
  student_answer: Record<string, any>
  error_details: ErrorDetailItem[] | Record<string, any> | string[]
}

export interface SplitScreenProps {
  record: RecordDetail
  onAppeal?: (recordId: string, payload: { status: string; comment: string }) => Promise<void> | void
  onClose?: () => void
  className?: string
}

const FIELD_LABELS: Record<string, string> = {
  street: "Улица / Проспект",
  house: "Номер дома",
  address: "Адрес происшествия",
  category: "Категория происшествия",
  incident_type: "Тип происшествия",
  caller_name: "ФИО Заявителя",
  phone: "Контактный телефон",
  services: "Вызванные службы",
  assigned_services: "Направленные службы",
  description: "Описание ситуации",
  urgency: "Срочность",
  injured_count: "Количество пострадавших",
}

export function SplitScreen({ record, onAppeal, onClose, className = "" }: SplitScreenProps) {
  const [isAppealModalOpen, setIsAppealModalOpen] = useState(false)
  const [appealStatus, setAppealStatus] = useState<string>("passed")
  const [appealComment, setAppealComment] = useState<string>("Опечатка")
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  // Normalize error_details into uniform list
  const normalizedErrors: ErrorDetailItem[] = React.useMemo(() => {
    if (!record.error_details) return []
    if (Array.isArray(record.error_details)) {
      return record.error_details.map((item) => {
        if (typeof item === "string") {
          const isWarning = item.toLowerCase().includes("предупреждение") || item.toLowerCase().includes("warning")
          return {
            field: undefined,
            message: item,
            error: item,
            severity: isWarning ? "warning" : "error",
          }
        }
        return {
          ...item,
          severity: item.severity || "error",
        }
      })
    }
    // If it's a key-value object { [field]: "error message" }
    return Object.entries(record.error_details).map(([key, val]) => {
      const msg = typeof val === "object" ? JSON.stringify(val) : String(val)
      const isWarning = msg.toLowerCase().includes("предупреждение") || msg.toLowerCase().includes("warning")
      return {
        field: key,
        message: msg,
        error: msg,
        severity: isWarning ? "warning" : "error",
      }
    })
  }, [record.error_details])

  // Map of field -> error
  const fieldErrors = React.useMemo(() => {
    const map = new Map<string, ErrorDetailItem>()
    for (const err of normalizedErrors) {
      if (err.field) {
        map.set(err.field.toLowerCase(), err)
      }
    }
    return map
  }, [normalizedErrors])

  // Collect all unique field keys from etalon and student_answer
  const allFieldKeys = React.useMemo(() => {
    const keys = new Set<string>()
    if (record.etalon && typeof record.etalon === "object") {
      Object.keys(record.etalon).forEach((k) => keys.add(k))
    }
    if (record.student_answer && typeof record.student_answer === "object") {
      Object.keys(record.student_answer).forEach((k) => keys.add(k))
    }
    // Also include any fields from errors
    normalizedErrors.forEach((e) => {
      if (e.field) keys.add(e.field)
    })
    return Array.from(keys)
  }, [record.etalon, record.student_answer, normalizedErrors])

  const formatFieldValue = (val: any) => {
    if (val === undefined || val === null) return "—"
    if (Array.isArray(val)) return val.join(", ")
    if (typeof val === "object") return JSON.stringify(val, null, 1)
    return String(val)
  }

  const handleSaveAppeal = async () => {
    try {
      setIsSaving(true)
      if (onAppeal) {
        await onAppeal(record.record_id, {
          status: appealStatus,
          comment: appealComment,
        })
      } else {
        const res = await fetch(`/api/v1/analytics/records/${record.record_id}/appeal`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: appealStatus,
            comment: appealComment,
          }),
        })
        if (!res.ok) {
          throw new Error(`Ошибка сохранения апелляции (${res.status})`)
        }
      }
      setSaveSuccess("Оценка успешно обновлена")
      setIsAppealModalOpen(false)
      setTimeout(() => setSaveSuccess(null), 4000)
    } catch (err: any) {
      alert(err.message || "Не удалось сохранить апелляцию")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className={`w-full shadow-lg border-2 ${className}`} data-testid="split-screen-card">
      <CardHeader className="border-b pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              <CardTitle className="text-xl">
                Сплит-скрин карточки: {record.title || `Запись #${record.record_id}`}
              </CardTitle>
            </div>
            <CardDescription className="mt-1 flex items-center gap-2 flex-wrap">
              {record.cadet_name && <span><strong>{record.cadet_name}</strong></span>}
              <span>•</span>
              <span>Статус: </span>
              {record.status === "passed" ? (
                <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Зачтено
                </Badge>
              ) : (
                <Badge variant="destructive" className="bg-rose-600 hover:bg-rose-700 text-white">
                  <XCircle className="h-3 w-3 mr-1" /> Не зачтено
                </Badge>
              )}
              {record.is_appealed && (
                <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300">
                  <Sparkles className="h-3 w-3 mr-1" /> Апеллировано
                </Badge>
              )}
              {record.score !== undefined && (
                <span className="font-semibold text-foreground">Балл: {record.score}%</span>
              )}
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="default"
              className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5"
              onClick={() => setIsAppealModalOpen(true)}
            >
              <RotateCcw className="h-4 w-4" />
              Изменить оценку
            </Button>
            {onClose && (
              <Button type="button" variant="outline" size="icon" onClick={onClose} title="Закрыть">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {saveSuccess && (
          <div className="mt-2 p-2.5 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500 text-emerald-800 dark:text-emerald-200 text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {saveSuccess}
          </div>
        )}

        {record.teacher_comment && (
          <div className="mt-2 p-2.5 rounded bg-purple-50 dark:bg-purple-950/30 border border-purple-300 text-purple-900 dark:text-purple-200 text-sm">
            <span className="font-semibold">Комментарий преподавателя: </span>
            {record.teacher_comment}
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        {/* Split Screen 2 Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="split-screen-columns">
          {/* Left Column: Эталон */}
          <div className="flex flex-col border rounded-lg p-4 bg-muted/20" data-testid="etalon-column">
            <div className="flex items-center gap-2 pb-3 mb-4 border-b">
              <FileCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="font-bold text-lg text-blue-900 dark:text-blue-300">Эталон</h3>
              <Badge variant="outline" className="ml-auto text-xs">Правильный ответ</Badge>
            </div>

            <div className="space-y-4">
              {allFieldKeys.map((key) => {
                const label = FIELD_LABELS[key] || key
                const val = record.etalon ? record.etalon[key] : undefined
                return (
                  <div key={`etalon-${key}`} className="p-3 rounded-md bg-background border border-border/60">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                      {label}
                    </span>
                    <div className="text-sm font-medium text-foreground whitespace-pre-wrap">
                      {formatFieldValue(val)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right Column: Ввод курсанта */}
          <div className="flex flex-col border rounded-lg p-4 bg-muted/20" data-testid="student-column">
            <div className="flex items-center gap-2 pb-3 mb-4 border-b">
              <UserCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="font-bold text-lg text-indigo-900 dark:text-indigo-300">Ввод курсанта</h3>
              <Badge variant="outline" className="ml-auto text-xs">Ответ курсанта</Badge>
            </div>

            <div className="space-y-4">
              {allFieldKeys.map((key) => {
                const label = FIELD_LABELS[key] || key
                const val = record.student_answer ? record.student_answer[key] : undefined
                const error = fieldErrors.get(key.toLowerCase())

                // Highlight color depending on severity: red (error) or yellow (warning)
                let highlightClass = "bg-background border-border/60"
                if (error) {
                  if (error.severity === "warning") {
                    highlightClass =
                      "border-yellow-500 bg-yellow-500/10 text-yellow-950 dark:text-yellow-200 border-2 shadow-xs"
                  } else {
                    highlightClass =
                      "border-red-500 bg-red-500/10 text-red-950 dark:text-red-200 border-2 shadow-xs"
                  }
                }

                return (
                  <div
                    key={`student-${key}`}
                    className={`p-3 rounded-md transition-colors ${highlightClass}`}
                    data-testid={`student-field-${key}`}
                    data-severity={error?.severity}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {label}
                      </span>
                      {error && (
                        <Badge
                          variant={error.severity === "warning" ? "secondary" : "destructive"}
                          className={
                            error.severity === "warning"
                              ? "bg-yellow-500 text-yellow-950 hover:bg-yellow-600 text-[10px] px-1.5 py-0"
                              : "bg-red-600 text-white text-[10px] px-1.5 py-0"
                          }
                        >
                          {error.severity === "warning" ? "Предупреждение" : "Ошибка"}
                        </Badge>
                      )}
                    </div>

                    <div className="text-sm font-medium whitespace-pre-wrap">
                      {formatFieldValue(val)}
                    </div>

                    {error && (
                      <div className="mt-2 text-xs font-semibold flex items-start gap-1">
                        <AlertTriangle
                          className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${
                            error.severity === "warning" ? "text-yellow-600" : "text-red-600"
                          }`}
                        />
                        <span>{error.message || error.error}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Detailed error list from error_details */}
        {normalizedErrors.length > 0 && (
          <div className="mt-6 border rounded-lg p-4 bg-background" data-testid="error-details-section">
            <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Обнаруженные ошибки и несовпадения ({normalizedErrors.length})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {normalizedErrors.map((err, idx) => {
                const isWarning = err.severity === "warning"
                return (
                  <div
                    key={`err-${idx}`}
                    className={`p-3 rounded-lg border text-sm flex items-start gap-2.5 ${
                      isWarning
                        ? "bg-yellow-500/10 border-yellow-500/40 text-yellow-900 dark:text-yellow-200"
                        : "bg-red-500/10 border-red-500/40 text-red-900 dark:text-red-200"
                    }`}
                  >
                    <span
                      className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 mt-1.5 ${
                        isWarning ? "bg-yellow-500" : "bg-red-500"
                      }`}
                    />
                    <div>
                      {err.field && (
                        <span className="font-bold mr-1.5">
                          [{FIELD_LABELS[err.field] || err.field}]:
                        </span>
                      )}
                      <span>{err.message || err.error || "Несоответствие образцу"}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>

      {/* Appeal Modal */}
      {isAppealModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          data-testid="appeal-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="appeal-modal-title"
        >
          <div className="bg-background border rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-amber-600" />
                <h3 id="appeal-modal-title" className="text-lg font-bold text-foreground">
                  Апелляция: Изменение оценки
                </h3>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsAppealModalOpen(false)}
                title="Отмена"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="appeal-status-select" className="text-sm font-semibold mb-1 block">
                  Новый статус оценки
                </Label>
                <select
                  id="appeal-status-select"
                  aria-label="Новый статус оценки"
                  value={appealStatus}
                  onChange={(e) => setAppealStatus(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background text-foreground border-input focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="passed">Зачтено (passed)</option>
                  <option value="failed">Не зачтено (failed)</option>
                </select>
              </div>

              <div>
                <Label htmlFor="appeal-comment-input" className="text-sm font-semibold mb-1 block">
                  Комментарий преподавателя
                </Label>
                <Textarea
                  id="appeal-comment-input"
                  aria-label="Комментарий преподавателя"
                  placeholder="Укажите причину (например: Опечатка, технический сбой, обоснованный ответ)"
                  value={appealComment}
                  onChange={(e) => setAppealComment(e.target.value)}
                  rows={4}
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAppealModalOpen(false)}
                disabled={isSaving}
              >
                Отмена
              </Button>
              <Button
                type="button"
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
                onClick={handleSaveAppeal}
                disabled={isSaving}
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
