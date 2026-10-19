"use client"

import {useEffect, useRef, useState} from "react"
import {useRouter} from "next/navigation"
import {DDSRequestError, fetchDDSTrainingTickets, startDDSTraining, type DDSTicketSummary} from "@/lib/dds-cycle"
import {OrderedDDSTickets} from "./ordered-dds-tickets"

export function DDSSelfTraining({layout = "card", blockedReason = null, onBusyChange, onConflict, onCancel}: {
  layout?: "card" | "dialog"; blockedReason?: string | null; onBusyChange?: (busy: boolean) => void;
  onConflict?: () => void; onCancel?: () => void
} = {}) {
  const router = useRouter()
  const [tickets, setTickets] = useState<DDSTicketSummary[]>([])
  const [selected, setSelected] = useState<DDSTicketSummary[]>([])
  const [category, setCategory] = useState("")
  const [complexity, setComplexity] = useState("")
  const [loading, setLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [uncertain, setUncertain] = useState(false)
  const pending = useRef<{request_id: string; ticket_ids: string[]} | null>(null)
  const busyRef = useRef(false)
  const startController = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setCatalogError(null)
    fetchDDSTrainingTickets(controller.signal).then(data => {if (!controller.signal.aborted) setTickets(data)})
      .catch(err => {if (!controller.signal.aborted) setCatalogError(err.message || "Не удалось загрузить каталог")})
      .finally(() => {if (!controller.signal.aborted) setLoading(false)})
    return () => controller.abort()
  }, [reload])
  useEffect(() => () => startController.current?.abort(), [])
  const launch = async () => {
    if (busyRef.current || blockedReason || selected.length === 0) return
    busyRef.current = true; setBusy(true); onBusyChange?.(true); setError(null)
    const payload = pending.current || {request_id: crypto.randomUUID(), ticket_ids: selected.map(item => item.ticket_id)}
    pending.current = payload
    const controller = new AbortController(); startController.current = controller
    try {
      const state = await startDDSTraining(payload, controller.signal)
      if (controller.signal.aborted) return
      router.push(`/dds/journal?${new URLSearchParams({focus_session_id: state.session_id, focus_ticket_id: state.ticket_id})}`)
    } catch (err: any) {
      if (controller.signal.aborted) return
      setError(err.message || "Не удалось запустить тренировку")
      if (err instanceof DDSRequestError && err.status === 409) onConflict?.()
      if (err instanceof DDSRequestError && !err.retryable) {pending.current = null; setUncertain(false)}
      else setUncertain(true)
    } finally {busyRef.current = false; if (!controller.signal.aborted) {setBusy(false); onBusyChange?.(false)}}
  }
  const filtered = tickets.filter(ticket => (!category || ticket.category === category) && (!complexity || ticket.complexity === Number(complexity)))
  return <section className={layout === "dialog" ? "flex min-h-0 flex-1 flex-col" : "border rounded-lg p-5 bg-card space-y-4"} aria-label="Самостоятельная тренировка ДДС">
    <div className={layout === "dialog" ? "min-h-0 overflow-y-auto p-5 sm:p-7 space-y-5" : "space-y-4"}>
    {layout !== "dialog" && <><h2 className="font-bold">Самостоятельная тренировка ДДС</h2>
    <p className="text-xs text-muted-foreground">Выберите билеты и порядок. Карточки поступают по одной после завершения предыдущей.</p></>}
    {loading ? <p>Загрузка билетов…</p> : catalogError ? <div role="alert">{catalogError} <button type="button" onClick={() => setReload(value => value + 1)}>Повторить загрузку</button></div> : <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">Категория происшествия<select disabled={busy || uncertain} aria-label="Категория самостоятельной тренировки" value={category} onChange={event => setCategory(event.target.value)} className="block w-full min-w-0 rounded-lg border border-border bg-background p-3 text-sm font-normal">
          <option value="">Все категории</option>{[...new Set(tickets.map(ticket => ticket.category).filter(Boolean))].map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <label className="space-y-2 text-sm font-medium">Уровень сложности<select disabled={busy || uncertain} aria-label="Сложность самостоятельной тренировки" value={complexity} onChange={event => setComplexity(event.target.value)} className="block w-full rounded-lg border border-border bg-background p-3 text-sm font-normal">
          <option value="">Все уровни</option>{[1, 2, 3].map(value => <option key={value} value={value}>Уровень {value}</option>)}
        </select></label>
      </div>
      <OrderedDDSTickets tickets={filtered} selected={selected} disabled={busy || uncertain} onChange={items => {setSelected(items); pending.current = null; setError(null)}}/>
    </>}
    {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
    </div>
    <div className={layout === "dialog" ? "shrink-0 border-t border-border bg-card px-5 py-4 sm:px-7" : ""}>
    {blockedReason && <p role="status" className="mb-3 text-sm text-muted-foreground">{blockedReason}</p>}
    <div className="flex flex-wrap items-center justify-end gap-3">
    {layout === "dialog" && <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-lg border border-border px-5 text-sm font-medium hover:bg-muted disabled:opacity-50">Отмена</button>}
    <button type="button" onClick={launch} disabled={!!blockedReason || busy || loading || !!catalogError || selected.length === 0} className="min-h-11 rounded-lg bg-primary px-5 py-2.5 text-sm text-primary-foreground font-semibold disabled:opacity-50">
      {busy ? "Запуск…" : uncertain ? "Повторить запуск" : "Начать тренировку"}
    </button>
    </div></div>
  </section>
}
