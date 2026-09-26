import { render, screen, fireEvent, act, renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useTelephony } from '@/hooks/useTelephony'
import { OperatorTopBar } from '@/components/operator/top-bar'
import OperatorPage from '@/app/operator/page'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('ticket_id=test_ticket_62&session_id=sess_test_62'),
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}))

describe('ТЗ 62: Архитектура VoIP и Телефонии (useTelephony hook)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1.1. useTelephony имеет начальный статус IDLE и дефолтный номер 1002', () => {
    const { result } = renderHook(() =>
      useTelephony({ sessionId: 's1', ticketId: 't1', operatorExt: '1002' })
    )
    expect(result.current.callStatus).toBe('IDLE')
    expect(result.current.operatorExt).toBe('1002')
  })

  it('1.2. startCall делает POST /api/v2/telephony/start_call и переходит в ANSWERED', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        call_id: 'call-12345',
        status: 'ANSWERED',
        ticket_id: 't1',
        operator_ext: '1002',
      }),
    })
    global.fetch = fetchMock

    const { result } = renderHook(() =>
      useTelephony({ sessionId: 's1', ticketId: 't1' })
    )

    await act(async () => {
      await result.current.startCall()
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v2/telephony/start_call',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    )
    expect(result.current.callStatus).toBe('ANSWERED')
    expect(result.current.callId).toBe('call-12345')
  })

  it('1.3. hangupCall отправляет POST /api/v2/telephony/hangup и переводит статус в HANGUP', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'HANGUP',
        message: 'Terminated',
      }),
    })
    global.fetch = fetchMock

    const { result } = renderHook(() =>
      useTelephony({ sessionId: 's1', ticketId: 't1' })
    )

    await act(async () => {
      await result.current.hangupCall()
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v2/telephony/hangup',
      expect.objectContaining({
        method: 'POST',
      })
    )
    expect(result.current.callStatus).toBe('HANGUP')
  })
})

describe('ТЗ 62: Отображение статусов телефонии в OperatorTopBar', () => {
  it('2.1. При статусе RINGING отображает "Входящий звонок (гудки...)"', () => {
    render(<OperatorTopBar elapsedSeconds={0} callStatus="RINGING" />)
    expect(screen.getByText(/Входящий звонок \(гудки\.\.\.\)/i)).toBeInTheDocument()
  })

  it('2.2. При статусе ANSWERED отображает "В эфире (линия занята)"', () => {
    render(<OperatorTopBar elapsedSeconds={15} callStatus="ANSWERED" />)
    expect(screen.getByText(/В эфире \(линия занята\)/i)).toBeInTheDocument()
  })

  it('2.3. Красная кнопка "Положить трубку" вызывает onHangup', () => {
    const onHangupMock = vi.fn()
    render(<OperatorTopBar elapsedSeconds={15} onHangup={onHangupMock} />)

    const hangupBtn = screen.getByLabelText('Положить трубку')
    expect(hangupBtn).toBeInTheDocument()
    expect(hangupBtn.className).toContain('text-red-600')

    fireEvent.click(hangupBtn)
    expect(onHangupMock).toHaveBeenCalledTimes(1)
  })
})

describe('ТЗ 62: Интеграция OperatorPage (гудки, отложенный старт таймера, hangup)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('3.1. При открытии страницы отправляется start_call, и клик на отбой шлет hangup на бэкенд', async () => {
    const fetchMock = vi.fn().mockImplementation((url) => {
      if (String(url).includes('/start_call')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            call_id: 'call-62-test',
            status: 'ANSWERED',
            ticket_id: 'test_ticket_62',
            operator_ext: '1002',
          }),
        })
      }
      if (String(url).includes('/hangup')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'HANGUP' }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      })
    })
    global.fetch = fetchMock

    render(<OperatorPage />)

    // Verify start_call was dispatched
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v2/telephony/start_call',
      expect.objectContaining({ method: 'POST' })
    )

    // Let start_call resolve
    await act(async () => {
      await Promise.resolve()
    })

    // Advance 3 seconds
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText(/00:03/)).toBeInTheDocument()

    // Click red "Положить трубку" button in TopBar
    const hangupBtn = screen.getByLabelText('Положить трубку')
    await act(async () => {
      fireEvent.click(hangupBtn)
    })

    // Verify hangup was called on backend
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v2/telephony/hangup',
      expect.objectContaining({ method: 'POST' })
    )

    // After hangup, timer does not advance
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByText(/00:03/)).toBeInTheDocument()
  })
})
