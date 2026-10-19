import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AnalyticsPage from '@/app/teacher/analytics/page'

const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body })
const record = {
  record_id: 'answer-1', title: 'Первый ответ', status: 'passed', score: 100,
  etalon: { address: 'Ленина, 1' }, student_answer: { address: 'Ленина, 1' }, error_details: [],
}
const session = (records: unknown[]) => ({
  session_id: 'session-1', title: 'Сессия', cadets: [{
    cadet_id: 'cadet-1', cadet_name: 'Иван Иванов', success_rate: null, records,
  }],
})
const ancillary = (url: string) => {
  if (url.includes('lessons') || url.includes('groups-comparison')) return reply([])
  return reply({ daily_dynamics: [] })
}
function loadSession(id = 'session-1') {
  fireEvent.change(screen.getByLabelText('Идентификатор сессии'), { target: { value: id } })
  fireEvent.click(screen.getByRole('button', { name: 'Обновить' }))
}

describe('answer review navigation and loading', () => {
  beforeEach(() => localStorage.setItem('token', 'teacher-token'))
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

  it('clears the previous answer when another session is empty', async () => {
    vi.stubGlobal('fetch', vi.fn((input) => {
      const url = String(input)
      return Promise.resolve(url.includes('/sessions/')
        ? reply(url.endsWith('empty') ? { session_id: 'empty', title: 'Пусто', cadets: [] } : session([record]))
        : ancillary(url))
    }))
    render(<AnalyticsPage />)
    loadSession()
    expect(await screen.findByTestId('split-screen-card')).toBeInTheDocument()
    loadSession('empty')
    await waitFor(() => expect(screen.queryByTestId('split-screen-card')).not.toBeInTheDocument())
    expect(screen.getByText('Ответ не выбран')).toBeInTheDocument()
  })

  it('shows loading and access errors instead of the previous answer', async () => {
    let finish!: (value: ReturnType<typeof reply>) => void
    vi.stubGlobal('fetch', vi.fn((input) => {
      const url = String(input)
      if (url.includes('/sessions/')) return Promise.resolve(reply(session([
        record, { record_id: 'restricted', title: 'Недоступный ответ', status: 'completed' },
      ])))
      if (url.endsWith('/records/restricted')) return new Promise((resolve) => { finish = resolve })
      return Promise.resolve(ancillary(url))
    }))
    render(<AnalyticsPage />)
    loadSession()
    await screen.findByTestId('split-screen-card')
    fireEvent.click(screen.getByTestId('record-item-restricted'))
    expect(screen.getByText('Загрузка ответа курсанта...')).toBeInTheDocument()
    expect(screen.queryByTestId('split-screen-card')).not.toBeInTheDocument()
    await act(async () => finish(reply({}, 403)))
    expect(await screen.findByRole('alert')).toHaveTextContent('Доступ к этому ответу ограничен.')
    expect(screen.queryByTestId('split-screen-card')).not.toBeInTheDocument()
    expect(screen.getByTestId('success-rate-cadet-1')).toHaveTextContent('Нет оценки')
    expect(screen.getByTestId('record-item-restricted')).toHaveTextContent('Ожидает проверки')
  })

  it('ignores a late detail response after another answer was selected', async () => {
    let finish!: (value: ReturnType<typeof reply>) => void
    vi.stubGlobal('fetch', vi.fn((input) => {
      const url = String(input)
      if (url.includes('/sessions/')) return Promise.resolve(reply(session([
        record, { record_id: 'slow', title: 'Медленный ответ', status: 'completed' },
      ])))
      if (url.endsWith('/records/slow')) return new Promise((resolve) => { finish = resolve })
      return Promise.resolve(ancillary(url))
    }))
    render(<AnalyticsPage />)
    loadSession()
    await screen.findByTestId('split-screen-card')
    fireEvent.click(screen.getByTestId('record-item-slow'))
    fireEvent.click(screen.getByTestId('record-item-answer-1'))
    await act(async () => finish(reply({ ...record, record_id: 'slow', title: 'Медленный ответ' })))
    expect(screen.getByTestId('split-screen-card')).toHaveTextContent('Первый ответ')
    expect(screen.getByTestId('split-screen-card')).not.toHaveTextContent('Медленный ответ')
  })

  it('opens review directly from a lesson ticket without asking for a session ID', async () => {
    vi.stubGlobal('fetch', vi.fn((input) => {
      const url = String(input)
      if (url === '/api/v1/lessons') return Promise.resolve(reply([{
        id: 'lesson-1', group_id: 'group-1', group_name: 'ПМ-41', target_role: 'OPERATOR_112',
        status: 'COMPLETED', total_cadets: 1, passed_count: 1, failed_count: 0,
        students: [{ cadet_id: 'cadet-1', cadet_name: 'Иван Иванов', status: 'COMPLETED',
          progress: 100, passed: 1, failed: 0, tickets: [{ ...record, ticket_id: 'ticket-1', errors_count: 0 }] }],
      }]))
      if (url.endsWith('/records/answer-1')) return Promise.resolve(reply(record))
      return Promise.resolve(ancillary(url))
    }))
    render(<AnalyticsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать ответ из истории уроков' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Подробнее' }))
    fireEvent.click(screen.getByRole('button', { name: 'Билеты (1)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Разобрать ответ' }))
    expect(await screen.findByTestId('split-screen-card')).toHaveTextContent('Иван Иванов')
    expect(screen.getByLabelText('Идентификатор сессии')).toHaveValue('')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
