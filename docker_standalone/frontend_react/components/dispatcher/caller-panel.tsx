"use client"

import { useState } from "react"
import { MapPinned, X } from "lucide-react"
import type { DispatcherData } from "@/lib/dispatcher-data"

type Props = {
  data: DispatcherData
}

export function CallerPanel({ data }: Props) {
  const [isMapOpen, setIsMapOpen] = useState(false)

  return (
    <div id="tour-caller" className="flex flex-1 flex-col gap-1.5 2xl:gap-2 select-none">
      {/* Карта места происшествия (стр. 18 регламента) */}
      {isMapOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 2xl:p-6">
          <div className="w-[800px] 2xl:w-[1120px] rounded border border-[#b4b9bc] bg-[#efefef] p-6 2xl:p-8 text-[#1e2327] shadow-2xl">
            <div className="mb-4 2xl:mb-6 flex items-center justify-between border-b border-[#b4b9bc] pb-3 2xl:pb-4">
              <span className="text-lg 2xl:text-2xl font-bold">Карта происшествия</span>
              <button
                type="button"
                onClick={() => setIsMapOpen(false)}
                className="text-[#6b7280] hover:text-[#111]"
              >
                <X className="h-6 2xl:h-8 w-6 2xl:w-8" />
              </button>
            </div>
            <div className="mb-3 2xl:mb-4 text-base 2xl:text-xl font-medium text-[#111]">
              📍 {data.caller.address}
            </div>
            <div className="relative flex h-[400px] 2xl:h-[560px] w-full items-center justify-center rounded border border-[#b4b9bc] bg-[#dbeafe]">
              <div className="flex flex-col items-center gap-2 2xl:gap-3">
                <MapPinned className="h-12 2xl:h-16 w-12 2xl:w-16 text-red-600 animate-bounce" />
                <span className="rounded bg-white/90 px-4 2xl:px-6 py-2 2xl:py-3 text-sm 2xl:text-lg font-bold shadow">
                  Чертановская ул., 58, к. 2 (Координаты: 55.6024, 37.5951)
                </span>
              </div>
            </div>
            <div className="mt-4 2xl:mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setIsMapOpen(false)}
                className="rounded bg-[#157dbd] px-6 2xl:px-8 py-2 2xl:py-3 text-sm 2xl:text-lg font-bold text-white hover:bg-[#136ba3]"
              >
                Закрыть карту
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Name row */}
      <div className="self-start rounded-[1px] border border-[#b4b9bc] bg-[#fbfdfe] px-5 2xl:px-7 py-2 2xl:py-3 text-base 2xl:text-xl">
        <span className="font-bold text-[#111827]">{data.caller.name}</span>
        <span className="ml-3 2xl:ml-4 text-[#49555d]">{data.caller.role}</span>
      </div>

      {/* Address row */}
      <div className="flex items-center justify-between rounded-[1px] border border-[#b4b9bc] bg-[#fbfdfe] px-4 2xl:px-6 py-3 2xl:py-4 text-sm 2xl:text-lg">
        <span className="font-bold text-[#111827]">{data.caller.address}</span>
        <button
          type="button"
          onClick={() => setIsMapOpen(true)}
          title="Показать место происшествия на карте"
          className="ml-2 2xl:ml-3 text-[#303335] hover:text-[#157dbd]"
        >
          <MapPinned className="h-5 2xl:h-7 w-5 2xl:w-7" />
        </button>
      </div>

      {/* Empty content area (Описание происшествия) */}
      <div className="min-h-[200px] 2xl:min-h-[280px] flex-1 flex flex-col rounded-[1px] border border-[#b4b9bc] bg-[#fbfdfe] p-4 2xl:p-6">
        <span className="text-xs 2xl:text-base font-bold uppercase text-[#8a949b] mb-2 2xl:mb-3">Описание происшествия (Фабула)</span>
        <div className="text-base 2xl:text-xl text-[#111827]">
          {data.description || 'Нет описания'}
        </div>
      </div>
    </div>
  )
}
