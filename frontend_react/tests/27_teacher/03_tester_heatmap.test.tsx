import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AnalyticsPage from '@/components/teacher/analytics-page'

const overview = {
  total_sessions: 0, total_attempts: 0, graded_attempts: 0, pending_attempts: 0,
  avg_score: null, passed_count: 0, failed_count: 0, pass_rate: null,
  total_errors: 0, active_cadets_count: 0, trend_direction: null, daily_dynamics: [],
}

describe('FIX-03: analytics without the DDS-inapplicable heatmap', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each(['charts', 'all'] as const)('removes the heatmap and its request from %s', async (initialTab) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => ({
      ok: true,
      status: 200,
      json: async () => String(input).includes('/overview') ? overview : [],
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(<AnalyticsPage initialTab={initialTab} />)

    await waitFor(() => expect(screen.getByText('Нет оценок')).toBeInTheDocument())
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('groups-comparison'))).toBe(true))
    expect(screen.queryByText(/Тепловая карта/i)).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('errors-heatmap'))).toBe(false)
  })
})
