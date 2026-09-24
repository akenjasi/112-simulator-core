"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectItem } from "@/components/ui/select"
import {
  Sparkles,
  Ticket,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Eye,
  X,
  Play,
  Pause,
  Volume2,
  ShieldAlert,
  Flame,
  Ambulance,
  Phone,
  MapPin,
  User,
  Info,
  Filter,
  RotateCcw,
  Trash2,
  Search,
} from "lucide-react"

export interface GroundTruth {
  fio?: string
  phone?: string
  street?: string
  house?: string
  city?: string
  [key: string]: any
}

export interface TicketItem {
  id?: string
  ticket_id: string
  display_id?: string
  sequence_number?: number
  category?: string
  subcategory?: string | null
  complexity: number
  plot: string
  etalon_services?: string[]
  factoids?: Record<string, any>
  ground_truth?: GroundTruth
  status?: string
  created_at?: string
}

export interface GenerationState {
  status: "in_progress" | "done"
  targetCount: number
  remainingSeconds: number
  startTime: number
  message?: string
}

// Preset standard categories and subcategories aligned with the classifier
export const CATEGORY_PRESETS: { category: string; subcategories: string[] }[] = [
  {
    category: "Пожары и задымления",
    subcategories: [
      "Пожар в жилом секторе",
      "Пожар в квартире",
      "Задымление в подъезде",
      "Возгорание автомобиля",
      "Пожар на складе/производстве",
    ],
  },
  {
    category: "ДТП",
    subcategories: [
      "Лобовое столкновение",
      "Дорожно-транспортные происшествия с пострадавшими",
      "Дорожно-транспортные происшествия без пострадавших",
      "Опрокидывание автомобиля",
      "Наезд на пешехода",
    ],
  },
  {
    category: "Запах газа",
    subcategories: [
      "Запах газа в квартире",
      "Запах газа в подъезде",
      "Запах газа на улице",
      "Повреждение газопровода",
    ],
  },
  {
    category: "Оказание медицинской скорой и неотложной помощи",
    subcategories: [
      "Потеря сознания",
      "Сердечный приступ",
      "Тяжелая травма",
      "Острое отравление",
      "Кровотечение",
    ],
  },
  {
    category: "Нарушение правопорядка",
    subcategories: [
      "Массовая драка",
      "Хулиганство и шум в ночное время",
      "Кража, грабеж, разбой",
      "Нападение",
    ],
  },
  {
    category: "Взрывы",
    subcategories: [
      "Взрыв бытового газа",
      "Взрыв на объекте",
      "Взрыв транспортного средства",
      "Угроза взрыва",
    ],
  },
  {
    category: "Аварии и происшествия в городском хозяйстве",
    subcategories: [
      "Прорыв трубы отопления",
      "Затопление подвала",
      "Обрыв проводов",
      "Падение дерева",
    ],
  },
  {
    category: "Человек в опасности",
    subcategories: [
      "Заблокирована дверь с пожилым человеком",
      "Человек на карнизе/крыше",
      "Угроза жизни ребенка",
      "Застревание в лифте с угрозой",
    ],
  },
  {
    category: "Обрушения",
    subcategories: [
      "Обрушение конструкций здания",
      "Обрушение козырька",
      "Провал грунта",
    ],
  },
]

