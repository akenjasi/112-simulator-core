import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTelephony } from '@/hooks/useTelephony'
import { useCallStore } from '@/store/useCallStore'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  readyState = 0
  url: string
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((e: any) => void) | null = null
  onmessage: ((event: any) => void) | null = null
  sent: string[] = []

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  simulateOpen() {
    this.readyState = 1
    if (this.onopen) this.onopen()
  }

  simulateClose() {
    this.readyState = 3
    if (this.onclose) this.onclose()
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = 3
    if (this.onclose) this.onclose()
  }
}

describe('useTelephony Reconnection & Lifecycle Management', () => {
  const originalWebSocket = global.WebSocket

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    MockWebSocket.instances = []
    global.WebSocket = MockWebSocket as any
    useCallStore.getState().reset()

    // Mock fetch for REST endpoints
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    global.WebSocket = originalWebSocket
    useCallStore.getState().reset()
  })

  it('1. triggers exponential backoff reconnect when active call WebSocket closes', async () => {
    const { result } = renderHook(() =>
      useTelephony({ sessionId: 'session-1', ticketId: 'ticket-1' })
    )

    expect(MockWebSocket.instances.length).toBe(1)
    const ws1 = MockWebSocket.instances[0]
    act(() => {
      ws1.simulateOpen()
      result.current.setCallStatus('ANSWERED')
    })

    expect(result.current.isConnected).toBe(true)
    expect(result.current.callStatus).toBe('ANSWERED')

    // Simulate WS unexpected closure during active call
    act(() => {
      ws1.simulateClose()
    })

    expect(result.current.isConnected).toBe(false)
    expect(result.current.isReconnecting).toBe(true)

    // Reconnect delay for attempt 1 is 1000ms
    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(MockWebSocket.instances.length).toBe(1) // Still waiting

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(MockWebSocket.instances.length).toBe(2) // Second WS created

    const ws2 = MockWebSocket.instances[1]
    act(() => {
      ws2.simulateOpen()
    })
    expect(result.current.isConnected).toBe(true)
    expect(result.current.isReconnecting).toBe(false)
  })

  it('2. cancels scheduled reconnect when hangupCall is invoked before timer fires', async () => {
    const { result } = renderHook(() =>
      useTelephony({ sessionId: 'session-2', ticketId: 'ticket-2' })
    )

    const ws1 = MockWebSocket.instances[0]
    act(() => {
      ws1.simulateOpen()
      result.current.setCallStatus('ANSWERED')
    })

    // WS drops
    act(() => {
      ws1.simulateClose()
    })
    expect(result.current.isReconnecting).toBe(true)

    // Hangup before timer fires
    await act(async () => {
      await result.current.hangupCall('operator_hangup')
    })

    expect(result.current.callStatus).toBe('HANGUP')
    expect(result.current.isReconnecting).toBe(false)

    // Advance past reconnect delay
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    // No second WS connection should be attempted
    expect(MockWebSocket.instances.length).toBe(1)
  })

  it('3. cancels scheduled reconnect and closes WS on component unmount', () => {
    const { result, unmount } = renderHook(() =>
      useTelephony({ sessionId: 'session-3', ticketId: 'ticket-3' })
    )

    const ws1 = MockWebSocket.instances[0]
    act(() => {
      ws1.simulateOpen()
      result.current.setCallStatus('ANSWERED')
    })

    // WS drops -> timer scheduled
    act(() => {
      ws1.simulateClose()
    })
    expect(result.current.isReconnecting).toBe(true)

    // Unmount before timer fires
    unmount()

    // Advance timers
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    // No reconnect after unmount
    expect(MockWebSocket.instances.length).toBe(1)
  })
})
