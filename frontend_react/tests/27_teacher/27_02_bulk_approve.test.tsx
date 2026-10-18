import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TicketsPage, { type TicketItem } from '@/app/teacher/tickets/page'

const ticket = (id: string, status = 'DRAFT'): TicketItem => ({
  ticket_id: id, display_id: id, status, complexity: 1, category: 'Пожары', plot: `Сценарий ${id}`,
})
const response = (body: unknown = {}, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response

function setup(tickets: TicketItem[], approve: (id: string) => Promise<Response> = async () => response()) {
  const requests: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/approve') && init?.method === 'POST') {
      const id = decodeURIComponent(url.split('/').at(-2)!)
      requests.push(id)
      return approve(id)
    }
    if (url.startsWith('/api/v1/tickets')) return response(tickets)
    if (url.includes('/api/classifier/')) return response([])
    throw new Error(`Unexpected request: ${url}`)
  }))
  render(<TicketsPage />)
  return requests
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Массовое утверждение билетов', () => {
  it('утверждает каждый уникальный ожидающий билет через сервер, пропускает утверждённые, архивные и удалённые', async () => {
    const requests = setup([
      ticket('DRAFT-1'), ticket('REVIEW-2', 'UNDER_REVIEW'), ticket('ACTIVE-3', 'ACTIVE'),
      ticket('DRAFT-1'), ticket('APPROVED-4', 'APPROVED'), ticket('ARCHIVED-5', 'ARCHIVED'),
      ticket('DELETED-6', 'DELETED'),
    ])
    const button = await screen.findByRole('button', { name: 'Утвердить все (3)' })
    fireEvent.click(button)
    await screen.findByText('Утверждение завершено. Утверждено: 3 из 3. Ошибок: 0.')
    expect(requests).toEqual(['DRAFT-1', 'REVIEW-2', 'ACTIVE-3'])
    expect(screen.getByRole('button', { name: 'Утвердить все (0)' })).toBeDisabled()
  })

  it('блокирует повторный запуск и индивидуальное утверждение и показывает ход выполнения', async () => {
    let finish!: (value: Response) => void
    const pending = new Promise<Response>((resolve) => { finish = resolve })
    const requests = setup([ticket('FIRST'), ticket('SECOND')], async (id) => id === 'FIRST' ? pending : response())
    const button = await screen.findByRole('button', { name: 'Утвердить все (2)' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Утвердить билет SECOND' })).toBeDisabled()
    expect(screen.getByText('Обработано: 0 из 2. Утверждено: 0 из 2. Ошибок: 0.')).toBeInTheDocument()
    expect(requests).toEqual(['FIRST'])
    await act(async () => { finish(response()) })
    await screen.findByText('Утверждение завершено. Утверждено: 2 из 2. Ошибок: 0.')
    expect(requests).toEqual(['FIRST', 'SECOND'])
  })

  it('сохраняет успешные статусы, честно сообщает частичную ошибку и повторяет только неудавшиеся', async () => {
    let attempts = 0
    const requests = setup([ticket('SUCCESS'), ticket('RETRY')], async (id) => {
      if (id === 'RETRY' && attempts++ === 0) return response({ detail: 'Заполните эталон' }, 422)
      return response()
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Утвердить все (2)' }))
    await screen.findByText('Утверждение завершено. Утверждено: 1 из 2. Ошибок: 1.')
    expect(screen.getByText('RETRY: Заполните эталон')).toBeInTheDocument()
    expect(within(screen.getByText('SUCCESS', { selector: 'td' }).closest('tr')!).getByText('Утвержден')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Утвердить билет SUCCESS' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить неудачные (1)' }))
    await screen.findByText('Утверждение завершено. Утверждено: 1 из 1. Ошибок: 0.')
    expect(requests).toEqual(['SUCCESS', 'RETRY', 'RETRY'])
  })

  it('ограничивает пакет текущим поиском по ID', async () => {
    const requests = setup([ticket('MATCH-1'), ticket('OTHER-2')])
    await screen.findByRole('button', { name: 'Утвердить все (2)' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск по ID билета' }), { target: { value: 'MATCH' } })
    fireEvent.click(screen.getByRole('button', { name: 'Утвердить все (1)' }))
    await waitFor(() => expect(requests).toEqual(['MATCH-1']))
    await screen.findByText('Утверждение завершено. Утверждено: 1 из 1. Ошибок: 0.')
    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск по ID билета' }), { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Утвердить билет OTHER-2' })).toBeEnabled()
  })

  it('после нового запроса учитывает повторную отправку измененного билета на проверку', async () => {
    const rows = [ticket('CHANGED')]
    setup(rows)
    fireEvent.click(await screen.findByRole('button', { name: 'Утвердить все (1)' }))
    await screen.findByText('Утверждение завершено. Утверждено: 1 из 1. Ошибок: 0.')
    rows[0] = ticket('CHANGED', 'UNDER_REVIEW')
    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }))
    expect(await screen.findByRole('button', { name: 'Утвердить билет CHANGED' })).toBeEnabled()
  })
})
