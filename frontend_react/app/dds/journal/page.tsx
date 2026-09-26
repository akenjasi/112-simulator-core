"use client"

import React, { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
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
  status: "Отработана" | "Завершена" | "Проверена" | "Зарегистрирована"
  address: string
  hasLink?: boolean
  isPinned?: boolean
  verified?: boolean
  description?: string
  preview?: IncidentPreview
}

const INITIAL_INCIDENTS: IncidentItem[] = [
  // Строка 1: 10:21:42 - Ошибочно набран номер (с описанием)
  {
    id: "38260204",
    number: "38260204",
    date: "17.02.25",
    time: "10:21:42",
    type: "Ошибочно набран номер",
    oper: "951",
    arm: "207",
    injured: "Нет",
    status: "Отработана",
    address: "",
    verified: true,
    description: "17.02.2025 10:21:50 Опер. 951 Захватов А. В. - нет ответа",
    preview: {
      services: [
        { name: "Служба 102", time: "10:21:45", status: "Получена службой" },
      ],
      applicant: {
        name: "Иванов Сергей Петрович",
        aon: "+7(926)543-21-00",
        phone: "+7(926)543-21-00",
        carrier: "МТС",
        creationTime: "00:00:42",
      },
      info: "Ошибочно набран номер. Разговор не состоялся.",
      actions: "Оп. 951 в 10:21:50 > Заявителю > +7(926)543-21-00",
    },
  },
  // Строка 2: 10:21:34 - Ошибочно набран номер (без описания)
  {
    id: "38260202",
    number: "38260202",
    date: "17.02.25",
    time: "10:21:34",
    type: "Ошибочно набран номер",
    oper: "677",
    arm: "223",
    injured: "Нет",
    status: "Завершена",
    address: "",
    verified: true,
    preview: {
      services: [
        { name: "Служба 102", time: "10:21:35", status: "Получена службой" },
      ],
      applicant: {
        name: "Смирнова Елена Васильевна",
        aon: "+7(915)321-45-67",
        phone: "+7(915)321-45-67",
        carrier: "Билайн",
        creationTime: "00:00:35",
      },
      info: "Сброс вызова абонентом.",
      actions: "Оп. 677 в 10:21:38 > Заявителю > +7(915)321-45-67",
    },
  },
  // Строка 3: 10:21:26 - Ошибочно набран номер (без описания)
  {
    id: "38260201",
    number: "38260201",
    date: "17.02.25",
    time: "10:21:26",
    type: "Ошибочно набран номер",
    oper: "377",
    arm: "230",
    injured: "Нет",
    status: "Завершена",
    address: "",
    verified: true,
    preview: {
      services: [
        { name: "Служба 102", time: "10:21:28", status: "Получена службой" },
      ],
      applicant: {
        name: "Кузнецов Андрей Викторович",
        aon: "+7(903)789-01-23",
        phone: "+7(903)789-01-23",
        carrier: "Мегафон",
        creationTime: "00:00:28",
      },
      info: "Детская шалость / ошибочный набор номера.",
      actions: "Оп. 377 в 10:21:30 > Заявителю > +7(903)789-01-23",
    },
  },
  // Строка 4: 10:21:15 - Справка-103 (с описанием)
  {
    id: "38260199",
    number: "38260199",
    date: "17.02.25",
    time: "10:21:15",
    type: "Справка-103",
    oper: "248",
    arm: "447",
    injured: "Нет",
    status: "Отработана",
    address: "",
    verified: true,
    description: "17.02.2025 10:21:44 Опер. 248 Черникова А. С. - Вызов врача /пред тел 122",
    preview: {
      services: [
        { name: "Служба 103", time: "10:21:20", status: "Получена службой" },
      ],
      applicant: {
        name: "Черникова Анна Сергеевна",
        aon: "+7(916)445-56-78",
        phone: "+7(916)445-56-78",
        carrier: "МТС",
        creationTime: "00:01:12",
      },
      info: "Вызов врача из поликлиники на дом. 03 не требуется. Предоставлен телефон 122.",
      actions: "Оп. 248 в 10:21:44 > Заявителю > +7(916)445-56-78",
    },
  },
  // Строка 5: 10:21:09 - Справка-103 (с описанием)
  {
    id: "38260198",
    number: "38260198",
    date: "17.02.25",
    time: "10:21:09",
    type: "Справка-103",
    oper: "528",
    arm: "204",
    injured: "Нет",
    status: "Отработана",
    address: "",
    verified: true,
    description: "17.02.2025 10:21:37 Опер. 528 Чубарова Ю. А. - вызов из полик/03 не треб//пред 122",
    preview: {
      services: [
        { name: "Служба 103", time: "10:21:12", status: "Получена службой" },
      ],
      applicant: {
        name: "Чубарова Юлия Алексеевна",
        aon: "+7(925)678-90-12",
        phone: "+7(925)678-90-12",
        carrier: "Теле2",
        creationTime: "00:00:54",
      },
      info: "Вызов из поликлиники. 03 не требуется. Предоставлен телефон 122.",
      actions: "Оп. 528 в 10:21:37 > Заявителю > +7(925)678-90-12",
    },
  },
  // Строка 6: 10:21:08 - Справка-103 (с описанием и адресом Москва , (ЦАО, Тверской район))
  {
    id: "38260197",
    number: "38260197",
    date: "17.02.25",
    time: "10:21:08",
    type: "Справка-103",
    oper: "816",
    arm: "209",
    injured: "Нет",
    status: "Проверена",
    address: "Москва , (ЦАО, Тверской район)",
    verified: true,
    description: "17.02.2025 10:21:36 Опер. 816 Шмытько П. М. - 103 не треб// врач из поликлиники// пред тел 122",
    preview: {
      services: [
        { name: "Служба 103", time: "10:21:10", status: "Получена службой" },
        { name: "УВД ЦАО", time: "10:21:25", status: "Получена службой" },
      ],
      applicant: {
        name: "Шмытько Павел Михайлович",
        aon: "+7(916)998-77-66",
        phone: "+7(916)998-77-66",
        carrier: "МТС",
        creationTime: "00:01:05",
      },
      info: "103 не треб// врач из поликлиники// пред тел 122",
      actions: "Оп. 816 в 10:21:36 > Заявителю > +7(916)998-77-66",
    },
  },
  // Строка 7: 10:21:05 - Справка-103 (с описанием)
  {
    id: "38260195",
    number: "38260195",
    date: "17.02.25",
    time: "10:21:05",
    type: "Справка-103",
    oper: "736",
    arm: "206",
    injured: "Нет",
    status: "Отработана",
    address: "",
    verified: true,
    description: "17.02.2025 10:21:17 Опер. 736 Кретинин А. И. - врач из пол-ки/ эос не треб / пред тел 122",
    preview: {
      services: [
        { name: "Служба 103", time: "10:21:07", status: "Получена службой" },
      ],
      applicant: {
        name: "Кретинин Александр Игоревич",
        aon: "+7(985)222-33-44",
        phone: "+7(985)222-33-44",
        carrier: "Мегафон",
        creationTime: "00:00:48",
      },
      info: "Врач из пол-ки/ эос не треб / пред тел 122",
      actions: "Оп. 736 в 10:21:17 > Заявителю > +7(985)222-33-44",
    },
  },
  // Строка 8: 10:20:51 - Дополнительный звонок от заявителя (ДТП / розовая скрепка связи)
  {
    id: "38260193",
    number: "38260193",
    date: "17.02.25",
    time: "10:20:51",
    type: "Дополнительный звонок от заявителя",
    oper: "776",
    arm: "208",
    injured: "Нет",
    status: "Отработана",
    address: "",
    hasLink: true,
    verified: true,
    preview: {
      services: [
        { name: "Служба 102", time: "10:48:38", status: "Получена службой" },
        { name: "ЦОДД", time: "10:49:05", status: "Начало реагирования" },
      ],
      applicant: {
        name: "Александр Александрович",
        aon: "+7(926)123-45-67",
        phone: "+7(926)123-45-67",
        carrier: "МТС",
        creationTime: "00:00:59",
      },
      info: "Разлив топлива: Нет. Легковой транспорт. Нет пострадавших. ТС: Kia Rio А123ВС777 .. Кол-во а/м: 2. Нет пострадавших",
      actions: "Оп. 900 в 10:47:44 > Заявителю > +7(926)123-45-67",
    },
  },
  // Строка 9: 10:20:46 - Справка-103 (с описанием)
  {
    id: "38260192",
    number: "38260192",
    date: "17.02.25",
    time: "10:20:46",
    type: "Справка-103",
    oper: "283",
    arm: "438",
    injured: "Нет",
    status: "Завершена",
    address: "",
    verified: true,
    description: "17.02.2025 10:21:09 Опер. 283 Ключникова Ю. В. - врач на дом /122",
    preview: {
      services: [
        { name: "Служба 103", time: "10:20:48", status: "Получена службой" },
      ],
      applicant: {
        name: "Ключникова Юлия Владимировна",
        aon: "+7(909)555-66-77",
        phone: "+7(909)555-66-77",
        carrier: "Билайн",
        creationTime: "00:00:41",
      },
      info: "Врач на дом /122. Вызов участкового педиатра.",
      actions: "Оп. 283 в 10:21:09 > Заявителю > +7(909)555-66-77",
    },
  },
  // Строка 10: 10:20:43 - Справка-103 (с описанием)
  {
    id: "38260191",
    number: "38260191",
    date: "17.02.25",
    time: "10:20:43",
    type: "Справка-103",
    oper: "682",
    arm: "205",
    injured: "Нет",
    status: "Отработана",
    address: "",
    verified: true,
    description: "17.02.2025 10:21:32 Опер. 682 Чубаров В. Д. - врач из пол-ки/ эос не треб / пред тел 122",
    preview: {
      services: [
        { name: "Служба 103", time: "10:20:45", status: "Получена службой" },
      ],
      applicant: {
        name: "Чубаров Виктор Дмитриевич",
        aon: "+7(917)888-99-00",
        phone: "+7(917)888-99-00",
        carrier: "МТС",
        creationTime: "00:00:52",
      },
      info: "Врач из пол-ки/ эос не треб / пред тел 122",
      actions: "Оп. 682 в 10:21:32 > Заявителю > +7(917)888-99-00",
    },
  },
]

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
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams?.get("session_id")
  const ticketId = searchParams?.get("ticket_id")

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
  const [verifiedMap, setVerifiedMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    INITIAL_INCIDENTS.forEach((item) => {
      initial[item.id] = !!item.verified
    })
    return initial
  })

  // Time state (defaults to screenshot 10:22:52)
  const [currentTime, setCurrentTime] = useState({
    hoursMinutes: "10:22",
    seconds: ":52",
  })
  const [liveClock, setLiveClock] = useState(false)

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

  const toggleVerified = (id: string) => {
    setVerifiedMap((prev) => {
      const next = !prev[id]
      showToast(next ? `Карточка ${id} проверена` : `Отметка проверки снята`)
      return { ...prev, [id]: next }
    })
  }

  const handleDeleteRow = (number: string) => {
    showToast(`Карточка №${number} перемещена в архив`)
  }

  const handleResetSearch = () => {
    setSearchQuery("")
    showToast("Поиск сброшен")
  }

  const filteredIncidents = INITIAL_INCIDENTS.filter((item) => {
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
        {/* Left Half (50%): Search Box (White Background) */}
        <div className="w-full md:w-1/2 bg-white text-gray-900 px-6 py-2.5 flex flex-col justify-between border-b md:border-b-0 md:border-r border-gray-300 shrink-0">
          <div>
            <div className="text-[19px] font-normal text-gray-900 tracking-tight mb-0.5">
              Поиск происшествий
            </div>
            {/* Input with Search Icon */}
            <div className="relative flex items-center border-b border-gray-400 pb-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder=""
                className="w-full text-sm text-gray-800 outline-none pr-8 bg-transparent"
                aria-label="Поиск происшествий"
              />
              <button
                type="button"
                className="absolute right-0 text-gray-800 hover:text-black cursor-pointer p-0.5"
                title="Искать"
                onClick={() => showToast(`Поиск: ${searchQuery || "все записи"}`)}
              >
                <Search size={18} strokeWidth={2.4} />
              </button>
            </div>
          </div>

          {/* Sub-row: Advanced Search dropdown & Reset button */}
          <div className="flex items-center justify-between mt-1 text-[11px] text-gray-600">
            <button
              type="button"
              onClick={() => {
                setShowAdvancedSearch(!showAdvancedSearch)
                showToast(showAdvancedSearch ? "Скрыт расширенный поиск" : "Открыт расширенный поиск")
              }}
              className="hover:text-gray-900 flex items-center gap-1 cursor-pointer"
            >
              <span>расширенный по параметрам</span>
              <ChevronDown size={13} className={`transition-transform ${showAdvancedSearch ? "rotate-180" : ""}`} />
            </button>

            <button
              type="button"
              onClick={handleResetSearch}
              className="border border-gray-400 rounded px-3 py-0.5 text-gray-700 hover:bg-gray-100 hover:text-black cursor-pointer text-[11px] font-medium"
            >
              сбросить
            </button>
          </div>

          {showAdvancedSearch && (
            <div className="absolute top-[96px] left-0 z-40 w-1/2 p-3 border border-gray-300 grid grid-cols-3 gap-2 text-xs text-gray-700 bg-white shadow-xl">
              <div>
                <label className="block text-[10px] text-gray-500 font-medium">Статус:</label>
                <select className="w-full border rounded p-1 text-xs bg-white">
                  <option>Все статусы</option>
                  <option>Отработана</option>
                  <option>Завершена</option>
                  <option>Проверена</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 font-medium">АРМ / Оператор:</label>
                <input type="text" placeholder="Номер..." className="w-full border rounded p-1 text-xs bg-white" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 font-medium">Период:</label>
                <input type="date" defaultValue="2025-02-17" className="w-full border rounded p-1 text-xs bg-white" />
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
                  Понедельник, 17 Февраль 2025
                </span>
                <div className="flex items-center gap-1.5 text-[11px] text-gray-300 mt-1">
                  <span className="truncate">оп. 227 , Глущенко О И</span>
                  <span className="flex items-center gap-0.5 text-gray-300 shrink-0">
                    <Monitor size={12} className="text-gray-300" />
                    <span>АРМ 007</span>
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
              if (sessionId && ticketId) {
                router.push(`/dds?session_id=${sessionId}&ticket_id=${ticketId}`)
              } else {
                router.push("/dds")
              }
            }}
            aria-label="Взять карточку в обработку"
            className="w-[125px] xl:w-[135px] bg-[#0077be] hover:bg-[#006bb0] text-white flex items-center justify-center text-center p-1.5 transition-colors shrink-0 shadow-inner group h-full cursor-pointer"
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
          <span>Список происшествий (Диспетчер ДДС)</span>
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
                  По вашему запросу не найдено ни одного происшествия.
                </div>
              ) : (
                filteredIncidents.map((incident) => {
                  const isPinned = !!pinnedRows[incident.id]
                  const isVerified = !!verifiedMap[incident.id]
                  const isExpanded = !!expandedRows[incident.id]

                  return (
                    <div
                      key={incident.id}
                      className="flex flex-col bg-[#49555d] hover:bg-[#525f69] transition-colors rounded-[2px] border border-[#3d474e]/50 overflow-hidden shadow-xs"
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
                              href={`/operator?ticket_id=${incident.number}`}
                              className="hover:underline hover:text-blue-300"
                              title="Открыть карточку происшествия"
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
                              onClick={() => showToast(`Бланк / планшет карточки №${incident.number}`)}
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
                              onClick={() => toggleVerified(incident.id)}
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
                                <div className="flex items-center gap-1">
                                  <span className="text-gray-400 text-[11px]">АОН</span>
                                  <span className="font-mono text-gray-200">{incident.preview.applicant.aon}</span>
                                </div>
                                <div className="flex items-center gap-1">
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
              <span>1</span>
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
          <span className="text-gray-300">1-10 из 23030</span>

          {/* Arrows */}
          <div className="flex items-center gap-1 ml-1">
            <button
              type="button"
              onClick={() => showToast("Предыдущая страница")}
              className="text-gray-400 hover:text-white cursor-pointer p-0.5"
              title="Предыдущая"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => showToast("Следующая страница")}
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

export default function DdsJournalPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">Загрузка журнала ДДС...</div>}>
      <DdsJournalContent />
    </Suspense>
  )
}
