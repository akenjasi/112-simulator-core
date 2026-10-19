import React, { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AnalyticsPage from '@/components/teacher/analytics-page'
import { SplitScreen, type RecordDetail } from '@/components/teacher/split-screen'
import { GradeDialog } from '@/components/teacher/grade-dialog'
import { GradeScoreInput } from '@/components/teacher/grade-score-input'

vi.mock('@/components/teacher/dds-lesson-report', () => ({ DDSLessonReport: () => null }))
const reply = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
beforeEach(() => { localStorage.setItem('token', 'test-only'); vi.stubGlobal('alert', vi.fn()) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

const record = (patch: Partial<RecordDetail> = {}): RecordDetail => ({
  record_id: 'r', title: 'ДДС', status: 'failed', score: 84, automatic_score: 84,
  expert_score: null, etalon: {}, student_answer: {}, error_details: [],
  incident_context: { description: 'Происшествие' }, ...patch,
})

it('sends status and reason without inventing a numeric score', async () => {
  const save = vi.fn(async (_recordId: string, _payload: any) => {})
  render(<SplitScreen record={record()} onAppeal={save} />)
  fireEvent.click(screen.getAllByRole('button', { name: 'Изменить оценку' })[0])
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByLabelText('Новый статус оценки')).toHaveValue('failed')
  fireEvent.change(within(dialog).getByLabelText('Новый статус оценки'), { target: { value: 'passed' } })
  fireEvent.change(within(dialog).getByLabelText('Причина пересмотра'), { target: { value: 'Результат проверен' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith('r', {
    status: 'passed', reason: 'Результат проверен', comment: '',
  }))
  expect(save.mock.calls[0][1]).not.toHaveProperty('score')
})

it('sends the selected status together with a fractional numeric grade', async () => {
  const save = vi.fn(async (_recordId: string, _payload: any) => {})
  render(<SplitScreen record={record()} onAppeal={save} />)
  fireEvent.click(screen.getAllByRole('button', { name: 'Изменить оценку' })[0])
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Новый статус оценки'), { target: { value: 'passed' } })
  fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '73.5' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith('r', expect.objectContaining({ status: 'passed', score: 73.5 })))
})

it('refreshes the journal from the server after a status-only change', async () => {
  let status = 'failed'
  const writes: any[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const path = String(url)
    if (init?.method === 'POST') {
      expect(path).toBe('/api/v1/analytics/records/r/grade-override')
      const body = JSON.parse(String(init.body)); writes.push(body); status = body.status
      return reply({ new_score: 84 })
    }
    if (path === '/api/v1/analytics/sessions/s') return reply({ session_id: 's', title: 'Занятие',
      cadets: [{ cadet_id: 'c', cadet_name: 'Курсант', records: [record({ status })] }] })
    if (path === '/api/v1/analytics/records/r') return reply(record({ status, is_appealed: writes.length > 0 }))
    return reply({})
  }))
  render(<AnalyticsPage initialTab="split" />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Идентификатор сессии' }), { target: { value: 's' } })
  fireEvent.click(screen.getByRole('button', { name: 'Обновить' }))
  fireEvent.click((await screen.findAllByRole('button', { name: 'Изменить оценку' }))[0])
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Новый статус оценки'), { target: { value: 'passed' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(writes).toHaveLength(1)
  expect(writes[0]).not.toHaveProperty('score')
  expect(writes[0].status).toBe('passed')
  expect(screen.queryByText('Не зачтено')).not.toBeInTheDocument()
  expect(screen.getAllByText('Зачтено').length).toBeGreaterThan(0)
})

it.each(['e', 'E', '+', '-'])('prevents the %s key in the score input', (key) => {
  render(<GradeScoreInput aria-label="Балл" value="" onValueChange={vi.fn()} />)
  expect(fireEvent.keyDown(screen.getByRole('spinbutton'), { key })).toBe(false)
})

it.each(['1e2', '-5', '+5', 'abc'])('blocks invalid pasted score %s', (value) => {
  render(<GradeScoreInput aria-label="Балл" value="" onValueChange={vi.fn()} />)
  expect(fireEvent.paste(screen.getByRole('spinbutton'), { clipboardData: { getData: () => value } })).toBe(false)
})

it('allows clearing, decimal numbers, zero and one hundred', () => {
  function Editor() {
    const [value, setValue] = useState('')
    return <GradeScoreInput aria-label="Балл" value={value} onValueChange={setValue} />
  }
  render(<Editor />)
  const input = screen.getByRole('spinbutton')
  for (const value of ['0', '73.5', '100', '']) {
    fireEvent.change(input, { target: { value } })
    expect(input).toHaveValue(value === '' ? null : Number(value))
  }
})

it('uses the same score input protections in the initial grading dialog', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply(record())))
  render(<GradeDialog isOpen recordId="r" cadetName="Курсант" ticketTitle="ДДС" isEdit={false} onClose={vi.fn()} />)
  await act(async () => {})
  const input = screen.getByRole('spinbutton', { name: 'Балл' })
  expect(fireEvent.keyDown(input, { key: 'e' })).toBe(false)
  expect(fireEvent.keyDown(input, { key: '-' })).toBe(false)
})

it('shows a teacher status-only decision without labelling the AI score as expert', () => {
  render(<SplitScreen record={record({ status: 'passed', is_appealed: true, expert_score: null,
    expert_modified_at: '2026-10-18T10:00:00Z', teacher_comment: 'Работа зачтена без балла' })} />)
  const teacher = screen.getByTestId('teacher-grade-block')
  expect(within(teacher).getByText('Зачтено')).toBeInTheDocument()
  expect(within(teacher).getByText('Балл не выставлен')).toBeInTheDocument()
  expect(within(teacher).getByText('Работа зачтена без балла')).toBeInTheDocument()
  expect(teacher.textContent).not.toContain('84%')
})
