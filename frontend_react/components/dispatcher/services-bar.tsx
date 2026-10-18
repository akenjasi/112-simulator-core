"use client"

import { useEffect, useRef, useState } from "react"
import NextLink from "next/link"
import { Link, Timer, Bell, MessageSquareWarning, X, Check, Pencil } from "lucide-react"
import type { DispatcherData, ServiceStatus } from "@/lib/dispatcher-data"

type Props = {
  data: DispatcherData
  onStatusChange?: (serviceName: string, nextStatus: string, comment: string, orderNumber: string) => void | boolean | Promise<void | boolean>
  onAccept?: () => void
  onNextCard?: () => void
  disabled?: boolean
  allowedStatuses?: Record<string, string[]>
  closeHref?: string
  disabledReason?: string
  completionDisabled?: boolean
  completionReason?: string
}

export function ServicesBar({ data, onStatusChange, onAccept, onNextCard, disabled = false, allowedStatuses, closeHref, disabledReason, completionDisabled = false, completionReason }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const submittingRef = useRef(false)
  const editingStatusRef = useRef<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [popupLeft, setPopupLeft] = useState(0)
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

  useEffect(() => {
    // A successful server retry may update the service after this editor returned.
    if (editingService && editingService.status !== editingStatusRef.current) setEditingServiceId(null)
  }, [editingService?.status])

  // Список доступных статусов
  const getStatusOptions = (currentStatus?: string, serviceName?: string) => {
    if (currentStatus === "Получена слу...") currentStatus = "Получена службой"
    // Saved sessions use the server policy. The fallback serves the explicit local demo.
    if (allowedStatuses !== undefined) {
      const canonical = currentStatus === "В пути" ? "Начало реагирования" : currentStatus === "Прибыли" ? "Прибытие" : currentStatus
      // The next stage is preselected; only refusal is an alternative, not a stage picker.
      return (Object.hasOwn(allowedStatuses, serviceName || "") ? allowedStatuses[serviceName || ""] : [])
        .filter(status => status !== canonical)
    }
    if (currentStatus === "Не принята") {
      return ["Принята"]
    }
    if (currentStatus === "Принята") {
      return ["Начало реагирования", "Отказ от выполнения работ"]
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
    return ["Добавлена", "Получена службой", "В обработке", "Направлена"].includes(currentStatus || "") ? ["Принята", "Не принята"] : []
  }

  // Клик по карандашу (открытие белой горизонтальной линии прямо над футером)
  const handlePencilClick = (e: React.MouseEvent, service: ServiceStatus) => {
    e.stopPropagation()
    if (disabled || submittingRef.current) return
    const options = getStatusOptions(service.status, service.name)
    if (!options.length) return

    // Close the blue history popup to prevent UI overlap
    setPopupOpen(false)
    setActiveId(null)

    setEditingServiceId(service.id)
    editingStatusRef.current = service.status
    setSelectedStatus(options[0] || "Принята")
    setIsSelectDropdownOpen(false)
    setOrderNumber("")
    setCommentText("")
  }

  // Клик по подтверждению (галочка ✓ с оранжевой рамкой)
  const handleConfirmAction = async () => {
    if (!editingService || disabled || submittingRef.current) return

    const isRejection = selectedStatus === "Не принята" || selectedStatus === "Отказ от выполнения работ"
    if ((isRejection || isSupplement) && !commentText.trim()) {
      return
    }

    submittingRef.current = true
    setIsSubmitting(true)
    try {
      const saved = await onStatusChange?.(editingService.name, selectedStatus, commentText.trim(), orderNumber.trim())
      if (saved === false) return
      if (["Принята", "Начало реагирования", "Прибытие", "Проведение работ"].includes(selectedStatus)) {
        onAccept?.()
      }
      setEditingServiceId(null)
    } catch {
      // Keep the draft; the caller displays the network/server error and retry.
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  // Переключение разворачивания службы (синий попап)
  const handleTabClick = (event: React.MouseEvent<HTMLElement>, service: ServiceStatus) => {
    const bar = barRef.current?.getBoundingClientRect()
    const tab = event.currentTarget.getBoundingClientRect()
    if (bar) setPopupLeft(Math.max(0, Math.min(tab.left - bar.left, bar.width - Math.min(480, bar.width))))
    setEditingServiceId(null)
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
  const currentStatus = editingService?.status === "В пути" ? "Начало реагирования" : editingService?.status === "Прибыли" ? "Прибытие" : editingService?.status
  const isSupplement = selectedStatus === currentStatus
  const isConfirmDisabled = disabled || isSubmitting || ((isRejection || isSupplement) && !commentText.trim())

  return (
    <div ref={barRef} id="tour-services" className="relative select-none">
      {/* 1. Белая горизонтальная полоса редактирования статуса (строго как на скриншоте со стр. 24) */}
      {editingServiceId && (
        <div className="absolute bottom-full left-0 sm:left-32 2xl:left-44 z-30 flex min-h-[42px] sm:h-[42px] 2xl:h-[59px] w-full sm:w-[min(800px,calc(100%_-_8rem))] 2xl:w-[min(1120px,calc(100%_-_11rem))] flex-wrap sm:flex-nowrap items-center border border-[#b4b9bc] bg-white text-sm shadow-lg">
          {/* Кастомный выпадающий селект статусов */}
          <div className="relative flex h-full w-[220px] 2xl:w-[308px] items-center border-r border-[#d1d5db] px-3 2xl:px-4">
            <button type="button" disabled={disabled || isSubmitting}
              aria-label="Выбрать статус службы" aria-expanded={isSelectDropdownOpen}
              onClick={() => setIsSelectDropdownOpen(!isSelectDropdownOpen)}
              className="flex w-full cursor-pointer items-center justify-between font-medium text-[#111827]"
            >
              <span>{selectedStatus}</span>
              <span className="text-xs 2xl:text-sm text-[#4b5563]">▾</span>
            </button>

            {/* Выпадающий список опций */}
            {isSelectDropdownOpen && (
              <div className="absolute bottom-full left-0 mb-1 2xl:mb-1.5 z-40 w-[220px] 2xl:w-[308px] border border-[#b4b9bc] bg-white py-1 2xl:py-1.5 shadow-md">
                {getStatusOptions(editingService?.status, editingService?.name).map((opt) => (
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
              disabled={disabled || isSubmitting}
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
              disabled={disabled || isSubmitting}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={isRejection ? "Причина отказа (обязательно)" : isSupplement ? "Комментарий (обязательно)" : "Комментарий..."}
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
            disabled={isSubmitting}
            className="flex h-full w-[42px] 2xl:w-[59px] items-center justify-center text-[#4b5563] hover:bg-gray-100 hover:text-[#111]"
            title="Отмена"
          >
            <X className="h-5 2xl:h-5 w-5 2xl:w-5" />
          </button>
        </div>
      )}

      {/* History must be outside the horizontal scroller or it gets clipped. */}
                  {popupOpen && activeService && (
                    <div
                      role="dialog" aria-label={`История службы ${activeService.name}`}
                      style={{ left: popupLeft, width: "min(480px, 100%)" }}
                      className="absolute bottom-full z-20 rounded-[1px] bg-[#157dbd] p-4 2xl:p-6 text-white shadow-xl cursor-default"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="mb-3 2xl:mb-4 flex items-center justify-between border-b border-white/20 pb-2 2xl:pb-3">
                        <span className="text-base 2xl:text-sm font-bold">{activeService.name}</span>
                        <button
                          type="button"
                          aria-label="Закрыть историю службы"
                          onClick={() => {
                            setPopupOpen(false)
                            setActiveId(null)
                          }}
                          className="text-white hover:opacity-80 text-sm 2xl:text-sm"
                        >
                          <X className="h-5 2xl:h-5 w-5 2xl:w-5" />
                        </button>
                      </div>

                      <div className="flex max-h-[50vh] overflow-y-auto flex-col gap-1.5 2xl:gap-2 text-sm 2xl:text-sm">
                        {(activeService.history || []).map((entry, idx) => {
                          const isRej = entry.isRejected || entry.status === "Не принята" || entry.status === "Отказ от выполнения работ"
                          return (
                            <div key={idx} className="flex flex-wrap items-center gap-2 2xl:gap-2 leading-tight">
                              {entry.op && <>
                                <span className="w-16 2xl:w-24 shrink-0 truncate text-white/90" title={entry.op}>{entry.op}</span>
                                <span className="text-white/60">&gt;</span>
                              </>}

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

      {/* 3. Нижняя панель служб (Футер) */}
      <div className="flex h-[52px] 2xl:h-[73px] items-stretch bg-[#303335] border-t border-[#b4b9bc]">
        <div className="flex w-[80px] 2xl:w-[112px] items-center px-3 2xl:px-4 text-sm 2xl:text-sm font-semibold text-white/90">
          Службы:
        </div>

        {/* Список вкладок служб */}
        <div className="min-w-0 flex-1 overflow-x-auto" onScroll={() => setPopupOpen(false)}>
          <div className="flex items-stretch h-full">
            {data.services.map((service) => {
              const isActive = service.id === activeId && popupOpen
              const isRejected = service.isRejected || service.status === "Не принята" || service.status === "Отказ от выполнения работ"

              return (
                <div
                  key={service.id}
                  onClick={(event) => handleTabClick(event, service)}
                  className={`relative flex w-[180px] 2xl:w-[240px] shrink-0 cursor-pointer flex-col justify-center border-r border-[#49555d] px-3 2xl:px-4 transition-colors ${
                    isActive ? "bg-[#157dbd]" : "bg-[#3e4850] hover:bg-[#46525b]"
                  }`}
                >
                  <div className="flex items-center justify-between text-sm 2xl:text-sm font-bold text-white">
                    <div className="flex items-center gap-1 2xl:gap-1.5">
                      <button type="button" aria-label={`История службы ${service.name}`}
                        aria-expanded={isActive}>
                      {isActive ? (
                        <span className="flex h-5 2xl:h-5 w-5 2xl:w-5 items-center justify-center rounded-[1px] bg-white/20 text-xs 2xl:text-sm text-white">
                          ⌄
                        </span>
                      ) : (
                        <span className="text-xs 2xl:text-sm text-white/80">^</span>
                      )}
                      </button>

                      {/* Карандаш (для любой службы в режиме тренажера) */}
                        <button
                          id={service === data.services[0] ? "tour-pencil" : undefined}
                          type="button"
                          aria-label="Редактировать статус"
                          disabled={disabled || isSubmitting || getStatusOptions(service.status, service.name).length === 0}
                          onClick={(e) => handlePencilClick(e, service)}
                          className="flex h-5 2xl:h-5 w-5 2xl:w-5 items-center justify-center rounded-[1px] border border-transparent bg-white/10 text-white hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={disabled ? disabledReason || "Редактирование временно недоступно" : isSubmitting ? "Дождитесь сохранения" : getStatusOptions(service.status, service.name).length === 0 ? "Изменение статуса этой службы недоступно" : "Проставить статус реагирования"}
                        >
                          <Pencil className="h-3 2xl:h-4 w-3 2xl:w-4" />
                        </button>
                    </div>
                    <button type="button"
                      aria-expanded={isActive} className="truncate text-right flex-1 ml-1 2xl:ml-1.5">{service.name}</button>
                  </div>

                  <div className="flex items-center gap-1 2xl:gap-1.5 text-xs 2xl:text-sm text-white/90 mt-0.5 2xl:mt-1">
                    <span className={`px-1 2xl:px-1.5 rounded-[1px] ${isRejected ? "bg-[#b91c1c] font-bold text-white" : ""}`}>
                      {service.time}
                    </span>
                    <span className="truncate">{service.status}</span>
                  </div>


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
            disabled={disabled || isSubmitting || completionDisabled}
            className="flex items-center justify-center px-4 2xl:px-5 border-r border-[#49555d] text-sm 2xl:text-sm font-bold text-white bg-[#157dbd] hover:bg-[#136ba3] transition-colors"
            title={completionReason || "Отработана"}
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
          {closeHref ? <NextLink href={closeHref}
            aria-label="Закрыть карточку и открыть список происшествий"
            onClick={event => {if (isSubmitting) event.preventDefault()}}
            className="flex w-[46px] 2xl:w-[64px] items-center justify-center text-white/80 hover:text-white hover:bg-red-600/80 transition-colors"
            title="К списку происшествий">
            <X className="h-5 2xl:h-5 w-5 2xl:w-5" />
          </NextLink> : <button
            type="button"
            aria-label="Закрыть"
            onClick={onNextCard}
            disabled={disabled || isSubmitting || completionDisabled}
            className="flex w-[46px] 2xl:w-[64px] items-center justify-center text-white/80 hover:text-white hover:bg-red-600/80 transition-colors"
            title="Закрыть"
          >
            <X className="h-5 2xl:h-5 w-5 2xl:w-5" />
          </button>}
        </div>
      </div>
    </div>
  )
}
