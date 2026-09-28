"use client"

import { useState } from "react"
import { Link, Timer, Bell, MessageSquareWarning, X, Check, Pencil } from "lucide-react"
import type { DispatcherData, ServiceStatus } from "@/lib/dispatcher-data"

type Props = {
  data: DispatcherData
  onStatusChange?: (serviceName: string, nextStatus: string, comment: string, orderNumber: string) => void
  onAccept?: () => void
  onNextCard?: () => void
}

export function ServicesBar({ data, onStatusChange, onAccept, onNextCard }: Props) {
  // По умолчанию никакая служба не выбрана и не подсвечена синим
  const [activeId, setActiveId] = useState<string | null>(null)
  const [popupOpen, setPopupOpen] = useState<boolean>(false)

  // Горизонтальная белая плашка смены статуса (скриншот со стр. 24)
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [selectedStatus, setSelectedStatus] = useState("Принята")
  const [isSelectDropdownOpen, setIsSelectDropdownOpen] = useState(false)
  const [orderNumber, setOrderNumber] = useState("")
  const [commentText, setCommentText] = useState("")

  const activeService = data.services.find((s) => s.id === activeId)
  const editingService = data.services.find((s) => s.id === editingServiceId)

  // Список доступных статусов
  const getStatusOptions = (currentStatus?: string) => {
    if (currentStatus === "Не принята") {
      return ["Принята"]
    }
    if (currentStatus === "Принята") {
      return ["Начало реагирования"]
    }
    if (currentStatus === "Начало реагирования") {
      return ["Прибытие", "Отказ от выполнения работ"]
    }
    if (currentStatus === "Прибытие") {
      return ["Проведение работ", "Отказ от выполнения работ"]
    }
    if (currentStatus === "Проведение работ") {
      return ["Работы завершены", "Отказ от выполнения работ"]
    }
    if (currentStatus === "Работы завершены" || currentStatus === "Отказ от выполнения работ") {
      return []
    }
    return ["Принята", "Не принята"]
  }

  // Клик по карандашу (открытие белой горизонтальной линии прямо над футером)
  const handlePencilClick = (e: React.MouseEvent, service: ServiceStatus) => {
    e.stopPropagation()
    const options = getStatusOptions(service.status)
    
    // Close the blue history popup to prevent UI overlap
    setPopupOpen(false)
    setActiveId(null)
    
    setEditingServiceId(service.id)
    setSelectedStatus(options[0] || "Принята")
    setIsSelectDropdownOpen(false)
    setOrderNumber("")
    setCommentText("")
  }

  // Клик по подтверждению (галочка ✓ с оранжевой рамкой)
  const handleConfirmAction = () => {
    if (!editingService) return

    const isRejection = selectedStatus === "Не принята" || selectedStatus === "Отказ от выполнения работ"
    if (isRejection && !commentText.trim()) {
      alert("Для статуса отказа внесение комментария с причиной обязательно!")
      return
    }

    if (onStatusChange) {
      onStatusChange(editingService.name, selectedStatus, commentText.trim(), orderNumber.trim())
    }
    
    // Unlock the dispatch panel for any active status
    if (["Принята", "Начало реагирования", "Прибытие на место", "Работы завершены"].includes(selectedStatus) && onAccept) {
      onAccept()
    }

    setEditingServiceId(null)
  }

  // Переключение разворачивания службы (синий попап)
  const handleTabClick = (service: ServiceStatus) => {
    if (activeId === service.id && popupOpen) {
      // Сворачиваем обратно
      setActiveId(null)
      setPopupOpen(false)
    } else {
      // Разворачиваем эту службу
      setActiveId(service.id)
      setPopupOpen(true)
    }
  }

  const isRejection = selectedStatus === "Не принята" || selectedStatus === "Отказ от выполнения работ"
  const isConfirmDisabled = isRejection && !commentText.trim()

  return (
    <div id="tour-services" className="relative select-none">
      {/* 1. Белая горизонтальная полоса редактирования статуса (строго как на скриншоте со стр. 24) */}
      {editingServiceId && (
        <div className="absolute bottom-full left-32 2xl:left-44 z-30 flex h-[42px] 2xl:h-[59px] w-[800px] 2xl:w-[1120px] items-center border border-[#b4b9bc] bg-white text-sm 2xl:text-sm shadow-lg">
          {/* Кастомный выпадающий селект статусов */}
          <div className="relative flex h-full w-[220px] 2xl:w-[308px] items-center border-r border-[#d1d5db] px-3 2xl:px-4">
            <div
              onClick={() => setIsSelectDropdownOpen(!isSelectDropdownOpen)}
              className="flex w-full cursor-pointer items-center justify-between font-medium text-[#111827]"
            >
              <span>{selectedStatus}</span>
              <span className="text-xs 2xl:text-sm text-[#4b5563]">▾</span>
            </div>

            {/* Выпадающий список опций */}
            {isSelectDropdownOpen && (
              <div className="absolute bottom-full left-0 mb-1 2xl:mb-1.5 z-40 w-[220px] 2xl:w-[308px] border border-[#b4b9bc] bg-white py-1 2xl:py-1.5 shadow-md">
                {getStatusOptions(editingService?.status).map((opt) => (
                  <div
                    key={opt}
                    onClick={() => {
                      setSelectedStatus(opt)
                      setIsSelectDropdownOpen(false)
                    }}
                    className={`cursor-pointer px-4 2xl:px-5 py-1.5 2xl:py-2 text-sm 2xl:text-sm transition-colors ${
                      selectedStatus === opt
                        ? "bg-[#0078d4] text-white font-medium"
                        : "text-[#111827] hover:bg-gray-100"
                    }`}
                  >
                    {opt}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Поле "Номер наряда" */}
          <div className="flex h-full w-[200px] 2xl:w-[280px] items-center border-r border-[#d1d5db] px-3 2xl:px-4">
            <input
              type="text"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="Номер наряда"
              className="w-full text-sm 2xl:text-sm text-[#111827] placeholder:text-[#6b7280] outline-none border-b border-transparent focus:border-[#0078d4]"
            />
          </div>

          {/* Поле комментария / "Комментарий..." */}
          <div className="flex h-full flex-1 items-center px-3 2xl:px-4">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={isRejection ? "Причина отказа (обязательно)" : "Комментарий..."}
              className="w-full text-sm 2xl:text-sm text-[#111827] placeholder:text-[#6b7280] outline-none border-b border-transparent focus:border-[#0078d4]"
            />
          </div>

          {/* Кнопка подтверждения ✓ с оранжевой рамкой фокуса */}
          <button
            type="button"
            onClick={handleConfirmAction}
            disabled={isConfirmDisabled}
            className={`flex h-full w-[42px] 2xl:w-[59px] items-center justify-center border-l border-r ${
              isConfirmDisabled
                ? "border-gray-300 text-gray-400 bg-gray-50 cursor-not-allowed"
                : "border-[#f97316] text-[#16a34a] hover:bg-green-50"
            }`}
            title="Подтвердить"
          >
            <Check className="h-5 2xl:h-5 w-5 2xl:w-5 stroke-[2.5]" />
          </button>

          {/* Кнопка отмены ✕ */}
          <button
            type="button"
            onClick={() => setEditingServiceId(null)}
            className="flex h-full w-[42px] 2xl:w-[59px] items-center justify-center text-[#4b5563] hover:bg-gray-100 hover:text-[#111]"
            title="Отмена"
          >
            <X className="h-5 2xl:h-5 w-5 2xl:w-5" />
          </button>
        </div>
      )}

      {/* 2. Плавающий синий попап перенесен внутрь вкладки */}

      {/* 3. Нижняя панель служб (Футер) */}
      <div className="flex h-[52px] 2xl:h-[73px] items-stretch bg-[#303335] border-t border-[#b4b9bc]">
        <div className="flex w-[80px] 2xl:w-[112px] items-center px-3 2xl:px-4 text-sm 2xl:text-sm font-semibold text-white/90">
          Службы:
        </div>

        {/* Список вкладок служб */}
        <div className="flex-1 overflow-x-auto">
          <div className="flex items-stretch h-full">
            {data.services.map((service) => {
              const isActive = service.id === activeId && popupOpen
              const isRejected = service.isRejected || service.status === "Не принята" || service.status === "Отказ от выполнения работ"

              return (
                <div
                  key={service.id}
                  onClick={() => handleTabClick(service)}
                  className={`relative flex w-[180px] 2xl:w-[240px] shrink-0 cursor-pointer flex-col justify-center border-r border-[#49555d] px-3 2xl:px-4 transition-colors ${
                    isActive ? "bg-[#157dbd]" : "bg-[#3e4850] hover:bg-[#46525b]"
                  }`}
                >
                  <div className="flex items-center justify-between text-sm 2xl:text-sm font-bold text-white">
                    <div className="flex items-center gap-1 2xl:gap-1.5">
                      {isActive ? (
                        <span className="flex h-5 2xl:h-5 w-5 2xl:w-5 items-center justify-center rounded-[1px] bg-white/20 text-xs 2xl:text-sm text-white">
                          ⌄
                        </span>
                      ) : (
                        <span className="text-xs 2xl:text-sm text-white/80">^</span>
                      )}

                      {/* Карандаш (для любой службы в режиме тренажера) */}
                      {service.status !== "Работы завершены" && service.status !== "Отказ от выполнения работ" && (
                        <button
                          id="tour-pencil"
                          type="button"
                          aria-label="Редактировать статус"
                          onClick={(e) => handlePencilClick(e, service)}
                          className="flex h-5 2xl:h-5 w-5 2xl:w-5 items-center justify-center rounded-[1px] border border-transparent bg-white/10 text-white hover:bg-white/20"
                          title="Проставить статус реагирования"
                        >
                          <Pencil className="h-3 2xl:h-4 w-3 2xl:w-4" />
                        </button>
                      )}
                    </div>
                    <span className="truncate text-right flex-1 ml-1 2xl:ml-1.5">{service.name}</span>
                  </div>

                  <div className="flex items-center gap-1 2xl:gap-1.5 text-xs 2xl:text-sm text-white/90 mt-0.5 2xl:mt-1">
                    <span className={`px-1 2xl:px-1.5 rounded-[1px] ${isRejected ? "bg-[#b91c1c] font-bold text-white" : ""}`}>
                      {service.time}
                    </span>
                    <span className="truncate">{service.status}</span>
                  </div>

                  {isActive && (
                    <div 
                      className="absolute bottom-full left-0 z-20 min-w-[480px] 2xl:min-w-[672px] max-w-[700px] 2xl:max-w-[980px] rounded-[1px] bg-[#157dbd] p-4 2xl:p-6 text-white shadow-xl cursor-default" 
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="mb-3 2xl:mb-4 flex items-center justify-between border-b border-white/20 pb-2 2xl:pb-3">
                        <span className="text-base 2xl:text-sm font-bold">{service.name}</span>
                        <button
                          type="button"
                          aria-label="Закрыть"
                          onClick={() => {
                            setPopupOpen(false)
                            setActiveId(null)
                          }}
                          className="text-white hover:opacity-80 text-sm 2xl:text-sm"
                        >
                          <X className="h-5 2xl:h-5 w-5 2xl:w-5" />
                        </button>
                      </div>

                      <div className="flex flex-col gap-1.5 2xl:gap-2 text-sm 2xl:text-sm">
                        {(service.history || []).map((entry, idx) => {
                          const isRej = entry.isRejected || entry.status === "Не принята" || entry.status === "Отказ от выполнения работ"
                          return (
                            <div key={idx} className="flex flex-wrap items-center gap-2 2xl:gap-2 leading-tight">
                              <span className="w-16 2xl:w-24 text-white/90">{entry.op}</span>
                              <span className="text-white/60">&gt;</span>

                              {/* Красный бейдж времени при отказе */}
                              <span className={`px-1 2xl:px-1.5 rounded-[1px] tabular-nums ${isRej ? "bg-[#b91c1c] font-bold text-white" : ""}`}>
                                {entry.time}
                              </span>

                              <span className="font-semibold">{entry.status}</span>

                              {/* Комментарий / наряд через стрелочку */}
                              {entry.orderNumber && (
                                <span className="text-white/80">[наряд: {entry.orderNumber}]</span>
                              )}
                              {entry.comment && (
                                <>
                                  <span className="text-white/60">&gt;</span>
                                  <span className="text-white/95 italic">{entry.comment}</span>
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Правые системные кнопки */}
        <div className="flex items-stretch shrink-0 border-l border-[#49555d]">
          <button
            type="button"
            aria-label="Отработана"
            onClick={onNextCard}
            className="flex items-center justify-center px-4 2xl:px-5 border-r border-[#49555d] text-sm 2xl:text-sm font-bold text-white bg-[#157dbd] hover:bg-[#136ba3] transition-colors"
            title="Отработана"
          >
            отработана
          </button>
          <button
            type="button"
            aria-label="Связи"
            className="flex w-[46px] 2xl:w-[64px] items-center justify-center border-r border-[#49555d] text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Связи"
          >
            <Link className="h-5 2xl:h-5 w-5 2xl:w-5" />
          </button>
          <button
            type="button"
            aria-label="Таймер"
            className="flex w-[46px] 2xl:w-[64px] items-center justify-center border-r border-[#49555d] text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Таймер"
          >
            <Timer className="h-5 2xl:h-5 w-5 2xl:w-5" />
          </button>
          <button
            type="button"
            aria-label="Оповещения"
            className="flex w-[46px] 2xl:w-[64px] items-center justify-center border-r border-[#49555d] text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Оповещения"
          >
            <Bell className="h-5 2xl:h-5 w-5 2xl:w-5" />
          </button>
          <button
            type="button"
            aria-label="Сообщения"
            className="flex w-[46px] 2xl:w-[64px] items-center justify-center border-r border-[#49555d] text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="Сообщения"
          >
            <MessageSquareWarning className="h-5 2xl:h-5 w-5 2xl:w-5" />
          </button>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onNextCard}
            className="flex w-[46px] 2xl:w-[64px] items-center justify-center text-white/80 hover:text-white hover:bg-red-600/80 transition-colors"
            title="Закрыть"
          >
            <X className="h-5 2xl:h-5 w-5 2xl:w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
