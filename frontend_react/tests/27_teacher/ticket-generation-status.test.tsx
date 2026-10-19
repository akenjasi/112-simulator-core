import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import TicketsPage from '@/app/teacher/tickets/page'

const response = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

it.each(['failed', 'completed'])('ends polling on %s independently of the visible filtered list', async (status) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/v1/tickets/generate' && init?.method === 'POST') {
      return response({ generation_id: 'batch-1' })
    }
    if (url.startsWith('/api/v1/tickets/status?')) {
      return response({ status, generated_count: status === 'failed' ? 1 : 2, error_code: 'UNIQUE_TICKETS_EXHAUSTED' })
    }
    if (url.includes('/api/classifier/') || url.startsWith('/api/v1/tickets')) return response([])
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<TicketsPage />)
  fireEvent.click(await screen.findByRole('button', { name: /^Сгенерировать$/i }))
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Количество' }), { target: { value: '2' } })
  vi.useFakeTimers()
  await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: /^Сгенерировать$/i }).at(-1)!) })
  await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  if (status === 'failed') {
    expect(screen.getByRole('alert')).toHaveTextContent('Сохранено 1 из 2')
  } else {
    expect(screen.getByRole('status')).toHaveTextContent('Сгенерировано 2 билетов')
  }
  expect(screen.getByRole('button', { name: /^Сгенерировать$/i })).toBeEnabled()
  const pollCount = fetchMock.mock.calls.filter(([url]) => String(url).includes('/status?')).length
  await act(async () => { await vi.advanceTimersByTimeAsync(9000) })
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/status?'))).toHaveLength(pollCount)
})
