"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { dispatcherData as initialData, emptyDispatcherData, type DispatcherData } from "@/lib/dispatcher-data"
import { ddsScenarios, type DdsScenario } from "@/lib/dds-scenarios"
import { TopBar } from "@/components/dispatcher/top-bar"
import { CallerPanel } from "@/components/dispatcher/caller-panel"
import { IncidentPanel } from "@/components/dispatcher/incident-panel"
import { ServicesBar } from "@/components/dispatcher/services-bar"
import { Tutorial } from "@/components/tutorial"
import { DispatchPanel } from "@/components/dispatcher/dispatch-panel"
import { Award, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react"

function DdsSimulator() {
  const searchParams = useSearchParams()
  const sessionId = searchParams ? searchParams.get("session_id") : null
  const ticketId = searchParams ? searchParams.get("ticket_id") : null

  const [liveScenarios, setLiveScenarios] = useState<any[]>([])

  const [demoIndex, setDemoIndex] = useState(0)
  const currentScenario = liveScenarios.length > 0 ? liveScenarios[demoIndex] : ddsScenarios[0]

  const [data, setData] = useState<DispatcherData>(emptyDispatcherData)
  const [networkStatus, setNetworkStatus] = useState<"offline" | "waiting" | "active">("active")
  const [slaTimer, setSlaTimer] = useState<number | null>(null)
  const [slaViolated, setSlaViolated] = useState<boolean>(false)
  const [isTutorialRunning, setIsTutorialRunning] = useState<boolean>(false)
  const slaIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Cadet decision & dispatch recording
  const [isCardAccepted, setIsCardAccepted] = useState(false)
  const [userDecision, setUserDecision] = useState<"Принята" | "Не принята" | null>(null)
  const [userComment, setUserComment] = useState("")
  const [userOrderNumber, setUserOrderNumber] = useState("")
  const [whoAccepted, setWhoAccepted] = useState("")
  const [summary, setSummary] = useState("")
  const [calledServices, setCalledServices] = useState<string[]>([])
  const [showEndShiftModal, setShowEndShiftModal] = useState(false)

  // Load real ticket data for DDS
  useEffect(() => {
    if (ticketId) {
      fetch(`/api/v1/tickets/${ticketId}`)
        .then(res => {
          if (!res.ok) throw new Error("Network response was not ok");
          return res.json();
        })
        .then(ticket => {
          if (ticket) {
            const gt = ticket.ground_truth || {};
            
            const servicesList = Array.isArray(ticket.etalon_services) 
              ? ticket.etalon_services.map((s: string, idx: number) => ({
                  id: `srv_${idx}`,
                  name: s,
                  time: "12:00",
                  status: "Получена службой",
                  isRejected: false,
                  history: [
                    { op: "Система", time: "20.09.2026 12:00:00", status: "Добавлена" },
                    { op: "Система", time: "20.09.2026 12:00:00", status: "Получена службой" },
                  ],
              }))
              : [];
              
            setData(prev => ({
              ...prev,
              caller: {
                ...prev.caller,
                name: gt.fio || prev.caller.name,
                role: gt.caller_status || prev.caller.role,
                address: gt.street ? `${gt.street} ${gt.house || ""}`.trim() : prev.caller.address,
              },
              phones: {
                aon: gt.phone || prev.phones.aon,
                provided: gt.phone || prev.phones.provided,
                onSite: gt.phone || prev.phones.onSite,
              },
              description: ticket.plot || gt.plot || prev.description,
              statuses: {
                ...prev.statuses,
                injured: gt.injured || prev.statuses.injured,
                ambulanceRefusal: gt.ambulanceRefusal || prev.statuses.ambulanceRefusal,
                blocked: gt.blocked || prev.statuses.blocked,
              },
              classification: {
                ...prev.classification,
                title: ticket.subcategory || prev.classification.title,
                section: ticket.category || prev.classification.section,
                class: gt.class || prev.classification.class,
                visClass: gt.visClass || prev.classification.visClass
              },
              incident: {
                ...prev.incident,
                number: ticket.ticket_id ? ticket.ticket_id.split("-")[0] : prev.incident.number,
                savedAt: ticket.created_at ? new Date(ticket.created_at).toLocaleString('ru-RU', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}) : prev.incident.savedAt
              },
              connection: "Установлено",
              services: servicesList.length > 0 ? servicesList : prev.services
            }));
          }
        })
        .catch(err => console.error("Failed to load real ticket data for DDS:", err));
    }
  }, [ticketId]);

  // Play beep sound when timer expires
  const playTimeoutBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (AudioCtx) {
        const ctx = new AudioCtx()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = "sawtooth"
        osc.frequency.setValueAtTime(880, ctx.currentTime) // 880 Hz sharp alert beep
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        // Two beeps
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.35)
        setTimeout(() => {
          try {
            const ctx2 = new AudioCtx()
            const osc2 = ctx2.createOscillator()
            const gain2 = ctx2.createGain()
            osc2.type = "sawtooth"
            osc2.frequency.setValueAtTime(880, ctx2.currentTime)
            gain2.gain.setValueAtTime(0.2, ctx2.currentTime)
            gain2.gain.exponentialRampToValueAtTime(0.01, ctx2.currentTime + 0.4)
            osc2.connect(gain2)
            gain2.connect(ctx2.destination)
            osc2.start()
            osc2.stop(ctx2.currentTime + 0.45)
          } catch {}
        }, 400)
      }
    } catch (e) {
      console.warn("AudioContext error on timeout beep:", e)
    }
  }

  // Start/Restart SLA Timer
  const startSlaTimer = () => {
    if (slaIntervalRef.current) {
      clearInterval(slaIntervalRef.current)
      slaIntervalRef.current = null
    }
    setSlaTimer(30)
    setSlaViolated(false)

    slaIntervalRef.current = setInterval(() => {
      setSlaTimer((prev) => {
        if (prev === null) return null
        const next = prev - 1
        if (next <= 0) {
          setSlaViolated(true)
          playTimeoutBeep()
          return 0
        }
        return next
      })
    }, 1000)
  }

  // Load ticket scenario into view
  const loadScenario = (index: number, scenariosOverride?: any[]) => {
    const list = scenariosOverride || (liveScenarios.length > 0 ? liveScenarios : ddsScenarios)
    if (!list || list.length === 0) return

    const sc = (list[index] || list[0]) as any
    const rawCard = sc.cardData || {}
    const rawPhones = rawCard.phones || {}
    const rawIncident = rawCard.incident || {}
    const rawCaller = rawCard.caller || {}
    const rawStatuses = rawCard.statuses || {}
    const rawEmergency = rawCard.emergency || {}
    const rawClassification = rawCard.classification || {}

    const servicesList = Array.isArray(rawCard.services)
      ? rawCard.services.map((s: any, idx: number) => {
          if (typeof s === "string") {
            return {
              id: `srv_${idx}`,
              name: s,
              time: "12:00",
              status: "Получена службой",
              isRejected: false,
              history: [
                { op: "Система", time: "20.09.2026 12:00:00", status: "Добавлена" },
                { op: "Система", time: "20.09.2026 12:00:00", status: "Получена службой" },
              ],
            }
          }
          return {
            id: s.id || `srv_${idx}`,
            name: s.name || "Служба",
            time: s.time || "12:00",
            status: s.status || "Получена службой",
            isRejected: !!s.isRejected,
            history: Array.isArray(s.history) ? s.history : [],
          }
        })
      : []

    const normalizedData: DispatcherData = {
      connection: rawCard.connection || "Установлено",
      phones: {
        aon: rawPhones.aon || sc.caller_phone || "---",
        provided: rawPhones.provided || sc.caller_phone || "---",
        onSite: rawPhones.onSite || "",
      },
      incident: {
        number: rawIncident.number || String(sc.ticketNumber || sc.id || "101-2024"),
        savedAt: rawIncident.savedAt || "20.09.2026 00:00:00",
        operator: rawIncident.operator || "Система 112 (Оператор)",
      },
      caller: {
        name: rawCaller.name || sc.caller_name || "Неизвестно",
        role: rawCaller.role || "Очевидец",
        address: rawCaller.address || sc.address || "Неизвестно",
      },
      statuses: {
        injured: rawStatuses.injured || (sc.has_victims ? "да" : "нет"),
        ambulanceRefusal: rawStatuses.ambulanceRefusal || "нет",
        blocked: rawStatuses.blocked || "нет",
      },
      emergency: {
        cs: !!rawEmergency.cs,
        cp: !!rawEmergency.cp,
      },
      classification: {
        section: rawClassification.section || sc.category || "Не указано",
        title: rawClassification.title || sc.title || "Не указано",
        class: rawClassification.class || "Экстренная",
        visClass: rawClassification.visClass || "bg-red-500",
      },
      services: servicesList,
      description: rawCard.description || sc.plot || sc.explanation || "Нет описания",
    }

    setData(normalizedData)
    setIsCardAccepted(false)
    setUserDecision(null)
    setUserComment("")
    setUserOrderNumber("")
    setWhoAccepted("")
    setSummary("")
    setCalledServices([])
    startSlaTimer()
  }

  // Load scenarios on mount and show initial scenario immediately
  useEffect(() => {
    if (!ticketId) {
      loadScenario(0, ddsScenarios)
      fetch("/api/dds/scenarios")
        .then((res) => res.json())
        .then((data) => {
          if (data.scenarios && data.scenarios.length > 0) {
            setLiveScenarios(data.scenarios)
            loadScenario(0, data.scenarios)
          }
        })
        .catch((err) => console.error("Ошибка загрузки карточек ДДС:", err))
    }
  }, [ticketId])

  // Switch to next demo card
  const nextDemoCard = () => {
    const list = liveScenarios.length > 0 ? liveScenarios : ddsScenarios
    if (!list || list.length === 0) return
    const nextIdx = (demoIndex + 1) % list.length
    setDemoIndex(nextIdx)
    loadScenario(nextIdx, list)
  }

  const handleConnect = () => {
    setIsTutorialRunning(false)
    setNetworkStatus("waiting")
    setTimeout(() => {
      setNetworkStatus("active")
      if (ticketId) {
        setIsCardAccepted(false)
        setUserDecision(null)
        setUserComment("")
        setUserOrderNumber("")
        setWhoAccepted("")
        setSummary("")
        startSlaTimer()
      } else {
        loadScenario(demoIndex)
      }
    }, 500)
  }

  // Cadet actions: Pencil status change
  const handleStatusChange = async (
    serviceName: string,
    nextStatus: string,
    commentText: string,
    orderNumber: string
  ) => {
    // 1. Stop SLA timer on primary decision
    if (slaIntervalRef.current) {
      clearInterval(slaIntervalRef.current)
      slaIntervalRef.current = null
    }

    const decision = (nextStatus === "Не принята" || nextStatus === "Отказ от выполнения работ")
      ? "Не принята"
      : "Принята"

    setUserDecision(decision)
    setUserComment(commentText)
    setUserOrderNumber(orderNumber)

    const isRej = decision === "Не принята"
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    const shortTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`

    const finalComment = orderNumber ? `[Наряд: ${orderNumber}] ${commentText}` : commentText
    const finalCardId = currentScenario.id || data.incident.number.replace("Происшествие ", "")

    try {
      const response = await fetch("/api/dds/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card_id: finalCardId,
          service_name: serviceName,
          status: nextStatus,
          comment: finalComment,
          duplicate_id: "",
          user_name: "Диспетчер ДДС",
        }),
      })
      const resData = await response.json()
      if (resData && resData.evaluation) {
        console.log("evaluation", resData.evaluation)
      }
    } catch (err) {
      console.error("Failed to submit DDS action:", err)
    }

    // Update state
    setData((prev) => {
      const updatedServices = prev.services.map((srv) => {
        if (srv.name === serviceName) {
          return {
            ...srv,
            status: nextStatus,
            time: shortTime,
            orderNumber: orderNumber,
            isRejected: isRej,
            history: [
              ...srv.history,
              {
                op: "оп. 14",
                time: timeStr,
                status: nextStatus,
                orderNumber: orderNumber,
                comment: commentText,
                isRejected: isRej,
              },
            ],
          }
        }
        return srv
      })
      return { ...prev, services: updatedServices }
    })
  }

  // Calculate Deterministic Score (0 - 100)
  const calculateScore = () => {
    const isTrick = currentScenario.isTrick
    const expected = currentScenario.expectedDecision
    const actual = userDecision

    let slaScore = 0
    let decisionScore = 0
    let justificationScore = 0
    let dispatchScore = 0

    // 1. SLA 30s (+20)
    if (!slaViolated && actual !== null) {
      slaScore = 20
    }

    // 2. Decision accuracy (+35)
    if (actual === expected) {
      decisionScore = 35
    }

    // 3. Justification or Requisite completeness (+20)
    if (isTrick) {
      if (actual === "Не принята" && userComment.trim().length >= 15) {
        justificationScore = 20
      }
    } else {
      // Normal ticket: properly registered
      if (actual === "Принята") {
        justificationScore = 20
      }
    }

    // 4. Dispatch call and fields (+25)
    if (isTrick) {
      // Rejection does not require dispatch call
      if (actual === "Не принята") {
        dispatchScore = 25
      }
    } else {
      // Normal ticket requires call & telephony fields for ALL assigned services
      const requiredServicesCount = data.services.length;
      if (requiredServicesCount > 0) {
        if (calledServices.length >= requiredServicesCount) {
          dispatchScore = 25
        } else if (calledServices.length > 0) {
          dispatchScore = Math.floor(25 * (calledServices.length / requiredServicesCount))
        }
      } else {
        if (whoAccepted.trim().length > 0 && summary.trim().length > 0) {
          dispatchScore = 25
        } else if (whoAccepted.trim().length > 0 || summary.trim().length > 0) {
          dispatchScore = 10
        }
      }
    }

    const total = slaScore + decisionScore + justificationScore + dispatchScore

    return {
      total,
      slaScore,
      decisionScore,
      justificationScore,
      dispatchScore,
      passed: total >= 70,
    }
  }

  const scoreResult = calculateScore()
  const displayData = isTutorialRunning ? initialData : data
  const displaySlaTimer = isTutorialRunning ? 30 : slaTimer

  return (
    <div className={`flex h-screen w-full overflow-hidden select-none flex-col bg-[#c9ced1] ${
      slaViolated ? "ring-4 ring-red-600 shadow-2xl shadow-red-500/30" : ""
    }`}>
      
      {/* Permanent Status Banner */}
      <div className={`w-full z-50 flex shrink-0 items-center justify-between px-4 2xl:px-8 py-2 2xl:py-2 border-b-2 shadow-md transition-colors ${
        networkStatus === "active" 
          ? "bg-[#2b3a42] border-[#157dbd] text-white" 
          : "bg-[#303335] border-orange-500 text-white"
      }`}>
        {networkStatus === "offline" ? (
          <>
            <span className="font-bold text-sm 2xl:text-sm">Режим: Учебный тренажер ДДС (Ожидание старта)</span>
            <div className="flex items-center gap-3">
              <button onClick={handleConnect} type="button" className="px-4 2xl:px-5 py-1.5 2xl:py-2 bg-[#157dbd] text-white text-[11px] 2xl:text-sm uppercase tracking-wide rounded-sm hover:bg-[#136ba3] transition-colors font-bold shadow">
                Начать смену
              </button>
              <button
                onClick={() => setIsTutorialRunning(true)}
                type="button"
                className="px-4 2xl:px-5 py-1.5 2xl:py-2 bg-[#1f2b31] border border-[#157dbd] text-[#4ade80] text-[11px] 2xl:text-sm uppercase tracking-wide rounded-sm hover:bg-[#157dbd] hover:text-white transition-colors font-bold"
              >
                Обучение
              </button>
            </div>
          </>
        ) : networkStatus === "waiting" ? (
          <span className="font-bold text-sm 2xl:text-sm text-orange-400 animate-pulse">Инициализация экзаменационных билетов...</span>
        ) : (
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-bold text-xs 2xl:text-sm text-[#4ade80] flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#4ade80] animate-ping" />
                Смена активна (ДДС-112)
              </span>
              {sessionId && (
                <span className="bg-blue-900/70 border border-blue-400 text-blue-200 px-2.5 py-0.5 rounded text-xs font-mono font-bold">
                  Сессия #{sessionId.slice(0, 8)} {ticketId ? `• Билет: ${ticketId.slice(0, 8)}` : ""}
                </span>
              )}
              {currentScenario.isTrick && (
                <span className="bg-amber-900/60 border border-amber-500 text-amber-300 px-2 py-0.5 rounded text-[11px] font-bold">
                  ⚠️ Билет с подвохом
                </span>
              )}
              {displaySlaTimer !== null && displaySlaTimer !== undefined && (
                <div 
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded font-mono font-bold text-xs border ml-2 ${
                    slaViolated || displaySlaTimer <= 5
                      ? "bg-red-600 text-white border-red-500 animate-pulse"
                      : displaySlaTimer <= 15
                      ? "bg-amber-500/20 text-amber-400 border-amber-500/50"
                      : "bg-emerald-500/20 text-emerald-400 border-emerald-500/50"
                  }`}
                  title={
                    slaViolated
                      ? "Внимание! Регламентный норматив 30с нарушен"
                      : `Осталось ${displaySlaTimer} сек на первичное реагирование`
                  }
                >
                  <span className="uppercase tracking-wider opacity-90 text-[10px]">
                    {slaViolated ? "ПРОСРОЧКА" : "SLA 30С:"}
                  </span>
                  <span className="text-sm">
                    {displaySlaTimer} сек
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/student/lobby"
                className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded font-medium transition cursor-pointer"
              >
                ← В Лобби
              </Link>
              <button 
                onClick={() => setShowEndShiftModal(true)} 
                className="px-4 py-1.5 text-xs 2xl:text-sm bg-red-600 hover:bg-red-700 text-white rounded font-bold transition shadow cursor-pointer"
              >
                Завершить смену
              </button>
            </div>
          </div>
        )}
      </div>

      <Tutorial run={isTutorialRunning} onFinish={() => setIsTutorialRunning(false)} />
      <TopBar data={displayData} slaTimer={displaySlaTimer} slaViolated={slaViolated} />

      <div className="flex flex-1 gap-3 px-2 py-1 overflow-hidden">
        <CallerPanel data={displayData} />
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-2 pb-2">
          <IncidentPanel data={displayData} />
          <DispatchPanel 
            isCardAccepted={isCardAccepted} 
            whoAccepted={whoAccepted}
            setWhoAccepted={setWhoAccepted}
            summary={summary}
            setSummary={setSummary}
            services={displayData.services}
            calledServices={calledServices}
            onServiceSaved={(srv) => {
              if (!calledServices.includes(srv)) {
                setCalledServices(prev => [...prev, srv])
              }
            }}
          />
        </div>
      </div>

      <div className="shrink-0 z-50 w-full">
        <ServicesBar 
          data={displayData} 
          onStatusChange={handleStatusChange} 
          onAccept={() => setIsCardAccepted(true)} 
          onNextCard={nextDemoCard} 
        />
      </div>

      {/* Protocol Evaluation Modal (Завершение смены) */}
      {showEndShiftModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-lg shadow-2xl max-w-xl w-full flex flex-col text-[#111827] overflow-hidden border border-gray-300">
            {/* Modal Header */}
            <div className="bg-[#303335] text-white px-6 py-4 flex items-center justify-between border-b border-gray-700">
              <div className="flex items-center gap-2">
                <Award className="h-6 w-6 text-amber-400" />
                <div>
                  <h2 className="text-lg 2xl:text-sm font-bold">Протокол аттестации диспетчера ДДС</h2>
                  <p className="text-xs text-gray-400">Регламент первичного реагирования ЕКП 2025</p>
                </div>
              </div>
              <button 
                onClick={() => setShowEndShiftModal(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Checklist Breakdown */}
            <div className="p-6 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
              {/* Ticket Info Banner */}
              <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs flex flex-col gap-1">
                <div className="flex justify-between font-bold text-gray-800 text-sm">
                  <span>Билет #{demoIndex + 1}: {currentScenario.ticketNumber}</span>
                  <span className={currentScenario.isTrick ? "text-amber-700" : "text-blue-700"}>
                    {currentScenario.isTrick ? "⚠️ Билет с подвохом" : "✓ Штатная ситуация"}
                  </span>
                </div>
                <p className="text-gray-600 mt-0.5">{currentScenario.explanation}</p>
              </div>

              {/* 4 Deterministic Criteria */}
              <div className="flex flex-col gap-2.5">
                {/* 1. SLA */}
                <div className="flex items-start justify-between p-3 rounded border border-gray-200 bg-white">
                  <div className="flex items-start gap-2.5">
                    {scoreResult.slaScore > 0 ? (
                      <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-semibold text-sm">1. Норматив 30 секунд (SLA реагирования)</div>
                      <div className="text-xs text-gray-500">
                        {scoreResult.slaScore > 0 
                          ? "Решение принято вовремя в пределах регламентного интервала." 
                          : "Нарушен 30-секундный норматив реагирования или решение не принято."}
                      </div>
                    </div>
                  </div>
                  <span className={`font-mono font-bold text-sm ${scoreResult.slaScore > 0 ? "text-emerald-600" : "text-red-600"}`}>
                    +{scoreResult.slaScore} / 20
                  </span>
                </div>

                {/* 2. Decision */}
                <div className="flex items-start justify-between p-3 rounded border border-gray-200 bg-white">
                  <div className="flex items-start gap-2.5">
                    {scoreResult.decisionScore > 0 ? (
                      <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-semibold text-sm">2. Корректность решения (Принята / Не принята)</div>
                      <div className="text-xs text-gray-500">
                        Эталон: <b className="text-gray-800">{currentScenario.expectedDecision}</b>. Курсант выбрал: <b className="text-gray-800">{userDecision || "Не выбрано"}</b>.
                      </div>
                    </div>
                  </div>
                  <span className={`font-mono font-bold text-sm ${scoreResult.decisionScore > 0 ? "text-emerald-600" : "text-red-600"}`}>
                    +{scoreResult.decisionScore} / 35
                  </span>
                </div>

                {/* 3. Justification / Requisites */}
                <div className="flex items-start justify-between p-3 rounded border border-gray-200 bg-white">
                  <div className="flex items-start gap-2.5">
                    {scoreResult.justificationScore > 0 ? (
                      <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-semibold text-sm">
                        {currentScenario.isTrick ? "3. Обоснование отказа по регламенту" : "3. Регистрация наряда / реквизитов"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {currentScenario.isTrick 
                          ? userComment.trim().length >= 15
                            ? `Обоснование зафиксировано (${userComment.trim().length} симв.): "${userComment.slice(0, 45)}..."`
                            : "Обоснование отсутствует или менее обязательных 15 символов."
                          : userDecision === "Принята"
                          ? "Карточка принята на подведомственной территории."
                          : "Ошибочный отказ в приеме штатной карточки."}
                      </div>
                    </div>
                  </div>
                  <span className={`font-mono font-bold text-sm ${scoreResult.justificationScore > 0 ? "text-emerald-600" : "text-red-600"}`}>
                    +{scoreResult.justificationScore} / 20
                  </span>
                </div>

                {/* 4. Dispatch Call & Telephony */}
                <div className="flex items-start justify-between p-3 rounded border border-gray-200 bg-white">
                  <div className="flex items-start gap-2.5">
                    {scoreResult.dispatchScore > 0 ? (
                      <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-semibold text-sm">4. Отработка вызова дежурному (Телефонограмма)</div>
                      <div className="text-xs text-gray-500">
                        {currentScenario.isTrick
                          ? "Для отклоненной карточки вызов не требуется (зачет автоматом)."
                          : whoAccepted.trim().length > 0 && summary.trim().length > 0
                          ? `Звонок выполнен. Принял: ${whoAccepted}, Суть: ${summary}`
                          : "Поля телефонограммы («Кто принял», «Суть») не заполнены после звонка."}
                      </div>
                    </div>
                  </div>
                  <span className={`font-mono font-bold text-sm ${scoreResult.dispatchScore > 0 ? "text-emerald-600" : "text-red-600"}`}>
                    +{scoreResult.dispatchScore} / 25
                  </span>
                </div>
              </div>

              {/* Total Score & Grade */}
              <div className="border-t border-gray-200 pt-4 flex items-center justify-between bg-gray-50 p-4 rounded-md">
                <div>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Итоговый результат:</div>
                  <div className={`text-2xl 2xl:text-sm font-extrabold ${
                    scoreResult.total >= 85 ? "text-emerald-600" : scoreResult.total >= 70 ? "text-amber-600" : "text-red-600"
                  }`}>
                    {scoreResult.total} из 100 баллов
                  </div>
                </div>

                <div className={`px-4 py-2 rounded-lg font-bold text-sm text-center ${
                  scoreResult.passed 
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : "bg-red-100 text-red-800 border border-red-300"
                }`}>
                  {scoreResult.total >= 85 
                    ? "АТТЕСТАЦИЯ ПРОЙДЕНА 🟢" 
                    : scoreResult.total >= 70 
                    ? "ЗАЧЁТ С ЗАМЕЧАНИЯМИ 🟡" 
                    : "НЕ СДАНО 🔴"}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-100 px-6 py-3 border-t border-gray-200 flex items-center justify-between">
              <button 
                onClick={() => {
                  window.location.href = "/dds/journal"
                }}
                className="px-4 py-2 bg-[#157dbd] text-white text-xs 2xl:text-sm font-bold rounded hover:bg-[#136ba3] transition"
              >
                В журнал (Поиск происшествий) →
              </button>
              <button 
                onClick={() => {
                  window.location.href = "/dds/journal"
                }}
                className="px-4 py-2 bg-gray-200 text-gray-800 text-xs 2xl:text-sm font-semibold rounded hover:bg-gray-300 transition"
              >
                Закрыть протокол
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-[#2b3a42] text-white">
          <span className="font-semibold text-sm animate-pulse">Загрузка рабочего места ДДС...</span>
        </div>
      }
    >
      <DdsSimulator />
    </Suspense>
  )
}