export default function TicketsPage() {
  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null)

  // Audio Playback state
  const [playingTicketId, setPlayingTicketId] = useState<string | null>(null)
  const [loadingAudioTicketId, setLoadingAudioTicketId] = useState<string | null>(null)
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)

  // Filters state
  const [filterCategory, setFilterCategory] = useState<string>("")
  const [filterSubcategory, setFilterSubcategory] = useState<string>("")
  const [filterComplexity, setFilterComplexity] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")

  // Generation Modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [modalCategory, setModalCategory] = useState<string>("Пожары и задымления")
  const [modalSubcategory, setModalSubcategory] = useState<string>("")
  const [modalCount, setModalCount] = useState<number>(10)
  const [modalError, setModalError] = useState<string | null>(null)

  // Real-time generation & polling state
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [generationState, setGenerationState] = useState<GenerationState | null>(null)

  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const baselineTicketIdsRef = useRef<Set<string>>(new Set())
  const activeFiltersRef = useRef({ category: "", subcategory: "", complexity: "" })

  // Keep active filters ref updated
  useEffect(() => {
    activeFiltersRef.current = {
      category: filterCategory,
      subcategory: filterSubcategory,
      complexity: filterComplexity,
    }
  }, [filterCategory, filterSubcategory, filterComplexity])

  // Clear timers and audio on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause()
        audioPlayerRef.current = null
      }
    }
  }, [])

  // Format estimated time helper: "~10 сек на 1 билет"
  const formatEstimatedTime = (seconds: number): string => {
    if (seconds <= 0) return "менее 5 сек"
    const minutes = Math.floor(seconds / 60)
    const remainingSecs = seconds % 60
    if (minutes > 0) {
      return `${minutes} мин${remainingSecs > 0 ? ` ${remainingSecs} сек` : ""}`
    }
    return `${remainingSecs} сек`
  }

  // Format date helper
  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return "—"
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return dateStr
      return d.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return dateStr
    }
  }

  // Helper for abbreviation (e.g. "Пожары и задымления" -> "ПИ")
  const makeAbbr = (text?: string | null): string => {
    if (!text) return "ХЗ"
    const words = text.trim().split(/\s+/).slice(0, 2)
    return words.map((w) => w[0]?.toUpperCase() || "").join("")
  }

  // Format display ID (e.g. ПИ_ЗВ_42)
  const formatShortId = (ticket: TicketItem, index: number): string => {
    if (ticket.display_id) {
      return ticket.display_id
    }
    const cat = makeAbbr(ticket.category)
    const sub = makeAbbr(ticket.subcategory)
    const seq = ticket.sequence_number ?? (index + 1)
    return `${cat}_${sub}_${seq}`
  }

  // Load tickets from server with active filters
  const loadTickets = useCallback(
    async (
      cat = filterCategory,
      subcat = filterSubcategory,
      comp = filterComplexity,
      silent = false
    ) => {
      try {
        if (!silent) {
          setIsRefreshing(true)
        }
        setError(null)

        const params = new URLSearchParams()
        if (cat) params.append("category", cat)
        if (subcat) params.append("subcategory", subcat)
        if (comp) params.append("complexity", comp)

        const url = `/api/v1/tickets${params.toString() ? `?${params.toString()}` : ""}`
        const res = await fetch(url)
        if (!res.ok) {
          throw new Error(`Ошибка загрузки списка билетов (${res.status})`)
        }
        const data = await res.json()
        const ticketList: TicketItem[] = Array.isArray(data) ? data : []
        setTickets(ticketList)
        return ticketList
      } catch (err: any) {
        if (!silent) {
          setError(err.message || "Не удалось загрузить список билетов")
        }
        return []
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [filterCategory, filterSubcategory, filterComplexity]
  )

  useEffect(() => {
    loadTickets()
  }, [loadTickets])

  // Handle filter application
  const handleApplyFilter = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    loadTickets(filterCategory, filterSubcategory, filterComplexity)
  }

  // Handle filter reset
  const handleResetFilter = () => {
    setFilterCategory("")
    setFilterSubcategory("")
    setFilterComplexity("")
    setSearchQuery("")
    loadTickets("", "", "")
  }

  // UX-сценарий "Умная генерация":
  // Если преподаватель выбрал фильтры (например, "Взрывы") и хочет сгенерировать,
  // модальное окно автоматически подхватывает выбранные фильтры.
  const handleOpenSmartGenerateModal = () => {
    setModalCategory(filterCategory || "")
    setModalSubcategory(filterSubcategory || "")
    setModalCount(10)
    setModalError(null)
    setIsModalOpen(true)
  }

  // Handle Ticket Generation Submit
  const handleStartGeneration = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    const countNum = Number(modalCount)
    if (!countNum || countNum < 1 || countNum > 20) {
      setModalError("Количество билетов должно быть от 1 до 20")
      return
    }

    let categoryToSend = modalCategory.trim()
    if (!categoryToSend || categoryToSend === "Случайная категория") {
      const randomPreset = CATEGORY_PRESETS[Math.floor(Math.random() * CATEGORY_PRESETS.length)]
      categoryToSend = randomPreset ? randomPreset.category : "Пожары и задымления"
    }

    const currentIds = new Set(tickets.map((t) => t.ticket_id || t.id || ""))
    baselineTicketIdsRef.current = currentIds

    // Close modal, start real-time banner
    setIsModalOpen(false)
    setIsGenerating(true)
    setError(null)
    setSuccessMessage(null)

    const totalSeconds = countNum * 30
    const startTime = Date.now()

    setGenerationState({
      status: "in_progress",
      targetCount: countNum,
      remainingSeconds: totalSeconds,
      startTime,
    })

    // Start 1-second countdown for honest UX calculation
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      setGenerationState((prev) => {
        if (!prev || prev.status !== "in_progress") return prev
        const elapsed = Math.floor((Date.now() - prev.startTime) / 1000)
        const left = Math.max(0, totalSeconds - elapsed)
        return {
          ...prev,
          remainingSeconds: left,
        }
      })
    }, 1000)

    try {
      const res = await fetch("/api/v1/tickets/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: categoryToSend,
          subcategory: modalSubcategory.trim() ? modalSubcategory.trim() : null,
          count: countNum,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(errorData?.detail || `Не удалось начать генерацию (${res.status})`)
      }

      const responseData = await res.json()

      // Handle immediate mock response (e.g., in synchronous unit test environments)
      if (Array.isArray(responseData)) {
        if (countdownRef.current) clearInterval(countdownRef.current)
        setTickets(responseData)
        setIsGenerating(false)
        setGenerationState({
          status: "done",
          targetCount: responseData.length || countNum,
          remainingSeconds: 0,
          startTime: 0,
        })
        setSuccessMessage(`Пакет из ${responseData.length || countNum} билетов успешно сгенерирован!`)
        return
      }

      // Backend responded 202 Accepted: start 3-second polling
      if (pollingRef.current) clearInterval(pollingRef.current)
      pollingRef.current = setInterval(async () => {
        try {
          // Poll ticket list
          const updatedList = await loadTickets(
            activeFiltersRef.current.category,
            activeFiltersRef.current.subcategory,
            activeFiltersRef.current.complexity,
            true
          )

          // Look for newly added tickets that weren't in the baseline set
          const baseline = baselineTicketIdsRef.current
          const newTickets = updatedList.filter((t) => !baseline.has(t.ticket_id || t.id || ""))

          if (newTickets.length >= countNum || updatedList.length >= baseline.size + countNum) {
            // Completed! Stop polling
            if (pollingRef.current) clearInterval(pollingRef.current)
            if (countdownRef.current) clearInterval(countdownRef.current)

            setIsGenerating(false)
            setGenerationState({
              status: "done",
              targetCount: newTickets.length || countNum,
              remainingSeconds: 0,
              startTime: 0,
            })
            setSuccessMessage(`Готово! Сгенерировано ${newTickets.length || countNum} билетов`)
          }
        } catch (pollErr) {
          console.warn("Polling error:", pollErr)
        }
      }, 3000)
    } catch (err: any) {
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (pollingRef.current) clearInterval(pollingRef.current)
      setIsGenerating(false)
      setGenerationState(null)
      setError(err.message || "Ошибка при запуске генерации билетов")
    }
  }

  // Handle audio playback for ticket (ТЗ 30.2)
  const handlePlayAudio = async (ticketId: string) => {
    if (!ticketId) return

    // If currently playing, clicking again stops playback
    if (playingTicketId === ticketId) {
      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause()
        } catch {}
        audioPlayerRef.current = null
      }
      setPlayingTicketId(null)
      setLoadingAudioTicketId(null)
      return
    }

    // Stop any existing playback
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause()
      } catch {}
      audioPlayerRef.current = null
    }

    setPlayingTicketId(null)
    setLoadingAudioTicketId(ticketId)
    setError(null)

    try {
      const url = `/api/tickets/${encodeURIComponent(ticketId)}/audio`
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`Ошибка загрузки аудио (${res.status})`)
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)

      const audio = new Audio(objectUrl)
      audioPlayerRef.current = audio

      audio.onplay = () => {
        setLoadingAudioTicketId(null)
        setPlayingTicketId(ticketId)
      }
      audio.onended = () => {
        try {
          URL.revokeObjectURL(objectUrl)
        } catch {}
        setPlayingTicketId(null)
        setLoadingAudioTicketId(null)
        audioPlayerRef.current = null
      }
      audio.onerror = () => {
        try {
          URL.revokeObjectURL(objectUrl)
        } catch {}
        setPlayingTicketId(null)
        setLoadingAudioTicketId(null)
        audioPlayerRef.current = null
        setError("Не удалось воспроизвести аудиозапись")
      }

      await audio.play()
    } catch (err: any) {
      setLoadingAudioTicketId(null)
      setPlayingTicketId(null)
      setError(err.message || "Не удалось загрузить аудиозапись")
    }
  }

  // Handle Ticket Deletion (ТЗ 31 / ТЗ 35: сразу без подтверждения)
  const handleDeleteTicket = async (ticket: TicketItem) => {
    const ticketId = ticket.ticket_id || ticket.id
    if (!ticketId) return

    setDeletingTicketId(ticketId)
    setError(null)
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        throw new Error(`Ошибка при удалении билета (${res.status})`)
      }
      setSuccessMessage("Билет успешно удален")
      setTickets((prev) => prev.filter((t) => (t.ticket_id || t.id) !== ticketId))
      if (selectedTicket && (selectedTicket.ticket_id || selectedTicket.id) === ticketId) {
        setSelectedTicket(null)
      }
      loadTickets(filterCategory, filterSubcategory, filterComplexity, true)
    } catch (err: any) {
      setError(err.message || "Не удалось удалить билет")
    } finally {
      setDeletingTicketId(null)
    }
  }

  // Visual complexity badge renderer
  const renderComplexityBadge = (complexity: number) => {
    switch (complexity) {
      case 1:
        return (
          <Badge
            data-testid="complexity-badge-1"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium border-emerald-700/30 text-xs px-2.5 py-0.5"
          >
            1
          </Badge>
        )
      case 2:
        return (
          <Badge
            data-testid="complexity-badge-2"
            className="bg-amber-500 hover:bg-amber-600 text-white font-medium border-amber-600/30 text-xs px-2.5 py-0.5"
          >
            2
          </Badge>
        )
      case 3:
      default:
        return (
          <Badge
            data-testid="complexity-badge-3"
            variant="destructive"
            className="bg-rose-600 hover:bg-rose-700 text-white font-medium border-rose-700/30 text-xs px-2.5 py-0.5"
          >
            3
          </Badge>
        )
    }
  }

  // Emergency service badge renderer
  const renderServiceBadge = (code: string) => {
    switch (code) {
      case "01":
        return (
          <Badge
            key={code}
            variant="outline"
            className="border-red-400 text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-300 text-xs"
          >
            <Flame className="w-3 h-3 mr-1 inline" /> 01 Пожарные
          </Badge>
        )
      case "02":
        return (
          <Badge
            key={code}
            variant="outline"
            className="border-blue-400 text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300 text-xs"
          >
            <ShieldAlert className="w-3 h-3 mr-1 inline" /> 02 Полиция
          </Badge>
        )
      case "03":
        return (
          <Badge
            key={code}
            variant="outline"
            className="border-green-400 text-green-700 bg-green-50 dark:bg-green-950/40 dark:text-green-300 text-xs"
          >
            <Ambulance className="w-3 h-3 mr-1 inline" /> 03 Скорая
          </Badge>
        )
      case "04":
        return (
          <Badge
            key={code}
            variant="outline"
            className="border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 text-xs"
          >
            04 Газ
          </Badge>
        )
      default:
        return (
          <Badge key={code} variant="outline" className="text-xs">
            {code}
          </Badge>
        )
    }
  }

  // Available subcategories for modal selection
  const selectedPreset = CATEGORY_PRESETS.find((p) => p.category === modalCategory)
  const modalSubcategoryOptions = selectedPreset ? selectedPreset.subcategories : []

  // Available subcategories for filter selection
  const filterPreset = CATEGORY_PRESETS.find((p) => p.category === filterCategory)
  const filterSubcategoryOptions = filterPreset ? filterPreset.subcategories : []

  // Filter tickets locally by display_id (ТЗ 35)
  const filteredTickets = tickets.filter((ticket, index) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.trim().toLowerCase()
    const displayId = (ticket.display_id || formatShortId(ticket, index)).toLowerCase()
    return displayId.includes(query)
  })

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-6xl space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-xl text-primary shrink-0">
            <Ticket className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              База билетов
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-0.5">
              Глобальный склад учебных сценариев и синтез речи для экзаменов
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="default"
            onClick={() => loadTickets()}
            disabled={isLoading || isGenerating}
            title="Обновить список билетов"
            className="text-sm font-medium"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Обновить
          </Button>

          <Button
            variant="default"
            size="lg"
            onClick={handleOpenSmartGenerateModal}
            disabled={isGenerating}
            className="text-base font-semibold shadow-md px-6 py-2.5 h-11 min-w-[170px]"
          >
            <Sparkles className="h-5 w-5 mr-2" />
            Сгенерировать
          </Button>
        </div>
      </div>

      {/* Real-time UX: Honest Generation Status Banner */}
      {generationState?.status === "in_progress" && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-blue-500/40 bg-blue-50/95 dark:bg-blue-950/40 p-4 sm:p-5 text-blue-950 dark:text-blue-100 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="flex items-start sm:items-center gap-3.5">
            <Loader2 className="h-6 w-6 sm:h-7 sm:w-7 animate-spin text-blue-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <div className="text-base sm:text-lg font-bold">
                Генерация билетов: в процессе...
              </div>
              <div className="text-sm sm:text-base text-blue-800 dark:text-blue-300 font-medium mt-0.5">
                Осталось примерно {formatEstimatedTime(generationState.remainingSeconds)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Badge
              variant="outline"
              className="bg-blue-100/80 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border-blue-300 text-xs sm:text-sm px-3 py-1 font-mono"
            >
              Пакет: {generationState.targetCount} шт. (~30 сек/билет)
            </Badge>
          </div>
        </div>
      )}

      {/* Real-time UX: Generation Success Banner */}
      {generationState?.status === "done" && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-emerald-500/40 bg-emerald-50/95 dark:bg-emerald-950/40 p-4 sm:p-5 text-emerald-950 dark:text-emerald-100 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="flex items-start sm:items-center gap-3.5">
            <CheckCircle2 className="h-6 w-6 sm:h-7 sm:w-7 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <div className="text-base sm:text-lg font-bold">
                Готово! Сгенерировано {generationState.targetCount} билетов
              </div>
              <div className="text-sm sm:text-base text-emerald-800 dark:text-emerald-300 mt-0.5">
                Все сценарии и аудиофайлы TTS успешно сформированы и добавлены в базу
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGenerationState(null)}
            className="border-emerald-400 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 self-start sm:self-auto"
          >
            Скрыть уведомление
          </Button>
        </div>
      )}

      {/* Notifications */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive text-base font-medium"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && !generationState && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-lg border border-green-500/40 bg-green-500/10 p-4 text-green-700 dark:text-green-300 text-base font-medium"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Filters Panel */}
      <Card className="shadow-xs border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg sm:text-xl">Фильтры базы билетов</CardTitle>
          </div>
          <CardDescription className="text-sm">
            Фильтрация билетов по категориям происшествий, подкатегориям и уровню сложности
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleApplyFilter}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 items-end"
          >
            {/* Category Dropdown */}
            <div className="space-y-1.5 lg:col-span-4">
              <Label htmlFor="filter-category" className="text-sm font-semibold">
                Категория
              </Label>
              <Select
                id="filter-category"
                name="filterCategory"
                aria-label="Категория"
                value={filterCategory}
                onChange={(e) => {
                  setFilterCategory(e.target.value)
                  setFilterSubcategory("")
                }}
              >
                <SelectItem value="">Все категории</SelectItem>
                {CATEGORY_PRESETS.map((p) => (
                  <SelectItem key={p.category} value={p.category}>
                    {p.category}
                  </SelectItem>
                ))}
              </Select>
            </div>

            {/* Subcategory Dropdown */}
            <div className="space-y-1.5 lg:col-span-3">
              <Label htmlFor="filter-subcategory" className="text-sm font-semibold">
                Подкатегория
              </Label>
              <Select
                id="filter-subcategory"
                name="filterSubcategory"
                aria-label="Подкатегория"
                value={filterSubcategory}
                onChange={(e) => setFilterSubcategory(e.target.value)}
              >
                <SelectItem value="">Все подкатегории</SelectItem>
                {filterSubcategoryOptions.map((sub) => (
                  <SelectItem key={sub} value={sub}>
                    {sub}
                  </SelectItem>
                ))}
              </Select>
            </div>

            {/* Complexity Dropdown */}
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="filter-complexity" className="text-sm font-semibold">
                Сложность
              </Label>
              <Select
                id="filter-complexity"
                name="filterComplexity"
                aria-label="Сложность"
                value={filterComplexity}
                onChange={(e) => setFilterComplexity(e.target.value)}
              >
                <SelectItem value="">Все уровни</SelectItem>
                <SelectItem value="1">Сложность 1 (Зеленый)</SelectItem>
                <SelectItem value="2">Сложность 2 (Желтый)</SelectItem>
                <SelectItem value="3">Сложность 3 (Красный)</SelectItem>
              </Select>
            </div>

            {/* Filter Action Buttons */}
            <div className="flex items-center gap-2 lg:col-span-3 w-full min-w-0">
              <Button
                type="submit"
                variant="default"
                disabled={isLoading}
                className="flex-1 text-sm font-medium min-w-0 px-3"
                aria-label="Применить фильтр"
              >
                <Filter className="h-4 w-4 mr-1.5 shrink-0" />
                <span className="truncate">Применить</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleResetFilter}
                disabled={isLoading}
                title="Сбросить фильтры"
                className="text-sm font-medium shrink-0 px-3"
                aria-label="Сбросить фильтры"
              >
                <RotateCcw className="h-4 w-4 mr-1.5 shrink-0" />
                <span>Сбросить</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Ticket Table Card */}
      <Card className="shadow-xs border">
        <CardHeader className="pb-3">
          <div>
            <CardTitle className="text-lg sm:text-xl">Список билетов</CardTitle>
            <CardDescription className="text-sm mt-0.5">
              Всего билетов найдено: {tickets.length}
              {searchQuery.trim() && ` (отфильтровано: ${filteredTickets.length})`}
              {(filterCategory || filterComplexity) && " (с учетом активных фильтров)"}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {/* Local Search by display_id */}
          {tickets.length > 0 && (
            <div className="mb-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Поиск по ID билета (например, ПИ_ЗВ_42)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Поиск по ID билета"
                  className="pl-9 pr-8 text-sm"
                />
                {searchQuery && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 rounded-full"
                    aria-label="Очистить поиск"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Stable layout: no jumps during refresh */}
          {isLoading && tickets.length === 0 ? (
            <div className="space-y-3 py-6">
              {[1, 2, 3, 4, 5].map((idx) => (
                <div
                  key={idx}
                  className="h-12 w-full rounded-md bg-muted/40 animate-pulse border"
                />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            /* UX-сценарий "Умная генерация": Пустое состояние таблицы */
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center border rounded-xl bg-muted/20 space-y-4">
              <div className="p-3 rounded-full bg-muted/60 text-muted-foreground">
                <Ticket className="h-10 w-10" />
              </div>
              <div className="max-w-md space-y-1">
                <h3 className="font-bold text-lg sm:text-xl text-foreground">
                  Билеты не найдены
                </h3>
                <p className="text-sm sm:text-base text-muted-foreground">
                  {filterCategory || filterComplexity
                    ? `По выбранным критериям (${[
                        filterCategory,
                        filterSubcategory,
                        filterComplexity ? `Сложность ${filterComplexity}` : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}) билетов пока нет в базе.`
                    : "В базе билетов пока нет сохраненных сценариев."}
                </p>
              </div>

              {/* Умная генерация: кнопка подхватывает фильтры */}
              <Button
                size="lg"
                onClick={handleOpenSmartGenerateModal}
                className="text-base font-semibold shadow-xs mt-2"
              >
                <Sparkles className="mr-2 h-5 w-5" />
                Сгенерировать{" "}
                {filterCategory ? `«${filterCategory}»` : "билеты"}
              </Button>
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center border rounded-xl bg-muted/20 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                Билеты с ID «{searchQuery}» не найдены
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="text-xs"
              >
                Сбросить поиск
              </Button>
            </div>
          ) : (
            <div
              className={`border rounded-lg overflow-x-auto transition-opacity duration-150 ${
                isRefreshing ? "opacity-60" : "opacity-100"
              }`}
            >
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-[120px] text-sm font-semibold">ID</TableHead>
                    <TableHead className="min-w-[200px] text-sm font-semibold">
                      Название / Категория
                    </TableHead>
                    <TableHead className="min-w-[170px] text-sm font-semibold">
                      Подкатегория
                    </TableHead>
                    <TableHead className="w-[140px] text-sm font-semibold">
                      Сложность
                    </TableHead>
                    <TableHead className="w-[160px] text-sm font-semibold">
                      Дата создания
                    </TableHead>
                    <TableHead className="w-[140px] text-right text-sm font-semibold">
                      Действия
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTickets.map((ticket, index) => {
                    const shortId = formatShortId(ticket, index)
                    const categoryName = ticket.category || "Общее"
                    const subcategoryName = ticket.subcategory || "—"
                    const dateFormatted = formatDate(ticket.created_at)
                    const ticketId = ticket.ticket_id || ticket.id || ""

                    return (
                      <TableRow
                        key={ticket.ticket_id || ticket.id || index}
                        className="hover:bg-muted/30 transition-colors"
                      >
                        {/* ID (display_id: например ПИ_ЗВ_42) */}
                        <TableCell className="font-mono text-sm font-bold text-foreground">
                          {shortId}
                        </TableCell>

                        {/* Название / Категория (только название категории) */}
                        <TableCell>
                          <span className="font-semibold text-sm sm:text-base text-foreground block">
                            {categoryName}
                          </span>
                        </TableCell>

                        {/* Подкатегория */}
                        <TableCell className="text-sm font-medium text-foreground">
                          {subcategoryName}
                        </TableCell>

                        {/* Сложность (1, 2, 3 с бейджами) */}
                        <TableCell>
                          {renderComplexityBadge(ticket.complexity)}
                        </TableCell>

                        {/* Дата создания */}
                        <TableCell className="text-xs sm:text-sm text-muted-foreground font-medium">
                          {dateFormatted}
                        </TableCell>

                        {/* Действия: кнопки Детали и Удалить */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedTicket(ticket)}
                              aria-label={`Детали билета ${shortId}`}
                              className="text-xs sm:text-sm font-medium"
                            >
                              <Eye className="h-4 w-4 mr-1.5 inline" />
                              Детали
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteTicket(ticket)}
                              disabled={deletingTicketId === ticketId}
                              aria-label={`Удалить билет ${shortId}`}
                              title="Удалить билет"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 w-8 p-0"
                            >
                              {deletingTicketId === ticketId ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Модальное окно Генерации */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="generate-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-background border rounded-xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 id="generate-modal-title" className="text-xl font-bold text-foreground">
                    Генерация билетов
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    Фоновая генерация учебных сценариев с синтезом речи TTS
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(false)}
                aria-label="Закрыть"
                className="rounded-full w-8 h-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Modal Errors */}
            {modalError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-destructive text-sm font-medium"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            {/* Modal Form */}
            <form onSubmit={handleStartGeneration} className="space-y-5">
              {/* Поле Категория (опционально / случайная) */}
              <div className="space-y-1.5">
                <Label htmlFor="modal-category-select" className="text-sm font-semibold">
                  Категория
                </Label>
                <Select
                  id="modal-category-select"
                  name="modalCategory"
                  aria-label="Категория"
                  value={modalCategory}
                  onChange={(e) => {
                    setModalCategory(e.target.value)
                    setModalSubcategory("")
                  }}
                >
                  <SelectItem value="">Случайная категория</SelectItem>
                  {CATEGORY_PRESETS.map((p) => (
                    <SelectItem key={p.category} value={p.category}>
                      {p.category}
                    </SelectItem>
                  ))}
                </Select>
              </div>

              {/* Поле Подкатегория (опционально) */}
              <div className="space-y-1.5">
                <Label htmlFor="modal-subcategory-select" className="text-sm font-semibold">
                  Подкатегория (опционально)
                </Label>
                <Select
                  id="modal-subcategory-select"
                  name="modalSubcategory"
                  aria-label="Подкатегория"
                  value={modalSubcategory}
                  onChange={(e) => setModalSubcategory(e.target.value)}
                >
                  <SelectItem value="">Любая / Общая подкатегория</SelectItem>
                  {modalSubcategoryOptions.map((sub) => (
                    <SelectItem key={sub} value={sub}>
                      {sub}
                    </SelectItem>
                  ))}
                </Select>
              </div>

              {/* Поле Количество (min=1, max=20) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="modal-count-input" className="text-sm font-semibold">
                    Количество билетов (от 1 до 20) <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-xs text-muted-foreground font-medium">
                    ~30 сек на 1 билет
                  </span>
                </div>
                <Input
                  id="modal-count-input"
                  name="count"
                  type="number"
                  aria-label="Количество"
                  min={1}
                  max={20}
                  value={modalCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    if (isNaN(val)) {
                      setModalCount(1)
                    } else {
                      setModalCount(Math.min(20, Math.max(1, val)))
                    }
                  }}
                  className="font-medium text-base"
                  required
                />

                {/* Кнопки быстрого выбора: 1, 5, 10, 20 */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground mr-1">Быстрый выбор:</span>
                  {[1, 5, 10, 20].map((num) => (
                    <Button
                      key={num}
                      type="button"
                      variant={modalCount === num ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setModalCount(num)}
                      className="text-xs font-semibold px-3"
                    >
                      {num}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Estimated generation summary note */}
              <div className="p-3 bg-muted/40 rounded-lg border text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Info className="h-4 w-4 text-primary" /> Расчет времени TTS:
                </div>
                <p>
                  Заказано: <strong>{modalCount} шт.</strong> (~30 сек на 1 билет). Расчетное время синтеза аудио:{" "}
                  <strong>{formatEstimatedTime(modalCount * 30)}</strong>. Генерация будет выполняться в фоне.
                </p>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                >
                  Закрыть
                </Button>
                <Button type="submit" className="font-semibold shadow-xs">
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  Сгенерировать
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ticket Details Modal */}
      {selectedTicket && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ticket-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setSelectedTicket(null)}
        >
          <div
            className="bg-background border rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="ticket-modal-title" className="text-xl font-bold text-foreground">
                    Детали билета {selectedTicket.display_id || (selectedTicket.ticket_id ? `#${selectedTicket.ticket_id.slice(0, 8)}` : "")}
                  </h2>
                  {renderComplexityBadge(selectedTicket.complexity)}
                </div>
                <p className="font-mono text-xs text-muted-foreground mt-1">
                  ID: {selectedTicket.display_id ? `${selectedTicket.display_id} (${selectedTicket.ticket_id || selectedTicket.id})` : (selectedTicket.ticket_id || selectedTicket.id)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedTicket(null)}
                aria-label="Закрыть"
                data-testid="modal-dismiss-btn"
                className="rounded-full w-8 h-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4">
              {/* Category and Subcategory */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-lg bg-muted/20 border">
                <div>
                  <span className="text-xs text-muted-foreground block">Категория:</span>
                  <span className="text-sm font-semibold text-foreground">
                    {selectedTicket.category || "Общее"}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Подкатегория:</span>
                  <span className="text-sm font-semibold text-foreground">
                    {selectedTicket.subcategory || "—"}
                  </span>
                </div>
              </div>

              {/* Situation / Plot */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold flex items-center gap-1.5">
                    <Info className="h-4 w-4 text-primary" /> Фабула вызова / Сценарий
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handlePlayAudio(selectedTicket.ticket_id || selectedTicket.id || "")}
                    disabled={loadingAudioTicketId === (selectedTicket.ticket_id || selectedTicket.id)}
                    className="text-xs font-semibold"
                  >
                    {loadingAudioTicketId === (selectedTicket.ticket_id || selectedTicket.id) ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin text-primary" />
                        Загрузка...
                      </>
                    ) : playingTicketId === (selectedTicket.ticket_id || selectedTicket.id) ? (
                      <>
                        <Pause className="h-3.5 w-3.5 mr-1.5 text-primary fill-primary" />
                        Остановить
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5 mr-1.5 text-primary fill-primary" />
                        Прослушать аудио
                      </>
                    )}
                  </Button>
                </div>
                <div className="p-3.5 rounded-lg bg-muted/40 border text-sm leading-relaxed text-foreground">
                  {selectedTicket.plot ||
                    (selectedTicket.factoids && Object.values(selectedTicket.factoids)[0]) ||
                    "Текст сценария отсутствует"}
                </div>
              </div>

              {/* Etalon Services */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">
                  Назначенные службы экстренного реагирования
                </Label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedTicket.etalon_services && selectedTicket.etalon_services.length > 0 ? (
                    selectedTicket.etalon_services.map((code) => renderServiceBadge(code))
                  ) : (
                    <span className="text-sm text-muted-foreground">Службы не назначены</span>
                  )}
                </div>
              </div>

              {/* Ground Truth Data */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">
                  Эталонные данные абонента (Ground Truth)
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-lg bg-muted/30 border">
                  <div className="flex items-start gap-2">
                    <User className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs text-muted-foreground block">Заявитель:</span>
                      <span className="text-sm font-medium">
                        {selectedTicket.ground_truth?.fio || "Не указан"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs text-muted-foreground block">Телефон:</span>
                      <span className="text-sm font-medium font-mono">
                        {selectedTicket.ground_truth?.phone || "Не указан"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 sm:col-span-2">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs text-muted-foreground block">Адрес происшествия:</span>
                      <span className="text-sm font-medium">
                        {[
                          selectedTicket.ground_truth?.city,
                          selectedTicket.ground_truth?.street
                            ? `ул. ${selectedTicket.ground_truth.street}`
                            : null,
                          selectedTicket.ground_truth?.house
                            ? `д. ${selectedTicket.ground_truth.house}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(", ") || "Адрес не указан"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Factoids if present */}
              {selectedTicket.factoids && Object.keys(selectedTicket.factoids).length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">Дополнительные фактоиды</Label>
                  <div className="text-xs space-y-1 bg-muted/20 p-3 rounded border">
                    {Object.entries(selectedTicket.factoids).map(([key, val]) => (
                      <div key={key} className="flex gap-2">
                        <span className="font-mono text-muted-foreground">{key}:</span>
                        <span>{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => setSelectedTicket(null)}>
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
