"use client"

import { apiFetch as fetch } from "@/lib/api-fetch"

import React, { useState } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { GradeScoreInput } from "@/components/teacher/grade-score-input"
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
  FileText,
  Clock,
  Activity,
  MessageSquare,
  Award,
  Bot,
} from "lucide-react"

export interface ErrorDetailItem {
  field?: string
  error?: string
  message?: string
  severity?: "error" | "warning" | string
  etalon_value?: any
  student_value?: any
}

export interface IncidentContextData {
  category?: string
  subcategory?: string
  address?: string
  description?: string
  caller_name?: string
  caller_phone?: string
  caller_role?: string
  signs?: Record<string, string>
  assigned_service?: string
  services?: string[]
}

export interface DDSEtalonData {
  service_name?: string
  expected_decision?: string
  decision_rationale?: string
  decision_alternatives?: string
  expected_stages?: string[]
  expected_result?: string
  required_comment_points?: string[]
  sample_comment?: string
  confirmation_time_limit_seconds?: number
}

export interface DDSActionItemData {
  request_id?: string
  kind?: string
  service_name?: string
  actor_id?: string
  at?: string
  seconds_from_start?: number
  status?: string
  comment?: string
  order_number?: string
  who_accepted?: string
  summary?: string
}

export interface DDSCriteriaComparisonData {
  decision: {
    expected_decision?: string
    rationale?: string
    alternatives?: string
    actual_decision?: string
    actual_service?: string
    actual_comment?: string
    actual_at?: string
  }
  timeliness: {
    normative_seconds?: number
    actual_seconds?: number
    directed_at?: string
    confirmed_at?: string
    is_recorded: boolean
    note?: string
  }
  progression: {
    expected_stages: string[]
    expected_result?: string
    actual_stages: Array<Record<string, any>>
    final_status?: string
  }
  comment: {
    required_points: string[]
    sample_comment?: string
    actual_comments: string[]
    actual_messages: Array<Record<string, any>>
  }
  has_dds_etalon: boolean
  has_cadet_actions: boolean
}

export interface RecordDetail {
  record_id: string
  cadet_id?: string
  cadet_name?: string
  ticket_id?: string
  title?: string
  status: "passed" | "failed" | string
  score?: number | null
  automatic_score?: number | null
  expert_score?: number | null
  expert_modified_by?: string | null
  expert_modified_at?: string | null
  snapshot_missing?: boolean
  is_appealed?: boolean
  teacher_comment?: string | null
  revision_reason?: string | null
  ai_comment?: string | null
  automatic_comment?: string | null
  etalon: Record<string, any>
  student_answer: Record<string, any>
  error_details: ErrorDetailItem[] | Record<string, any> | string[]
  incident_context?: IncidentContextData | null
  dds_etalon?: DDSEtalonData | null
  cadet_actions?: DDSActionItemData[]
  dds_comparison?: DDSCriteriaComparisonData | null
  has_dds_etalon?: boolean
}

