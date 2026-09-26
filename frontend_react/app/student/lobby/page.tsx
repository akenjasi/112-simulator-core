"use client"

import React, { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Headphones,
  Radio,
  Play,
  CheckCircle2,
  User,
  Loader2,
  AlertTriangle,
  ArrowRight,
  Ear,
  Mic,
  MicOff,
  Volume2,
  Sliders,
  X,
} from "lucide-react"

// Helper to downsample Web Audio buffer to 16kHz Int16 for GigaAM
function downsampleTo16k(buffer: Float32Array, sampleRate: number): Int16Array {
  if (sampleRate === 16000) {
    const result = new Int16Array(buffer.length)
    for (let i = 0; i < buffer.length; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]))
      result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    return result
  }
  const ratio = sampleRate / 16000
  const newLength = Math.round(buffer.length / ratio)
  const result = new Int16Array(newLength)
  for (let i = 0; i < newLength; i++) {
    const origIdx = Math.round(i * ratio)
    const s = Math.max(-1, Math.min(1, buffer[origIdx] || 0))
    result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
  }
  return result
}

export default function StudentLobbyPage() {
  const router = useRouter()
  const [selectedRole, setSelectedRole] = useState<"OPERATOR_112" | "DISPATCHER_DDS">("OPERATOR_112")
  const [isStartingDemo, setIsStartingDemo] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [evaluationToast, setEvaluationToast] = useState<string | null>(null)

  // Equipment Modal state
  const [isAudioModalOpen, setIsAudioModalOpen] = useState<boolean>(false)

  // Headphone test state
  const [testingChannel, setTestingChannel] = useState<"left" | "right" | null>(null)

  // Real microphone & speech recognition states
  const [isMicTesting, setIsMicTesting] = useState<boolean>(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [realVolume, setRealVolume] = useState<number>(0)
  const [realBars, setRealBars] = useState<number[]>(new Array(16).fill(6))
  const [recognizedText, setRecognizedText] = useState<string>("")
  const [isSpeechDetected, setIsSpeechDetected] = useState<boolean>(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null)

  // Try to read cadet role and evaluation toast from storage if set
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedRole = localStorage.getItem("cadet_role")
      if (storedRole === "DISPATCHER_DDS" || storedRole === "OPERATOR_112") {
        setSelectedRole(storedRole)
      }
      const storedToast = sessionStorage.getItem("evaluation_toast")
      if (storedToast) {
        setEvaluationToast(storedToast)
        sessionStorage.removeItem("evaluation_toast")
      }
    }
  }, [])

  // Cleanup mic & audio resources on unmount
  useEffect(() => {
    return () => {
      stopMicTest()
    }
  }, [])

  const handleSelectRole = (role: "OPERATOR_112" | "DISPATCHER_DDS") => {
    setSelectedRole(role)
    if (typeof window !== "undefined") {
      localStorage.setItem("cadet_role", role)
    }
  }

  // Web Audio test tone with stereo panning for left/right headset verification
  const playChannelTone = (channel: "left" | "right") => {
    setTestingChannel(channel)
    setTimeout(() => {
      setTestingChannel((curr) => (curr === channel ? null : curr))
    }, 600)

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const panValue = channel === "left" ? -1 : 1

      if (typeof ctx.createStereoPanner === "function") {
        const panner = ctx.createStereoPanner()
        panner.pan.value = panValue
        osc.connect(gain)
        gain.connect(panner)
        panner.connect(ctx.destination)
      } else {
        const merger = ctx.createChannelMerger(2)
        osc.connect(gain)
        if (channel === "left") {
          gain.connect(merger, 0, 0)
        } else {
          gain.connect(merger, 0, 1)
        }
        merger.connect(ctx.destination)
      }

      osc.type = "sine"
      osc.frequency.setValueAtTime(channel === "left" ? 523.25 : 659.25, ctx.currentTime) // C5 (L) and E5 (R)
      gain.gain.setValueAtTime(0.001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)

      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.55)
    } catch (err) {
      console.warn("Ошибка воспроизведения тестового тона:", err)
    }
  }

  // Real-Time Streaming ASR via GigaAM-v3 WebSocket + MediaRecorder
  const startMicTest = async () => {
    setMicError(null)
    setRecognizedText("")
    setIsSpeechDetected(false)
    recordedChunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        } 
      })
      mediaStreamRef.current = stream

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioCtx()
      audioContextRef.current = ctx

      // 1. AnalyserNode for volume bars & voice detection
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      analyser.smoothingTimeConstant = 0.8
      analyserRef.current = analyser

      const source = ctx.createMediaStreamSource(stream)
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const updateAudioLevel = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)

        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i]
        }
        const avg = sum / dataArray.length
        const vol = Math.min(100, Math.round((avg / 128) * 100))
        setRealVolume(vol)

        if (vol > 15) {
          setIsSpeechDetected(true)
        }

        const barCount = 16
        const step = Math.floor(dataArray.length / barCount) || 1
        const newBars = []
        for (let i = 0; i < barCount; i++) {
          const val = dataArray[i * step] || 0
          newBars.push(Math.max(6, Math.min(100, Math.round((val / 240) * 100))))
        }
        setRealBars(newBars)

        animFrameRef.current = requestAnimationFrame(updateAudioLevel)
      }
      updateAudioLevel()

      // 2. Connect to GigaAM-v3 Real-Time WebSocket ASR
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:"
      const wsHost = window.location.hostname || "127.0.0.1"
      const wsPort = window.location.port === "3000" ? "8000" : window.location.port || "8000"
      const wsUrl = `${wsProtocol}//${wsHost}:${wsPort}/api/v2/asr/stream`

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log("Connected to GigaAM ASR stream:", wsUrl)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === "transcript" && data.text) {
            setRecognizedText(data.text)
            setIsSpeechDetected(true)
          }
        } catch (e) {
          console.warn("Failed to parse ASR message:", e)
        }
      }

      ws.onerror = (err) => {
        console.warn("WebSocket ASR error:", err)
      }

      // 3. Stream 16kHz PCM chunks via ScriptProcessorNode
      const bufferSize = 4096
      const scriptNode = ctx.createScriptProcessor(bufferSize, 1, 1)
      scriptProcessorRef.current = scriptNode

      scriptNode.onaudioprocess = (e) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0)
          const pcm16 = downsampleTo16k(inputData, ctx.sampleRate)
          // Tagged with PCM1 header
          const packet = new Uint8Array(4 + pcm16.byteLength)
          packet.set([80, 67, 77, 49], 0) // "PCM1"
          packet.set(new Uint8Array(pcm16.buffer), 4)
          wsRef.current.send(packet.buffer)
        }
      }

      source.connect(scriptNode)
      scriptNode.connect(ctx.destination)

      // 4. Concurrently record using MediaRecorder for POST /api/v2/asr/transcribe fallback
      try {
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/ogg"
        const mediaRecorder = new MediaRecorder(stream, { mimeType })
        mediaRecorderRef.current = mediaRecorder

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recordedChunksRef.current.push(e.data)
          }
        }

        mediaRecorder.start(500)
      } catch (mrErr) {
        console.warn("MediaRecorder init error:", mrErr)
      }

      setIsMicTesting(true)
    } catch (err: any) {
      console.error("Microphone access error:", err)
      setMicError("Доступ к микрофону отклонен или микрофон не обнаружен. Разрешите доступ в браузере.")
      setIsMicTesting(false)
    }
  }

  const stopMicTest = () => {
    // Disconnect ScriptProcessor
    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect()
      } catch (_) {}
      scriptProcessorRef.current = null
    }

    // Finalize and close WebSocket
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "finalize" }))
        }
        setTimeout(() => {
          if (wsRef.current) {
            wsRef.current.close()
            wsRef.current = null
          }
        }, 300)
      } catch (_) {
        wsRef.current = null
      }
    }

    // Stop MediaRecorder and send POST /api/v2/asr/transcribe
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop()
      } catch (_) {}
    }

    const sendPostTranscribe = async () => {
      if (recordedChunksRef.current.length > 0) {
        const blob = new Blob(recordedChunksRef.current, { type: "audio/webm" })
        const formData = new FormData()
        formData.append("file", blob, "mic_test.webm")
        try {
          const resp = await fetch("/api/v2/asr/transcribe", {
            method: "POST",
            body: formData,
          })
          if (resp.ok) {
            const data = await resp.json()
            if (data.text && data.text.trim()) {
              setRecognizedText(data.text)
              setIsSpeechDetected(true)
            }
          }
        } catch (e) {
          console.warn("POST /transcribe fallback failed:", e)
        }
      }
    }
    setTimeout(sendPostTranscribe, 250)

    // Stop media streams & audio context
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close()
      } catch (_) {}
      audioContextRef.current = null
    }
    setIsMicTesting(false)
    setRealVolume(0)
    setRealBars(new Array(16).fill(6))
  }

  const handleCloseModal = () => {
    stopMicTest()
    setIsAudioModalOpen(false)
  }

  // Call POST /api/v1/sessions/demo and redirect
  const handleDemoLaunch = async () => {
    setIsStartingDemo(true)
    setErrorMessage(null)

    if (typeof window !== "undefined") {
      localStorage.setItem("cadet_role", selectedRole)
    }

    try {
      const response = await fetch("/api/v1/sessions/demo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target_role: selectedRole,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const detail = errorData.detail || "Не удалось инициализировать демо-сессию."
        throw new Error(detail)
      }

      const data = await response.json()
      const targetUrl =
        data.redirect_url ||
        (selectedRole === "DISPATCHER_DDS"
          ? `/dds/journal?session_id=${data.session_id}&ticket_id=${data.ticket_id}&incoming_call=true`
          : `/operator/journal?session_id=${data.session_id}&ticket_id=${data.ticket_id}&incoming_call=true`)

      // Perform redirect
      router.push(targetUrl)
    } catch (err: any) {
      console.error("Ошибка при демо-запуске:", err)
      setErrorMessage(
        err.message ||
          "Не удалось запустить демо-сессию. Убедитесь, что сервер запущен и в базе присутствуют билеты."
      )
      setIsStartingDemo(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-background to-slate-100 dark:from-slate-950 dark:via-background dark:to-slate-900 flex flex-col justify-between p-4 md:p-8">
      {/* Top Header */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-md font-bold text-lg">
            112
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground leading-tight">
              Тренажер Системы-112
            </h1>
            <p className="text-xs text-muted-foreground">
              Терминал курсанта • Лобби ожидания
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/student/profile">
            <Button variant="outline" size="sm" className="gap-2 text-xs h-9">
              <User className="h-3.5 w-3.5" />
              <span>Личный кабинет</span>
            </Button>
          </Link>

          <Badge
            variant="outline"
            className="gap-1.5 px-3 py-1.5 text-xs border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold hidden sm:flex"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Сервер подключен</span>
          </Badge>
        </div>
      </header>

      {/* Main Center Waiting Card (fits screen height without scrolling) */}
      <main className="max-w-xl w-full mx-auto my-auto py-4">
        <Card className="border-2 border-primary/20 shadow-xl overflow-hidden backdrop-blur-xs bg-card/95">
          {/* Top Strict Solid Line (no gradient) */}
          <div className="h-1.5 bg-[#1f2b31] dark:bg-slate-700" />

          <CardHeader className="text-center pt-7 pb-3 space-y-3">
            {/* Pulsing Sonar / Radar Animation */}
            <div className="relative mx-auto flex items-center justify-center w-20 h-20">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-75" />
              <div className="absolute inset-2 rounded-full bg-primary/15 animate-pulse" />
              <div className="relative z-10 w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center shadow-lg">
                {selectedRole === "OPERATOR_112" ? (
                  <Headphones className="h-7 w-7 animate-pulse" />
                ) : (
                  <Radio className="h-7 w-7 animate-pulse" />
                )}
              </div>
            </div>

            <div className="space-y-1">
              <CardTitle className="text-xl sm:text-2xl font-extrabold tracking-tight">
                Ожидание старта. Преподаватель подготавливает занятие...
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
                Сценарий и параметры симуляции будут загружены автоматически. Либо воспользуйтесь режимом «Демо-запуск» для самостоятельной тренировки.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pt-1 pb-5 px-6">
            {/* Role switch toggle: Operator 112 vs Dispatcher DDS */}
            <div className="p-3.5 rounded-xl border bg-muted/40 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <span>Целевая учебная роль:</span>
                <span className="text-[11px] normal-case text-primary font-normal">
                  (для демо-запуска)
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSelectRole("OPERATOR_112")}
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    selectedRole === "OPERATOR_112"
                      ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40 font-bold"
                      : "border-border/70 hover:bg-muted/60 opacity-80"
                  }`}
                >
                  <Headphones className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-foreground">Оператор 112</div>
                    <div className="text-[11px] text-muted-foreground">Прием звонков</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRole("DISPATCHER_DDS")}
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    selectedRole === "DISPATCHER_DDS"
                      ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40 font-bold"
                      : "border-border/70 hover:bg-muted/60 opacity-80"
                  }`}
                >
                  <Radio className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-foreground">Диспетчер ДДС</div>
                    <div className="text-[11px] text-muted-foreground">Направление служб</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Error Message Box */}
            {errorMessage && (
              <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400 text-xs flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold">Ошибка демо-запуска</div>
                  <div>{errorMessage}</div>
                </div>
              </div>
            )}

            {/* Dedicated button to open equipment check without scrolling */}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAudioModalOpen(true)}
                className="w-full h-10 border-primary/30 hover:border-primary/60 bg-primary/5 hover:bg-primary/10 text-primary font-medium gap-2 cursor-pointer transition-all shadow-2xs"
              >
                <Sliders className="h-4 w-4" />
                <span>Проверка оборудования (наушники и микрофон)</span>
              </Button>
            </div>

            {/* Accent Demo Launch Action Button */}
            <div className="pt-1 space-y-1.5">
              <Button
                size="lg"
                onClick={handleDemoLaunch}
                disabled={isStartingDemo}
                className="w-full py-5 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg transition-all gap-2 cursor-pointer"
              >
                {isStartingDemo ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Инициализация сессии...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 fill-current" />
                    <span>
                      Демо-запуск ({selectedRole === "DISPATCHER_DDS" ? "Диспетчер ДДС" : "Оператор 112"})
                    </span>
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                Переход на рабочее место:{" "}
                <span className="font-semibold text-foreground">
                  {selectedRole === "DISPATCHER_DDS" ? "Диспетчер ДДС (/dds)" : "Оператор 112 (/operator)"}
                </span>
              </p>
            </div>
          </CardContent>

          <CardFooter className="bg-muted/20 border-t py-2.5 px-6 flex justify-between items-center text-xs text-muted-foreground">
            <span className="font-mono">Идентификатор АРМ: WKST-7 (Курсант)</span>
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Готов к работе
            </span>
          </CardFooter>
        </Card>
      </main>

      {/* Footer without copyright text */}
      <footer className="max-w-4xl w-full mx-auto text-center text-xs text-muted-foreground">
      </footer>

      {/* Equipment Check Modal (Headphones + Real Mic Speech Recognition) */}
      {isAudioModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <Card className="max-w-lg w-full border border-border/80 shadow-2xl overflow-hidden bg-card">
            {/* Strict solid top line */}
            <div className="h-1.5 bg-[#1f2b31] dark:bg-slate-700" />

            <CardHeader className="pt-5 pb-3 px-6 flex flex-row items-start justify-between space-y-0">
              <div>
                <div className="flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg font-bold">
                    Проверка оборудования (гарнитура и микрофон)
                  </CardTitle>
                </div>
                <CardDescription className="text-xs mt-1">
                  Тест стереоканалов наушников и реальное распознавание речи с микрофона
                </CardDescription>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md cursor-pointer transition-colors"
                title="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
            </CardHeader>

            <CardContent className="space-y-4 px-6 pb-6 pt-1">
              {/* Test 1: Stereo Headphones */}
              <div className="p-3.5 rounded-xl border bg-muted/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <Headphones className="h-4 w-4 text-primary" />
                    <span>Тест наушников (Стереоканалы)</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {testingChannel ? `Воспроизведение: ${testingChannel === "left" ? "Левый канал" : "Правый канал"}` : "Проверьте слышимость"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => playChannelTone("left")}
                    className={`h-10 justify-center gap-2 text-xs font-medium cursor-pointer transition-all ${
                      testingChannel === "left"
                        ? "border-primary bg-primary/15 text-primary ring-2 ring-primary/40 font-bold"
                        : "hover:bg-muted/80 hover:border-primary/50"
                    }`}
                  >
                    <Ear className={`h-4 w-4 ${testingChannel === "left" ? "text-primary animate-bounce" : "text-muted-foreground"}`} />
                    <span>Тест Левый канал</span>
                    <Volume2 className="h-3.5 w-3.5 opacity-60 ml-1" />
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => playChannelTone("right")}
                    className={`h-10 justify-center gap-2 text-xs font-medium cursor-pointer transition-all ${
                      testingChannel === "right"
                        ? "border-primary bg-primary/15 text-primary ring-2 ring-primary/40 font-bold"
                        : "hover:bg-muted/80 hover:border-primary/50"
                    }`}
                  >
                    <Volume2 className="h-3.5 w-3.5 opacity-60 mr-1" />
                    <span>Тест Правый канал</span>
                    <Ear className={`h-4 w-4 ${testingChannel === "right" ? "text-primary animate-bounce" : "text-muted-foreground"}`} />
                  </Button>
                </div>
              </div>

              {/* Test 2: Real Microphone & Speech Recognition */}
              <div className="p-3.5 rounded-xl border bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <Mic className={`h-4 w-4 ${isMicTesting && realVolume > 15 ? "text-emerald-500 animate-pulse" : "text-muted-foreground"}`} />
                    <span>Реальный тест микрофона и распознавание речи</span>
                  </div>
                  {isMicTesting ? (
                    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px] gap-1.5 animate-pulse">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span>GigaAM Live ASR</span>
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[11px] text-muted-foreground">
                      Неактивен
                    </Badge>
                  )}
                </div>

                {/* Action button to Start/Stop mic */}
                <div className="flex items-center gap-2">
                  {!isMicTesting ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={startMicTest}
                      className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium cursor-pointer"
                    >
                      <Mic className="h-4 w-4" />
                      <span>Начать проверку микрофона</span>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={stopMicTest}
                      className="w-full gap-2 text-xs font-medium cursor-pointer"
                    >
                      <MicOff className="h-4 w-4" />
                      <span>Остановить проверку микрофона</span>
                    </Button>
                  )}
                </div>

                {/* Error notice if mic failed */}
                {micError && (
                  <div className="p-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{micError}</span>
                  </div>
                )}

                {/* Live Volume Meter and Visualizer */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Уровень громкости (реальный вход):</span>
                    <span className="font-mono font-bold text-foreground">{realVolume}%</span>
                  </div>
                  <div className="h-10 w-full bg-slate-100 dark:bg-slate-900/80 rounded-lg p-2 border border-slate-200 dark:border-slate-800 flex items-end gap-1 overflow-hidden">
                    {realBars.map((height, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-xs transition-[height] duration-75 ${
                          height > 70
                            ? "bg-amber-500 dark:bg-amber-400"
                            : height > 20
                            ? "bg-emerald-500 dark:bg-emerald-400"
                            : "bg-emerald-600/40 dark:bg-emerald-500/30"
                        }`}
                        style={{ height: `${Math.max(8, height)}%` }}
                      />
                    ))}
                  </div>
                </div>

                {/* Speech Recognition Output Box */}
                <div className="p-3 rounded-lg bg-background border space-y-1.5 text-xs shadow-2xs">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                    <span>
                      {isMicTesting
                        ? "Говорите в микрофон (распознавание в реальном времени):"
                        : "Нажмите «Начать проверку микрофона», чтобы произнести фразу"}
                    </span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                      GigaAM-v3 CTC
                    </span>
                  </div>
                  <div className="min-h-9 flex items-center font-medium p-2 rounded bg-muted/20 border border-border/50 text-sm">
                    {recognizedText ? (
                      <span className="text-foreground">
                        Вы сказали: <span className="font-semibold text-emerald-600 dark:text-emerald-400">«{recognizedText}»</span>
                      </span>
                    ) : isMicTesting ? (
                      <span className="text-muted-foreground italic text-xs flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                        Слушаю вас... Говорите в микрофон (например: «Раз, два, три, проверка связи»)
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs italic">Текст распознанной речи появится здесь...</span>
                    )}
                  </div>
                </div>

                {/* Status Indicators */}
                {(isSpeechDetected || recognizedText || realVolume > 15) ? (
                  <div className="flex items-center gap-2 pt-0.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span>Микрофон работает и распознает речь (Нейросеть GigaAM)</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">
                    Статус: {isMicTesting ? "микрофон активен, произнесите фразу" : "готов к тестированию"}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCloseModal}
                  className="text-xs cursor-pointer"
                >
                  Закрыть
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Evaluation Result Toast */}
      {evaluationToast && (
        <div className="fixed bottom-8 right-8 z-50 bg-slate-900 text-white text-xs px-4 py-3 rounded-lg shadow-2xl border border-emerald-500/50 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-md">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shrink-0" />
          <div className="flex-1 font-medium">{evaluationToast}</div>
          <button
            type="button"
            onClick={() => setEvaluationToast(null)}
            className="text-slate-400 hover:text-white cursor-pointer ml-2"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
