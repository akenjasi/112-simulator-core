"use client"

import React, { useState, useEffect, useCallback, useRef, Suspense } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { fetchDDSAssignments, type DDSSessionState } from "@/lib/dds-cycle"
import { getDDSWorkingCard } from "@/lib/dds-working-card"
import {
  Search,
  ChevronDown,
  ChevronUp,
  Headphones,
  Monitor,
  Settings,
  HelpCircle,
  LogOut,
  Menu,
  BarChart3,
  FileText,
  Users,
  Helicopter,
  Glasses,
  ClipboardCheck,
  Contact,
  Globe,
  Paperclip,
  Bookmark,
  Zap,
  Clock,
  Trash2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
} from "lucide-react"

interface ServiceNotification {
  name: string
  time: string
  status: string
}

interface IncidentPreview {
  services: ServiceNotification[]
  applicant: {
    name: string
    aon: string
    phone: string
    carrier: string
    creationTime: string
  }
  info?: string
  actions?: string
}

interface IncidentItem {
  id: string
  number: string
  date: string
  time: string
  type: string
  oper: string
  arm: string
  injured: string
  status: string
  consoleUrl: string
  address: string
  hasLink?: boolean
  isPinned?: boolean
  verified?: boolean
  description?: string
  preview?: IncidentPreview
}

function toIncident(state: DDSSessionState): IncidentItem {
  const card = getDDSWorkingCard(state)
  const started = (state.received_at || state.started_at) ? new Date((state.received_at || state.started_at)!) : null
  const knownTime = started && Number.isFinite(started.getTime())
  return {
    id: `${state.session_id}:${state.card_id}`,
    consoleUrl: `/dds?${new URLSearchParams({session_id: state.session_id, ticket_id: state.ticket_id, ...(state.readonly ? {card_id: state.card_id} : {})})}`,
    number: card.incident.number || state.ticket_id,
    date: knownTime ? started.toLocaleDateString("ru-RU") : "—",
    time: knownTime ? started.toLocaleTimeString("ru-RU") : "—",
    type: card.classification.title || card.classification.section || "Не указано",
    oper: card.incident.operator || "—", arm: "—",
    injured: card.statuses.injured || "неизвестно",
    status: state.card_submitted_at ? "Отработана" : state.session_status === "COMPLETED" ? state.submitted_at ? "Отработана" : "Не завершено" : state.session_status === "ACTIVE" ? "В процессе" : state.session_status,
    address: card.caller.address, description: card.description,
    preview: {
      services: card.services.map(service => ({name: service.name, time: service.time, status: service.status})),
      applicant: {name: card.caller.name, aon: card.phones.aon, phone: card.phones.provided, carrier: "—", creationTime: ""},
      info: card.description,
    },
  }
}

const renderFormattedTime = (timeStr: string) => {
  const parts = timeStr.split(":")
  if (parts.length >= 3) {
    const [hh, mm, ss] = parts
    return (
      <span className="inline-flex items-center font-bold">
        <span className="text-[12.5px] tracking-tight">{hh}:{mm}</span>
        <span className="text-[9.5px] relative -top-[3px]">:{ss}</span>
      </span>
    )
  }
  return <span>{timeStr}</span>
}

function DdsJournalContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusedSessionId = searchParams?.get("focus_session_id")
  const focusedTicketId = searchParams?.get("focus_ticket_id")
  const [sessions, setSessions] = useState<DDSSessionState[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const controllerRef = useRef<AbortController | null>(null)
  const epochRef = useRef(0)
  const load = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const epoch = ++epochRef.current
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDDSAssignments(controller.signal, true)
      if (epoch === epochRef.current) setSessions(data)
    } catch (err: any) {
      if (!controller.signal.aborted && epoch === epochRef.current) {
        setSessions([])
        setError(err.message || "Не удалось загрузить происшествия")
      }
    } finally {
      if (epoch === epochRef.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    load()
    return () => { epochRef.current++; controllerRef.current?.abort() }
  }, [load])
  const orderedSessions = [...sessions].sort((a, b) => (b.received_at || b.started_at || "").localeCompare(a.received_at || a.started_at || ""))
  const incidents = orderedSessions.map(toIncident)
  const focusedSession = focusedSessionId ? sessions.find(item => !item.readonly && item.session_id === focusedSessionId && (!focusedTicketId || (item.ticket_id === focusedTicketId || item.cards?.some(card => card.ticket_id === focusedTicketId)))) : undefined
  const sessionToOpen = focusedSessionId ? focusedSession : orderedSessions.find(item => !item.readonly && item.session_status === "ACTIVE" && item.lesson_status === "ACTIVE" && !item.submitted_at)
  const canOpen = Boolean(sessionToOpen && sessionToOpen.session_status === "ACTIVE" && sessionToOpen.lesson_status === "ACTIVE" && !sessionToOpen.submitted_at)
  const selectedIncident = sessionToOpen ? incidents.find(item => item.id === `${sessionToOpen.session_id}:${sessionToOpen.card_id}`) : undefined

  // Search State
  const [searchQuery, setSearchQuery] = useState("")
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false)

  // Toggle Switches (Sliding Switches)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [queueRequests, setQueueRequests] = useState(false)
  const [listCollapsed, setListCollapsed] = useState(false)

  // Rows pinned state (Закрепить карточку на экране)
  const [pinnedRows, setPinnedRows] = useState<Record<string, boolean>>({})

  // Expanded/collapsed preview state (starts collapsed as described by user: collapsed cards already display description row)
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})

  const toggleRowExpanded = (id: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  // Selected Nav Tab
  const [activeNavTab, setActiveNavTab] = useState("журнал")

  // Interactive verification state
  // Verification is a separate service workflow; the list must not invent it.
  const verifiedMap: Record<string, boolean> = {}

  // Clock in the preserved journal header.
  const [currentTime, setCurrentTime] = useState({
    hoursMinutes: "—",
    seconds: "",
    date: "",
  })
  const [liveClock, setLiveClock] = useState(true)

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur))
    }, 2500)
  }

  useEffect(() => {
    if (!liveClock) return
    const updateTime = () => {
      const now = new Date()
      const hh = String(now.getHours()).padStart(2, "0")
      const mm = String(now.getMinutes()).padStart(2, "0")
      const ss = String(now.getSeconds()).padStart(2, "0")
      setCurrentTime({
        hoursMinutes: `${hh}:${mm}`,
        seconds: `:${ss}`,
        date: now.toLocaleDateString("ru-RU", {weekday:"long",day:"numeric",month:"long",year:"numeric"}),
      })
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [liveClock])

  const togglePin = (id: string) => {
    setPinnedRows((prev) => {
      const next = !prev[id]
      showToast(next ? `Карточка ${id} закреплена на экране` : `Карточка ${id} откреплена`)
      return { ...prev, [id]: next }
    })
  }

  const toggleVerified = () => showToast("Проверка карточки недоступна в этом режиме")

  const handleResetSearch = () => {
    setSearchQuery("")
    showToast("Поиск сброшен")
  }

  const filteredIncidents = incidents.filter((item) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      item.number.toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q) ||
      item.oper.toLowerCase().includes(q) ||
      item.status.toLowerCase().includes(q) ||
      item.address.toLowerCase().includes(q) ||
      (item.description && item.description.toLowerCase().includes(q))
    )
  })

  const maxPage = Math.max(1, Math.ceil(filteredIncidents.length / 10))
  const currentPage = Math.min(page, maxPage)
  const visibleIncidents = filteredIncidents.slice((currentPage - 1) * 10, currentPage * 10)
  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [autoRefresh, load])

  // Exact 13 Navigation Items matching Screenshot 4
  const navItems = [
    { id: "журнал", label: "журнал", icon: Menu },
    { id: "экран", label: "экран", icon: Monitor },
    { id: "статистика", label: "статистика", icon: BarChart3 },
    { id: "УЕР", label: "УЕР", icon: Settings },
    { id: "БДПН", label: "БДПН", icon: FileText },
    { id: "вики", label: "вики", icon: HelpCircle },
    { id: "заявители", label: "заявители", icon: Users },
    { id: "техника", label: "техника", icon: Helicopter },
    { id: "аудит", label: "аудит", icon: Glasses },
    { id: "отчеты", label: "отчеты", icon: FileText },
    { id: "контроль", label: "контроль", icon: ClipboardCheck },
    { id: "смена", label: "смена", icon: Contact },
    { id: "регионы", label: "регионы", icon: Globe },
  ]

  return (
    <div
      className="min-h-screen w-full flex flex-col font-sans select-none text-[13px] text-gray-100"
      style={{ backgroundColor: "#838f97" }}
    >

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#2f353a] text-white text-xs px-4 py-2 rounded shadow-2xl border border-gray-600 animate-in fade-in slide-in-from-top-2 duration-150">
          {toastMessage}
        </div>
      )}

      {/* ============================================================== */}
      {/* SECTION 1: TOP HEADER (Exact 50/50 Split)                      */}
      {/* Left 50%: Search | Right 50%: Operator, Clock, Nav & Orange Btn */}
      {/* ============================================================== */}
      <div className="w-full flex flex-col md:flex-row border-b border-[#2f353a] shrink-0 h-[96px]">
        {/* Left Half (50%): Search Box (White Background in light, Card in dark) */}
        <div className="w-full md:w-1/2 bg-white dark:bg-card text-gray-900 dark:text-foreground px-6 py-2.5 flex flex-col justify-between border-b md:border-b-0 md:border-r border-gray-300 dark:border-border shrink-0">
          <div>
            <div className="text-[19px] font-normal text-gray-900 dark:text-foreground tracking-tight mb-0.5">
              Поиск происшествий
            </div>
            {/* Input with Search Icon */}
            <div className="relative flex items-center border-b border-gray-400 dark:border-border pb-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {setSearchQuery(e.target.value); setPage(1)}}
                placeholder=""
                className="w-full text-sm text-gray-800 dark:text-foreground outline-none pr-8 bg-transparent"
                aria-label="Поиск происшествий"
              />
              <button
                type="button"
                className="absolute right-0 text-gray-800 dark:text-foreground hover:text-black dark:hover:text-primary cursor-pointer p-0.5"
                title="Искать"
                onClick={() => showToast(`Поиск: ${searchQuery || "все записи"}`)}
              >
                <Search size={18} strokeWidth={2.4} />
              </button>
            </div>
          </div>

          {/* Sub-row: Advanced Search dropdown & Reset button */}
          <div className="flex items-center justify-between mt-1 text-[11px] text-gray-600 dark:text-muted-foreground">
            <button
              type="button"
              onClick={() => {
                setShowAdvancedSearch(!showAdvancedSearch)
                showToast(showAdvancedSearch ? "Скрыт расширенный поиск" : "Открыт расширенный поиск")
              }}
              className="hover:text-gray-900 dark:hover:text-foreground flex items-center gap-1 cursor-pointer"
            >
              <span>расширенный по параметрам</span>
              <ChevronDown size={13} className={`transition-transform ${showAdvancedSearch ? "rotate-180" : ""}`} />
            </button>

            <button
              type="button"
              onClick={handleResetSearch}
              className="border border-gray-400 dark:border-border rounded px-3 py-0.5 text-gray-700 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-accent hover:text-black dark:hover:text-foreground cursor-pointer text-[11px] font-medium"
            >
              сбросить
            </button>
          </div>

          {showAdvancedSearch && (
            <div className="absolute top-[96px] left-0 z-40 w-1/2 p-3 border border-gray-300 dark:border-border grid grid-cols-3 gap-2 text-xs text-gray-700 dark:text-foreground bg-white dark:bg-card shadow-xl">
              <div>
                <label className="block text-[10px] text-gray-500 dark:text-muted-foreground font-medium">Статус:</label>
                <select className="w-full border dark:border-border rounded p-1 text-xs bg-white dark:bg-background text-foreground">
                  <option>Все статусы</option>
                  <option>Отработана</option>
                  <option>Завершена</option>
                  <option>Проверена</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 dark:text-muted-foreground font-medium">АРМ / Оператор:</label>
                <input type="text" placeholder="Номер..." className="w-full border dark:border-border rounded p-1 text-xs bg-white dark:bg-background text-foreground" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 dark:text-muted-foreground font-medium">Период:</label>
                <input type="date" className="w-full border dark:border-border rounded p-1 text-xs bg-white dark:bg-background text-foreground" />
              </div>
            </div>
          )}
        </div>

        {/* Right Half (50%): Dark Panel with Operator, Nav and Full-Height Orange Button */}
        <div className="w-full md:w-1/2 flex flex-row bg-[#2f353a] shrink-0 h-full overflow-hidden">
          {/* Main Area on the Left of Orange Button: Top Row + Bottom 13-Button Nav Row */}
          <div className="flex-1 flex flex-col justify-between min-w-0 h-full">
            {/* Top Sub-Row: Date, Operator Info, Headset, Clock */}
            <div className="flex items-center justify-between px-3 h-[54px] border-b border-[#3c444a]">
              {/* Operator and Workstation Info with icons */}
              <div className="flex flex-col justify-center text-xs min-w-0 pr-2">
                <span className="text-white text-[13px] font-bold leading-tight truncate">
                  {currentTime.date || "Список происшествий"}
                </span>
                <div className="flex items-center gap-1.5 text-[11px] text-gray-300 mt-1">
                  <span className="truncate">Диспетчер ДДС</span>
                  <span className="flex items-center gap-0.5 text-gray-300 shrink-0">
                    <Monitor size={12} className="text-gray-300" />
                    <span>АРМ ДДС</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => showToast("Параметры соединения")}
                    className="text-gray-300 hover:text-white cursor-pointer ml-0.5"
                    title="Параметры"
                  >
                    <Settings size={12} />
                  </button>

                  {/* Boxed Question Mark Icon indicated by arrow in screenshot 4 */}
                  <button
                    type="button"
                    onClick={() => showToast("Справка оператора")}
                    className="border border-gray-400 rounded-[2px] p-0.5 text-gray-200 hover:text-white hover:border-white cursor-pointer flex items-center justify-center leading-none"
                    title="Справка"
                  >
                    <HelpCircle size={10} />
                  </button>

                  <button
                    type="button"
                    onClick={() => showToast("Выход из системы")}
                    className="text-gray-300 hover:text-white cursor-pointer"
                    title="Выйти"
                  >
                    <LogOut size={12} />
                  </button>
                </div>
              </div>

              {/* Headset / Break Status (Light Blue Headset) */}
              <div className="flex items-center gap-2 px-2 border-l border-r border-[#3c444a] shrink-0">
                <Headphones size={22} className="text-[#7ea6c5] shrink-0" strokeWidth={2.2} />
                <div className="flex flex-col justify-center">
                  <span className="text-[10px] text-gray-300 leading-none">Подключение</span>
                  <button
                    type="button"
                    onClick={() => showToast("Меню статуса оператора (В эфире / Перерыв)")}
                    className="mt-1 flex items-center gap-1 text-[11px] text-gray-200 border border-gray-600 rounded px-1.5 py-0.5 hover:bg-[#383f46] cursor-pointer bg-[#24292d]"
                  >
                    <span className="truncate">Перейти в перерыв</span>
                    <ChevronDown size={11} className="text-gray-400 shrink-0" />
                  </button>
                </div>
              </div>

              {/* Big Digital Clock (10:22 :52) */}
              <div
                className="flex items-baseline px-3 text-white font-sans cursor-pointer hover:opacity-90 shrink-0"
                onClick={() => setLiveClock(!liveClock)}
                title={liveClock ? "Часы реального времени (клик для фиксации)" : "Фиксированное время (клик для запуска реальных часов)"}
              >
                <span className="text-[34px] font-bold tracking-tight leading-none self-center">
                  {currentTime.hoursMinutes}
                </span>
                <span className="text-[15px] font-bold text-gray-200 self-start mt-2 ml-0.5">
                  {currentTime.seconds}
                </span>
              </div>
            </div>

            {/* Bottom Sub-Row: 13 Navigation Buttons taking 100% width up to Orange Button */}
            <div className="grid grid-cols-13 w-full h-[42px] bg-[#2f353a] overflow-hidden">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = activeNavTab === item.id
                const isJournal = item.id === "журнал"

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveNavTab(item.id)
                      showToast(`Раздел «${item.label}»`)
                    }}
                    className={`flex flex-col items-center justify-center py-0.5 border-r border-[#3c444a] transition-colors cursor-pointer w-full h-full min-w-0 overflow-hidden ${
                      isJournal
                        ? "bg-[#0077be] hover:bg-[#006bb0] text-white font-medium"
                        : isActive
                        ? "bg-[#383f46] text-white font-medium"
                        : "bg-[#2f353a] hover:bg-[#383f46] text-gray-200"
                    }`}
                    title={item.label}
                  >
                    <Icon size={14} strokeWidth={2} className="shrink-0 mb-0.5 text-white" />
                    <span className="text-[9px] 2xl:text-[9.5px] leading-none text-white whitespace-nowrap truncate px-0.5">
                      {item.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Far Right: Big Blue Action Button SPANNING FULL HEIGHT OF THE PANEL */}
          <button
            onClick={() => {
              if (canOpen && selectedIncident) router.push(selectedIncident.consoleUrl)
            }}
            disabled={loading || Boolean(error) || !canOpen}
            aria-label="Взять карточку в обработку"
            className="w-[125px] xl:w-[135px] bg-[#0077be] hover:bg-[#006bb0] text-white flex items-center justify-center text-center p-1.5 transition-colors shrink-0 shadow-inner group h-full cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Взять карточку в обработку"
          >
            <div className="w-full h-full border border-white/90 flex flex-col items-center justify-center p-1 leading-tight font-bold text-[12px] xl:text-[13px] lowercase tracking-wide">
              <span>взять</span>
              <span>карточку</span>
              <span>в обработку</span>
            </div>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* SECTION 2: SUBHEADER & CONTROLS (Список происшествий (Диспетчер ДДС) & Switches) */}
      {/* ============================================================== */}
      <div className="px-4 py-2 flex flex-wrap items-center justify-between text-white border-b border-[#2f353a]/60">
        {/* Left: Incident List Title with Collapse Icon */}
        <div
          onClick={() => setListCollapsed(!listCollapsed)}
          className="flex items-center gap-1.5 cursor-pointer font-bold text-[14.5px] hover:text-gray-200"
        >
          <span>Список происшествий</span>
          {listCollapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
        </div>

        {/* Right: Switches & Selectors */}
        <div className="flex items-center gap-4 text-xs font-normal">

          {/* Notifications */}
          <div
            onClick={() => showToast("Уведомления смены активны")}
            className="flex items-center gap-1.5 cursor-pointer text-gray-200 hover:text-white"
          >
            <span className="w-4 h-4 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[10px] font-bold">
              !
            </span>
            <span>уведомления</span>
          </div>

          {/* Switch 1: Автообновление (Interactive Sliding Switch) */}
          <div
            onClick={() => {
              const next = !autoRefresh
              setAutoRefresh(next)
              showToast(next ? "Автообновление включено" : "Автообновление выключено")
            }}
            className={`inline-flex items-center gap-2 rounded-full border px-2 py-0.5 cursor-pointer transition-colors duration-200 select-none ${
              autoRefresh
                ? "bg-[#0077be] border-white/80 text-white"
                : "bg-[#454e57] border-gray-400 text-gray-300"
            }`}
            title={autoRefresh ? "Автообновление включено (клик для выключения)" : "Автообновление выключено (клик для включения)"}
          >
            {/* Sliding Pill Knob */}
            <div className="relative w-7 h-3.5 bg-black/30 rounded-full p-0.5 flex items-center">
              <div
                className={`w-2.5 h-2.5 rounded-full bg-white shadow-xs transform transition-transform duration-200 ${
                  autoRefresh ? "translate-x-3.5" : "translate-x-0"
                }`}
              />
            </div>
            <span className="text-[11.5px] font-medium leading-none">автообновление</span>
          </div>

          {/* Switch 2: Обращения в очереди (Interactive Sliding Switch) */}
          <div
            onClick={() => {
              const next = !queueRequests
              setQueueRequests(next)
              showToast(next ? "Отображение обращений в очереди включено" : "Очередь скрыта")
            }}
            className={`inline-flex items-center gap-2 rounded-full border px-2 py-0.5 cursor-pointer transition-colors duration-200 select-none ${
              queueRequests
                ? "bg-[#0077be] border-white/80 text-white"
                : "bg-[#454e57] border-gray-400 text-gray-300"
            }`}
            title={queueRequests ? "Обращения в очереди отображаются" : "Обращения в очереди скрыты"}
          >
            {/* Sliding Pill Knob */}
            <div className="relative w-7 h-3.5 bg-black/30 rounded-full p-0.5 flex items-center">
              <div
                className={`w-2.5 h-2.5 rounded-full bg-white shadow-xs transform transition-transform duration-200 ${
                  queueRequests ? "translate-x-3.5" : "translate-x-0"
                }`}
              />
            </div>
            <span className="text-[11.5px] leading-none">обращения в очереди</span>
          </div>

          {/* Dropdown: Выберите что показать */}
          <button
            type="button"
            onClick={() => showToast("Фильтр колонок и отображения карточек")}
            className="flex items-center gap-1.5 border border-gray-400 rounded px-2.5 py-0.5 text-gray-200 hover:bg-white/10 cursor-pointer text-[11.5px]"
          >
            <span>выберите что показать</span>
            <ChevronDown size={13} />
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* SECTION 3: INCIDENT TABLE (Exact 50/50 Split Alignment)        */}
      {/* Left 50%: 11 columns up to "Тип происшествия"                  */}
      {/* Right 50%: Starts exactly at middle with "Постр.", "Статус",   */}
      {/*            "Адрес", "Проверена"                                */}
      {/* ============================================================== */}
      {loading && <div role="status" className="px-4 py-2 text-sm">Загрузка происшествий...</div>}
      {error && <div role="alert" className="px-4 py-2 text-sm text-red-100 bg-red-950/70">
        {error} <button type="button" onClick={load} className="underline ml-2">Повторить загрузку</button>
      </div>}
      {!loading && !error && focusedSessionId && !focusedSession && <div role="alert" className="px-4 py-2 text-sm text-red-100 bg-red-950/70">Выбранная карточка недоступна в вашем списке происшествий</div>}
      {!listCollapsed && (
        <div className="flex-1 overflow-x-auto w-full px-2 py-1">
          <div className="min-w-[1240px] text-xs">
            {/* Table Header Row: Divided exactly 50% / 50% */}
            <div className="flex w-full items-center text-[11px] text-gray-200 font-medium px-1 py-1.5 border-b border-[#2f353a]/70">
              {/* Left 50% Columns (Starts at 0% to 50%) */}
              <div className="w-1/2 flex items-center shrink-0">
                <div className="w-[28px] shrink-0" />
                <div className="w-[36px] shrink-0 text-center" title="Наличие связанных карточек">Связи</div>
                <div className="w-[30px] shrink-0 flex justify-center" title="Закрепить карточку на экране">
                  <Bookmark size={15} className="text-gray-300" />
                </div>
                <div className="w-[30px] shrink-0 flex justify-center" title="Важное происшествие (ЧС)">ЧС</div>
                <div className="w-[30px] shrink-0 flex justify-center" title="Таймер карточки">
                  <Clock size={15} className="text-gray-300" />
                </div>
                <div className="w-[48px] shrink-0 text-center" title="№ оператора Службы 112">Опер.</div>
                <div className="w-[44px] shrink-0 text-center" title="№ АРМ в Службе 112">АРМ</div>
                <div className="w-[84px] shrink-0 text-center" title="№ Карточки происшествия">Номер</div>
                <div className="w-[72px] shrink-0 flex items-center justify-center gap-0.5" title="Дата создания карточки">
                  <span>Дата</span>
                  <span className="text-[10px]">↓</span>
                </div>
                <div className="w-[72px] shrink-0 text-center" title="Время создания карточки">Время</div>
                <div className="flex-1 min-w-0 pl-2.5" title="Тип происшествия">Тип происшествия</div>
              </div>

              {/* Right 50% Columns (Starts exactly at the 50% vertical line!) */}
              <div className="w-1/2 flex items-center shrink-0">
                <div className="w-[50px] shrink-0 text-center" title="Наличие пострадавших">Постр.</div>
                <div className="w-[110px] shrink-0 pl-2" title="Статус карточки">Статус</div>
                <div className="flex-1 min-w-0 pl-2.5" title="Адрес происшествия">Адрес</div>
                <div className="w-[72px] shrink-0 text-center" title="Проверка карточки">Проверена</div>
              </div>
            </div>

            {/* Table Body Rows */}
            <div className="flex flex-col gap-2 mt-1.5">
              {filteredIncidents.length === 0 ? (
                <div className="p-8 text-center text-gray-300 bg-[#49555d] rounded">
                  {loading ? "Загрузка..." : error ? "Список недоступен" : searchQuery.trim() ? "По вашему запросу не найдено ни одного происшествия." : "Нет доступных карточек происшествий"}
                </div>
              ) : (
                visibleIncidents.map((incident) => {
                  const isPinned = !!pinnedRows[incident.id]
                  const isVerified = !!verifiedMap[incident.id]
                  const isExpanded = !!expandedRows[incident.id]

                  return (
                    <div
                      key={incident.id}
                      className={`flex flex-col bg-[#49555d] hover:bg-[#525f69] transition-colors rounded-[2px] border overflow-hidden shadow-xs ${incident.id === selectedIncident?.id ? "border-[#54b9ec]" : "border-[#3d474e]/50"}`}
                    >
                      {/* Main Incident Row (Exactly 50% / 50% Split) */}
                      <div className="flex w-full items-stretch text-[12px] text-gray-100 divide-x divide-[#3d474e] min-h-[30px]">
                        {/* Left 50% Group (All 11 Left Columns) */}
                        <div className="w-1/2 flex items-stretch divide-x divide-[#3d474e] shrink-0">
                          {/* 1. Expander Chevron */}
                          <div
                            onClick={() => toggleRowExpanded(incident.id)}
                            className="w-[28px] shrink-0 flex items-center justify-center cursor-pointer text-gray-300 hover:text-white"
                            title={isExpanded ? "Свернуть предпросмотр карточки" : "Открывает предпросмотр карточки"}
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>

                          {/* 2. Связи (Наличие связанных карточек - Розово-малиновый бейдж #6c364b) */}
                          <div className="w-[36px] shrink-0 flex items-center justify-center">
                            {incident.hasLink ? (
                              <div
                                onClick={() => showToast(`Связи карточки №${incident.number}: найдено 2 дубликата`)}
                                className="bg-[#6c364b] hover:bg-[#7e3f57] text-white p-1 rounded-xs cursor-pointer flex items-center justify-center shadow-xs"
                                title="Имеются связанные карточки"
                              >
                                <Paperclip size={15} className="rotate-45" />
                              </div>
                            ) : (
                              <span className="text-transparent">-</span>
                            )}
                          </div>

                          {/* 3. Закрепить карточку на экране (Bookmark Ribbon) */}
                          <div
                            onClick={() => togglePin(incident.id)}
                            className="w-[30px] shrink-0 flex items-center justify-center cursor-pointer text-gray-300 hover:text-amber-400"
                            title={isPinned ? "Карточка закреплена на экране (клик для открепления)" : "Закрепить карточку на экране"}
                          >
                            <Bookmark
                              size={16}
                              className={isPinned ? "fill-gray-200 text-white" : "text-gray-400"}
                            />
                          </div>

                          {/* 4. ЧС (Молния) */}
                          <div
                            onClick={() => showToast("Важное происшествие (устанавливается Службой 112)")}
                            className="w-[30px] shrink-0 flex items-center justify-center text-gray-300 hover:text-amber-400 cursor-pointer"
                            title="Важное происшествие"
                          >
                            <Zap size={16} />
                          </div>

                          {/* 5. Таймер (Секундомер/Часы) */}
                          <div
                            onClick={() => showToast(`Таймер карточки №${incident.number}`)}
                            className="w-[30px] shrink-0 flex items-center justify-center text-gray-300 hover:text-blue-300 cursor-pointer"
                            title="Таймер карточки"
                          >
                            <Clock size={16} />
                          </div>

                          {/* 6. № оператора */}
                          <div className="w-[48px] shrink-0 flex items-center justify-center font-mono text-gray-200">
                            {incident.oper}
                          </div>

                          {/* 7. № АРМ */}
                          <div className="w-[44px] shrink-0 flex items-center justify-center font-mono text-gray-200">
                            {incident.arm}
                          </div>

                          {/* 8. № Карточки происшествия */}
                          <div className="w-[84px] shrink-0 flex items-center justify-center font-mono font-medium text-gray-100">
                            <Link
                              href={incident.consoleUrl}
                              className="block max-w-full truncate hover:underline hover:text-blue-300"
                              title={`Открыть карточку происшествия №${incident.number}`}
                            >
                              {incident.number}
                            </Link>
                          </div>

                          {/* 9. Дата создания карточки */}
                          <div className="w-[72px] shrink-0 flex items-center justify-center text-gray-300 font-mono">
                            {incident.date}
                          </div>

                          {/* 10. Время создания карточки (Акцент #2f353a, формат времени) */}
                          <div
                            className="w-[72px] shrink-0 flex items-center justify-center text-white font-mono px-1"
                            style={{ backgroundColor: "#2f353a" }}
                            title="Время создания карточки"
                          >
                            {renderFormattedTime(incident.time)}
                          </div>

                          {/* 11. Тип происшествия (Акцент #2f353a) */}
                          <div
                            className="flex-1 min-w-0 px-2.5 py-1.5 flex items-center font-bold text-white truncate"
                            style={{ backgroundColor: "#2f353a" }}
                            title={incident.type}
                          >
                            {incident.type}
                          </div>
                        </div>

                        {/* Right 50% Group (Starts exactly at middle 50% with Постр.!) */}
                        <div className="w-1/2 flex items-stretch divide-x divide-[#3d474e] shrink-0">
                          {/* 12. Наличие пострадавших */}
                          <div className="w-[50px] shrink-0 flex items-center justify-center text-gray-300">
                            {incident.injured}
                          </div>

                          {/* 13. Статус карточки */}
                          <div className="w-[110px] shrink-0 px-2 py-1.5 flex items-center text-gray-200 truncate">
                            {incident.status}
                          </div>

                          {/* 14. Адрес происшествия (Акцент #2f353a) */}
                          <div
                            className="flex-1 min-w-0 px-2.5 py-1.5 flex items-center text-white truncate font-normal"
                            style={{ backgroundColor: "#2f353a" }}
                            title={incident.address || ""}
                          >
                            {incident.address || ""}
                          </div>

                          {/* 15. Планшет для бумаг (второй столбец справа) */}
                          <div className="w-[36px] shrink-0 flex items-center justify-center">
                            <button
                              type="button"
                              onClick={() => router.push(incident.consoleUrl)}
                              className="text-gray-300 hover:text-white cursor-pointer p-0.5 transition-colors"
                              title="Планшет карточки"
                            >
                              <ClipboardList size={18} />
                            </button>
                          </div>

                          {/* 16. Проверена (первый столбец справа) */}
                          <div className="w-[36px] shrink-0 flex items-center justify-center">
                            <button
                              type="button"
                              onClick={() => toggleVerified()}
                              disabled
                              className="cursor-pointer p-0.5"
                              title={isVerified ? "Карточка проверена" : "Отметить карточку как проверенную"}
                            >
                              <CheckCircle2
                                size={19}
                                className={isVerified ? "text-white fill-transparent" : "text-gray-400"}
                              />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Description Subrow: Fastened together with top row in collapsed & expanded state */}
                      {incident.description && (
                        <div
                          className="border-t border-[#3d474e]/60 text-[11.5px] px-8 py-1.5 flex items-center text-gray-200"
                          style={{ backgroundColor: "#49555d" }}
                        >
                          <span className="font-semibold text-gray-300 mr-4 shrink-0">Описание:</span>
                          <span className="font-sans text-white">{incident.description}</span>
                        </div>
                      )}

                      {/* Rich Preview Details (Opened when chevron is clicked) */}
                      {isExpanded && incident.preview && (
                        <div className="flex flex-col text-[11.5px] border-t border-[#3d474e]/60 divide-y divide-[#3d474e]/50">
                          {/* 1. Службы: Список оповещения */}
                          {incident.preview.services && incident.preview.services.length > 0 && (
                            <div className="flex items-center px-4 py-1.5 text-gray-300" style={{ backgroundColor: "#49555d" }}>
                              <span className="w-[84px] shrink-0 text-gray-400 font-medium">Службы:</span>
                              <div className="flex-1 flex items-center flex-wrap gap-x-3 gap-y-1">
                                {incident.preview.services.map((srv, idx) => (
                                  <span key={idx} className="inline-flex items-center gap-1.5">
                                    <strong className="text-white font-bold">{srv.name}</strong>
                                    <span className="text-gray-400">—</span>
                                    <span className="font-mono text-gray-200">{srv.time}</span>
                                    <span className="text-gray-300">{srv.status}</span>
                                    {idx < (incident.preview?.services?.length ?? 0) - 1 && (
                                      <span className="text-gray-500 mr-1">,</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 2. Заявитель: Информация о заявителе */}
                          {incident.preview.applicant && (
                            <div className="flex items-center px-4 py-1.5 text-gray-300" style={{ backgroundColor: "#49555d" }}>
                              <span className="w-[84px] shrink-0 text-gray-400 font-medium">Заявитель:</span>
                              <div className="flex-1 flex items-center flex-wrap gap-x-3 gap-y-1">
                                <strong className="text-white font-bold">{incident.preview.applicant.name}</strong>
                                <div className="flex items-center gap-1 whitespace-nowrap">
                                  <span className="text-gray-400 text-[11px]">АОН</span>
                                  <span className="font-mono text-gray-200">{incident.preview.applicant.aon}</span>
                                </div>
                                <div className="flex items-center gap-1 whitespace-nowrap">
                                  <span className="text-gray-400 text-[11px]">предоставленный телефон</span>
                                  <span className="font-mono text-gray-200">{incident.preview.applicant.phone}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-gray-400 text-[11px]">Канал связи:</span>
                                  <strong className="text-white font-bold">{incident.preview.applicant.carrier}</strong>
                                </div>
                              </div>
                              {/* Right side: Создание XX:XX:XX */}
                              {incident.preview.applicant.creationTime && (
                                <div className="shrink-0 flex items-center gap-2 pl-4 text-xs">
                                  <span className="text-gray-400">Создание</span>
                                  <span className="font-bold text-white font-mono">{incident.preview.applicant.creationTime}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* 3. Информация: Признаки происшествия */}
                          {incident.preview.info && (
                            <div className="flex items-center px-4 py-1.5 text-gray-300" style={{ backgroundColor: "#49555d" }}>
                              <span className="w-[84px] shrink-0 text-gray-400 font-medium">Информация:</span>
                              <span className="flex-1 text-gray-100 font-sans">{incident.preview.info}</span>
                            </div>
                          )}

                          {/* 4. Отработки: Звонки оператора Службы 112 */}
                          {incident.preview.actions && (
                            <div className="flex items-center px-4 py-1.5 text-gray-300" style={{ backgroundColor: "#49555d" }}>
                              <span className="w-[84px] shrink-0 text-gray-400 font-medium">Отработки:</span>
                              <span className="flex-1 text-gray-200 font-mono text-[11px]">{incident.preview.actions}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SECTION 4: TABLE FOOTER (Select Group & Pagination)           */}
      {/* ============================================================== */}
      <div className="px-4 py-3 flex flex-wrap items-center justify-between text-xs text-gray-200 border-t border-[#2f353a]/60 mt-auto shrink-0">
        {/* Left: Button "выберите группу" */}
        <button
          type="button"
          onClick={() => showToast("Группировка: Все происшествия смены")}
          className="border border-gray-400 rounded px-2.5 py-1 text-gray-200 hover:bg-white/10 cursor-pointer flex items-center gap-1.5 text-[11.5px]"
        >
          <span>выберите группу</span>
          <ChevronDown size={13} />
        </button>

        {/* Right: Pagination */}
        <div className="flex items-center gap-3 text-[11.5px]">
          {/* Page selector */}
          <div className="flex items-center gap-1">
            <span>Страница:</span>
            <button
              type="button"
              onClick={() => showToast("Выбор страницы")}
              className="border border-gray-400 rounded px-1.5 py-0.5 flex items-center gap-1 hover:bg-white/10 cursor-pointer"
            >
              <span>{currentPage}</span>
              <ChevronDown size={11} />
            </button>
          </div>

          {/* Records per page */}
          <div className="flex items-center gap-1">
            <span>Записей на странице:</span>
            <button
              type="button"
              onClick={() => showToast("Количество записей: 10")}
              className="border border-gray-400 rounded px-1.5 py-0.5 flex items-center gap-1 hover:bg-white/10 cursor-pointer"
            >
              <span>10</span>
              <ChevronDown size={11} />
            </button>
          </div>

          {/* Total range */}
          <span className="text-gray-300">{filteredIncidents.length ? (currentPage - 1) * 10 + 1 : 0}-{Math.min(currentPage * 10, filteredIncidents.length)} из {filteredIncidents.length}</span>

          {/* Arrows */}
          <div className="flex items-center gap-1 ml-1">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="text-gray-400 hover:text-white cursor-pointer p-0.5"
              title="Предыдущая"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setPage(Math.min(maxPage, currentPage + 1))}
              disabled={currentPage === maxPage}
              className="text-gray-400 hover:text-white cursor-pointer p-0.5"
              title="Следующая"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DdsJournalRouter() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const query = searchParams?.toString() || ""
  const hasCard = Boolean(searchParams?.get("session_id") || searchParams?.get("ticket_id"))
  useEffect(() => {
    if (hasCard) router.replace(`/dds?${query}`)
  }, [hasCard, query, router])
  // Old links are aliases to the workplace; no intermediate card screen is mounted.
  return hasCard ? null : <DdsJournalContent />
}

export default function DdsJournalPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">Загрузка журнала ДДС...</div>}>
      <DdsJournalRouter />
    </Suspense>
  )
}
