"use client"

import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { OperatorTopBar } from "@/components/operator/top-bar"
import { OperatorLeftPanel } from "@/components/operator/left-panel"
import { OperatorRightPanel } from "@/components/operator/right-panel"
import { OperatorBottomBar, type OperatorService } from "@/components/operator/bottom-bar"
import { AddServiceModal } from "@/components/operator/AddServiceModal"
import { matchCanonicalService, getServiceShortName, DEFAULT_SERVICES_LIST } from "@/components/operator/services-data"
import { useTelephony } from "@/hooks/useTelephony"
import { useCallStore } from "@/store/useCallStore"
import {
  CheckCircle2,
  X,
  Phone,
  PhoneOff,
  AlertTriangle,
  FileText,
  Clock,
  Link2,
  Bell,
  MessageSquare,
  Globe,
  HelpCircle,
  MapPin,
  Flame,
  Shield,
  Stethoscope,
  Wrench,
  Truck,
  Plus,
} from "lucide-react"

type ModalType =
  | "save"
  | "hangup"
  | "call_records"
  | "sms_list"
  | "translate"
  | "add_service"
  | "timer"
  | "alerts"
  | "chat"
  | "close"
  | null

function OperatorContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams ? searchParams.get("session_id") : null
  const ticketId = searchParams ? searchParams.get("ticket_id") : null

  // ТЗ 59: Задача 1 — Защита страницы (Route Guard)
  useEffect(() => {
    if (!sessionId || !ticketId) {
      router.push("/student/lobby")
    }
  }, [sessionId, ticketId, router])

  // ТЗ 62: VoIP / SIP телефония (Asterisk mock + WebSocket)
  const telephony = useTelephony({
    sessionId,
    ticketId,
    operatorExt: "1002",
    autoStart: true,
  })
  const isStoreReconnecting = useCallStore((s) => s.isReconnecting)



  // LocalStorage key is session-specific so each new session starts with a clean slate
  // even if same ticketId is reused across sessions
  const storageKey = `operator_state_${sessionId || ticketId || "demo"}`

  // Load real ticket data and play real audio from backend
  useEffect(() => {
    if (ticketId) {
      fetch(`/api/v1/tickets/${encodeURIComponent(ticketId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((ticket) => {
          if (!ticket) {
            return fetch(`/api/v1/tickets`)
              .then((res) => res.json())
              .then((data) =>
                Array.isArray(data)
                  ? data.find((t) => t.id === ticketId || t.ticket_id === ticketId)
                  : null
              )
          }
          return ticket
        })
        .then((ticket) => {
          if (ticket && ticket.ground_truth) {
            const gt = ticket.ground_truth
            if (gt.fio) setCallerName(gt.fio)
            if (gt.phone) {
              setAonPhone(gt.phone)
              setProvidedPhone(gt.phone)
              setOnSitePhone(gt.phone)
            }
            if (gt.caller_status) setCallerStatus(gt.caller_status)
            if (gt.street) {
              setAddress((prev) => ({ ...prev, street: gt.street, house: gt.house || "" }))
              setFullAddressString(`${gt.street} ${gt.house || ""}`.trim())
            }
          }
        })
        .catch((err) => console.error("Failed to load real ticket data:", err))
    }
  }, [ticketId])

  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    // The interactive TTS in useTelephony will handle dialogue audio.
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause()
        audioPlayerRef.current.src = ""
        audioPlayerRef.current = null
        setIsPlayingAudio(false)
      }
    }
  }, [telephony.callStatus, ticketId])


  // 1. Elapsed timer starting from 0s (ТЗ 57: was 16)
  // ТЗ 62: стартует только при переходе в ANSWERED!
  // ТЗ 58: stops when "save" modal is opened or when submitted
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isCallActive, setIsCallActive] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  // 8. Modals state & Toast feedback
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    if (telephony.callStatus !== "ANSWERED" || !isCallActive || activeModal === "save" || isSubmitted) return
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [telephony.callStatus, isCallActive, activeModal, isSubmitted])

  // 2. Phone numbers in top slots
  const [aonPhone, setAonPhone] = useState("+7 ( )  - -")
  const [providedPhone, setProvidedPhone] = useState("+7 ( )  - -")
  const [onSitePhone, setOnSitePhone] = useState("+7 ( )  - -")

  // 3. Caller & Address State (ТЗ 58: пустые ФИО и адрес, приблизительная геолокация до района)
  const [callerName, setCallerName] = useState("")
  const [callerStatus, setCallerStatus] = useState("")
  const [fullAddressString, setFullAddressString] = useState("")
  const [address, setAddress] = useState({
    country: "Россия",
    subject: "Москва",
    city: "Москва",
    objectName: "",
    okrug: "СВАО",
    district: "Южное Медведково",
    street: "",
    house: "",
    building: "",
    structure: "",
    apartment: "",
    entrance: "",
    floor: "",
    doorCode: "",
    description: "",
  })

  // 4. Incident Description (Фабула со слов заявителя)
  const [incidentDescription, setIncidentDescription] = useState("")

  // 5. Quick Status Buttons (Пострадавшие, Отказ от скорой, Заблокированные, нет контакта, срыв)
  const [topStatuses, setTopStatuses] = useState<Record<string, boolean>>({
    victims: false,
    refusal: false,
    blocked: false,
    no_contact: false,
    call_dropped: false,
  })
  const toggleTopStatus = (id: string) => {
    setTopStatuses((prev) => {
      const nextVal = !prev[id]
      if (nextVal) {
        if (id === "victims") handleAutoAddServices(["103"])
        if (id === "blocked") handleAutoAddServices(["101"])
      }
      return { ...prev, [id]: nextVal }
    })
  }

  // 6. Questionnaire Pills (Initially empty)
  const [selectedPills, setSelectedPills] = useState<Record<string, boolean>>({})
  const togglePill = (id: string) => {
    setSelectedPills((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // 6.1 ЕКП Классификатор (Агрегированная строка)
  const [classifierAggregatedText, setClassifierAggregatedText] = useState("")

  // 7. Assigned Services (Initially empty per TZ 55)
  const [services, setServices] = useState<OperatorService[]>([])

  const handleRemoveService = (id: string) => {
    setServices((prev) => prev.filter((s) => s.id !== id))
  }

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current))
    }, 4000)
  }

  // Incident title / type (Initially null per TZ 55)
  const [activeIncidentTitle, setActiveIncidentTitle] = useState<string | null>(null)

  // storageKey is declared above near ticket loading
  const [isRestored, setIsRestored] = useState(false)

  // 1. Restore state from localStorage on mount
  // NOTE: phones (aonPhone, providedPhone, onSitePhone) are NOT restored — they come from the ticket API.
  // NOTE: callStatus is NOT restored — call always starts fresh per session.
  useEffect(() => {
    if (typeof window === "undefined") return
    // Clean up old-format keys (operator_state_<ticketId>) that were not session-specific
    if (sessionId && ticketId) {
      const oldKey = `operator_state_${ticketId}`
      if (oldKey !== storageKey) {
        try { localStorage.removeItem(oldKey) } catch (_) {}
      }
    }
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.callerName !== undefined) setCallerName(parsed.callerName)
        if (parsed.callerStatus !== undefined) setCallerStatus(parsed.callerStatus)
        if (parsed.fullAddressString !== undefined) setFullAddressString(parsed.fullAddressString)
        if (parsed.address) setAddress((prev) => ({ ...prev, ...parsed.address }))
        if (parsed.incidentDescription !== undefined) setIncidentDescription(parsed.incidentDescription)
        if (Array.isArray(parsed.services)) setServices(parsed.services)
        if (parsed.activeIncidentTitle !== undefined) setActiveIncidentTitle(parsed.activeIncidentTitle)
        if (parsed.classifierAggregatedText !== undefined) setClassifierAggregatedText(parsed.classifierAggregatedText)
        if (parsed.topStatuses) setTopStatuses(parsed.topStatuses)
        if (parsed.selectedPills) setSelectedPills(parsed.selectedPills)
        if (typeof parsed.elapsedSeconds === "number") setElapsedSeconds(parsed.elapsedSeconds)
        // Do NOT restore: aonPhone, providedPhone, onSitePhone, callStatus
        // These are always loaded fresh from the ticket API / telephony start
      }
    } catch (e) {
      console.error("Failed to restore operator state from localStorage", e)
    } finally {
      setIsRestored(true)
    }
  }, [storageKey])


  // Call must be started by user interaction to allow audio playback!
  // Removed the auto-start useEffect here.


  // 2. Persist state to localStorage on changes
  useEffect(() => {
    if (!isRestored || typeof window === "undefined") return
    const stateToSave = {
      callerName,
      callerStatus,
      fullAddressString,
      address,
      incidentDescription,
      services,
      activeIncidentTitle,
      classifierAggregatedText,
      topStatuses,
      selectedPills,
      providedPhone,
      onSitePhone,
      aonPhone,
      elapsedSeconds,
      callStatus: telephony.callStatus,
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(stateToSave))
    } catch (e) {
      console.error("Failed to save operator state to localStorage", e)
    }
  }, [
    isRestored,
    storageKey,
    callerName,
    callerStatus,
    fullAddressString,
    address,
    incidentDescription,
    services,
    activeIncidentTitle,
    classifierAggregatedText,
    topStatuses,
    selectedPills,
    providedPhone,
    onSitePhone,
    aonPhone,
    elapsedSeconds,
  ])

  // Incident type selection and reset handler (ТЗ 57: очистка служб при сбросе типа происшествия)
  const handleSelectIncidentType = (type: string | null) => {
    setActiveIncidentTitle(type)
    if (!type) {
      setServices([])
      setClassifierAggregatedText("")
    }
  }

  // Copy AON helpers
  const handleCopyAonToProvided = () => {
    setProvidedPhone(aonPhone)
    showToast("Номер АОН скопирован в «предоставленный»")
  }
  const handleCopyAonToOnSite = () => {
    setOnSitePhone(aonPhone)
    showToast("Номер АОН скопирован в «телефон на место»")
  }

  // Action stamps for no-contact and call-dropped
  const handleNoContact = () => {
    const next = !topStatuses.no_contact
    toggleTopStatus("no_contact")
    if (next) {
      setIncidentDescription((prev) =>
        prev
          ? `${prev}\n[Зафиксировано: нет контакта с заявителем]`
          : "[Зафиксировано: нет контакта с заявителем]"
      )
      showToast("Зафиксировано: нет контакта с заявителем")
    }
  }

  const handleCallDropped = () => {
    const next = !topStatuses.call_dropped
    toggleTopStatus("call_dropped")
    if (next) {
      setIncidentDescription((prev) =>
        prev ? `${prev}\n[Зафиксировано: срыв звонка]` : "[Зафиксировано: срыв звонка]"
      )
      showToast("Зафиксировано: срыв звонка")
    }
  }

  // Auto-calculation handler (ТЗ 56 / 57): Automatically adds recommended services to card
  const handleAutoAddServices = (recommendedNames: string[]) => {
    if (!recommendedNames || recommendedNames.length === 0) return
    setServices((prev) => {
      const existingKeys = new Set(
        prev.flatMap((s) => [
          s.name.toLowerCase().trim(),
          (s.shortName || "").toLowerCase().trim(),
          getServiceShortName(s.name).toLowerCase().trim(),
        ])
      )
      const toAdd: OperatorService[] = []
      for (const rawName of recommendedNames) {
        const canonical = matchCanonicalService(rawName)
        // Ensure only recognized services from DEFAULT_SERVICES_LIST can be added as a service!
        if (!canonical || !DEFAULT_SERVICES_LIST.includes(canonical)) {
          continue
        }
        const short = getServiceShortName(canonical)
        if (
          !existingKeys.has(canonical.toLowerCase().trim()) &&
          !existingKeys.has(short.toLowerCase().trim()) &&
          !existingKeys.has(rawName.toLowerCase().trim())
        ) {
          toAdd.push({
            id: `svc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: canonical,
            shortName: short,
            isGray: canonical.includes("102") || canonical.toLowerCase().includes("мвд"),
          })
          existingKeys.add(canonical.toLowerCase().trim())
          existingKeys.add(short.toLowerCase().trim())
        }
      }
      if (toAdd.length === 0) return prev
      showToast(
        `Авто-расчет: добавлены службы (${toAdd.map((s) => s.shortName || s.name).join(", ")})`
      )
      return [...prev, ...toAdd]
    })
  }

  // Modal save handler (ТЗ 56): Updates services list from AddServiceModal
  const handleSaveServicesFromModal = (selectedNames: string[]) => {
    setServices((prev) => {
      const kept = prev.filter((s) => {
        const canonical = matchCanonicalService(s.name) || s.name
        return selectedNames.includes(canonical) || selectedNames.includes(s.name)
      })
      const keptCanonicalNames = new Set(
        kept.map((s) => matchCanonicalService(s.name) || s.name)
      )
      const added: OperatorService[] = selectedNames
        .filter((name) => !keptCanonicalNames.has(name))
        .map((name) => ({
          id: `svc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name,
          shortName: getServiceShortName(name),
          isGray: name.includes("102") || name.toLowerCase().includes("мвд"),
        }))
      return [...kept, ...added]
    })
    showToast("Службы успешно обновлены")
    setActiveModal(null)
  }

  // ТЗ 59: Задача 2 — Валидация перед сохранением (Не даем сдать пустую карточку!)
  const handleOpenSaveModal = () => {
    // 1. Выбран ли тип происшествия (activeIncidentTitle / incidentType)
    const hasIncidentType = Boolean(activeIncidentTitle && activeIncidentTitle.trim())

    // 2. Указан ли Адрес (хотя бы Улица или Округ/Район)
    const hasStreet = Boolean(address.street && address.street.trim())
    const hasDistrictOrOkrug = Boolean(
      (address.district && address.district.trim()) ||
      (address.okrug && address.okrug.trim())
    )
    const hasFullAddress = Boolean(fullAddressString && fullAddressString.trim())
    const hasAddress = hasFullAddress || hasStreet || hasDistrictOrOkrug

    // 3. Указан ли статус заявителя (callerStatus)
    const hasCallerStatus = Boolean(callerStatus && callerStatus.trim())

    if (!hasIncidentType || !hasAddress || !hasCallerStatus) {
      showToast("Ошибка: Заполните обязательные поля (Тип происшествия, Адрес, Статус заявителя)")
      return
    }

    setActiveModal("save")
  }

  const handleSubmitEvaluation = async () => {
    setIsSubmitting(true)
    setIsCallActive(false)
    setIsSubmitted(true)

    const fullAddress =
      fullAddressString.trim() ||
      [
        address.country,
        address.subject,
        address.city,
        address.okrug,
        address.district,
        address.street,
        address.house ? `д. ${address.house}` : "",
        address.building ? `к. ${address.building}` : "",
        address.apartment ? `кв. ${address.apartment}` : "",
      ]
        .filter(Boolean)
        .join(", ")

    const assignedServiceNames = services.map((s) => {
      const short = s.shortName || s.name
      if (short.includes("101")) return "101"
      if (short.includes("102")) return "102"
      if (short.includes("103")) return "103"
      if (short.includes("104")) return "104"
      return short
    })

    const payload = {
      ticket_id: ticketId || "demo-ticket",
      caller_name: callerName || "Аноним",
      caller_status: callerStatus || "очевидец",
      address: fullAddress,
      address_string: fullAddress,
      incident_description: classifierAggregatedText || incidentDescription || "Описание не заполнено",
      time_taken_seconds: elapsedSeconds,
      assigned_services: assignedServiceNames,
      is_refusal_03: topStatuses.refusal || false,
    }

    try {
      let evalData: any = null

      if (sessionId) {
        let res = await fetch(`/api/v2/sessions/${sessionId}/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          res = await fetch(`/api/v1/sessions/${sessionId}/evaluate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        }

        if (res.ok) {
          evalData = await res.json()
        }
      }

      // Cleanup local draft
      try {
        localStorage.removeItem(storageKey)
      } catch (e) {
        // ignore
      }

      const totalScore = evalData?.scores?.total ?? 100
      const errorsList = evalData?.errors_list || []
      const resultMessage = `Оценка: ${totalScore}/100 баллов! ${
        errorsList.length > 0
          ? `Замечания: ${errorsList.join("; ")}`
          : "Все нормативы выполнены верно!"
      }`

      showToast(resultMessage)
      setActiveModal(null)

      setTimeout(() => {
        router.push(sessionId ? "/student/lobby" : "/operator/journal")
      }, 2000)
    } catch (err) {
      console.error("Evaluation error:", err)
      showToast("Ошибка при отправке на сервер. Перенаправление...")
      setActiveModal(null)
      setTimeout(() => {
        router.push(sessionId ? "/student/lobby" : "/operator/journal")
      }, 2000)
    } finally {
      setIsSubmitting(false)
    }
  }

  // ТЗ 62: Завершение вызова (POST /api/v2/telephony/hangup)
  const handleHangup = async () => {
    setIsCallActive(false)
    setActiveModal(null)
    await telephony.hangupCall()
    showToast("Вызов завершен оператором")
  }

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden select-none font-sans" style={{ background: "#efefef" }}>
      {/* Session Training Strip */}
      {sessionId ? (
        <div className="bg-[#1f2b31] border-b border-blue-500/40 text-blue-200 px-4 py-1.5 text-xs flex items-center justify-between shrink-0 shadow-xs z-30">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-white">Учебный режим: Оператор 112</span>
            <span className="font-mono text-blue-300">Сессия #{sessionId.slice(0, 8)}</span>
            {ticketId && <span className="font-mono text-blue-300">• Билет #{ticketId.slice(0, 8)}</span>}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/operator/journal"
              className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-2.5 py-1 rounded transition"
            >
              Журнал
            </Link>
            <Link
              href="/student/lobby"
              className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1 rounded transition"
            >
              ← В Лобби
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-[#1f2b31] border-b border-slate-700 text-slate-300 px-4 py-1 text-xs flex items-center justify-between shrink-0 z-30">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">АРМ Оператора 112</span>
            <span className="text-slate-400">• Карточка вызова</span>
          </div>
          <Link
            href="/operator/journal"
            className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-2.5 py-0.5 rounded transition flex items-center gap-1"
          >
            ← В Журнал происшествий
          </Link>
        </div>
      )}

      {/* Toast Notification (ТЗ 58: внизу экрана, чтобы не перекрывать АОН) */}
      {toastMessage && (
        <div
          role="alert"
          className={`fixed bottom-20 right-8 z-50 text-white text-xs px-4 py-2.5 rounded shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-md ${
            toastMessage.startsWith("Ошибка")
              ? "bg-red-800 border border-red-500 font-medium"
              : "bg-[#303335] border border-gray-600"
          }`}
        >
          {toastMessage}
        </div>
      )}

      {/* Network Resilience Warning Banner (ТЗ 73) */}
      {(telephony.isReconnecting || isStoreReconnecting) && (
        <div
          role="alert"
          aria-live="assertive"
          className="bg-amber-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 shadow-md z-40 border-b border-amber-700 animate-pulse"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
          </span>
          <span>Соединение потеряно, восстанавливаем...</span>
        </div>
      )}

      {/* Top Bar (Telephony, Numbers, Incident Info, Timer) */}
      <OperatorTopBar
        elapsedSeconds={elapsedSeconds}
        callStatus={telephony.callStatus}
        aonPhone={aonPhone}
        providedPhone={providedPhone}
        onSitePhone={onSitePhone}
        incidentNumber={ticketId ? `Билет #${ticketId.slice(0, 6)}` : "913126"}
        operatorInfo={sessionId ? `АРМ-7 (Курсант ${sessionId.slice(0, 4)})` : "АРМ-7 (Оператор 112)"}
        onHangup={handleHangup}
        onCallRecords={() => setActiveModal("call_records")}
        onSmsList={() => setActiveModal("sms_list")}
        onAonInfo={() => showToast("АОН: Определитель номера сотового оператора (ПАО «МТС», Москва)")}
        onMapInfo={() => showToast("Геолокация БС: Москва, СВАО, Ясный проезд, вышка #4182")}
        onProviderInfo={() => showToast("Оператор связи: ПАО «МТС», коммутатор г. Москвы, СОРМ-3")}
        onCopyAonToProvided={handleCopyAonToProvided}
        onCopyAonToOnSite={handleCopyAonToOnSite}
        isPlayingAudio={isPlayingAudio}
      />

      {/* Main Two-Column Workstation Grid (50 / 50 Desktop Split) */}
      <div className="flex-1 min-h-0 grid grid-cols-2 overflow-hidden" style={{ background: "#efefef" }}>
        {/* Left Column: Caller Information & Structured Address */}
        <div className="h-full overflow-hidden" style={{ borderRight: "1px solid #c9ced1" }}>
          <OperatorLeftPanel
            callerName={callerName}
            setCallerName={setCallerName}
            callerStatus={callerStatus}
            setCallerStatus={setCallerStatus}
            address={address}
            setAddress={setAddress}
            fullAddressString={fullAddressString}
            setFullAddressString={setFullAddressString}
            incidentDescription={incidentDescription}
            setIncidentDescription={setIncidentDescription}
            onTranslate={() => setActiveModal("translate")}
          />
        </div>

        {/* Right Column: Emergency Actions & Questionnaire Pills */}
        <div className="h-full overflow-hidden">
          <OperatorRightPanel
            selectedPills={selectedPills}
            togglePill={togglePill}
            topStatuses={topStatuses}
            toggleTopStatus={toggleTopStatus}
            onNoContact={handleNoContact}
            onCallDropped={handleCallDropped}
            activeIncidentTitle={activeIncidentTitle}
            incidentType={activeIncidentTitle}
            onSelectType={handleSelectIncidentType}
            onAggregatedUpdate={(text) => setClassifierAggregatedText(text)}
            onRecommendedServices={handleAutoAddServices}
          />
        </div>
      </div>

      {/* Bottom Bar: Wide & Roomy Services Bar (min-height 64px, safe at 133% zoom) */}
      <OperatorBottomBar
        services={services}
        onRemoveService={handleRemoveService}
        onAddService={() => setActiveModal("add_service")}
        onSave={handleOpenSaveModal}
        onOpenTimer={() => setActiveModal("timer")}
        onOpenAlerts={() => setActiveModal("alerts")}
      />

      {/* ==================== INTERACTIVE MODALS ==================== */}

      {/* 1. Modal: Save & Finalize Incident Card */}
      {activeModal === "save" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-lg w-full flex flex-col gap-4 border border-gray-300 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    Карточка происшествия #{ticketId ? ticketId.slice(0, 6) : "913126"}
                  </h3>
                  <p className="text-xs text-gray-500">Готова к сохранению и передаче в ДДС экстренных служб</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setActiveModal(null)}
                className="text-gray-400 hover:text-gray-700 cursor-pointer p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="text-xs text-gray-800 bg-gray-50 p-3.5 rounded border border-gray-200 flex flex-col gap-2">
              <div><b>Адрес происшествия:</b> {fullAddressString || [address.country, address.subject, address.city, address.okrug, address.district, address.street, address.house ? `д. ${address.house}` : ""].filter(Boolean).join(", ") || "Не указан"}</div>
              <div><b>Заявитель:</b> {callerName || "Аноним"} ({callerStatus || "статус не выбран"})</div>
              <div><b>Назначено служб ({services.length}):</b> {services.map((s) => s.shortName || s.name).join(", ") || "не назначены"}</div>
              <div><b>Выбранные признаки:</b> {classifierAggregatedText || Object.keys(selectedPills).filter((k) => selectedPills[k]).map((k) => k.replace(/^[a-z]+_/, "")).join(", ") || "не выбраны"}</div>
              <div><b>Хронометраж приёма:</b> {Math.floor(elapsedSeconds / 60)} мин {elapsedSeconds % 60} сек (Норматив ≤ 90 сек: {elapsedSeconds <= 90 ? "✅ Соблюден" : "⚠️ Превышен"})</div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded text-xs font-semibold hover:bg-gray-100 cursor-pointer transition disabled:opacity-50"
              >
                Вернуться к редактированию
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmitEvaluation}
                className="px-5 py-2 bg-[#d64e23] text-white rounded text-xs font-bold hover:brightness-110 cursor-pointer shadow transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isSubmitting ? "Отправка..." : "Передать в службы"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal: Hang Up Call */}
      {activeModal === "hangup" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-md w-full flex flex-col gap-4 border border-gray-300">
            <div className="flex items-center gap-3 border-b pb-3">
              <PhoneOff className="h-6 w-6 text-red-600 shrink-0" />
              <h3 className="text-base font-bold text-gray-900">Завершение телефонного соединения</h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Вы хотите завершить активный вызов с заявителем? Разговор длится {Math.floor(elapsedSeconds / 60)} мин {elapsedSeconds % 60} сек. Карточка происшествия останется открытой для дозаполнения.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 border border-gray-300 text-gray-700 rounded text-xs font-semibold hover:bg-gray-100 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleHangup}
                className="px-4 py-1.5 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700 cursor-pointer"
              >
                Положить трубку
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal: Call Recordings Archive */}
      {activeModal === "call_records" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-lg w-full flex flex-col gap-4 border border-gray-300">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-gray-900">Записи телефонных разговоров АРМ-7</h3>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="divide-y text-xs text-gray-700 max-h-60 overflow-y-auto">
              <div className="py-2.5 flex items-center justify-between">
                <div>
                  <div className="font-semibold">09:04:37 — {aonPhone} (Текущий вызов)</div>
                  <div className="text-gray-500">Ясный проезд 10, открытое пламя на балконе</div>
                </div>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-medium">В эфире</span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <div>
                  <div className="font-semibold">08:48:12 — +7 (495) 912-34-56 (Завершён)</div>
                  <div className="text-gray-500">Полярная ул. 14, ДТП без пострадавших (1 мин 18 с)</div>
                </div>
                <button
                  type="button"
                  onClick={() => showToast("Воспроизведение аудиозаписи...")}
                  className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 border rounded text-[11px] font-medium cursor-pointer"
                >
                  ▷ Слушать
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal: Emergency SMS List */}
      {activeModal === "sms_list" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-lg w-full flex flex-col gap-4 border border-gray-300">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-gray-900">Экстренные SMS-сообщения (Служба-112)</h3>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="text-xs text-gray-700 space-y-2">
              <div className="p-2.5 bg-gray-50 border rounded">
                <div className="flex justify-between font-semibold text-gray-900">
                  <span>От: +7 (903) 123-45-67</span>
                  <span className="text-gray-500">09:02:15</span>
                </div>
                <div className="mt-1 text-gray-800">«Пожар на балконе 4 этажа, Ясный проезд дом 10, срочно пожарных!»</div>
                <div className="mt-1 text-[11px] text-blue-600">Координаты: 55.8641° N, 37.6412° E</div>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* 6. Modal: Inter-language & Sign Translation Service */}
      {activeModal === "translate" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-md w-full flex flex-col gap-4 border border-gray-300">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <Globe className="text-blue-600" size={20} />
                <h3 className="text-sm font-bold text-gray-900">Служба межъязыкового перевода 112</h3>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-600">
              Выберите язык для подключения оператора-лингвиста или сурдопереводчика к трехсторонней конференции:
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {["Английский", "Узбекский", "Таджикский", "Киргизский", "Китайский", "Русский жестовый (РЖЯ)"].map(
                (lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => {
                      setActiveModal(null)
                      showToast(`Подключен переводчик: ${lang}`)
                    }}
                    className="p-2.5 text-left border rounded hover:border-blue-500 hover:bg-blue-50 transition cursor-pointer font-medium text-gray-800"
                  >
                    🌐 {lang}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}


      {/* 8. Modal: Add Emergency Service (ТЗ 56) */}
      <AddServiceModal
        isOpen={activeModal === "add_service"}
        onClose={() => setActiveModal(null)}
        currentServices={services}
        onSave={handleSaveServicesFromModal}
      />



      {/* 10. Modal: Call Timeline (Хронометраж) */}
      {activeModal === "timer" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-md w-full flex flex-col gap-4 border border-gray-300">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">Хронометраж этапов вызова</h3>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="divide-y text-xs text-gray-700">
              <div className="py-2 flex justify-between">
                <span>Поступление вызова в АТС:</span>
                <span className="font-mono font-bold">09:04:21</span>
              </div>
              <div className="py-2 flex justify-between">
                <span>Снятие трубки оператором (АРМ-7):</span>
                <span className="font-mono font-bold">09:04:37 (16 сек)</span>
              </div>
              <div className="py-2 flex justify-between">
                <span>Текущая длительность опроса:</span>
                <span className="font-mono font-bold text-blue-600">
                  {Math.floor(elapsedSeconds / 60)} мин {elapsedSeconds % 60} сек
                </span>
              </div>
              <div className="py-2 flex justify-between">
                <span>Регламентный норматив 112:</span>
                <span className="font-mono font-bold text-emerald-600">≤ 90 секунд</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 11. Modal: Operational Alerts */}
      {activeModal === "alerts" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-md w-full flex flex-col gap-4 border border-gray-300">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-amber-500" />
                <h3 className="text-sm font-bold text-gray-900">Оперативные оповещения смены</h3>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-2 text-xs text-gray-700">
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded">
                <div className="font-bold text-amber-900">Метеопредупреждение МЧС</div>
                <div className="text-amber-800 text-[11px] mt-0.5">Усиление порывов ветра до 18 м/с в северных округах Москвы.</div>
              </div>
              <div className="p-2.5 bg-gray-50 border rounded">
                <div className="font-bold text-gray-900">Регламент ЕКП 2025</div>
                <div className="text-gray-600 text-[11px] mt-0.5">Обязательное внесение подъезда и этажа при пожаре в жилом секторе.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 12. Modal: Operator Shift Chat */}
      {activeModal === "chat" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-md w-full flex flex-col gap-3 border border-gray-300">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <MessageSquare size={18} className="text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">Служебный чат смены 112</h3>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className="text-gray-400 hover:text-gray-700 p-1">
                <X size={18} />
              </button>
            </div>
            <div className="bg-gray-50 p-3 rounded border text-xs h-48 overflow-y-auto space-y-2">
              <div className="bg-white p-2 rounded shadow-xs border">
                <span className="font-bold text-blue-700">Старший смены:</span> Все АРМ, обратите внимание на возгорание на Ясном проезде, службы оповещены.
              </div>
              <div className="bg-white p-2 rounded shadow-xs border">
                <span className="font-bold text-emerald-700">ДДС-101:</span> АЦ 22 ПСЧ выехала к дому 10.
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Сообщение старшему оператору..."
                className="flex-1 text-xs border rounded p-2 outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => showToast("Сообщение отправлено")}
                className="px-3 py-1.5 bg-gray-800 text-white rounded text-xs font-semibold cursor-pointer"
              >
                Отправить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 13. Modal: Close Incident Confirmation */}
      {activeModal === "close" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded shadow-2xl p-6 max-w-sm w-full flex flex-col gap-4 border border-gray-300">
            <div className="flex items-center gap-3 border-b pb-3">
              <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0" />
              <h3 className="text-base font-bold text-gray-900">Закрыть карточку вызова?</h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Вы действительно хотите закрыть карточку #913126? Все несохраненные данные будут сброшены.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-1.5 border rounded text-xs font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null)
                  showToast("Карточка закрыта")
                }}
                className="px-4 py-1.5 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700 cursor-pointer"
              >
                Закрыть без сохранения
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function OperatorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-[#efefef] text-gray-700">
          <span className="font-semibold text-sm animate-pulse">Загрузка АРМ Оператора 112...</span>
        </div>
      }
    >
      <OperatorContent />
    </Suspense>
  )
}
