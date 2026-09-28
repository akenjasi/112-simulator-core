"use client"

import {
  Phone,
  PhoneOff,
  MessageSquare,
  HelpCircle,
  MapPin,
  Globe,
} from "lucide-react"
import type { DispatcherData } from "@/lib/dispatcher-data"

type Props = {
  data: DispatcherData
  slaTimer?: number | null
  slaViolated?: boolean
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
    <div id="tour-topbar" className="flex items-stretch gap-2 2xl:gap-2 bg-[#efefef] p-2 2xl:p-2">
      {/* Hang up */}
      <div className="flex w-[64px] 2xl:w-[70px] shrink-0 items-center justify-center rounded-sm border border-gray-300 bg-gray-200 opacity-60">
        <button type="button" aria-label="Завершить вызов" disabled className="h-full w-full flex items-center justify-center text-gray-500 cursor-not-allowed" title="Недоступно для роли ДДС в режиме тренажера">
          <PhoneOff className="h-6 2xl:h-6 w-6 2xl:w-6" />
        </button>
      </div>

      {/* Connection + buttons */}
      <div className="flex flex-1 flex-col justify-center gap-2 2xl:gap-2 rounded-sm border border-[#c9ced1] bg-[#fbfdfe] px-5 2xl:px-5 py-3 2xl:py-2">
        <span className="text-base 2xl:text-sm text-[#49555d]">{data.connection}</span>
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

      {/* АОН */}
      <div className="flex flex-1 flex-col justify-center rounded-sm border border-[#c9ced1] bg-[#fbfdfe] px-2 2xl:px-5 py-2 2xl:py-2 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-[11px] 2xl:text-sm text-[#8a949b]">АОН</span>
          <div className="flex items-center gap-1 2xl:gap-2 text-[#49555d]">
            <HelpCircle className="h-4 w-4 2xl:h-5 2xl:w-5 text-gray-400" />
            <MapPin className="h-4 w-4 2xl:h-5 2xl:w-5 text-gray-400" fill="currentColor" strokeWidth={1} />
            <Globe className="h-4 w-4 2xl:h-5 2xl:w-5 text-gray-400" />
          </div>
        </div>
        <div className="border-b border-dashed border-[#c9ced1] pb-0.5 text-sm 2xl:text-sm font-medium tracking-tight text-[#303335] whitespace-nowrap">
          {data.phones.aon}
        </div>
      </div>

      {/* phone icon + msg */}
      <div className="flex flex-col items-center justify-between py-1 2xl:py-1">
        <Phone className="h-5 w-5 2xl:h-5 2xl:w-5 text-[#49555d]" />
        <MsgIcon />
      </div>

      {/* предоставленный */}
      <div className="flex flex-1 flex-col justify-center rounded-sm border border-[#c9ced1] bg-[#fbfdfe] px-2 2xl:px-5 py-2 2xl:py-2 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 2xl:gap-2">
            <span className="text-[11px] 2xl:text-sm text-[#8a949b] truncate">предоставленный</span>
            <span className="rounded-sm border border-[#c9ced1] bg-white px-1 2xl:px-3 py-0.5 2xl:py-0.5 text-[10px] 2xl:text-sm uppercase text-[#8a949b]">
              АОН
            </span>
          </div>
          <Globe className="h-4 w-4 2xl:h-5 2xl:w-5 text-gray-400" />
        </div>
        <div className="border-b border-dashed border-[#c9ced1] pb-0.5 text-sm 2xl:text-sm font-medium tracking-tight text-[#303335] whitespace-nowrap">
          {data.phones.provided}
        </div>
      </div>

      {/* phone icon + msg */}
      <div className="flex flex-col items-center justify-between py-1 2xl:py-1.5">
        <Phone className="h-5 2xl:h-5 w-5 2xl:w-5 text-[#49555d]" />
        <MsgIcon />
      </div>

      {/* телефон на место */}
      <div className="flex flex-1 flex-col rounded-sm border border-[#c9ced1] bg-[#fbfdfe] px-5 2xl:px-5 py-3 2xl:py-2">
        <span className="text-base 2xl:text-sm text-[#8a949b]">телефон на место</span>
      </div>

      {/* Incident info */}
      <div className="flex flex-1 flex-col justify-center rounded-sm border border-[#c9ced1] bg-[#fbfdfe] px-3 2xl:px-5 py-2 2xl:py-2">
        <span className="text-sm 2xl:text-sm font-bold text-[#303335] leading-tight">{data.incident.number}</span>
        <span className="text-xs 2xl:text-sm text-[#49555d] leading-tight mt-0.5">{data.incident.savedAt}</span>
        <span className="text-xs 2xl:text-sm text-[#49555d] leading-tight mt-0.5">{data.incident.operator}</span>
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
