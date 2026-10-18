"use client"

import type {DDSTicketSummary} from "@/lib/dds-cycle"

export function OrderedDDSTickets({tickets, selected, onChange, disabled = false}: {
  tickets: DDSTicketSummary[]; selected: DDSTicketSummary[];
  onChange: (tickets: DDSTicketSummary[]) => void; disabled?: boolean
}) {
  const move = (index: number, direction: number) => {
    const copy = [...selected]
    ;[copy[index], copy[index + direction]] = [copy[index + direction], copy[index]]
    onChange(copy)
  }
  return <div className="space-y-3 text-sm">
    <div role="group" aria-label="Доступные билеты ДДС" className="max-h-52 overflow-auto border rounded p-2 space-y-1">
      {tickets.length === 0 && <p className="text-muted-foreground text-xs">Нет билетов по выбранным фильтрам</p>}
      {tickets.map(ticket => <label key={ticket.ticket_id} className="flex gap-2 items-start p-1 cursor-pointer">
        <input type="checkbox" checked={selected.some(item => item.ticket_id === ticket.ticket_id)} disabled={disabled}
          onChange={event => onChange(event.target.checked ? [...selected, ticket] : selected.filter(item => item.ticket_id !== ticket.ticket_id))}/>
        <span>{ticket.title}<span className="text-muted-foreground text-xs"> · {ticket.category || "Без категории"} · Уровень {ticket.complexity ?? "—"}</span></span>
      </label>)}
    </div>
    <div aria-label="Порядок прохождения" className="space-y-1">
      <p className="font-medium text-xs">Выбрано: {selected.length}. Порядок прохождения:</p>
      {selected.map((ticket, index) => <div key={ticket.ticket_id} className="flex items-center gap-2 border-b py-1">
        <span className="flex-1 text-xs">{index + 1}. {ticket.title}</span>
        <button type="button" aria-label={`Выше: ${ticket.title}`} disabled={disabled || index === 0} onClick={() => move(index, -1)} className="px-2 disabled:opacity-30">↑</button>
        <button type="button" aria-label={`Ниже: ${ticket.title}`} disabled={disabled || index === selected.length - 1} onClick={() => move(index, 1)} className="px-2 disabled:opacity-30">↓</button>
        <button type="button" aria-label={`Убрать: ${ticket.title}`} disabled={disabled} onClick={() => onChange(selected.filter(item => item.ticket_id !== ticket.ticket_id))} className="px-2 disabled:opacity-30">×</button>
      </div>)}
    </div>
  </div>
}
