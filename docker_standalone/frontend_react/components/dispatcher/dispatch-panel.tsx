"use client"

import { useState, useRef } from "react"
import { Phone } from "lucide-react"

type Props = {
  isCardAccepted: boolean
  whoAccepted: string
  setWhoAccepted: (v: string) => void
  summary: string
  setSummary: (v: string) => void
}

export function DispatchPanel({ isCardAccepted, whoAccepted, setWhoAccepted, summary, setSummary }: Props) {
  const [callState, setCallState] = useState<"idle" | "dialing" | "speaking" | "connected">("idle")
  const [inputsUnlocked, setInputsUnlocked] = useState(false)
  const [selectedService, setSelectedService] = useState("Аварийная служба")

  const handleCall = () => {
    if (callState !== "idle" && callState !== "connected") return
    setCallState("dialing")
    setInputsUnlocked(false)

    try {
      // Play dial tone / beep via Web Audio API
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
        setTimeout(() => {
          try {
            osc.stop()
            ctx.close()
          } catch {}
        }, 1200)
      }
    } catch (e) {
      console.warn("AudioContext недоступен, продолжаем без звука:", e)
    }

    // Step 2: Speech synthesis answer after dial tone
    setTimeout(() => {
      setCallState("speaking")
      let finished = false

      const finishCall = () => {
        if (finished) return
        finished = true
        setCallState("connected")
        setInputsUnlocked(true)
      }

      if ("speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel()
          const phrase = `Слушаю, служба ${selectedService}, информация принята.`
          const utterance = new SpeechSynthesisUtterance(phrase)
          utterance.lang = "ru-RU"
          utterance.rate = 1.0
          utterance.onend = finishCall
          utterance.onerror = finishCall
          window.speechSynthesis.speak(utterance)
        } catch {
          finishCall()
        }
      }

      // Safe fallback timeout in case TTS doesn't trigger onend
      setTimeout(finishCall, 2000)
    }, 1300)
  }

  return (
    <div className={`flex shrink-0 flex-col gap-1.5 2xl:gap-2 select-none transition-opacity duration-300 ${!isCardAccepted ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
      {/* Section header (dark) */}
      <div className="mt-2 2xl:mt-3 flex items-center justify-between bg-[#303335] px-4 2xl:px-6 py-2 2xl:py-3">
        <span className="text-sm 2xl:text-lg font-bold text-white border-b border-dotted border-white">
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
        <div className="flex items-center rounded-[1px] border border-[#b4b9bc] bg-[#fbfdfe] px-4 2xl:px-6 py-2.5 2xl:py-3.5 text-base 2xl:text-xl gap-4">
          <select 
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            disabled={callState === "dialing" || callState === "speaking"}
            className="flex-1 bg-white border border-gray-300 rounded px-3 py-2 text-[#111827] outline-none focus:border-[#0078d4]"
          >
            <option value="Аварийная служба">Аварийная служба (ГБУ Жилищник)</option>
            <option value="Мосгаз">Аварийная Мосгаз</option>
            <option value="101">Служба 101 (МЧС / Пожарные)</option>
            <option value="102">Служба 102 (Полиция / ГИБДД)</option>
            <option value="103">Служба 103 (Скорая медицинская помощь)</option>
            <option value="ЦЭМП">ЦЭМП (Экстренная медицина катастроф)</option>
            <option value="Мосводоканал">Мосводоканал (Аварийная сетей)</option>
            <option value="Гормост">ГБУ Гормост</option>
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
            <span className="font-semibold">Дежурный службы {selectedService}: «Слушаю, информация принята.»</span>
          </div>
        )}

        {callState === "connected" && (
          <div className="bg-emerald-50 border border-emerald-300 px-4 py-1.5 rounded text-xs text-emerald-900 flex items-center gap-2">
            <span>✓</span>
            <span className="font-semibold">Телефонограмма передана. Заполните реквизиты приема ниже:</span>
          </div>
        )}

        <div className="flex items-center rounded-[1px] border border-[#b4b9bc] bg-[#fbfdfe] px-4 2xl:px-6 py-2.5 2xl:py-3.5 text-sm 2xl:text-lg gap-2 2xl:gap-3">
          <span className="text-[#6b7280] min-w-[110px] font-medium">Кто принял:</span>
          <input 
            type="text"
            disabled={!inputsUnlocked}
            value={whoAccepted}
            onChange={(e) => setWhoAccepted(e.target.value)}
            className={`flex-1 bg-transparent outline-none border-b border-transparent focus:border-[#0078d4] text-[#111827] ${
              !inputsUnlocked ? 'opacity-50 cursor-not-allowed' : 'font-medium'
            }`}
            placeholder={inputsUnlocked ? "ФИО / должность дежурного (напр. Диспетчер Сидоров С.И.)" : "Сначала совершите звонок ☎..."}
          />
        </div>

        <div className="flex items-center rounded-[1px] border border-[#b4b9bc] bg-[#fbfdfe] px-4 2xl:px-6 py-2.5 2xl:py-3.5 text-sm 2xl:text-lg gap-2 2xl:gap-3">
          <span className="text-[#6b7280] min-w-[110px] font-medium">Суть:</span>
          <input 
            type="text"
            disabled={!inputsUnlocked}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className={`flex-1 bg-transparent outline-none border-b border-transparent focus:border-[#0078d4] text-[#111827] ${
              !inputsUnlocked ? 'opacity-50 cursor-not-allowed' : 'font-medium'
            }`}
            placeholder={inputsUnlocked ? "Краткая суть телефонограммы (напр. направлена бригада №2 на распил)" : "Сначала совершите звонок ☎..."}
          />
        </div>
      </div>
    </div>
  )
}
