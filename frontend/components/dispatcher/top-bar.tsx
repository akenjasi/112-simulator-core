"use client"

import {
  Phone,
  PhoneOff,
  MessageSquare,
  MapPin,
  Globe,
} from "lucide-react"
import type { DispatcherData } from "@/lib/dispatcher-data"

type Props = {
  data: DispatcherData
  slaTimer?: number | null
  slaViolated?: boolean
}

/** Format Russian subscriber numbers without changing short numbers or source labels. */
export function formatCallerPhone(value: string) {
  const digits = value.replace(/[\s()+.\-]/g, "")
  const national = /^\d{10}$/.test(digits) ? digits : /^[78]\d{10}$/.test(digits) ? digits.slice(1) : null
  return national ? `+7 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6, 8)}-${national.slice(8)}` : value
}

export function formatCardSavedAt(value: string) {
  const raw = value.replace(/^сохр[.\s]*/i, "").trim()
  if (!raw) return "Сохр. не указано"
  // Legacy source times have no timezone or seconds: retain their actual precision.
  const legacy = raw.match(/^(\d{2}\.\d{2}\.\d{4})\s+(?:в\s+)?(\d{2}:\d{2}(?::\d{2})?)$/)
  if (legacy) return `Сохр. ${legacy[1]} в ${legacy[2]}`
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    const date = new Date(raw)
    if (!Number.isNaN(date.getTime())) {
      const parts = new Intl.DateTimeFormat("ru-RU", {timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"}).formatToParts(date)
      const part = (type: string) => parts.find(p => p.type === type)?.value
      return `Сохр. ${part("day")}.${part("month")}.${part("year")} в ${part("hour")}:${part("minute")}:${part("second")}`
    }
  }
  return `Сохр. ${raw}`
}

export function formatSourceOperator(value: string) {
  // Approved teaching-manual identity for old cards carrying only the "112" placeholder.
  if (!value.trim() || value.trim() === "112") return "Опер. 14, АРМ 7, Рожкова О. И."
  return value.replace(/^(Опер\.\s*[^,]+,\s*АРМ\s*[^,]+,\s*)([А-ЯЁа-яё-]+)\s+([А-ЯЁа-яё-]+)\s+([А-ЯЁа-яё-]+)$/u,
    (_, prefix, surname, name, patronymic) => `${prefix}${surname} ${name[0]}. ${patronymic[0]}.`)
}

function MsgIcon() {
  return (
    <button
      type="button"
      disabled
      className="flex h-[26px] 2xl:h-[30px] w-[26px] 2xl:w-[30px] shrink-0 items-center justify-center rounded-sm bg-gray-300 text-gray-500 opacity-60 cursor-not-allowed"
      aria-label="Сообщения"
      title="Недоступно для роли ДДС в режиме тренажера"
    >
      <MessageSquare className="h-3.5 2xl:h-5 w-3.5 2xl:w-5" fill="currentColor" strokeWidth={0} />
    </button>
  )
}

export function TopBar({ data, slaTimer, slaViolated }: Props) {
  return (
    <div id="tour-topbar" className="flex shrink-0 items-stretch gap-2 2xl:gap-2 bg-[#efefef] p-2 2xl:p-2">
      {/* Hang up */}
      <div className="flex w-[64px] 2xl:w-[70px] shrink-0 items-center justify-center rounded-sm border border-gray-300 bg-gray-200 opacity-60">
        <button type="button" aria-label="Завершить вызов" disabled className="h-full w-full flex items-center justify-center text-gray-500 cursor-not-allowed" title="Недоступно для роли ДДС в режиме тренажера">
          <PhoneOff className="h-6 2xl:h-6 w-6 2xl:w-6" />
        </button>
      </div>

      {/* Connection + buttons */}
      <div className="flex flex-1 flex-col justify-center gap-2 2xl:gap-2 rounded-sm border border-[#c9ced1] bg-[#fbfdfe] px-5 2xl:px-5 py-3 2xl:py-2">
        <span className="flex items-center gap-1 text-base 2xl:text-sm text-[#49555d]">{data.connection}</span>
        <div className="flex items-center gap-2 2xl:gap-2">
          <button
            type="button"
            disabled
            className="rounded-sm bg-gray-300 px-4 2xl:px-5 py-1.5 2xl:py-2 text-sm 2xl:text-sm tracking-wide text-gray-500 opacity-60 cursor-not-allowed"
            title="Недоступно для роли ДДС в режиме тренажера"
          >
            записи звонков
          </button>
          <button
            type="button"
            disabled
            className="rounded-sm border border-gray-300 bg-gray-200 px-4 2xl:px-5 py-1.5 2xl:py-2 text-sm 2xl:text-sm tracking-wide text-gray-500 opacity-60 cursor-not-allowed"
            title="Недоступно для роли ДДС в режиме тренажера"
          >
            список SMS
          </button>
        </div>
      </div>

      {/* phone icon + msg */}
      <div className="flex flex-col items-center justify-between py-1 2xl:py-1.5">
        <Phone className="h-5 2xl:h-5 w-5 2xl:w-5 text-[#49555d]" />
        <MsgIcon />
      </div>

      {/* АОН заявителя, не номер вызываемой службы */}
      <div aria-label="АОН заявителя" title="Номер заявителя, определённый при приёме сообщения в 112" className="flex flex-1 flex-col justify-center rounded-sm border border-[#c9ced1] bg-[#fbfdfe] px-2 2xl:px-3 py-2 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-[11px] 2xl:text-sm text-[#8a949b]">АОН</span>
          <div className="flex items-center gap-1 2xl:gap-2 text-[#49555d]">
            <MapPin className="h-4 w-4 2xl:h-5 2xl:w-5 text-gray-400" fill="currentColor" strokeWidth={1} />
            <Globe className="h-4 w-4 2xl:h-5 2xl:w-5 text-gray-400" />
          </div>
        </div>
        <div title={data.phones.aon} className="border-b border-dotted border-[#c9ced1] pb-0.5 text-xl 2xl:text-2xl leading-tight tabular-nums text-[#303335] truncate">
          {formatCallerPhone(data.phones.aon)}
        </div>
      </div>

      {/* phone icon + msg */}
      <div className="flex flex-col items-center justify-between py-1 2xl:py-1">
        <Phone className="h-5 w-5 2xl:h-5 2xl:w-5 text-[#49555d]" />
        <MsgIcon />
      </div>

      {/* предоставленный */}
      <div aria-label="Предоставленный номер заявителя" title="Контактный номер, указанный заявителем" className="flex flex-1 flex-col justify-center rounded-sm border border-[#c9ced1] bg-[#fbfdfe] px-2 2xl:px-3 py-2 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 2xl:gap-2">
            <span className="text-[11px] 2xl:text-sm text-[#8a949b] truncate">предоставленный</span>
          </div>
          <Globe className="h-4 w-4 2xl:h-5 2xl:w-5 text-gray-400" />
        </div>
        <div className="mt-1 flex items-center gap-1">
          <div title={data.phones.provided} className="min-w-0 flex-1 border-b border-dotted border-[#c9ced1] pb-0.5 text-xl 2xl:text-2xl leading-tight tabular-nums text-[#303335] truncate">
            {formatCallerPhone(data.phones.provided)}
          </div>
          <span className="shrink-0 rounded-sm border border-[#c9ced1] bg-white px-2 py-0.5 text-[10px] 2xl:text-xs uppercase text-[#8a949b]">АОН</span>
        </div>
      </div>

      {/* phone icon + msg */}
      <div className="flex flex-col items-center justify-between py-1 2xl:py-1.5">
        <Phone className="h-5 2xl:h-5 w-5 2xl:w-5 text-[#49555d]" />
        <MsgIcon />
      </div>

      {/* телефон на место */}
      <div aria-label="Телефон на место происшествия" title="Контактный телефон на месте происшествия" className="flex flex-1 flex-col rounded-sm border border-[#c9ced1] bg-[#fbfdfe] px-5 2xl:px-5 py-3 2xl:py-2">
        <span className="text-base 2xl:text-sm text-[#8a949b]">телефон на место</span>
        <span title={data.phones.onSite} className="mt-1 text-xl 2xl:text-2xl tabular-nums text-[#303335]">{formatCallerPhone(data.phones.onSite)}</span>
      </div>

      {/* Incident info */}
      <div aria-label="Сведения о происшествии" className="flex flex-1 flex-col justify-center rounded-sm border border-[#c9ced1] bg-[#fbfdfe] px-3 py-2">
        <span className="text-base 2xl:text-lg font-bold text-[#303335] leading-tight">{/^происшествие(?:\s|$)/i.test(data.incident.number) ? data.incident.number : `Происшествие ${data.incident.number}`}</span>
        <span className="text-xs 2xl:text-sm text-[#49555d] leading-tight mt-0.5">{formatCardSavedAt(data.incident.savedAt)}</span>
        <span title={formatSourceOperator(data.incident.operator)} className="text-xs 2xl:text-sm text-[#49555d] leading-tight mt-0.5">{formatSourceOperator(data.incident.operator)}</span>
      </div>



      {/* Action buttons */}
      <div className="flex w-[100px] 2xl:w-[110px] shrink-0 flex-col gap-2 2xl:gap-2">
        <button
          type="button"
          disabled
          className="flex-1 rounded-sm bg-gray-300 text-sm 2xl:text-sm uppercase tracking-wide text-gray-500 opacity-60 cursor-not-allowed"
          title="Недоступно для роли ДДС в режиме тренажера"
        >
          просмотр
        </button>
        <button
          type="button"
          disabled
          className="flex-1 rounded-sm bg-gray-300 text-sm 2xl:text-sm uppercase tracking-wide text-gray-500 opacity-60 cursor-not-allowed"
          title="Недоступно для роли ДДС в режиме тренажера"
        >
          дополнение
        </button>
      </div>
    </div>
  )
}
