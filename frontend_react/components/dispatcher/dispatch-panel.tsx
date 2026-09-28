"use client"

import { useState, useRef, useEffect } from "react"
import { Phone } from "lucide-react"

type Props = {
  isCardAccepted: boolean
  whoAccepted: string
  setWhoAccepted: (v: string) => void
  summary: string
  setSummary: (v: string) => void
  services?: any[]
  calledServices?: string[]
  onServiceSaved?: (serviceName: string) => void
}

export function DispatchPanel({ isCardAccepted, whoAccepted, setWhoAccepted, summary, setSummary, services = [], calledServices = [], onServiceSaved }: Props) {
  const [callState, setCallState] = useState<"idle" | "dialing" | "speaking" | "connected">("idle")
  const [inputsUnlocked, setInputsUnlocked] = useState(false)
  const [savedRequisites, setSavedRequisites] = useState(false)
  const [selectedService, setSelectedService] = useState(services && services.length > 0 ? services[0].name : "Аварийная служба")

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
    setInputsUnlocked(false)
    setWhoAccepted("")
    setSummary("")
  }, [selectedService]) // ONLY reset when selectedService changes

  useEffect(() => {
    setSavedRequisites(calledServices.includes(selectedService))
  }, [calledServices, selectedService])

  const handleCall = () => {
    if (callState !== "idle" && callState !== "connected") return
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
      audio.onerror = () => {
        console.warn("Failed to play static TTS, falling back to finishCall")
        finishCall()
      }
      
      audio.play().catch(e => {
        console.warn("Auto-play prevented or error", e)
        finishCall()
      })
      
      fallbackTimeoutRef.current = setTimeout(finishCall, 8000)
    }, 1300)
  }

  return (
    <div className={`flex shrink-0 flex-col gap-1.5 2xl:gap-2 select-none transition-opacity duration-300 ${!isCardAccepted ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
      {/* Section header (dark) */}
      <div className="mt-2 2xl:mt-3 flex items-center justify-between bg-[#303335] px-4 2xl:px-5 py-2 2xl:py-2">
        <span className="text-sm 2xl:text-sm font-bold text-white border-b border-dotted border-white">
          Отработка (Направление служб)
        </span>
        <span className={`text-[11px] 2xl:text-xs px-2 py-0.5 rounded font-semibold ${
          !isCardAccepted
            ? "bg-gray-700 text-gray-400"
            : callState === "connected"
            ? "bg-emerald-600 text-white"
            : callState === "dialing" || callState === "speaking"
            ? "bg-amber-500 text-white animate-pulse"
            : "bg-blue-600 text-white"
        }`}>
          {!isCardAccepted
            ? "Заблокировано (требуется статус «Принята»)"
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
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            disabled={callState === "dialing" || callState === "speaking"}
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
            onClick={handleCall}
            disabled={callState === "dialing" || callState === "speaking"}
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
            <span className="font-semibold">Телефонограмма передана. Заполните реквизиты приема ниже:</span>
          </div>
        )}

        <div className="flex items-center rounded-[1px] border border-[#b4b9bc] bg-[#fbfdfe] px-4 2xl:px-5 py-2.5 2xl:py-2.5 text-sm 2xl:text-sm gap-2 2xl:gap-2">
          <span className="text-[#6b7280] min-w-[110px] font-medium">Кто принял:</span>
          <input 
            type="text"
            disabled={savedRequisites}
            value={whoAccepted}
            onChange={(e) => setWhoAccepted(e.target.value)}
            className={`flex-1 bg-transparent outline-none border-b border-transparent focus:border-[#0078d4] text-[#111827] font-medium`}
            placeholder="ФИО / должность дежурного (напр. Диспетчер Сидоров С.И.)"
          />
        </div>

        <div className="flex items-center rounded-[1px] border border-[#b4b9bc] bg-[#fbfdfe] px-4 2xl:px-5 py-2.5 2xl:py-2.5 text-sm 2xl:text-sm gap-2 2xl:gap-2">
          <span className="text-[#6b7280] min-w-[110px] font-medium">Суть:</span>
          <input 
            type="text"
            disabled={savedRequisites}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className={`flex-1 bg-transparent outline-none border-b border-transparent focus:border-[#0078d4] text-[#111827] font-medium`}
            placeholder="Краткая суть телефонограммы (напр. направлена бригада №2 на распил)"
          />
        </div>

        <div className="flex justify-end mt-1">
          <button
            onClick={() => {
                if (whoAccepted.trim() && summary.trim()) {
                  setSavedRequisites(true)
                  if (onServiceSaved) onServiceSaved(selectedService)
                  
                  if (audioRef.current) {
                    audioRef.current.pause()
                  }
                  
                  const sType = getServiceType(selectedService)
                  const audioUrl = `/audio/tts/${sType}_accepted.wav`
                  const audio = new Audio(audioUrl)
                  audioRef.current = audio
                  audio.play().catch(e => console.warn("Auto-play prevented", e))
                }
              }}
              disabled={savedRequisites || !whoAccepted.trim() || !summary.trim()}
              className={`px-4 py-1.5 text-xs font-bold rounded transition-colors ${
                savedRequisites 
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed" 
                  : !whoAccepted.trim() || !summary.trim()
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed border"
                  : "bg-[#0078d4] text-white hover:bg-[#006cbd]"
              }`}
            >
              {savedRequisites ? "✓ Сохранено" : "Сохранить"}
            </button>
          </div>
      </div>
    </div>
  )
}
