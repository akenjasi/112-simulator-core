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
import { Textarea } from "@/components/ui/textarea"
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
  Edit2,
  Save,
  Check,
  Plus,
  Dices,
} from "lucide-react"

export interface GroundTruth {
  fio?: string
  phone?: string
  street?: string
  house?: string
  city?: string
  apartment?: string
  floor?: string
  entrance?: string
  intercom?: string
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

// Format address fields safely preventing literal "null" / "undefined" strings (ТЗ 39.2)
export const formatAddressField = (val: any): string => {
  if (val == null) return ""
  const str = String(val).trim()
  return str === "null" || str === "undefined" ? "" : str
}

export const ALL_EMERGENCY_SERVICES = [
  { code: "01", name: "01 Пожарные", icon: Flame, color: "border-red-400 text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-300" },
  { code: "02", name: "02 Полиция", icon: ShieldAlert, color: "border-blue-400 text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300" },
  { code: "03", name: "03 Скорая", icon: Ambulance, color: "border-green-400 text-green-700 bg-green-50 dark:bg-green-950/40 dark:text-green-300" },
  { code: "04", name: "04 Газ", icon: null, color: "border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300" },
]

export default function TicketsPage() {
  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null)

  // Editing state for ticket details modal (ТЗ 36, ТЗ 37)
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false)

  // Edit form state
  const [editCategory, setEditCategory] = useState<string>("")
  const [editSubcategory, setEditSubcategory] = useState<string>("")
  const [editComplexity, setEditComplexity] = useState<number>(1)
  const [editPlot, setEditPlot] = useState<string>("")
  const [editServices, setEditServices] = useState<string[]>([])
  const [selectedServiceToAdd, setSelectedServiceToAdd] = useState<string>("")
  const [editFio, setEditFio] = useState<string>("")
  const [editPhone, setEditPhone] = useState<string>("")
  const [editStreet, setEditStreet] = useState<string>("")
  const [editHouse, setEditHouse] = useState<string>("")
  const [editApartment, setEditApartment] = useState<string>("")
  const [editFloor, setEditFloor] = useState<string>("")
  const [editEntrance, setEditEntrance] = useState<string>("")
  const [editIntercom, setEditIntercom] = useState<string>("")
  const [editExtraAddress, setEditExtraAddress] = useState<Record<string, any>>({})
  const [isGeneratingAddress, setIsGeneratingAddress] = useState<boolean>(false)

  // Classifier options (ТЗ 37.1, ТЗ 37.4, ТЗ 39.1)
  const [classifierCategories, setClassifierCategories] = useState<string[]>([])
  const [classifierSubcategories, setClassifierSubcategories] = useState<string[]>([])
  const [filterSubcategories, setFilterSubcategories] = useState<string[]>([])
  const [modalSubcategories, setModalSubcategories] = useState<string[]>([])
  const [classifierServices, setClassifierServices] = useState<string[]>([])

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

  // Load categories and services from classifier API
  useEffect(() => {
    fetch("/api/classifier/categories")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: string[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setClassifierCategories(data)
        }
      })
      .catch(() => {})

    fetch("/api/classifier/services")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: string[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setClassifierServices(data)
        }
      })
      .catch(() => {})
  }, [])

  // Load subcategories dynamically whenever editCategory changes (ТЗ 37.1, ТЗ 39.1)
  useEffect(() => {
    if (!editCategory) {
      setClassifierSubcategories([])
      return
    }

    fetch(`/api/classifier/subcategories?category=${encodeURIComponent(editCategory)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: string[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setClassifierSubcategories(data)
        } else {
          setClassifierSubcategories([])
        }
      })
      .catch(() => {
        setClassifierSubcategories([])
      })
  }, [editCategory])

  // Load subcategories dynamically whenever filterCategory changes (ТЗ 39.1)
  useEffect(() => {
    if (!filterCategory) {
      setFilterSubcategories([])
      return
    }

    fetch(`/api/classifier/subcategories?category=${encodeURIComponent(filterCategory)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: string[]) => {
        if (Array.isArray(data)) {
          setFilterSubcategories(data)
        } else {
          setFilterSubcategories([])
        }
      })
      .catch(() => {
        setFilterSubcategories([])
      })
  }, [filterCategory])

  // Load subcategories dynamically whenever modalCategory changes (ТЗ 39.1)
  useEffect(() => {
    if (!modalCategory) {
      setModalSubcategories([])
      return
    }

    fetch(`/api/classifier/subcategories?category=${encodeURIComponent(modalCategory)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: string[]) => {
        if (Array.isArray(data)) {
          setModalSubcategories(data)
        } else {
          setModalSubcategories([])
        }
      })
      .catch(() => {
        setModalSubcategories([])
      })
  }, [modalCategory])

  // Auto-populate edit form whenever a ticket is selected (ТЗ 39.2, ТЗ 39.3)
  useEffect(() => {
    if (selectedTicket) {
      setEditCategory(selectedTicket.category || "Пожары и задымления")
      setEditSubcategory(selectedTicket.subcategory || "")
      setEditComplexity(selectedTicket.complexity || 1)
      setEditPlot(selectedTicket.plot || "")
      setEditServices(selectedTicket.etalon_services ? [...selectedTicket.etalon_services] : [])
      setSelectedServiceToAdd("")
      setEditFio(selectedTicket.ground_truth?.fio || "")
      setEditPhone(selectedTicket.ground_truth?.phone || "")
      setEditStreet(selectedTicket.ground_truth?.street || "")
      setEditHouse(selectedTicket.ground_truth?.house || "")
      setEditApartment(formatAddressField(selectedTicket.ground_truth?.apartment))
      setEditFloor(formatAddressField(selectedTicket.ground_truth?.floor))
      setEditEntrance(formatAddressField(selectedTicket.ground_truth?.entrance))
      setEditIntercom(formatAddressField(selectedTicket.ground_truth?.intercom))
      setEditExtraAddress({})
      setSaveSuccess(false)

      // Auto-fetch full actual classifier services upon opening modal (ТЗ 39.3)
      if (selectedTicket.category && selectedTicket.subcategory) {
        fetch(
          `/api/classifier/details?category=${encodeURIComponent(selectedTicket.category)}&subcategory=${encodeURIComponent(selectedTicket.subcategory)}`
        )
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data && Array.isArray(data.services) && data.services.length > 0) {
              setEditServices(data.services)
              setSelectedTicket((prev) => (prev ? { ...prev, etalon_services: data.services } : null))
            }
          })
          .catch((err) => {
            console.error("Failed to auto-fetch classifier details on ticket open:", err)
          })
      }
    } else {
      setIsEditing(false)
      setSaveSuccess(false)
    }
  }, [selectedTicket?.ticket_id, selectedTicket?.id])

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
      categoryToSend = "Случайная категория"
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

  // Handle Open Ticket Details
  const handleOpenTicketDetails = (ticket: TicketItem, editMode: boolean = false) => {
    setSelectedTicket(ticket)
    setIsEditing(editMode)
  }

  // Handle Cancel Edit
  const handleCancelEdit = () => {
    if (selectedTicket) {
      setEditCategory(selectedTicket.category || "Пожары и задымления")
      setEditSubcategory(selectedTicket.subcategory || "")
      setEditComplexity(selectedTicket.complexity || 1)
      setEditPlot(selectedTicket.plot || "")
      setEditServices(selectedTicket.etalon_services ? [...selectedTicket.etalon_services] : [])
      setSelectedServiceToAdd("")
      setEditFio(selectedTicket.ground_truth?.fio || "")
      setEditPhone(selectedTicket.ground_truth?.phone || "")
      setEditStreet(selectedTicket.ground_truth?.street || "")
      setEditHouse(selectedTicket.ground_truth?.house || "")
      setEditApartment(formatAddressField(selectedTicket.ground_truth?.apartment))
      setEditFloor(formatAddressField(selectedTicket.ground_truth?.floor))
      setEditEntrance(formatAddressField(selectedTicket.ground_truth?.entrance))
      setEditIntercom(formatAddressField(selectedTicket.ground_truth?.intercom))
      setEditExtraAddress({})
    }
    setIsEditing(false)
  }

  // Handle subcategory change with auto-fetching of etalon services (ТЗ 38.1)
  const handleSubcategoryChange = async (newSubcategory: string) => {
    setEditSubcategory(newSubcategory)
    const cat = editCategory || selectedTicket?.category || ""
    if (!newSubcategory.trim() || !cat.trim()) return

    try {
      const res = await fetch(
        `/api/classifier/details?category=${encodeURIComponent(cat.trim())}&subcategory=${encodeURIComponent(newSubcategory.trim())}`
      )
      if (res.ok) {
        const data = await res.json()
        if (data && Array.isArray(data.services)) {
          setEditServices(data.services)
        }
      }
    } catch (err) {
      console.error("Failed to fetch classifier details for services:", err)
    }
  }

  // Handle Generate Random Address (ТЗ 37.2, ТЗ 38.2, ТЗ 39.2)
  const handleGenerateRandomAddress = async () => {
    setIsGeneratingAddress(true)
    setError(null)
    try {
      const res = await fetch("/api/generator/address")
      if (!res.ok) {
        throw new Error(`Не удалось получить случайный адрес (${res.status})`)
      }
      const data = await res.json()
      if (data.street) setEditStreet(data.street)
      if (data.house) setEditHouse(data.house)

      if (!data.apartment || data.apartment === "null") {
        setEditApartment("")
        setEditFloor("")
        setEditIntercom("")
        setEditEntrance(formatAddressField(data.entrance))
      } else {
        setEditApartment(formatAddressField(data.apartment))
        setEditFloor(formatAddressField(data.floor))
        setEditEntrance(formatAddressField(data.entrance))
        setEditIntercom(formatAddressField(data.intercom))
      }

      setEditExtraAddress({
        city: data.city || "Москва",
        lat: data.lat,
        lon: data.lon,
        corpus: data.corpus,
        structure: data.structure,
        full_address: data.full_address,
      })
    } catch (err: any) {
      setError(err.message || "Ошибка при генерации адреса")
    } finally {
      setIsGeneratingAddress(false)
    }
  }

  // Handle Toggle Emergency Service in edit form
  const handleToggleService = (code: string) => {
    setEditServices((prev) => {
      const std = ALL_EMERGENCY_SERVICES.find((s) => s.code === code || s.name === code)
      const matches = (c: string) => c === code || (std && (c === std.code || c === std.name))
      if (prev.some(matches)) {
        return prev.filter((c) => !matches(c))
      }
      return [...prev, code].sort()
    })
  }

  // Handle Save Ticket (PATCH /api/tickets/{ticket_id}) (ТЗ 36.1, ТЗ 37)
  const handleSaveTicket = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!selectedTicket) return
    const ticketId = selectedTicket.ticket_id || selectedTicket.id
    if (!ticketId) return

    setIsSaving(true)
    setError(null)
    setSaveSuccess(false)

    const payload = {
      category: editCategory.trim() || selectedTicket.category,
      subcategory: editSubcategory.trim() ? editSubcategory.trim() : null,
      complexity: Number(editComplexity) || 1,
      plot: editPlot.trim(),
      etalon_services: editServices,
      ground_truth: {
        ...(selectedTicket.ground_truth || {}),
        ...editExtraAddress,
        fio: editFio.trim(),
        phone: editPhone.trim(),
        street: editStreet.trim(),
        house: editHouse.trim(),
        apartment: editApartment.trim(),
        floor: editFloor.trim(),
        entrance: editEntrance.trim(),
        intercom: editIntercom.trim(),
      },
    }

    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        throw new Error(errorData?.detail || `Не удалось сохранить билет (${res.status})`)
      }

      const updatedTicket: TicketItem = await res.json()
      setSelectedTicket(updatedTicket)
      setTickets((prev) =>
        prev.map((t) => ((t.ticket_id || t.id) === ticketId ? { ...t, ...updatedTicket } : t))
      )
      setSaveSuccess(true)
      setIsEditing(false)
      setSuccessMessage("Билет успешно сохранен")
    } catch (err: any) {
      setError(err.message || "Ошибка при сохранении билета")
    } finally {
      setIsSaving(false)
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
      case "01 Пожарные":
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
      case "02 Полиция":
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
      case "03 Скорая":
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
      case "04 Газ":
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
            Фильтрация билетов по ID, категориям происшествий, подкатегориям и уровню сложности
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleApplyFilter} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">
              {/* Search by ID */}
              <div className="space-y-1.5">
                <Label htmlFor="filter-search-id" className="text-sm font-semibold">
                  Поиск по ID билета
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="filter-search-id"
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

              {/* Category Dropdown */}
              <div className="space-y-1.5">
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
                  {classifierCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                  {filterCategory && !classifierCategories.includes(filterCategory) && (
                    <SelectItem value={filterCategory}>{filterCategory}</SelectItem>
                  )}
                </Select>
              </div>

              {/* Subcategory Dropdown */}
              <div className="space-y-1.5">
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
                  {filterSubcategories.map((sub) => (
                    <SelectItem key={sub} value={sub}>
                      {sub}
                    </SelectItem>
                  ))}
                </Select>
              </div>

              {/* Complexity Dropdown */}
              <div className="space-y-1.5">
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
            </div>

            {/* Filter Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <Button
                type="submit"
                variant="default"
                disabled={isLoading}
                className="w-auto px-4 whitespace-nowrap text-sm font-medium shrink-0"
                aria-label="Применить фильтр"
              >
                <Filter className="h-4 w-4 mr-1.5 shrink-0" />
                <span>Применить фильтр</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleResetFilter}
                disabled={isLoading}
                title="Сбросить фильтры"
                className="w-auto px-4 whitespace-nowrap text-sm font-medium shrink-0"
                aria-label="Сбросить фильтры"
              >
                <RotateCcw className="h-4 w-4 mr-1.5 shrink-0" />
                <span>Сбросить фильтры</span>
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
                    <TableHead className="w-[140px] text-center text-sm font-semibold">
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

                        {/* Сложность (1, 2, 3 с бейджами строго по центру) */}
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center">
                            {renderComplexityBadge(ticket.complexity)}
                          </div>
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
                              onClick={() => handleOpenTicketDetails(ticket, false)}
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
                  {classifierCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                  {modalCategory && !classifierCategories.includes(modalCategory) && (
                    <SelectItem value={modalCategory}>{modalCategory}</SelectItem>
                  )}
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
                  {modalSubcategories.map((sub) => (
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
                    {isEditing ? "Редактирование билета" : "Детали билета"}{" "}
                    {selectedTicket.display_id ||
                      (selectedTicket.ticket_id
                        ? `#${selectedTicket.ticket_id.slice(0, 8)}`
                        : "")}
                  </h2>
                  {renderComplexityBadge(isEditing ? editComplexity : selectedTicket.complexity)}
                </div>
                <p className="font-mono text-xs text-muted-foreground mt-1">
                  ID:{" "}
                  {selectedTicket.display_id
                    ? `${selectedTicket.display_id} (${selectedTicket.ticket_id || selectedTicket.id})`
                    : selectedTicket.ticket_id || selectedTicket.id}
                </p>
              </div>
              <div className="flex items-center gap-2">
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
            </div>

            {/* Modal Body */}
            <div className="space-y-4">
              {/* Category and Subcategory (ТЗ 37.1) */}
              {isEditing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-lg bg-muted/20 border">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="edit-category"
                      className="text-xs font-semibold text-muted-foreground block"
                    >
                      Категория:
                    </Label>
                    <Select
                      id="edit-category"
                      value={editCategory}
                      onChange={(e) => {
                        setEditCategory(e.target.value)
                        setEditSubcategory("")
                      }}
                      aria-label="Категория"
                    >
                      {classifierCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                      {editCategory && !classifierCategories.includes(editCategory) && (
                        <SelectItem value={editCategory}>{editCategory}</SelectItem>
                      )}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="edit-subcategory"
                      className="text-xs font-semibold text-muted-foreground block"
                    >
                      Подкатегория:
                    </Label>
                    <Select
                      id="edit-subcategory"
                      value={editSubcategory}
                      onChange={(e) => handleSubcategoryChange(e.target.value)}
                      aria-label="Подкатегория"
                    >
                      <SelectItem value="">-- Без подкатегории --</SelectItem>
                      {classifierSubcategories.map((sub) => (
                        <SelectItem key={sub} value={sub}>
                          {sub}
                        </SelectItem>
                      ))}
                      {editSubcategory &&
                        !classifierSubcategories.includes(editSubcategory) && (
                          <SelectItem value={editSubcategory}>{editSubcategory}</SelectItem>
                        )}
                    </Select>
                  </div>
                </div>
              ) : (
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
              )}

              {/* Complexity (Edit Mode) */}
              {isEditing && (
                <div className="space-y-1.5">
                  <Label htmlFor="edit-complexity" className="text-sm font-semibold">
                    Сложность сценария (1-3)
                  </Label>
                  <div className="flex flex-wrap items-center gap-3">
                    {[1, 2, 3].map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setEditComplexity(lvl)}
                        aria-label={`Сложность ${lvl}`}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          editComplexity === lvl
                            ? lvl === 1
                              ? "bg-emerald-600 text-white border-emerald-600 shadow-xs ring-2 ring-emerald-600/30"
                              : lvl === 2
                              ? "bg-amber-500 text-white border-amber-500 shadow-xs ring-2 ring-amber-500/30"
                              : "bg-rose-600 text-white border-rose-600 shadow-xs ring-2 ring-rose-600/30"
                            : "border-muted-foreground/30 text-muted-foreground bg-muted/20 hover:bg-muted/40"
                        }`}
                      >
                        <span>Уровень {lvl}</span>
                        <span className="opacity-80">
                          {lvl === 1 ? "(Зеленый)" : lvl === 2 ? "(Желтый)" : "(Красный)"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Situation / Plot */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor={isEditing ? "edit-plot-textarea" : undefined}
                    className="text-sm font-semibold flex items-center gap-1.5"
                  >
                    <Info className="h-4 w-4 text-primary" /> Фабула вызова / Сценарий
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handlePlayAudio(selectedTicket.ticket_id || selectedTicket.id || "")
                    }
                    disabled={
                      loadingAudioTicketId ===
                      (selectedTicket.ticket_id || selectedTicket.id)
                    }
                    className="text-xs font-semibold"
                  >
                    {loadingAudioTicketId ===
                    (selectedTicket.ticket_id || selectedTicket.id) ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin text-primary" />
                        Загрузка...
                      </>
                    ) : playingTicketId ===
                      (selectedTicket.ticket_id || selectedTicket.id) ? (
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
                {isEditing ? (
                  <Textarea
                    id="edit-plot-textarea"
                    rows={4}
                    value={editPlot}
                    onChange={(e) => setEditPlot(e.target.value)}
                    placeholder="Введите текст фабулы происшествия..."
                    aria-label="Фабула вызова"
                    className="text-sm leading-relaxed"
                  />
                ) : (
                  <div className="p-3.5 rounded-lg bg-muted/40 border text-sm leading-relaxed text-foreground">
                    {selectedTicket.plot || "Текст сценария отсутствует"}
                  </div>
                )}
              </div>

              {/* Etalon Services (ТЗ 37.4) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">
                    Назначенные службы экстренного реагирования
                  </Label>
                  {isEditing && (
                    <span className="text-xs text-muted-foreground">
                      Назначено служб: {editServices.length}
                    </span>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2.5">
                    {/* Active assigned services chips with remove buttons */}
                    <div className="flex flex-wrap gap-2 p-2.5 rounded-lg bg-muted/20 border min-h-[42px] items-center">
                      {editServices.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">
                          Службы пока не назначены. Выберите службу из списка ниже.
                        </span>
                      ) : (
                        editServices.map((code) => {
                          const standardSvc = ALL_EMERGENCY_SERVICES.find(
                            (s) => s.code === code || s.name === code
                          )
                          return (
                            <span
                              key={code}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${
                                standardSvc
                                  ? standardSvc.color
                                  : "border-primary/30 text-primary bg-primary/10"
                              }`}
                            >
                              <span>{standardSvc ? standardSvc.name : code}</span>
                              <button
                                type="button"
                                onClick={() => handleToggleService(code)}
                                aria-label={`Удалить службу ${standardSvc ? standardSvc.name : code}`}
                                className="text-muted-foreground hover:text-foreground cursor-pointer ml-0.5"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          )
                        })
                      )}
                    </div>

                    {/* Dropdown to add a service from the classifier directory (ТЗ 37.4) */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="flex-1">
                        <Select
                          id="add-service-select"
                          aria-label="Выбрать службу"
                          value={selectedServiceToAdd}
                          onChange={(e) => {
                            const val = e.target.value
                            if (val && !editServices.includes(val)) {
                              setEditServices((prev) => [...prev, val])
                            }
                            setSelectedServiceToAdd("")
                          }}
                        >
                          <SelectItem value="">-- Выберите службу из справочника --</SelectItem>
                          {(classifierServices.length > 0
                            ? classifierServices
                            : [
                                "Служба 101",
                                "Служба 102",
                                "Служба 103",
                                "Служба 104",
                                "ЦОДД",
                                "ЦЭМП",
                                "Мосводоканал",
                                "Мосгаз",
                                "Мосгортранс",
                                "Росгвардия",
                              ]
                          )
                            .filter((svc) => !editServices.includes(svc))
                            .map((svc) => (
                              <SelectItem key={svc} value={svc}>
                                {svc}
                              </SelectItem>
                            ))}
                        </Select>
                      </div>
                    </div>

                    {/* Quick selection buttons for standard 01, 02, 03, 04 */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-xs text-muted-foreground mr-1">Быстрый выбор:</span>
                      {ALL_EMERGENCY_SERVICES.map((svc) => {
                        const isActive = editServices.some((c) => c === svc.code || c === svc.name)
                        const Icon = svc.icon
                        return (
                          <button
                            key={svc.code}
                            type="button"
                            onClick={() => handleToggleService(svc.code)}
                            aria-label={`${isActive ? "Удалить службу" : "Добавить службу"} ${svc.name}`}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border transition-all cursor-pointer ${
                              isActive
                                ? `${svc.color} ring-1 ring-primary/20 shadow-xs font-bold`
                                : "border-muted-foreground/30 text-muted-foreground bg-muted/20 hover:bg-muted/40"
                            }`}
                          >
                            {Icon && <Icon className="w-3.5 h-3.5" />}
                            <span>{svc.name}</span>
                            {isActive ? (
                              <X className="w-3.5 h-3.5 ml-1 text-muted-foreground hover:text-foreground" />
                            ) : (
                              <Plus className="w-3.5 h-3.5 ml-1 text-muted-foreground" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : selectedTicket.etalon_services &&
                  selectedTicket.etalon_services.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {selectedTicket.etalon_services.map((code) => renderServiceBadge(code))}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Службы не назначены</span>
                )}
              </div>

              {/* Ground Truth Data (ТЗ 37.2, 37.3) */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="text-sm font-semibold">
                    Эталонные данные абонента (Ground Truth)
                  </Label>
                  {isEditing && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateRandomAddress}
                      disabled={isGeneratingAddress}
                      title="Сгенерировать случайный адрес"
                      aria-label="Сгенерировать случайный адрес"
                      className="h-8 text-xs font-medium"
                    >
                      {isGeneratingAddress ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Dices className="h-3.5 w-3.5 mr-1.5 text-primary" />
                      )}
                      Сгенерировать случайный адрес
                    </Button>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-3 p-3.5 rounded-lg bg-muted/20 border">
                    {/* ФИО и Телефон */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label
                          htmlFor="edit-fio"
                          className="text-xs text-muted-foreground flex items-center gap-1"
                        >
                          <User className="h-3.5 w-3.5" /> Заявитель (ФИО):
                        </Label>
                        <Input
                          id="edit-fio"
                          value={editFio}
                          onChange={(e) => setEditFio(e.target.value)}
                          placeholder="Иванов Иван Иванович"
                          aria-label="ФИО заявителя"
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label
                          htmlFor="edit-phone"
                          className="text-xs text-muted-foreground flex items-center gap-1"
                        >
                          <Phone className="h-3.5 w-3.5" /> Телефон:
                        </Label>
                        <Input
                          id="edit-phone"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          placeholder="+7 (900) 000-00-00"
                          aria-label="Телефон заявителя"
                          className="text-sm font-mono"
                        />
                      </div>
                    </div>

                    {/* Улица и Дом (read-only per ТЗ 37.2) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border/40">
                      <div className="space-y-1">
                        <Label
                          htmlFor="edit-street"
                          className="text-xs text-muted-foreground flex items-center justify-between"
                        >
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" /> Улица происшествия:
                          </span>
                          <span className="text-[10px] text-muted-foreground/80 font-normal">
                            (только чтение)
                          </span>
                        </Label>
                        <Input
                          id="edit-street"
                          value={editStreet}
                          readOnly
                          aria-readonly="true"
                          placeholder="Сгенерируйте адрес"
                          aria-label="Улица"
                          className="text-sm bg-muted/60 cursor-not-allowed text-muted-foreground"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label
                          htmlFor="edit-house"
                          className="text-xs text-muted-foreground flex items-center justify-between"
                        >
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" /> Дом / строение:
                          </span>
                          <span className="text-[10px] text-muted-foreground/80 font-normal">
                            (только чтение)
                          </span>
                        </Label>
                        <Input
                          id="edit-house"
                          value={editHouse}
                          readOnly
                          aria-readonly="true"
                          placeholder="Номер дома"
                          aria-label="Дом"
                          className="text-sm bg-muted/60 cursor-not-allowed text-muted-foreground"
                        />
                      </div>
                    </div>

                    {/* ТЗ 37.3: Квартира, Этаж, Подъезд, Домофон (editable) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-border/40">
                      <div className="space-y-1">
                        <Label
                          htmlFor="edit-apartment"
                          className="text-xs text-muted-foreground block"
                        >
                          Квартира:
                        </Label>
                        <Input
                          id="edit-apartment"
                          value={editApartment}
                          onChange={(e) => setEditApartment(e.target.value)}
                          placeholder="12"
                          aria-label="Квартира"
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label
                          htmlFor="edit-floor"
                          className="text-xs text-muted-foreground block"
                        >
                          Этаж:
                        </Label>
                        <Input
                          id="edit-floor"
                          value={editFloor}
                          onChange={(e) => setEditFloor(e.target.value)}
                          placeholder="3"
                          aria-label="Этаж"
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label
                          htmlFor="edit-entrance"
                          className="text-xs text-muted-foreground block"
                        >
                          Подъезд:
                        </Label>
                        <Input
                          id="edit-entrance"
                          value={editEntrance}
                          onChange={(e) => setEditEntrance(e.target.value)}
                          placeholder="1"
                          aria-label="Подъезд"
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label
                          htmlFor="edit-intercom"
                          className="text-xs text-muted-foreground block"
                        >
                          Код домофона:
                        </Label>
                        <Input
                          id="edit-intercom"
                          value={editIntercom}
                          onChange={(e) => setEditIntercom(e.target.value)}
                          placeholder="12K1234"
                          aria-label="Код домофона"
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-lg bg-muted/30 border">
                    <div className="flex items-start gap-2">
                      <User className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs text-muted-foreground block">
                          Заявитель:
                        </span>
                        <span className="text-sm font-medium">
                          {selectedTicket.ground_truth?.fio || "Не указан"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs text-muted-foreground block">
                          Телефон:
                        </span>
                        <span className="text-sm font-medium font-mono">
                          {selectedTicket.ground_truth?.phone || "Не указан"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 sm:col-span-2">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs text-muted-foreground block">
                          Адрес происшествия:
                        </span>
                        <span className="text-sm font-medium">
                          {[
                            selectedTicket.ground_truth?.city,
                            selectedTicket.ground_truth?.street &&
                            selectedTicket.ground_truth.street !== "null"
                              ? `ул. ${selectedTicket.ground_truth.street}`
                              : null,
                            selectedTicket.ground_truth?.house &&
                            selectedTicket.ground_truth.house !== "null"
                              ? `д. ${selectedTicket.ground_truth.house}`
                              : null,
                            formatAddressField(selectedTicket.ground_truth?.apartment)
                              ? `кв. ${formatAddressField(selectedTicket.ground_truth?.apartment)}`
                              : null,
                            formatAddressField(selectedTicket.ground_truth?.entrance)
                              ? `под. ${formatAddressField(selectedTicket.ground_truth?.entrance)}`
                              : null,
                            formatAddressField(selectedTicket.ground_truth?.floor)
                              ? `эт. ${formatAddressField(selectedTicket.ground_truth?.floor)}`
                              : null,
                            formatAddressField(selectedTicket.ground_truth?.intercom)
                              ? `домофон: ${formatAddressField(selectedTicket.ground_truth?.intercom)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(", ") || "Адрес не указан"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Factoids block COMPLETELY REMOVED per ТЗ 36.2 */}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between gap-2 border-t pt-4">
              <div className="flex items-center gap-2">
                {saveSuccess && (
                  <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1 animate-in fade-in">
                    <CheckCircle2 className="h-4 w-4" /> Изменения сохранены!
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      className="text-sm"
                    >
                      Отмена
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      onClick={handleSaveTicket}
                      disabled={isSaving}
                      className="font-semibold text-sm shadow-xs"
                      aria-label="Сохранить изменения"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          Сохранение...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-1.5" />
                          Сохранить
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditing(true)}
                      className="text-sm font-medium"
                      aria-label="Редактировать билет"
                    >
                      <Edit2 className="h-4 w-4 mr-1.5" />
                      Редактировать
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedTicket(null)}
                      className="text-sm"
                    >
                      Закрыть
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
