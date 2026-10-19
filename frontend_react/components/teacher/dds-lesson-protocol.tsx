"use client"
import {useEffect, useState} from "react"
import {apiFetch} from "@/lib/api-fetch"
import {getStoredToken} from "@/lib/auth-session"
import {DDSProtocol} from "@/components/dispatcher/dds-protocol"
import type {DDSCriterion, DDSEvent} from "@/lib/dds-cycle"
type Session = {session_id: string; cadet_id: string; exercise_protocols: {card_id: string; criteria: DDSCriterion[]; events: DDSEvent[]}[]}
export function DDSLessonProtocol({lessonId}: {lessonId: string}) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("")
    apiFetch(`/api/ai-analytics/lessons/${encodeURIComponent(lessonId)}/data`, {signal: controller.signal, headers: {Authorization: `Bearer ${getStoredToken()}`}})
      .then(async r => {if (!r.ok) throw new Error("Протокол занятия недоступен"); return r.json()})
      .then(data => {if (!controller.signal.aborted) setSessions(data.sessions || [])})
      .catch(e => {if (!controller.signal.aborted) setError(e.message)})
      .finally(() => {if (!controller.signal.aborted) setLoading(false)})
    return () => controller.abort()
  }, [lessonId, attempt])
  return <section className="space-y-2 rounded border p-3" aria-label="Проверенные результаты ДДС">
    <h3 className="font-semibold">Проверенные результаты ДДС</h3>
    <p className="text-xs">Рассчитаны по сохранённым действиям, доступны независимо от ИИ-рекомендаций.</p>
    {loading ? <p>Загрузка…</p> : error ? <p role="alert">{error} <button type="button" className="underline" onClick={() => setAttempt(v => v+1)}>Повторить</button></p> : sessions.some(s => s.exercise_protocols?.length) ? sessions.map(s => <div key={s.session_id}>
      {s.exercise_protocols?.length > 0 && <p className="text-xs">Обучаемый {s.cadet_id} · сессия {s.session_id}</p>}
      {s.exercise_protocols?.map(p => <div key={p.card_id}><p className="text-xs">Карточка {p.card_id}</p><DDSProtocol criteria={p.criteria} events={p.events}/></div>)}
    </div>) : <p>Для этого занятия нет протоколов докладов. Новые критерии не оценены.</p>}
  </section>
}
