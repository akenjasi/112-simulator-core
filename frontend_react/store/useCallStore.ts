import { create } from "zustand"

export type CallStatus = "IDLE" | "RINGING" | "ANSWERED" | "HANGUP"

export interface DialogMessage {
  id: string
  sender: "operator" | "caller" | "system"
  text: string
  timestamp?: number
}

export interface CallStoreState {
  callStatus: CallStatus
  callId: string | null
  sessionId: string | null
  ticketId: string | null
  operatorExt: string
  isConnected: boolean
  isReconnecting: boolean
  reconnectAttempts: number
  messages: DialogMessage[]
  isAudioActive: boolean
  error: string | null

  // Methods
  setCallStatus: (status: CallStatus) => void
  setSessionInfo: (info: { sessionId?: string | null; ticketId?: string | null; operatorExt?: string }) => void
  addMessage: (message: DialogMessage) => void
  setMessages: (messages: DialogMessage[]) => void
  setIsAudioActive: (active: boolean) => void
  connectWS: (sessionId?: string | null, ticketId?: string | null) => void
  disconnectWS: (manual?: boolean) => void
  startCall: (overrideTicketId?: string, overrideExt?: string) => Promise<any>
  hangupCall: (reason?: string) => Promise<void>
  reset: () => void
}

let wsInstance: WebSocket | null = null
let reconnectTimer: any = null
let isManualDisconnect = false