export interface SplitScreenProps {
  record: RecordDetail
  onAppeal?: (
    recordId: string,
    payload: { status: string; comment: string; score?: number; reason?: string }
  ) => Promise<void> | void
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

const SERVICE_NAMES: Record<string, string> = {
  "101": "Пожарная охрана (101)",
  "102": "Полиция (102)",
  "103": "Скорая помощь (103)",
  "104": "Аварийная газовая служба (104)",
  "112": "ЕДДС (112)",
}

const EXCLUDED_KEYS = new Set([
  "speaker",
  "gender",
  "visClass",
  "bricks",
  "tts",
  "voice",
  "class",
  "className",
  "audio",
  "sound",
  "dds_etalon",
  "actions",
  "comments",
  "messages",
  "decision",
  "details",
])

export function SplitScreen({ record, onAppeal, onClose, className = "" }: SplitScreenProps) {
  const [isAppealModalOpen, setIsAppealModalOpen] = useState(false)
  const [appealStatus, setAppealStatus] = useState<string>("passed")
  const [appealScore, setAppealScore] = useState<string>("")
  const [appealComment, setAppealComment] = useState<string>("")
  const [appealReason, setAppealReason] = useState<string>("")
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
    // If it's a key-value object { [field]: "error message" or { message: "...", severity: "..." } }
    return Object.entries(record.error_details).map(([key, val]) => {
      let msg = ""
      let severity: "error" | "warning" = "error"
      if (typeof val === "object" && val !== null) {
        msg = (val as any).message || (val as any).error || (val as any).text || ""
        if ((val as any).severity) severity = (val as any).severity
      } else {
        msg = String(val ?? "")
      }
      const isWarning = severity === "warning" || msg.toLowerCase().includes("предупреждение") || msg.toLowerCase().includes("warning")
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

  // Collect unique field keys from etalon and student_answer (excluding technical/voice keys)
  const legacyFieldKeys = React.useMemo(() => {
    const keys = new Set<string>()
    if (record.etalon && typeof record.etalon === "object") {
      Object.keys(record.etalon).forEach((k) => {
        if (!EXCLUDED_KEYS.has(k)) keys.add(k)
      })
    }
    if (record.student_answer && typeof record.student_answer === "object") {
      Object.keys(record.student_answer).forEach((k) => {
        if (!EXCLUDED_KEYS.has(k)) keys.add(k)
      })
    }
    normalizedErrors.forEach((e) => {
      if (e.field && !EXCLUDED_KEYS.has(e.field)) keys.add(e.field)
    })
    return Array.from(keys)
  }, [record.etalon, record.student_answer, normalizedErrors])

  const formatFieldValue = (val: any): string => {
    if (val === undefined || val === null || val === "") return "—"
    if (typeof val === "boolean") return val ? "Да" : "Нет"
    if (Array.isArray(val)) {
      if (val.length === 0) return "—"
      return val
        .map((item) => (typeof item === "object" && item !== null ? formatFieldValue(item) : String(item)))
        .join(", ")
    }
    if (typeof val === "object") {
      const parts = Object.entries(val)
        .filter(([k]) => !EXCLUDED_KEYS.has(k))
        .map(([k, v]) => `${FIELD_LABELS[k] || k}: ${typeof v === "object" && v !== null ? formatFieldValue(v) : String(v ?? "—")}`)
      return parts.length > 0 ? parts.join("; ") : "—"
    }
    return String(val)
  }

  const openAppeal = () => {
    setAppealStatus(record.status === "failed" ? "failed" : "passed")
    setAppealScore("")
    setAppealComment(record.teacher_comment || "")
    setAppealReason("")
    setIsAppealModalOpen(true)
  }

  const handleSaveAppeal = async () => {
    if (isSaving) return
    try {
      setIsSaving(true)
      const numScore = appealScore.trim() !== "" ? Number(appealScore) : undefined
      if (numScore !== undefined && (isNaN(numScore) || numScore < 0 || numScore > 100)) {
        alert("Балл должен быть от 0 до 100")
        return
      }

      const finalReason = appealReason.trim() || appealComment || "Экспертный пересмотр оценки"

      if (onAppeal) {
        await onAppeal(record.record_id, {
          status: appealStatus,
          comment: appealComment,
          reason: finalReason,
          ...(numScore !== undefined ? { score: numScore } : {}),
        })
      } else {
        const res = await fetch(`/api/v1/analytics/records/${encodeURIComponent(record.record_id)}/grade-override`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: appealStatus,
            ...(numScore !== undefined ? { score: numScore } : {}),
            reason: finalReason,
            comment: appealComment,
          }),
        })
        if (!res.ok) {
          throw new Error(`Ошибка сохранения оценки (${res.status})`)
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

  const comparison = record.dds_comparison
  const isDdsRecord = Boolean(
    record.dds_comparison ||
    record.incident_context ||
    (record.cadet_actions && record.cadet_actions.length > 0) ||
    record.has_dds_etalon !== undefined ||
    record.title?.includes("ДДС")
  )

  const cadetActionsList = React.useMemo(() => {
    if (record.cadet_actions && Array.isArray(record.cadet_actions) && record.cadet_actions.length > 0) {
      return record.cadet_actions
    }
    const comparisonActions: any[] = []
    if (record.dds_comparison?.progression?.actual_stages) {
      for (const stg of record.dds_comparison.progression.actual_stages) {
        comparisonActions.push({
          status: stg.status,
          seconds_from_start: stg.seconds_from_start,
          comment: stg.comment,
        })
      }
    }
    if (comparisonActions.length === 0 && record.dds_comparison?.decision?.actual_decision) {
      comparisonActions.push({
        status: record.dds_comparison.decision.actual_decision,
        service: record.dds_comparison.decision.actual_service,
        comment: record.dds_comparison.decision.actual_comment,
      })
    }
    return comparisonActions
  }, [record.cadet_actions, record.dds_comparison])

  const incidentType =
    record.incident_context?.category ||
    record.incident_context?.subcategory ||
    record.etalon?.incident_type ||
    record.etalon?.category ||
    record.etalon?.theme ||
    "—"
  const incidentSubcategory =
    record.incident_context?.subcategory && record.incident_context.subcategory !== incidentType
      ? record.incident_context.subcategory
      : record.etalon?.subcategory && record.etalon.subcategory !== incidentType
      ? record.etalon.subcategory
      : null
  const incidentAddress = record.incident_context?.address || record.etalon?.address || "—"
  const assignedService =
    record.incident_context?.assigned_service || record.dds_etalon?.service_name || "—"
  const callerName =
    record.incident_context?.caller_name ||
    (typeof record.etalon?.caller === "object" ? record.etalon?.caller?.name : record.etalon?.caller_name) ||
    ""
  const callerPhone =
    record.incident_context?.caller_phone ||
    (typeof record.etalon?.phones === "object" ? record.etalon?.phones?.aon : record.etalon?.caller_phone) ||
    ""
  const callerRole =
    record.incident_context?.caller_role ||
    (typeof record.etalon?.caller === "object"
      ? record.etalon?.caller?.role
      : record.etalon?.caller_role || record.etalon?.caller_status) ||
    ""
  const hasCallerInfo = Boolean(callerName || callerPhone || callerRole)
  const incidentDescription =
    record.incident_context?.description || record.etalon?.description || record.etalon?.plot || ""

  const incidentServices: string[] = React.useMemo(() => {
    if (record.incident_context?.services && Array.isArray(record.incident_context.services)) {
      return record.incident_context.services
    }
    if (record.etalon?.services && Array.isArray(record.etalon.services)) {
      return record.etalon.services
    }
    if (record.etalon?.assigned_services && typeof record.etalon.assigned_services === "object") {
      return Object.keys(record.etalon.assigned_services)
    }
    return []
  }, [record.incident_context, record.etalon])

  const signsList: [string, string][] = React.useMemo(() => {
    if (record.incident_context?.signs && typeof record.incident_context.signs === "object") {
      return Object.entries(record.incident_context.signs)
    }
    return []
  }, [record.incident_context])

  const teacherScore = record.expert_score !== undefined ? record.expert_score : record.score
  const hasTeacherGrade = teacherScore != null || Boolean(record.expert_modified_at || record.is_appealed)

  return (
    <Card className={`w-full shadow-lg border-2 ${className}`} data-testid="split-screen-card">
      <CardHeader className="border-b pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              <CardTitle className="text-xl">
                Разбор работы: {record.title || `Запись #${record.record_id}`}
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
              ) : record.status === "completed" && record.score == null ? (
                <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300">
                  <Clock className="h-3 w-3 mr-1" /> Ожидает проверки
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
              {record.score != null ? (
                <span className="font-semibold text-foreground">Балл: {record.score}%</span>
              ) : (
                <span className="text-muted-foreground text-xs">Оценка не выставлена</span>
              )}
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="default"
              className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5"
              onClick={openAppeal}
            >
              <RotateCcw className="h-4 w-4" />
              {hasTeacherGrade || record.score != null ? "Изменить оценку" : "Выставить оценку"}
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
        {isDdsRecord ? (
          /* =============================================================== */
          /* 4 CLEAR BLOCKS FOR DDS EVALUATION                              */
          /* =============================================================== */
          <div className="space-y-6" data-testid="dds-evaluation-container">
            {/* 1. Исходная карточка происшествия */}
            <div className="p-5 rounded-lg bg-card border shadow-xs space-y-4" data-testid="incident-context-card">
              <div className="flex items-center gap-2 border-b pb-3">
                <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h4 className="font-bold text-base text-foreground">
                  1. Исходная карточка происшествия (контекст задания)
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    Тип происшествия
                  </span>
                  <div className="font-medium text-foreground">
                    {incidentType}
                    {incidentSubcategory ? ` (${incidentSubcategory})` : ""}
                  </div>
                </div>
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    Адрес происшествия
                  </span>
                  <div className="font-medium text-foreground">
                    {incidentAddress}
                  </div>
                </div>
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    Служба задания
                  </span>
                  <div className="font-medium text-foreground">
                    <Badge variant="outline" className="font-semibold text-primary border-primary/40">
                      {assignedService}
                    </Badge>
                  </div>
                </div>
              </div>

              {hasCallerInfo && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t text-sm bg-muted/20 p-3 rounded-md">
                  <div>
                    <span className="font-semibold text-muted-foreground text-xs block">Заявитель:</span>
                    <span className="text-foreground">{callerName || "—"}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-muted-foreground text-xs block">Телефон:</span>
                    <span className="text-foreground">{callerPhone || "—"}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-muted-foreground text-xs block">Статус заявителя:</span>
                    <span className="text-foreground">{callerRole || "—"}</span>
                  </div>
                </div>
              )}

              {incidentDescription && (
                <div className="pt-3 border-t text-sm">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    Описание ситуации
                  </span>
                  <p className="text-foreground whitespace-pre-wrap bg-muted/20 p-3 rounded-md border border-border/50">
                    {incidentDescription}
                  </p>
                </div>
              )}

              {incidentServices.length > 0 && (
                <div className="pt-3 border-t space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Распределение вызова по службам
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {incidentServices.map((srv) => (
                      <Badge key={srv} variant="secondary" className="text-xs px-2.5 py-1">
                        {SERVICE_NAMES[srv] || `Служба ${srv}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {signsList.length > 0 && (
                <div className="pt-3 border-t space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Существенные признаки и факты
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {signsList.map(([signName, signVal]) => (
                      <Badge key={signName} variant="outline" className="text-xs py-1 px-2.5 border-border/80">
                        <span className="font-medium mr-1">{signName}:</span>
                        <span>{signVal}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Его действия (Действия курсанта) */}
            <div
              className="p-5 rounded-lg bg-card border shadow-xs space-y-4"
              data-testid="student-column"
            >
              <div className="flex items-center gap-2 border-b pb-3">
                <UserCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <h4 className="font-bold text-base text-foreground">
                  2. Действия курсанта
                </h4>
                {cadetActionsList.length > 0 && (
                  <Badge variant="outline" className="ml-auto text-xs">
                    Действий: {cadetActionsList.length}
                  </Badge>
                )}
              </div>

              {cadetActionsList.length === 0 ? (
                <div className="p-4 rounded-md bg-muted/30 border border-border/60 text-muted-foreground text-sm flex items-center gap-2">
                  <UserCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>Сохранённые действия для этой работы отсутствуют</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <span className="text-xs font-medium text-muted-foreground block">
                    Хронология действий:
                  </span>
                  <div className="space-y-3">
                    {cadetActionsList.map((action: any, idx: number) => {
                      const service = action.service_name || action.service || record.incident_context?.assigned_service
                      const status = action.status || action.action_type || "Действие"
                      return (
                        <div
                          key={idx}
                          className="p-3.5 rounded-lg bg-background border border-border/70 space-y-2 text-sm shadow-2xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="default" className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white">
                                #{idx + 1} {status}
                              </Badge>
                              {service && (
                                <Badge variant="outline" className="text-xs">
                                  {SERVICE_NAMES[service] || `Служба ${service}`}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              {action.seconds_from_start != null && (
                                <span>{action.seconds_from_start} сек. с момента начала</span>
                              )}
                              {action.at && <span>({action.at})</span>}
                            </div>
                          </div>

                          {action.comment && (
                            <div className="bg-muted/30 p-2.5 rounded-md border border-border/50">
                              <span className="text-xs font-semibold text-muted-foreground block mb-0.5">
                                Дословный комментарий:
                              </span>
                              <p className="text-foreground whitespace-pre-wrap font-medium">
                                «{action.comment}»
                              </p>
                            </div>
                          )}

                          {(action.who_accepted || action.order_number || action.summary) && (
                            <div className="bg-muted/20 p-2.5 rounded-md border border-border/50 text-xs space-y-1">
                              <span className="font-semibold text-muted-foreground block">
                                Сведения о передаче сообщений:
                              </span>
                              {action.who_accepted && (
                                <div>
                                  <span className="font-medium text-foreground">Принял: </span>
                                  <span>{action.who_accepted}</span>
                                </div>
                              )}
                              {action.order_number && (
                                <div>
                                  <span className="font-medium text-foreground">№ наряда: </span>
                                  <span>{action.order_number}</span>
                                </div>
                              )}
                              {action.summary && (
                                <div>
                                  <span className="font-medium text-foreground">Содержание: </span>
                                  <span>{action.summary}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Оценка и замечания преподавателя */}
            <div
              className="p-5 rounded-lg bg-card border shadow-xs space-y-4"
              data-testid="teacher-grade-block"
            >
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <h4 className="font-bold text-base text-foreground">
                    3. Экспертный разбор и замечания
                  </h4>
                </div>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5 text-xs"
                  onClick={openAppeal}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {hasTeacherGrade || record.score != null ? "Изменить оценку" : "Выставить оценку"}
                </Button>
              </div>

              {hasTeacherGrade ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-muted-foreground">Оценка преподавателя:</span>
                    <Badge variant="default" className="text-base px-3 py-0.5 bg-amber-600 text-white font-bold">
                      {record.status === "passed" ? "Зачтено" : record.status === "failed" ? "Не зачтено" : "Проверено"}
                    </Badge>
                    <span>{teacherScore != null ? `${teacherScore}%` : "Балл не выставлен"}</span>
                  </div>

                  <div className="p-3.5 rounded-md bg-muted/20 border border-border/50 text-sm space-y-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      Замечания и рекомендации преподавателя:
                    </span>
                    <p className="text-foreground whitespace-pre-wrap">
                      {record.teacher_comment || "Преподаватель не оставил развёрнутого комментария."}
                    </p>
                  </div>

                  {(record.revision_reason || record.is_appealed) && (
                    <div className="p-3 rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 text-xs text-purple-900 dark:text-purple-200">
                      <span className="font-semibold block mb-0.5">Причина пересмотра оценки:</span>
                      <span>{record.revision_reason || "Оценка была пересмотрена преподавателем"}</span>
                    </div>
                  )}

                  {record.expert_modified_by && (
                    <div className="text-xs text-muted-foreground">
                      Оценку выставил/изменил: {record.expert_modified_by}{" "}
                      {record.expert_modified_at ? `(${record.expert_modified_at})` : ""}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-md bg-muted/30 border border-border/50 text-muted-foreground text-sm flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    <span>Оценка не выставлена (работа завершена курсантом и ожидает проверки)</span>
                  </div>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300">
                    Ожидает проверки
                  </Badge>
                </div>
              )}
            </div>

            {/* 4. Отдельная оценка ИИ */}
            <div
              className="p-5 rounded-lg bg-card border shadow-xs space-y-4"
              data-testid="ai-grade-block"
            >
              <div className="flex items-center gap-2 border-b pb-3">
                <Bot className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <h4 className="font-bold text-base text-foreground">
                  4. Автоматическая проверка ИИ
                </h4>
              </div>

              {record.automatic_score != null ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-muted-foreground">Оценка ИИ:</span>
                    <Badge variant="default" className="text-base px-3 py-0.5 bg-purple-600 text-white font-bold">
                      {record.automatic_score}%
                    </Badge>
                  </div>

                  {(record.ai_comment || record.automatic_comment) && (
                    <div className="p-3.5 rounded-md bg-muted/20 border border-border/50 text-sm space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                        Комментарий / разбор ИИ:
                      </span>
                      <p className="text-foreground whitespace-pre-wrap">
                        {record.ai_comment || record.automatic_comment}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-md bg-muted/30 border border-border/50 text-muted-foreground text-sm flex items-center gap-2">
                  <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>Оценка ИИ отсутствует</span>
                </div>
              )}

              {normalizedErrors.length > 0 && (
                <div className="pt-2 border-t space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Зафиксированные замечания и несовпадения ({normalizedErrors.length}):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {normalizedErrors.map((err, idx) => {
                      const isWarning = err.severity === "warning"
                      return (
                        <div
                          key={`ai-err-${idx}`}
                          className={`p-2.5 rounded-md border text-xs flex items-start gap-2 ${
                            isWarning
                              ? "bg-yellow-500/10 border-yellow-500/40 text-yellow-900 dark:text-yellow-200"
                              : "bg-red-500/10 border-red-500/40 text-red-900 dark:text-red-200"
                          }`}
                        >
                          <span
                            className={`inline-block h-2 w-2 rounded-full shrink-0 mt-1 ${
                              isWarning ? "bg-yellow-500" : "bg-red-500"
                            }`}
                          />
                          <div>
                            {err.field && !EXCLUDED_KEYS.has(err.field) && (
                              <span className="font-bold mr-1">[{FIELD_LABELS[err.field] || err.field}]:</span>
                            )}
                            <span>{err.message || err.error || "Несоответствие"}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* =============================================================== */
          /* NON-DDS SPLIT-SCREEN (2 COLUMNS)                               */
          /* =============================================================== */
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="split-screen-columns">
              {/* Left Column: Эталон */}
              <div className="flex flex-col border rounded-lg p-4 bg-muted/20 space-y-4" data-testid="etalon-column">
                <div className="flex items-center gap-2 pb-3 border-b">
                  <FileCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="font-bold text-lg text-blue-900 dark:text-blue-300">Эталон</h3>
                  {!record.snapshot_missing && (
                    <Badge variant="outline" className="ml-auto text-xs">
                      Правильный ответ
                    </Badge>
                  )}
                </div>

                {record.snapshot_missing && (
                  <p role="status" className="text-sm text-muted-foreground">
                    Исторический эталон не сохранён. Текущая версия билета не используется для сравнения.
                  </p>
                )}

                {legacyFieldKeys.length > 0 && (
                  <div className="space-y-3">
                    {legacyFieldKeys.map((key) => {
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
                )}
              </div>

              {/* Right Column: Ввод курсанта */}
              <div className="flex flex-col border rounded-lg p-4 bg-muted/20 space-y-4" data-testid="student-column">
                <div className="flex items-center gap-2 pb-3 border-b">
                  <UserCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="font-bold text-lg text-indigo-900 dark:text-indigo-300">Ввод курсанта</h3>
                  <Badge variant="outline" className="ml-auto text-xs">
                    Ответ курсанта
                  </Badge>
                </div>

                {legacyFieldKeys.length > 0 && (
                  <div className="space-y-3">
                    {legacyFieldKeys.map((key) => {
                      const label = FIELD_LABELS[key] || key
                      const val = record.student_answer ? record.student_answer[key] : undefined
                      const error = fieldErrors.get(key.toLowerCase())

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
                )}
              </div>
            </div>

            {/* Detailed error list from error_details for non-DDS */}
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
          </>
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
                  <option value="passed">Зачтено</option>
                  <option value="failed">Не зачтено</option>
                </select>
              </div>

              <div>
                <Label htmlFor="appeal-score-input" className="text-sm font-semibold mb-1 block">
                  Точный балл (0–100, опционально)
                </Label>
                <GradeScoreInput
                  id="appeal-score-input"
                  aria-label="Точный балл (0–100, опционально)"
                  placeholder="Необязательно — прежний балл сохранится"
                  value={appealScore}
                  onValueChange={setAppealScore}
                  className="w-full text-sm"
                />
              </div>

              <div>
                <Label htmlFor="appeal-reason-input" className="text-sm font-semibold mb-1 block">
                  Причина пересмотра
                </Label>
                <Input
                  id="appeal-reason-input"
                  aria-label="Причина пересмотра"
                  type="text"
                  placeholder="Обоснование пересмотра оценки"
                  value={appealReason}
                  onChange={(e) => setAppealReason(e.target.value)}
                  className="w-full text-sm"
                />
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
