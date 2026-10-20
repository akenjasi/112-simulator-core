import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import TicketsPage from '@/app/teacher/tickets/page'

afterEach(() => vi.unstubAllGlobals())

it('filters prepared DDS tickets by catalog categories absent from the classifier', async () => {
  const ticket = { id: 'dds-gas', ticket_id: 'dds-gas', display_id: 'dds-gas', category: 'ЖКХ', subcategory: 'Газовая авария', complexity: 1, plot: 'Учебная авария', status: 'APPROVED' }
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    let data: unknown = []
    if (url === '/api/classifier/categories') data = ['Пожары и задымления']
    else if (url === '/api/v1/tickets/counts') data = [{category: 'ЖКХ', total: 1, subcategories: {'Газовая авария': 1}}]
    else if (url.startsWith('/api/v1/tickets')) data = [ticket]
    return {ok: true, json: async () => data}
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<TicketsPage />)
  const category = screen.getByLabelText('Категория', {exact: true})
  await waitFor(() => expect(within(category).getByRole('option', {name: 'ЖКХ'})).toBeInTheDocument())
  fireEvent.change(category, {target: {value: 'ЖКХ'}})
  const subcategory = screen.getByLabelText('Подкатегория', {exact: true})
  await waitFor(() => expect(within(subcategory).getByRole('option', {name: 'Газовая авария'})).toBeInTheDocument())
  fireEvent.change(subcategory, {target: {value: 'Газовая авария'}})
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('category=%D0%96%D0%9A%D0%A5') && String(url).includes('subcategory='))).toBe(true))
  fireEvent.click(screen.getByRole('button', {name: 'Сбросить фильтры'}))
  expect(category).toHaveValue('')
  expect(subcategory).toHaveValue('')
})
