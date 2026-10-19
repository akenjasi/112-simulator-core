"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, ClipboardList, RefreshCw } from "lucide-react"
import { fetchDDSAssignments, type DDSSessionState } from "@/lib/dds-cycle"

export function ProfileAssignments() {
  const [items, setItems] = useState<DDSSessionState[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let disposed = false
    let controller: AbortController | null = null
    let pending = false
    const load = async () => {
      if (pending) return
      pending = true
      controller = new AbortController()
      try {
        const data = await fetchDDSAssignments(controller.signal)
        if (!disposed) {
          // Finished sessions belong to history, even when an older API includes them here.
          setItems(data.filter(item => !["COMPLETED", "CANCELLED", "INCOMPLETE"].includes(item.session_status))
            .sort((a, b) => (Date.parse(b.started_at || "") || 0) - (Date.parse(a.started_at || "") || 0)))
          setError(null)
        }
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : "Не удалось загрузить занятия")
      } finally {
        pending = false
        if (!disposed) setLoading(false)
      }
    }
    setLoading(true)
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, 5000)
    return () => { disposed = true; controller?.abort(); window.clearInterval(timer) }
  }, [reload])

  return <section aria-labelledby="assigned-heading" className="rounded-2xl border border-border bg-card shadow-xs">
    <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
      <div>
        <div className="mb-2 flex items-center gap-2 text-primary"><ClipboardList className="h-5 w-5" aria-hidden="true" /><span className="text-xs font-semibold uppercase tracking-wider">Обучение с преподавателем</span></div>
        <h2 id="assigned-heading" className="text-xl font-semibold tracking-tight">Назначенные занятия</h2>
        <p className="mt-1 text-sm text-muted-foreground">Откройте занятие, которое назначил преподаватель.</p>
      </div>
      <button type="button" aria-label="Обновить назначенные занятия" disabled={loading} onClick={() => setReload(value => value + 1)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
      </button>
    </div>
    <div className="px-5 pb-5 sm:px-6 sm:pb-6" aria-busy={loading}>
      {error ? <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm">
        <p>{error}</p><button type="button" className="mt-2 font-medium text-primary underline underline-offset-4" onClick={() => setReload(value => value + 1)}>Повторить загрузку</button>
      </div> : loading && items.length === 0 ? <p role="status" className="py-5 text-sm text-muted-foreground">Загружаем назначенные занятия…</p> : items.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-muted/20 px-5 py-7">
        <p className="font-medium">Пока нет назначенных занятий</p><p className="mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">Когда преподаватель назначит занятие, оно появится здесь. Пока можно выбрать самостоятельную тренировку.</p>
      </div> : <div className="space-y-3">
        {(showAll ? items : items.slice(0, 2)).map((item, index) => {
          const active = item.session_status === "ACTIVE"
          const title = item.incoming_card?.classification?.title || item.incoming_card?.classification?.section
          return <article key={item.session_id} className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{title || `Занятие ДДС ${index + 1}`}</h3><span className="rounded-md bg-primary/8 px-2 py-1 text-xs font-medium text-primary">{active ? "В процессе" : "Назначено"}</span></div>
              {item.incoming_card?.description && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{item.incoming_card.description}</p>}
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{item.incoming_card?.incident?.number && <span>Карточка № {item.incoming_card.incident.number}</span>}<span>{item.exercise ? "Телефон и доклады" : "Карточка прежнего формата"}</span><span>Завершено карточек: {item.completed_cards ?? 0} из {item.total_cards ?? 1}</span></div>
            </div>
            <Link className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href={`/dds?${new URLSearchParams({session_id: item.session_id, ticket_id: item.ticket_id || ""})}`}>
              {active ? "Продолжить занятие" : "Открыть занятие"}<ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </article>
        })}
        {items.length > 2 && <button type="button" onClick={() => setShowAll(value => !value)} className="py-2 text-sm font-medium text-primary underline-offset-4 hover:underline">{showAll ? "Свернуть список" : `Все назначенные занятия (${items.length})`}</button>}
      </div>}
    </div>
  </section>
}
