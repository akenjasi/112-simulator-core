"use client"

import { useState, useRef, useEffect } from "react"
import { Phone } from "lucide-react"

type Props = {
  preparedExercise?: boolean
  isCardAccepted: boolean
  whoAccepted: string
  setWhoAccepted: (v: string) => void
  summary: string
  setSummary: (v: string) => void
  services?: any[]
  calledServices?: string[]
  onServiceSaved?: (serviceName: string, whoAccepted: string, summary: string) => void | boolean | Promise<void | boolean>
  disabled?: boolean
  acceptedServices?: string[]
  selectedServiceName?: string
  onServiceChange?: (serviceName: string) => void
  savedDispatches?: Record<string, {whoAccepted: string; summary: string}>
}

const EMPTY_SERVICES: any[] = []
const EMPTY_CALLED_SERVICES: string[] = []

export function DispatchPanel({ preparedExercise = false, isCardAccepted, whoAccepted, setWhoAccepted, summary, setSummary, services = EMPTY_SERVICES, calledServices = EMPTY_CALLED_SERVICES, onServiceSaved, disabled = false, acceptedServices, selectedServiceName, onServiceChange, savedDispatches }: Props) {
  const [callState, setCallState] = useState<"idle" | "dialing" | "speaking" | "connected">("idle")
  const [callError, setCallError] = useState<string | null>(null)
  const [inputsUnlocked, setInputsUnlocked] = useState(false)
  const [savedRequisites, setSavedRequisites] = useState(false)
  const [localService, setLocalService] = useState(services && services.length > 0 ? services[0].name : "Аварийная служба")
  const selectedService = selectedServiceName ?? localService
  const setSelectedService = (value: string) => onServiceChange ? onServiceChange(value) : setLocalService(value)
  const accepted = acceptedServices ? acceptedServices.includes(selectedService) : isCardAccepted
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const epochRef = useRef(0)

  useEffect(() => {
    if (services && services.length > 0 && !services.some(s => s.name === selectedService)) {
      setSelectedService(services[0].name)
    }
  }, [services, selectedService])

  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const dialToneRef = useRef<any>(null)

  const getServiceType = (serviceName: string) => {
    const lower = serviceName.toLowerCase()
    if (lower.includes("пожар") || lower.includes("101") || lower.includes("мчс")) return "fire"
    if (lower.includes("полиц") || lower.includes("102") || lower.includes("гибдд")) return "police"
    if (lower.includes("скор") || lower.includes("103") || lower.includes("мц")) return "ambulance"
    if (lower.includes("газ") || lower.includes("104")) return "gas"
    return "generic"
  }

  useEffect(() => {
    epochRef.current++
    savingRef.current = false
    setSaving(false)
    // Clear all timeouts and audio when selectedService changes
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current)
    if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current)
    if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current)
    
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    
    if (dialToneRef.current) {
      try {
        dialToneRef.current.stop()
        dialToneRef.current.disconnect()
      } catch (e) {}
      dialToneRef.current = null
    }

    setCallState("idle")
    setCallError(null)
    setInputsUnlocked(false)
    setWhoAccepted("")
    setSummary("")
    return () => {
      epochRef.current++
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current)
      if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current)
      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current)
      if (audioRef.current) audioRef.current.pause()
      if (dialToneRef.current) {
        try { dialToneRef.current.stop(); dialToneRef.current.disconnect() } catch {}
        dialToneRef.current = null
      }
    }
  }, [selectedService]) // ONLY reset when selectedService changes

  useEffect(() => {
    setSavedRequisites(calledServices.includes(selectedService))
  }, [calledServices, selectedService])

  const saved = savedDispatches?.[selectedService]
  useEffect(() => {
    if (saved) {
      setWhoAccepted(saved.whoAccepted)
      setSummary(saved.summary)
    }
  }, [selectedService, saved?.whoAccepted, saved?.summary])

  const handleSave = async () => {
    if (disabled || savingRef.current || !accepted || savedRequisites || !whoAccepted.trim() || !summary.trim()) return
    const epoch = epochRef.current
    savingRef.current = true
    setSaving(true)
    try {
      const result = await onServiceSaved?.(selectedService, whoAccepted.trim(), summary.trim())
      if (epochRef.current !== epoch || result === false) return
      setSavedRequisites(true)
      if (preparedExercise) return
      if (audioRef.current) audioRef.current.pause()
      const audio = new Audio(`/audio/tts/${getServiceType(selectedService)}_accepted.wav`)
      audioRef.current = audio
      audio.play().catch(() => {})
    } catch {
      // Keep the draft. The assigned-session controller owns errors and retries.
    } finally {
      if (epochRef.current === epoch) {
        savingRef.current = false
        setSaving(false)
      }
    }
  }

  const handleCall = () => {
    if (disabled || saving || !accepted) return
    if (callState !== "idle" && callState !== "connected") return
    setCallError(null)
    setCallState("dialing")
    setInputsUnlocked(false)

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (AudioCtx) {
        const ctx = new AudioCtx()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = "sine"
        osc.frequency.setValueAtTime(440, ctx.currentTime)
        gain.gain.setValueAtTime(0.08, ctx.currentTime)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        dialToneRef.current = osc

        callTimeoutRef.current = setTimeout(() => {
          try {
            osc.stop()
            ctx.close()
            dialToneRef.current = null
          } catch {}
        }, 1200)
      }
    } catch (e) {
      console.warn("AudioContext недоступен:", e)
    }

    speakingTimeoutRef.current = setTimeout(() => {
      setCallState("speaking")
      let finished = false

      const finishCall = () => {
        if (finished) return
        finished = true
        setCallState("connected")
        setInputsUnlocked(true)
        if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current)
      }

      const sType = getServiceType(selectedService)
      const audioUrl = `/audio/tts/${sType}_reply.wav`
      
      const audio = new Audio(audioUrl)
      audioRef.current = audio
      
      audio.onended = finishCall
      const failCall = () => {
        if (finished) return
        finished = true
        if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current)
        audio.pause()
        setCallState("idle")
        setCallError("Учебная аудиореплика недоступна. Повторите вызов; приём сообщения не подтверждён.")
      }
      audio.onerror = failCall
      
      audio.play().catch(e => {
        console.warn("Auto-play prevented or error", e)
        failCall()
      })
      
      fallbackTimeoutRef.current = setTimeout(failCall, 15000)
    }, 1300)
  }

  return (
    <div className={`flex shrink-0 flex-col gap-1.5 2xl:gap-2 select-none transition-opacity duration-300 ${!accepted ? 'opacity-40 grayscale' : ''}`}>
      {/* Section header (dark) */}
      <div className="mt-2 2xl:mt-3 flex items-center justify-between bg-[#303335] px-4 2xl:px-5 py-2 2xl:py-2">
        <span className="text-sm 2xl:text-sm font-bold text-white border-b border-dotted border-white">
          {preparedExercise ? "Передача задания бригаде" : "Отработка (Направление служб)"}
        </span>
        <span className={`text-[11px] 2xl:text-xs px-2 py-0.5 rounded font-semibold ${
          !accepted
            ? "bg-gray-700 text-gray-400"
            : callState === "connected"
            ? "bg-emerald-600 text-white"
            : callState === "dialing" || callState === "speaking"
            ? "bg-amber-500 text-white animate-pulse"
            : "bg-blue-600 text-white"
        }`}>
          {!accepted
            ? "Заблокировано (требуется статус «Принята»)"
            : preparedExercise
            ? savedRequisites ? "Задание передано" : "Запишите передачу задания"
            : callState === "connected"
            ? "Соединено ✓"
            : callState === "dialing"
            ? "Гудки..."
            : callState === "speaking"
            ? "Ответ дежурного..."
            : "Готово к вызову"}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1.5 2xl:gap-2">
        <div className="flex items-center rounded-[1px] border border-[#b4b9bc] bg-[#fbfdfe] px-4 2xl:px-5 py-2.5 2xl:py-2.5 text-base 2xl:text-sm gap-4">
          <select 
            aria-label="Служба для направления"
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            disabled={disabled || saving || callState === "dialing" || callState === "speaking"}
            className="flex-1 bg-white border border-gray-300 rounded px-3 py-2 text-[#111827] outline-none focus:border-[#0078d4]"
          >
            {services && services.length > 0 ? (
              services.map((srv, idx) => (
                <option key={idx} value={srv.name}>{srv.name}</option>
              ))
            ) : (
              <>
                <option value="Аварийная служба">Аварийная служба (ГБУ Жилищник)</option>
                <option value="Мосгаз">Аварийная Мосгаз</option>
                <option value="101">Служба 101 (МЧС / Пожарные)</option>
                <option value="102">Служба 102 (Полиция / ГИБДД)</option>
                <option value="103">Служба 103 (Скорая медицинская помощь)</option>
                <option value="ЦЭМП">ЦЭМП (Экстренная медицина катастроф)</option>
                <option value="Мосводоканал">Мосводоканал (Аварийная сетей)</option>
                <option value="Гормост">ГБУ Гормост</option>
              </>
            )}
          </select>

          <button
            hidden={preparedExercise}
            onClick={handleCall}
            disabled={disabled || saving || !accepted || callState === "dialing" || callState === "speaking"}
            className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded text-white font-bold transition-all shadow-sm ${
              callState === "dialing" || callState === "speaking"
                ? 'bg-amber-500 animate-pulse'
                : callState === "connected"
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-green-600 hover:bg-green-700'
            }`}
            title="Позвонить в дежурную службу"
          >
            <Phone className="w-5 h-5" />
            {callState === "dialing" ? 'Гудки...' : callState === "speaking" ? 'Слушаю...' : callState === "connected" ? 'Повторный вызов' : 'Позвонить ☎'}
          </button>
        </div>

        {callError && <p role="status" className="text-xs text-red-800">{callError}</p>}
        {/* Status Call Feedback Notification */}
        {callState === "speaking" && (
          <div className="bg-amber-50 border border-amber-300 px-4 py-2 rounded text-xs text-amber-900 flex items-center gap-2 animate-pulse">
            <span>🔊</span>
            <span className="font-semibold">
              {selectedService.toLowerCase().includes("пожар") || selectedService.includes("101")
                ? `Пожарная охрана, радиотелефонист Иванова, слушаю.`
                : selectedService.toLowerCase().includes("полиц") || selectedService.includes("102")
                ? `Дежурная часть полиции, майор Смирнов, слушаю.`
                : selectedService.toLowerCase().includes("скор") || selectedService.includes("103")
                ? `Станция скорой помощи, диспетчер Соколова, слушаю.`
                : selectedService.toLowerCase().includes("газ") || selectedService.includes("104")
                ? `Аварийная служба газа, мастер Петров, слушаю.`
                : `Дежурный диспетчер службы ${selectedService}, слушаю.`}
            </span>
          </div>
        )}

        {callState === "connected" && (
          <div className="bg-emerald-50 border border-emerald-300 px-4 py-1.5 rounded text-xs text-emerald-900 flex items-center gap-2">
            <span>✓</span>
            <span className="font-semibold">Учебная реплика воспроизведена. Заполните реквизиты приёма ниже:</span>
          </div>
        )}

        <div className="flex items-center rounded-[1px] border border-[#b4b9bc] bg-[#fbfdfe] px-4 2xl:px-5 py-2.5 2xl:py-2.5 text-sm 2xl:text-sm gap-2 2xl:gap-2">
          <span className="text-[#6b7280] min-w-[110px] font-medium">Кто принял:</span>
          <input 
            aria-label="Кто принял"
            type="text"
            disabled={disabled || saving || !accepted || savedRequisites}
            value={whoAccepted}
            onChange={(e) => setWhoAccepted(e.target.value)}
            className={`flex-1 bg-transparent outline-none border-b border-transparent focus:border-[#0078d4] text-[#111827] font-medium`}
            placeholder="ФИО / должность дежурного (напр. Диспетчер Сидоров С.И.)"
          />
        </div>

        <div className="flex items-center rounded-[1px] border border-[#b4b9bc] bg-[#fbfdfe] px-4 2xl:px-5 py-2.5 2xl:py-2.5 text-sm 2xl:text-sm gap-2 2xl:gap-2">
          <span className="text-[#6b7280] min-w-[110px] font-medium">Суть:</span>
          <input 
            aria-label="Суть сообщения"
            type="text"
            disabled={disabled || saving || !accepted || savedRequisites}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className={`flex-1 bg-transparent outline-none border-b border-transparent focus:border-[#0078d4] text-[#111827] font-medium`}
            placeholder="Краткая суть телефонограммы (напр. направлена бригада №2 на распил)"
          />
        </div>

        <div className="flex justify-end mt-1">
          <button
            onClick={handleSave}
            disabled={disabled || saving || !accepted || savedRequisites || !whoAccepted.trim() || !summary.trim()}
              className={`px-4 py-1.5 text-xs font-bold rounded transition-colors ${
                savedRequisites 
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed" 
                  : !whoAccepted.trim() || !summary.trim()
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed border"
                  : "bg-[#0078d4] text-white hover:bg-[#006cbd]"
              }`}
            >
              {saving ? "Сохранение..." : savedRequisites ? "✓ Сохранено" : "Сохранить"}
            </button>
          </div>
      </div>
    </div>
  )
}