export const useCallStore = create<CallStoreState>((set, get) => ({
  callStatus: "IDLE",
  callId: null,
  sessionId: null,
  ticketId: null,
  operatorExt: "1002",
  isConnected: false,
  isReconnecting: false,
  reconnectAttempts: 0,
  messages: [],
  isAudioActive: false,
  error: null,

  setCallStatus: (callStatus) => set({ callStatus }),

  setSessionInfo: ({ sessionId, ticketId, operatorExt }) => {
    set((state) => ({
      sessionId: sessionId !== undefined ? sessionId : state.sessionId,
      ticketId: ticketId !== undefined ? ticketId : state.ticketId,
      operatorExt: operatorExt !== undefined ? operatorExt : state.operatorExt,
    }))
  },

  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }))
  },

  setMessages: (messages) => set({ messages }),

  setIsAudioActive: (isAudioActive) => set({ isAudioActive }),

  connectWS: (sessionIdParam, ticketIdParam) => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    const state = get()
    const targetSessionId = sessionIdParam !== undefined ? sessionIdParam : state.sessionId
    const targetTicketId = ticketIdParam !== undefined ? ticketIdParam : state.ticketId
    const sessionKey = targetSessionId || targetTicketId

    if (sessionIdParam !== undefined || ticketIdParam !== undefined) {
      set({
        sessionId: targetSessionId,
        ticketId: targetTicketId,
      })
    }

    if (!sessionKey) {
      return
    }

    isManualDisconnect = false

    if (wsInstance && (wsInstance.readyState === WebSocket.OPEN || wsInstance.readyState === WebSocket.CONNECTING)) {
      try {
        wsInstance.close()
      } catch (e) {
        // ignore
      }
    }

    let wsUrl: string
    if (typeof window !== "undefined" && window.location) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
      const host = window.location.host || "localhost:8000"
      wsUrl = `${protocol}//${host}/api/v2/telephony/ws/${sessionKey}`
    } else {
      wsUrl = `ws://localhost:8000/api/v2/telephony/ws/${sessionKey}`
    }

    try {
      const ws = new WebSocket(wsUrl)
      wsInstance = ws

      ws.onopen = () => {
        const wasReconnecting = get().isReconnecting
        set({
          isConnected: true,
          isReconnecting: false,
          reconnectAttempts: 0,
          error: null,
        })

        // Upon reconnect: automatically resume audio transmission/reception if it was active
        if (wasReconnecting || get().isAudioActive || get().callStatus === "ANSWERED") {
          set({ isAudioActive: true })
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: "RESUME_AUDIO" }))
            } catch (e) {
              // ignore
            }
          }
        }
      }

      ws.onmessage = (event) => {
        try {
          const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data
          if (data.type === "CALL_STATUS") {
            if (data.status) set({ callStatus: data.status })
            if (data.call_id) set({ callId: data.call_id })
            if (data.operator_ext) set({ operatorExt: data.operator_ext })
          } else if (data.type === "CONNECTED") {
            if (data.status && data.status !== "IDLE") {
              set({ callStatus: data.status })
            }
          } else if (data.type === "CHAT_MESSAGE" || data.type === "MESSAGE") {
            const msg: DialogMessage = {
              id: data.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              sender: data.sender || "caller",
              text: data.text || "",
              timestamp: data.timestamp || Date.now(),
            }
            get().addMessage(msg)
          }
        } catch (err) {
          console.error("Failed to parse telephony WS event:", err)
        }
      }

      ws.onerror = (e) => {
        console.warn("Telephony WebSocket error:", e)
        set({ error: "WebSocket connection error" })
      }

      ws.onclose = () => {
        set({ isConnected: false })
        const currentState = get()

        // Reconnect if call is active (or ringing) and wasn't manually terminated
        const shouldReconnect =
          !isManualDisconnect &&
          currentState.callStatus !== "HANGUP"

        if (shouldReconnect) {
          const attempt = currentState.reconnectAttempts + 1
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s... capped at 30 seconds
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000)

          set({
            isReconnecting: true,
            reconnectAttempts: attempt,
          })

          reconnectTimer = setTimeout(() => {
            // Check again that we still want to reconnect
            if (!isManualDisconnect && get().callStatus !== "HANGUP") {
              get().connectWS()
            }
          }, delay)
        }
      }
    } catch (err: any) {
      console.warn("Could not create Telephony WebSocket:", err)
      set({ error: err.message || "Failed to initialize WebSocket" })
    }
  },

  disconnectWS: (manual = true) => {
    isManualDisconnect = manual
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (wsInstance) {
      try {
        wsInstance.close()
      } catch (e) {
        // ignore
      }
      wsInstance = null
    }
    set({
      isConnected: false,
      isReconnecting: false,
      reconnectAttempts: 0,
    })
  },

  startCall: async (overrideTicketId?: string, overrideExt?: string) => {
    const state = get()
    const tId = overrideTicketId || state.ticketId
    if (!tId) return null

    set({ callStatus: "RINGING", error: null })

    try {
      const res = await fetch("/api/v2/telephony/start_call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_id: tId,
          operator_ext: overrideExt || state.operatorExt,
          session_id: state.sessionId || undefined,
        }),
      })

      if (!res.ok) {
        throw new Error(`Failed to start call: ${res.statusText}`)
      }

      const data = await res.json()
      set({
        callStatus: data.status || "ANSWERED",
        callId: data.call_id || state.callId,
        operatorExt: data.operator_ext || state.operatorExt,
        isAudioActive: true,
      })

      // Ensure WS is connected for this session
      get().connectWS(state.sessionId, tId)

      return data
    } catch (err: any) {
      console.error("startCall error in useCallStore:", err)
      set({
        error: err.message || "Failed to start call",
        callStatus: "ANSWERED", // fallback as in useTelephony
      })
      return null
    }
  },

  hangupCall: async (reason = "operator_hangup") => {
    const state = get()
    set({
      callStatus: "HANGUP",
      isAudioActive: false,
      isReconnecting: false,
    })

    get().disconnectWS(true)

    try {
      const res = await fetch("/api/v2/telephony/hangup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call_id: state.callId || undefined,
          session_id: state.sessionId || undefined,
          ticket_id: state.ticketId || undefined,
          reason,
        }),
      })

      if (!res.ok) {
        console.warn("Hangup request failed on backend:", res.statusText)
      }
    } catch (err) {
      console.error("hangupCall error in useCallStore:", err)
    }
  },

  reset: () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    isManualDisconnect = true
    if (wsInstance) {
      try {
        wsInstance.close()
      } catch (e) {
        // ignore
      }
      wsInstance = null
    }
    set({
      callStatus: "IDLE",
      callId: null,
      sessionId: null,
      ticketId: null,
      operatorExt: "1002",
      isConnected: false,
      isReconnecting: false,
      reconnectAttempts: 0,
      messages: [],
      isAudioActive: false,
      error: null,
    })
  },
}))
