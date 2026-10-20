"use client"

import { Zap, TriangleAlert, Pencil } from "lucide-react"
import type { DispatcherData } from "@/lib/dispatcher-data"

type Props = {
  data: DispatcherData
  onToggleEmergency?: (type: "cs" | "cp") => void
}

export function IncidentPanel({ data, onToggleEmergency }: Props) {

  return (
    <div id="tour-incident" className="flex shrink-0 flex-col gap-1.5 2xl:gap-2 select-none">
      {/* Statuses row */}
      <div className="flex items-center justify-between gap-2 2xl:gap-2">
        <div className="flex flex-1 items-center gap-4 2xl:gap-6 rounded-[1px] border border-[#b4b9bc] bg-[#fbfdfe] px-4 2xl:px-5 py-3 2xl:py-2 text-sm 2xl:text-sm text-[#49555d]">
          <span>Пострадавшие: <strong className="text-[#111827]">{data?.statuses?.injured ?? "нет"}</strong></span>
          <span>Отказ от скорой: <strong className="text-[#111827]">{data?.statuses?.ambulanceRefusal ?? "нет"}</strong></span>
          <span>Заблокированные: <strong className="text-[#111827]">{data?.statuses?.blocked ?? "нет"}</strong></span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 2xl:gap-2">
          <button
            type="button"
            disabled
            className="flex items-center gap-1 2xl:gap-1.5 rounded-[1px] border border-gray-300 bg-gray-200 px-3 2xl:px-4 py-2 2xl:py-2 text-sm 2xl:text-sm font-bold text-gray-500 opacity-60 cursor-not-allowed"
            title="Недоступно для роли ДДС в режиме тренажера"
          >
            ЧС <Zap className="h-4 2xl:h-6 w-4 2xl:w-6 fill-current" />
          </button>
          <button
            type="button"
            disabled
            className="flex items-center gap-1 2xl:gap-1.5 rounded-[1px] border border-gray-300 bg-gray-200 px-3 2xl:px-4 py-2 2xl:py-2 text-sm 2xl:text-sm font-bold text-gray-500 opacity-60 cursor-not-allowed"
            title="Недоступно для роли ДДС в режиме тренажера"
          >
            ЧП <TriangleAlert className="h-4 2xl:h-6 w-4 2xl:w-6 fill-current" />
          </button>
          <button
            type="button"
            disabled
            className="flex h-[36px] 2xl:h-[50px] w-[36px] 2xl:w-[50px] items-center justify-center rounded-[1px] border border-gray-300 bg-gray-200 text-gray-500 opacity-60 cursor-not-allowed"
            title="Недоступно для роли ДДС в режиме тренажера"
          >
            <Pencil className="h-4 2xl:h-6 w-4 2xl:w-6" />
          </button>
        </div>
      </div>

      {/* Section header (dark) */}
      <div className="mt-2 2xl:mt-3 flex items-center bg-[#303335] px-4 2xl:px-5 py-2.5 2xl:py-2.5">
        <span className="text-sm 2xl:text-sm font-bold text-white border-b border-dotted border-white">
          {data?.classification?.section}
        </span>
      </div>

      {/* Classification rows */}
      <div className="flex flex-col gap-1.5 2xl:gap-2">
        <div className="flex items-center rounded-[1px] border border-[#b4b9bc] bg-[#fbfdfe] px-4 2xl:px-5 py-2.5 2xl:py-2.5 text-base 2xl:text-sm">
          <span className="font-bold text-[#111827]">{data?.classification?.title}</span>
        </div>

        <div className="flex items-center rounded-[1px] border border-[#b4b9bc] bg-[#fbfdfe] px-4 2xl:px-5 py-2.5 2xl:py-2.5 text-sm 2xl:text-sm gap-2 2xl:gap-2">
          <span className="text-[#6b7280]">Класс.:</span>
          <span className="font-bold text-[#111827]">{data?.classification?.class}</span>
        </div>

        <div className="flex min-h-[40px] 2xl:min-h-[56px] items-center rounded-[1px] border border-[#b4b9bc] bg-[#fbfdfe] px-4 2xl:px-5 py-2.5 2xl:py-2.5 text-sm 2xl:text-sm gap-2 2xl:gap-2">
          <span className="text-[#6b7280]">[ВИС] Класс.:</span>
          <span className="font-bold text-[#111827]">{data?.classification?.visClass}</span>
        </div>
      </div>
    </div>
  )
}
