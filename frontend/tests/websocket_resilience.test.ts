import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useCallStore } from '../store/useCallStore'
import OperatorPage from '../app/operator/page'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('ticket_id=ticket_resilience_test&session_id=sess_resilience_test'),
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}))

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static OPEN = 1
  static CLOSED = 3
  static CONNECTING = 0

  readyState = MockWebSocket.CONNECTING
  url: string
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((e: any) => void) | null = null
  onmessage: ((event: any) => void) | null = null
  sentMessages: string[] = []

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    if (this.onopen) this.onopen()
  }

  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage({ data: typeof data === 'string' ? data : JSON.stringify(data) })
    }
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) this.onclose()
  }

  send(data: string) {
    this.sentMessages.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) this.onclose()
  }
}

describe('WebSocket Resilience', () => {
  const originalWebSocket = global.WebSocket

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    MockWebSocket.instances = []
    global.WebSocket = MockWebSocket as any
    useCallStore.getState().reset()
  })

  afterEach(() => {
    useCallStore.getState().reset()
    global.WebSocket = originalWebSocket
    vi.useRealTimers()
  })

  it('1. should have initial state and expose connection methods in the store', () => {
    const state = useCallStore.getState()
    expect(state.connectWS).toBeDefined()
    expect(state.disconnectWS).toBeDefined()
    expect(state.isConnected).toBe(false)
    expect(state.isReconnecting).toBe(false)
    expect(state.reconnectAttempts).toBe(0)
    expect(state.messages).toEqual([])
  })

  it('2. should reconnect with Exponential Backoff when WebSocket closes during active call', () => {
    const store = useCallStore.getState()
    store.setCallStatus('ANSWERED')
    store.connectWS('sess_1', 'ticket_1')

    expect(MockWebSocket.instances.length).toBe(1)
    const ws1 = MockWebSocket.instances[0]

    // Simulate open
    ws1.simulateOpen()
    expect(useCallStore.getState().isConnected).toBe(true)
    expect(useCallStore.getState().isReconnecting).toBe(false)

    // Simulate network drop during active call
    ws1.simulateClose()
    expect(useCallStore.getState().isConnected).toBe(false)
    expect(useCallStore.getState().isReconnecting).toBe(true)
    expect(useCallStore.getState().reconnectAttempts).toBe(1)

    // Delay for attempt 1 is 1000ms (1s)
    vi.advanceTimersByTime(900)
    expect(MockWebSocket.instances.length).toBe(1) // Still waiting

    vi.advanceTimersByTime(150) // Reaches 1000ms+
    expect(MockWebSocket.instances.length).toBe(2) // Second WS created

    const ws2 = MockWebSocket.instances[1]
    // Simulate drop again -> attempt 2
    ws2.simulateClose()
    expect(useCallStore.getState().reconnectAttempts).toBe(2)

    // Delay for attempt 2 is 2000ms (2s)
    vi.advanceTimersByTime(1900)
    expect(MockWebSocket.instances.length).toBe(2)

    vi.advanceTimersByTime(150) // Total 2050ms
    expect(MockWebSocket.instances.length).toBe(3) // Third WS created

    // Now let ws3 successfully open
    const ws3 = MockWebSocket.instances[2]
    ws3.simulateOpen()
    expect(useCallStore.getState().isConnected).toBe(true)
    expect(useCallStore.getState().isReconnecting).toBe(false)
    expect(useCallStore.getState().reconnectAttempts).toBe(0)
  })

  it('3. should NOT reconnect if call was hung up or manually disconnected', () => {
    const store = useCallStore.getState()
    store.setCallStatus('HANGUP')
    store.connectWS('sess_1', 'ticket_1')

    const ws = MockWebSocket.instances[0]
    ws.simulateOpen()
    ws.simulateClose()

    expect(useCallStore.getState().isReconnecting).toBe(false)
    vi.advanceTimersByTime(5000)
    expect(MockWebSocket.instances.length).toBe(1) // No new connection attempted
  })

  it('4. should preserve dialog messages across disconnect and reconnect', () => {
    const store = useCallStore.getState()
    store.setCallStatus('ANSWERED')
    store.connectWS('sess_1', 'ticket_1')

    const ws = MockWebSocket.instances[0]
    ws.simulateOpen()

    // Add dialog messages
    store.addMessage({ id: 'msg-1', sender: 'caller', text: 'Пожар на Ленина 5!' })
    store.addMessage({ id: 'msg-2', sender: 'operator', text: 'Службы выехали.' })

    expect(useCallStore.getState().messages).toHaveLength(2)

    // Connection drops
    ws.simulateClose()
    expect(useCallStore.getState().isReconnecting).toBe(true)
    // Messages must stay intact
    expect(useCallStore.getState().messages).toHaveLength(2)
    expect(useCallStore.getState().messages[0].text).toBe('Пожар на Ленина 5!')

    // Fast-forward backoff retry
    vi.advanceTimersByTime(1050)
    const ws2 = MockWebSocket.instances[1]
    ws2.simulateOpen()

    // Messages remain completely preserved after reconnect
    expect(useCallStore.getState().messages).toHaveLength(2)
    expect(useCallStore.getState().messages[1].text).toBe('Службы выехали.')
  })

  it('5. should resume audio transmission/reception upon successful reconnect', () => {
    const store = useCallStore.getState()
    store.setCallStatus('ANSWERED')
    store.setIsAudioActive(true)
    store.connectWS('sess_1', 'ticket_1')

    const ws = MockWebSocket.instances[0]
    ws.simulateOpen()
    ws.simulateClose()

    // Retry and succeed
    vi.advanceTimersByTime(1050)
    const ws2 = MockWebSocket.instances[1]
    ws2.simulateOpen()

    expect(useCallStore.getState().isAudioActive).toBe(true)
    expect(ws2.sentMessages.some((msg) => msg.includes('RESUME_AUDIO'))).toBe(true)
  })

  it('6. should render UI resilience banner ("Соединение потеряно, восстанавливаем...") when reconnecting', async () => {
    // Setup fetch mock for OperatorPage initialization
    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes('/start_call')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            call_id: 'call-resilience',
            status: 'ANSWERED',
            ticket_id: 'ticket_resilience_test',
            operator_ext: '1002',
          }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ([]),
      })
    })

    // Set store state as reconnecting
    useCallStore.setState({
      isReconnecting: true,
      callStatus: 'ANSWERED',
    })

    await act(async () => {
      render(React.createElement(OperatorPage))
    })

    // Check that the resilience banner with exact requested text is rendered
    const banner = screen.getByText(/Соединение потеряно, восстанавливаем\.\.\./i)
    expect(banner).toBeInTheDocument()
  })
})
