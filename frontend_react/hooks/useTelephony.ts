"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useCallStore } from "../store/useCallStore"
// Note: In future stages when Asterisk SIP/WebRTC PBX is connected,
// sip.js UserAgent will be initialized here for browser softphone registration:
// import { UserAgent } from "sip.js"

export type CallStatus = "IDLE" | "RINGING" | "ANSWERED" | "HANGUP"

interface UseTelephonyOptions {
  sessionId?: string | null
  ticketId?: string | null
  operatorExt?: string
  autoStart?: boolean
}

export function useTelephony({
  sessionId = null,
  ticketId = null,
  operatorExt = "1002",
  autoStart = false,
}: UseTelephonyOptions = {}) {
  const [callStatus, setCallStatus] = useState<CallStatus>("IDLE")
  const [callId, setCallId] = useState<string | null>(null)
  const [activeExt, setActiveExt] = useState<string>(operatorExt)
  const [isConnected, setIsConnected] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const asrWsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const ringOscillatorRef = useRef<OscillatorNode | null>(null)
  const ringGainRef = useRef<GainNode | null>(null)
  const ringIntervalRef = useRef<any>(null)

  // ─── Ringtone Generator (Web Audio API: Russian 425Hz cadence) ────────────
  const stopRingAudio = useCallback(() => {
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current)
      ringIntervalRef.current = null
    }
    if (ringGainRef.current) {
      try {
        ringGainRef.current.gain.setValueAtTime(0, audioContextRef.current?.currentTime || 0)
      } catch (e) {
        // ignore audio state error
      }
    }
    if (ringOscillatorRef.current) {
      try {
        ringOscillatorRef.current.stop()
        ringOscillatorRef.current.disconnect()
      } catch (e) {
        // ignore
      }
      ringOscillatorRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      try {
        audioContextRef.current.close()
      } catch (e) {
        // ignore
      }
      audioContextRef.current = null
    }
  }, [])

  const startRingAudio = useCallback(() => {
    // Stop any existing sound first
    stopRingAudio()

    if (typeof window === "undefined") return

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      audioContextRef.current = ctx

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = "sine"
      osc.frequency.setValueAtTime(425, ctx.currentTime) // Russian PBX standard 425 Hz
      gain.gain.setValueAtTime(0.08, ctx.currentTime)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()

      ringOscillatorRef.current = osc
      ringGainRef.current = gain

      // Russian cadence: 1.0s tone, 4.0s pause (or standard simulation: 1s on, 2s off)
      let isOn = true
      ringIntervalRef.current = setInterval(() => {
        if (!audioContextRef.current || audioContextRef.current.state === "closed") return
        isOn = !isOn
        const now = audioContextRef.current.currentTime
        gain.gain.setValueAtTime(isOn ? 0.08 : 0, now)
      }, 1000)
    } catch (e) {
      // Audio playback might be restricted by browser policy before first interaction
      console.warn("Telephony ring audio not allowed or failed:", e)
    }
  }, [stopRingAudio])

  useEffect(() => {
    useCallStore.getState().registerAsrSender((text: string) => {
      if (asrWsRef.current?.readyState === WebSocket.OPEN) {
        asrWsRef.current.send(JSON.stringify({ type: "text_input", text }))
      } else {
        console.warn("ASR WebSocket is not open, cannot send text")
      }
    })
  }, [])

  // Manage ringing sound according to callStatus
  useEffect(() => {
    if (callStatus === "RINGING") {
      startRingAudio()
    } else {
      stopRingAudio()
    }
    return () => {
      stopRingAudio()
    }
  }, [callStatus, startRingAudio, stopRingAudio])

  // ─── WebSocket connection to backend telephony router ─────────────────────
  useEffect(() => {
    const sessionKey = sessionId || ticketId
    if (!sessionKey || typeof window === "undefined") return

    let isSubscribed = true
    let reconnectTimeout: any = null
    let reconnectAttempts = 0
    let isManualClose = false

    const connect = () => {
      if (!isSubscribed) return
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
      const wsUrl = `${protocol}//${window.location.host}/api/v2/telephony/ws/${sessionKey}`

      try {
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          if (!isSubscribed) return
          setIsConnected(true)
          setIsReconnecting(false)
          reconnectAttempts = 0
          setError(null)
          useCallStore.setState({ isConnected: true, isReconnecting: false, reconnectAttempts: 0 })
        }

        ws.onmessage = (event) => {
          if (!isSubscribed) return
          try {
            const data = JSON.parse(event.data)
            if (data.type === "CALL_STATUS") {
              if (data.status) {
                setCallStatus(data.status)
                useCallStore.setState({ callStatus: data.status })
              }
              if (data.call_id) {
                setCallId(data.call_id)
                useCallStore.setState({ callId: data.call_id })
              }
              if (data.operator_ext) {
                setActiveExt(data.operator_ext)
                useCallStore.setState({ operatorExt: data.operator_ext })
              }
            } else if (data.type === "CONNECTED") {
              if (data.status && data.status !== "IDLE") {
                setCallStatus(data.status)
                useCallStore.setState({ callStatus: data.status })
              }
            } else if (data.type === "CHAT_MESSAGE" || data.type === "MESSAGE") {
              const msg = {
                id: data.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                sender: data.sender || "caller",
                text: data.text || "",
                timestamp: data.timestamp || Date.now(),
              }
              useCallStore.getState().addMessage(msg)
            }
          } catch (err) {
            console.error("Failed to parse telephony WS event:", err)
          }
        }

        ws.onclose = () => {
          if (!isSubscribed) return
          setIsConnected(false)
          useCallStore.setState({ isConnected: false })

          // Reconnect with exponential backoff if not closed manually and call is still active
          if (!isManualClose && callStatus !== "HANGUP") {
            setIsReconnecting(true)
            useCallStore.setState({ isReconnecting: true })
            reconnectAttempts += 1
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000)
            reconnectTimeout = setTimeout(() => {
              if (isSubscribed && !isManualClose && callStatus !== "HANGUP") {
                connect()
              }
            }, delay)
          }
        }

        ws.onerror = (e) => {
          if (!isSubscribed) return
          console.warn("Telephony WebSocket error, falling back to REST:", e)
        }
      } catch (err) {
        console.warn("Could not create Telephony WebSocket:", err)
      }
    }

    connect()

    return () => {
      isSubscribed = false
      isManualClose = true
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (asrWsRef.current) {
        asrWsRef.current.close()
        asrWsRef.current = null
      }
    }
  }, [sessionId, ticketId, callStatus])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)

  // ─── Telephony Control Methods ─────────────────────────────────────────────
  const startCall = useCallback(
    async (overrideTicketId?: string, overrideExt?: string) => {
      const tId = overrideTicketId || ticketId
      if (!tId) return null

      setCallStatus("RINGING")
      setError(null)
      // Clear dialogue chat for a fresh session
      useCallStore.getState().setMessages([])

      try {
        // 1. Establish ASR / Dialogue WebSocket
        const sessionKey = sessionId || tId
        if (sessionKey) {
          // Close existing ASR WS before opening a new one to prevent duplicate initial_phrase
          if (asrWsRef.current && asrWsRef.current.readyState !== WebSocket.CLOSED) {
            asrWsRef.current.close()
            asrWsRef.current = null
          }
          const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
          const asrWsUrl = ticketId
            ? `${protocol}//${window.location.host}/api/v2/asr/stream/${sessionKey}?ticket_id=${encodeURIComponent(ticketId)}`
            : `${protocol}//${window.location.host}/api/v2/asr/stream/${sessionKey}`
          const asrWs = new WebSocket(asrWsUrl)
          asrWsRef.current = asrWs
          
          asrWs.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data)
              if (data.type === "dialogue_response") {
                // operator_text is already added to store in ChatInput.handleSend — skip to avoid duplicates
                if (data.applicant_text) {
                  useCallStore.getState().addMessage({
                    id: `msg_app_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                    sender: "caller",
                    text: data.applicant_text,
                    timestamp: Date.now(),
                  })
                  // Play TTS audio for each applicant reply (one phrase at a time)
                  try {
                    if ((window as any).currentCallAudio) {
                      ;(window as any).currentCallAudio.pause()
                      ;(window as any).currentCallAudio.src = ""
                    }
                    const ttsUrl =
                      `/api/v1/tickets/tts/speak?` +
                      `text=${encodeURIComponent(data.applicant_text)}&speaker=aidar`
                    const ttsAudio = new Audio(ttsUrl)
                    ;(window as any).currentCallAudio = ttsAudio
                    const p = ttsAudio.play()
                    if (p && typeof p.catch === "function") {
                      p.catch((e: unknown) =>
                        console.warn("TTS dialogue audio autoplay blocked:", e)
                      )
                    }
                  } catch (e) {
                    console.warn("TTS dialogue audio error:", e)
                  }
                }
              }
            } catch (err) {
              console.error("Failed to parse ASR WS event:", err)
            }
          }


        }

        // 2. Запрос микрофона (optional fallback if no mic)
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          mediaStreamRef.current = stream
          const mediaRecorder = new MediaRecorder(stream)
          mediaRecorderRef.current = mediaRecorder

          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0 && asrWsRef.current?.readyState === WebSocket.OPEN) {
              asrWsRef.current.send(e.data)
            }
          }
          mediaRecorder.start(250)
        } catch (e) {
          console.warn("Microphone access denied or error. Falling back to text-only mode.", e)
        }

        const res = await fetch("/api/v2/telephony/start_call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticket_id: tId,
            operator_ext: overrideExt || activeExt,
            session_id: sessionId || undefined,
          }),
        })

        if (!res.ok) {
          throw new Error(`Failed to start call: ${res.statusText}`)
        }

        const data = await res.json()
        setCallStatus(data.status || "ANSWERED")
        if (data.call_id) setCallId(data.call_id)
        if (data.operator_ext) setActiveExt(data.operator_ext)
        return data
      } catch (err: any) {
        console.error("startCall error:", err)
        setError(err.message || "Failed to start call")
        // If start_call fails or mock delay is done, keep status as answered for fallback
        setCallStatus("ANSWERED")
        return null
      }
    },
    [ticketId, sessionId, activeExt]
  )

  const hangupCall = useCallback(
    async (reason = "operator_hangup") => {
      setCallStatus("HANGUP")
      stopRingAudio()
      
      if (asrWsRef.current) {
        asrWsRef.current.close()
        asrWsRef.current = null
      }

      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop()
        mediaRecorderRef.current = null
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
      }

      try {
        const res = await fetch("/api/v2/telephony/hangup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            call_id: callId || undefined,
            session_id: sessionId || undefined,
            ticket_id: ticketId || undefined,
            reason,
          }),
        })

        if (!res.ok) {
          console.warn("Hangup request failed on backend:", res.statusText)
        }
      } catch (err) {
        console.error("hangupCall error:", err)
      }
    },
    [callId, sessionId, ticketId, stopRingAudio]
  )

  const playAudio = useCallback(
    async (audioUrl: string, text?: string) => {
      try {
        const res = await fetch("/api/v2/telephony/play_audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            call_id: callId || undefined,
            session_id: sessionId || undefined,
            audio_url: audioUrl,
            text,
          }),
        })
        return res.ok
      } catch (err) {
        console.error("playAudio error:", err)
        return false
      }
    },
    [callId, sessionId]
  )

  // Auto-start on mount if requested
  useEffect(() => {
    if (autoStart && ticketId && callStatus === "IDLE") {
      startCall()
    }
  }, [autoStart, ticketId, callStatus, startCall])

  return {
    callStatus,
    setCallStatus,
    callId,
    operatorExt: activeExt,
    isConnected,
    isReconnecting,
    error,
    startCall,
    hangupCall,
    playAudio,
  }
}
