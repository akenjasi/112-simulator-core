import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AnalyticsPage from '@/components/teacher/analytics-page'

const emptyOverview = {
  total_sessions: 0, total_attempts: 0, graded_attempts: 0, pending_attempts: 0,
  avg_score: null, passed_count: 0, failed_count: 0, pass_rate: null,
  total_errors: 0, active_cadets_count: 0, trend_direction: null, daily_dynamics: [],
}

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function ancillaryFetch(url: string) {
  if (url.includes('groups-comparison')) return Promise.resolve(response([]))
  return Promise.resolve(response({}))
}

describe('analytics overview contract', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reports overview failure without requesting or synthesizing dynamics', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/overview')) return Promise.resolve(response({}, 503))
      return ancillaryFetch(url)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AnalyticsPage initialTab="charts" />)

    expect(await screen.findByText(/Ошибка загрузки данных аналитики \(503\)/)).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/analytics/dynamics'))).toBe(false)
  })

  it('keeps an empty successful overview empty', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      return url.includes('/overview') ? Promise.resolve(response(emptyOverview)) : ancillaryFetch(url)
    }))
    render(<AnalyticsPage initialTab="charts" />)
    await waitFor(() => expect(screen.getByText('Нет оценок')).toBeInTheDocument())
    expect(screen.getByText('Нет оценённых попыток')).toBeInTheDocument()
  })

  it('ignores an older overview response after the filter starts a newer request', async () => {
    let resolveOld!: (value: ReturnType<typeof response>) => void
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/overview?days=30')) return new Promise<any>((resolve) => { resolveOld = resolve })
      if (url.includes('/overview?days=7')) return Promise.resolve(response({ ...emptyOverview, avg_score: 88, graded_attempts: 1 }))
      return ancillaryFetch(url)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<AnalyticsPage initialTab="charts" />)

    fireEvent.click(screen.getByRole('button', { name: '7 дней' }))
    await waitFor(() => expect(screen.getByText('88.0')).toBeInTheDocument())
    resolveOld(response({ ...emptyOverview, avg_score: 12, graded_attempts: 1 }))
    await waitFor(() => expect(screen.getByText('88.0')).toBeInTheDocument())
  })
})
