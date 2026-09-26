"use client"

import React, { useState, useMemo } from "react"
import { X, Check } from "lucide-react"
import { DEFAULT_SERVICES_LIST, matchCanonicalService } from "./services-data"

export interface AddServiceModalProps {
  isOpen: boolean
  onClose: () => void
  currentServices: Array<{ name: string; shortName?: string }>
  onSave: (selectedServiceNames: string[]) => void
}

export function AddServiceModal({
  isOpen,
  onClose,
  currentServices,
  onSave,
}: AddServiceModalProps) {
  // Initialize selected services matching currentServices
  const initialSelected = useMemo(() => {
    const set = new Set<string>()
    for (const svc of currentServices) {
      const canonical = matchCanonicalService(svc.name) || svc.name
      set.add(canonical)
      if (svc.shortName) {
        const canonicalFromShort = matchCanonicalService(svc.shortName)
        if (canonicalFromShort) set.add(canonicalFromShort)
      }
    }
    return set
  }, [currentServices])

  const [selectedServices, setSelectedServices] = useState<Set<string>>(initialSelected)
  const [searchTerm, setSearchTerm] = useState("")

  if (!isOpen) return null

  const filteredServices = DEFAULT_SERVICES_LIST.filter((svc) => {
    if (!searchTerm.trim()) return true
    return svc.toLowerCase().includes(searchTerm.toLowerCase().trim())
  })

  const toggleService = (serviceName: string) => {
    setSelectedServices((prev) => {
      const next = new Set(prev)
      if (next.has(serviceName)) {
        next.delete(serviceName)
      } else {
        next.add(serviceName)
      }
      return next
    })
  }

  const handleSaveAndClose = () => {
    onSave(Array.from(selectedServices))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded shadow-2xl max-w-lg w-full flex flex-col overflow-hidden border border-gray-300 animate-in fade-in zoom-in-95 duration-150">
        {/* 1. Header: Large "Добавьте службы" and close cross */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-xl font-bold text-gray-900">Добавьте службы</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100 transition cursor-pointer"
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>

        {/* 2. Search: Bottom border only, no box border */}
        <div className="px-6 py-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Поиск ..."
            className="w-full pb-2 pt-1 border-b border-gray-300 text-sm outline-none focus:border-[#ec653b] text-gray-800 placeholder-gray-400 bg-transparent transition-colors"
          />
        </div>

        {/* 3. Vertical List (not a grid!), divide-y, click to select with highlight & checkmark */}
        <div className="divide-y divide-gray-200 overflow-y-auto max-h-[380px] w-full px-2">
          {filteredServices.length > 0 ? (
            filteredServices.map((svc) => {
              const isSelected = selectedServices.has(svc)
              return (
                <div
                  key={svc}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleService(svc)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      toggleService(svc)
                    }
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 cursor-pointer transition select-none ${
                    isSelected
                      ? "bg-orange-50/80 text-[#ec653b] font-medium"
                      : "text-gray-800 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-sm leading-snug flex-1 pr-3">{svc}</span>
                  {isSelected && (
                    <Check size={18} className="text-[#ec653b] shrink-0" strokeWidth={2.5} />
                  )}
                </div>
              )
            })
          ) : (
            <div className="py-8 text-center text-sm text-gray-400 italic">
              Ничего не найдено
            </div>
          )}
        </div>

        {/* 4. Button: Bottom center "Сохранить и закрыть", white bg, orange border & text */}
        <div className="p-4 border-t border-gray-100 flex justify-center bg-white">
          <button
            type="button"
            onClick={handleSaveAndClose}
            className="px-8 py-2.5 bg-white border border-[#ec653b] text-[#ec653b] text-sm font-semibold rounded hover:bg-[#fff5f2] active:scale-95 transition cursor-pointer shadow-xs"
          >
            Сохранить и закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
