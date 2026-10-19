"use client"

import { apiFetch as fetch } from "@/lib/api-fetch"
import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { GradeScoreInput } from "@/components/teacher/grade-score-input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { X, Loader2, Award, Bot, UserCheck, AlertCircle } from "lucide-react"
import { getStoredToken } from "@/lib/auth-session"

export interface GradeDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => Promise<void> | void
  onOpenSplitScreen?: (recordId: string) => void
  recordId: string
  cadetName: string
  ticketTitle: string
  isEdit: boolean
  initialScore?: number | null
  initialComment?: string | null
  initialAutomaticScore?: number | null
  initialExpertScore?: number | null
}

export function GradeDialog({
  isOpen,
  onClose,
  onSuccess,
  onOpenSplitScreen,
  recordId,
  cadetName,
  ticketTitle,
  isEdit,
  initialScore,
  initialComment,
  initialAutomaticScore,
  initialExpertScore,
}: GradeDialogProps) {
  const [score, setScore] = useState<string>("")
  const [comment, setComment] = useState<string>("")
  const [reason, setReason] = useState<string>("")
  const [automaticScore, setAutomaticScore] = useState<number | null>(null)
  const [expertScore, setExpertScore] = useState<number | null>(null)
  const [recordDetails, setRecordDetails] = useState<any>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const userEditedScoreRef = React.useRef(false)
  const userEditedCommentRef = React.useRef(false)

  useEffect(() => {
    if (!isOpen) return

    userEditedScoreRef.current = false
    userEditedCommentRef.current = false

    // Initialize from props
    if (initialScore !== undefined && initialScore !== null) {
      setScore(String(initialScore))
    } else {
      setScore("")
    }
    setComment(initialComment ?? "")
    setReason("")
    setAutomaticScore(initialAutomaticScore ?? null)
    setExpertScore(initialExpertScore ?? null)
    setRecordDetails(null)
    setSubmitError(null)
    setIsSubmitting(false)

    if (!recordId) return

    let isCancelled = false
    const token = getStoredToken() || (typeof window !== "undefined" ? localStorage.getItem("token") : null)
    const headers: Record<string, string> = {}
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    fetch(`/api/v1/analytics/records/${encodeURIComponent(recordId)}`, { headers })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json()
          if (!isCancelled && data) {
            setRecordDetails(data)
            if (data.automatic_score !== undefined) {
              setAutomaticScore(data.automatic_score)
            }
            if (data.expert_score !== undefined) {
              setExpertScore(data.expert_score)
            }
            if (data.teacher_comment !== undefined && data.teacher_comment !== null && !userEditedCommentRef.current) {
              setComment(data.teacher_comment)
            }
            if (data.score !== undefined && data.score !== null && !userEditedScoreRef.current) {
              setScore(String(data.score))
            }
          }
        }
      })
      .catch((err) => {
        console.warn("Could not fetch record details for grading:", err)
      })

    return () => {
      isCancelled = true
    }
  }, [isOpen, recordId, initialScore, initialComment, initialAutomaticScore, initialExpertScore])

  if (!isOpen) return null

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (isSubmitting) return

    // 1. Validation of score
    if (score.trim() === "" || isNaN(Number(score))) {
      setSubmitError("Необходимо указать корректный балл от 0 до 100")
      return
    }

    const numScore = Number(score)
    if (numScore < 0 || numScore > 100) {
      setSubmitError("Балл должен быть в диапазоне от 0 до 100")
      return
    }

    // 2. Validation of reason for edits
    if (isEdit && reason.trim() === "") {
      setSubmitError("Необходимо указать причину изменения оценки")
      return
    }

    const finalReason = isEdit ? reason.trim() : (reason.trim() || "Первичная экспертная оценка")

    try {
      setIsSubmitting(true)
      setSubmitError(null)

      const token = getStoredToken() || (typeof window !== "undefined" ? localStorage.getItem("token") : null)
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }
      if (token) {
        headers["Authorization"] = `Bearer ${token}`
      }

      const res = await fetch(`/api/v1/analytics/records/${encodeURIComponent(recordId)}/grade-override`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          score: numScore,
          reason: finalReason,
          comment: comment,
        }),
      })

      if (!res.ok) {
        let errMessage = `Ошибка сохранения оценки (${res.status})`
        try {
          const errData = await res.json()
          errMessage = errData.detail || errData.message || errMessage
        } catch {
          // fallback
        }
        setSubmitError(errMessage)
        return
      }

      if (onSuccess) {
        await onSuccess()
      }
      onClose()
    } catch (err: any) {
      setSubmitError(err.message || "Ошибка сети при сохранении оценки")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Оценка работы"
      aria-labelledby="grade-dialog-title"
    >
      <div className="bg-background border rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4 my-8 animate-in fade-in zoom-in-95">
        {/* Dialog Header */}
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            <h3 id="grade-dialog-title" className="text-lg font-bold text-foreground">
              {isEdit ? "Изменение экспертной оценки" : "Оценка работы курсанта"}
            </h3>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Закрыть"
            title="Закрыть"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Cadet & Ticket Info */}
        <div className="p-3.5 bg-muted/40 rounded-lg border space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-foreground">
              {cadetName}
            </div>
            <Badge variant="outline" className="text-xs shrink-0">
              {isEdit ? "Повторная оценка" : "Первичная оценка"}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground font-medium">
            {ticketTitle}
          </div>
        </div>

        {/* AI & Expert Scores Breakdown */}
        <div className="p-3 bg-muted/20 rounded-lg border text-sm space-y-1">
          <div>Оценка ИИ: {automaticScore !== null && automaticScore !== undefined ? `${automaticScore}%` : "Оценка ИИ отсутствует"}</div>
          <div>Экспертная оценка: {expertScore !== null && expertScore !== undefined ? `${expertScore}%` : "Оценка не выставлена"}</div>
        </div>

        {/* Context of Student Answer and Incident */}
        {recordDetails && (
          <div className="p-3 bg-muted/15 rounded-lg border text-xs space-y-2.5">
            <div className="flex items-center justify-between font-semibold text-foreground">
              <span>Контекст задания и действий</span>
              {onOpenSplitScreen && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs text-primary"
                  onClick={() => {
                    onOpenSplitScreen(recordId)
                    onClose()
                  }}
                >
                  Перейти к полному разбору работы &rarr;
                </Button>
              )}
            </div>

            {/* Incident Context snippet */}
            {recordDetails.incident_context && (
              <div className="bg-background/80 p-2 rounded border border-border/60 text-muted-foreground space-y-1">
                {(recordDetails.incident_context.category || recordDetails.incident_context.subcategory) && (
                  <div>
                    <span className="font-semibold text-foreground">Тип: </span>
                    {recordDetails.incident_context.category}
                    {recordDetails.incident_context.subcategory ? ` (${recordDetails.incident_context.subcategory})` : ""}
                  </div>
                )}
                {recordDetails.incident_context.address && (
                  <div>
                    <span className="font-semibold text-foreground">Адрес: </span>
                    {recordDetails.incident_context.address}
                  </div>
                )}
                {recordDetails.incident_context.assigned_service && (
                  <div>
                    <span className="font-semibold text-foreground">Служба задания: </span>
                    {recordDetails.incident_context.assigned_service}
                  </div>
                )}
                {(recordDetails.incident_context.caller_name || recordDetails.incident_context.caller_phone || recordDetails.incident_context.caller_role) && (
                  <div>
                    <span className="font-semibold text-foreground">Заявитель: </span>
                    {[
                      recordDetails.incident_context.caller_name,
                      recordDetails.incident_context.caller_phone,
                      recordDetails.incident_context.caller_role ? `(${recordDetails.incident_context.caller_role})` : null,
                    ].filter(Boolean).join(", ")}
                  </div>
                )}
                {recordDetails.incident_context.description && (
                  <div className="line-clamp-2">
                    <span className="font-semibold text-foreground">Описание: </span>
                    {recordDetails.incident_context.description}
                  </div>
                )}
              </div>
            )}

            {/* Cadet Actions list */}
            <div className="pt-2 border-t space-y-1.5">
              <span className="font-semibold text-foreground block">Действия курсанта:</span>
              <div className="text-[11px] bg-background p-2.5 rounded border max-h-40 overflow-y-auto space-y-2">
                {recordDetails.cadet_actions && recordDetails.cadet_actions.length > 0 ? (
                  recordDetails.cadet_actions.map((act: any, idx: number) => (
                    <div key={idx} className="pb-1.5 border-b last:border-b-0 space-y-0.5">
                      <div className="font-semibold text-foreground flex items-center justify-between">
                        <span>{act.status || act.action_type || "Действие"}</span>
                        {act.seconds_from_start != null && (
                          <span className="text-muted-foreground font-normal">({act.seconds_from_start} сек.)</span>
                        )}
                      </div>
                      {act.comment && (
                        <div className="text-foreground">
                          Комментарий: «{act.comment}»
                        </div>
                      )}
                      {act.who_accepted && (
                        <div className="text-muted-foreground">
                          Принял: {act.who_accepted}
                        </div>
                      )}
                      {act.order_number && (
                        <div className="text-muted-foreground">
                          № наряда: {act.order_number}
                        </div>
                      )}
                      {act.summary && (
                        <div className="text-muted-foreground">
                          Содержание: {act.summary}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground italic">
                    Сохранённые действия для этой работы отсутствуют
                  </div>
                )}
              </div>
            </div>

            {recordDetails.error_details && Array.isArray(recordDetails.error_details) && recordDetails.error_details.length > 0 && (
              <div className="pt-1 border-t text-destructive">
                <span className="font-medium block mb-0.5">Зафиксированные расхождения:</span>
                <ul className="list-disc pl-4 space-y-0.5">
                  {recordDetails.error_details.map((err: any, idx: number) => (
                    <li key={idx}>
                      {typeof err === "object" ? (err.message || err.error || String(err.field || "")) : String(err)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Alert Error Box */}
        {submitError && (
          <div
            role="alert"
            className="p-3 text-sm rounded-lg bg-destructive/15 text-destructive border border-destructive/30 flex items-start gap-2 font-medium"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Grading Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="grade-score" className="text-sm font-semibold block">
              Балл
            </Label>
            <GradeScoreInput
              id="grade-score"
              value={score}
              onValueChange={(value) => {
                userEditedScoreRef.current = true
                setScore(value)
                if (submitError) setSubmitError(null)
              }}
              placeholder="0–100 (дробные значения разрешены)"
              className="w-full text-sm"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="grade-comment" className="text-sm font-semibold block">
              Комментарий преподавателя
            </Label>
            <Textarea
              id="grade-comment"
              value={comment}
              onChange={(e) => {
                userEditedCommentRef.current = true
                setComment(e.target.value)
              }}
              placeholder="Оставьте замечания, рекомендации или пояснения к оценке..."
              rows={3}
              className="w-full text-sm"
              disabled={isSubmitting}
            />
          </div>

          {isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="grade-reason" className="text-sm font-semibold block">
                Причина изменения
              </Label>
              <Input
                id="grade-reason"
                type="text"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  if (submitError) setSubmitError(null)
                }}
                placeholder="Например: Учтён обоснованный ответ или исправлена техническая ошибка"
                className="w-full text-sm"
                disabled={isSubmitting}
              />
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="font-semibold min-w-[100px]"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              <span>Сохранить</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
