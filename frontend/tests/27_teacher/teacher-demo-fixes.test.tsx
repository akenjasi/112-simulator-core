import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AnalyticsPage from '@/components/teacher/analytics-page'
import { SplitScreen, type RecordDetail } from '@/components/teacher/split-screen'

vi.mock('@/components/teacher/dds-lesson-report', () => ({ DDSLessonReport: () => null }))
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const base = (patch: Partial<RecordDetail> = {}): RecordDetail => ({
  record_id: 'answer', title: 'Работа', status: 'completed', score: null, expert_score: null,
  can_grade: true, incident_context: {description: 'Карточка ДДС'}, etalon: {}, student_answer: {}, error_details: [], ...patch,
})
beforeEach(() => localStorage.setItem('token', 'teacher-test-token'))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

it('shows the real DDS criteria instead of treating protocol metadata as two errors', () => {
  const criteria = ['confirmation', 'service', 'stage', 'accuracy', 'completion'].map(key => ({
    key, label: `Критерий ${key}`, status: 'completed' as const, evidence: [],
  }))
  render(<SplitScreen record={base({dds_criteria: criteria, dds_events: [],
    error_details: {dds_criteria: criteria, dds_mistakes: []}})} />)
  expect(screen.getByTestId('dds-rules-review')).toHaveTextContent('Критерий accuracy: Выполнено')
  expect(screen.getByText('4. Автоматическая проверка ДДС')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain('Несоответствие')
  expect(document.body.textContent).not.toContain('[dds_criteria]')
  expect(document.body.textContent).not.toContain('[dds_mistakes]')
})

it('does not offer a writable grading action or a failed mark for an unsubmitted card', () => {
  render(<SplitScreen record={base({status: 'pending', can_grade: false,
    grading_block_reason: 'Карточка не завершена и не сдана.'})} />)
  for (const button of screen.getAllByRole('button', {name: 'Выставить оценку'})) expect(button).toBeDisabled()
  expect(screen.queryByText('Не зачтено')).not.toBeInTheDocument()
  expect(screen.getAllByText('Не завершено').length).toBeGreaterThan(0)
  expect(screen.getByText('Карточка не завершена и не сдана.')).toBeInTheDocument()
})

it('opens the first grade as an assessment and retains an inline save error', async () => {
  render(<SplitScreen record={base()} onAppeal={async () => {throw new Error('Карточка не сдана')}} />)
  fireEvent.click(screen.getAllByRole('button', {name: 'Выставить оценку'})[0])
  const dialog = screen.getByRole('dialog', {name: 'Выставление оценки'})
  expect(within(dialog).queryByLabelText('Причина пересмотра')).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', {name: 'Сохранить'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Карточка не сдана')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

it('keeps the selected cadet and card after a lesson grade refresh', async () => {
  let score = 95
  const cadets = [
    {cadet_id: 'first', cadet_name: 'Сидоров', records: [{record_id: 'first-card', title: 'Работа Сидорова', status: 'pending'}]},
    {cadet_id: 'second', cadet_name: 'Петров', records: [{record_id: 'second-card', title: 'Работа Петрова', status: 'passed'}]},
  ]
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: RequestInit) => {
    const path = String(url)
    if (init?.method === 'POST' && path.endsWith('/grade-override')) {
      score = JSON.parse(String(init.body)).score
      return reply({new_score: score})
    }
    if (path === '/api/v1/lessons') return reply([{id: 'lesson', group_name: 'Смена', status: 'COMPLETED'}])
    if (path === '/api/v1/analytics/lessons/lesson') return reply({cadets})
    if (path.endsWith('/records/first-card')) return reply(base({record_id: 'first-card', title: 'Работа Сидорова', cadet_name: 'Сидоров', can_grade: false}))
    if (path.endsWith('/records/second-card')) return reply(base({record_id: 'second-card', title: 'Работа Петрова', cadet_name: 'Петров', score, expert_score: score, status: 'passed'}))
    return reply({})
  }))
  render(<AnalyticsPage initialTab="split" />)
  await screen.findByRole('option', {name: 'Смена — Занятие (Завершён)'})
  fireEvent.change(screen.getByLabelText('Выбор урока'), {target: {value: 'lesson'}})
  fireEvent.click(await screen.findByTestId('record-item-second-card'))
  await waitFor(() => expect(screen.getByTestId('split-screen-card')).toHaveTextContent('Петров'))
  fireEvent.click(screen.getAllByRole('button', {name: 'Изменить оценку'})[0])
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByRole('spinbutton'), {target: {value: '96'}})
  fireEvent.click(within(dialog).getByRole('button', {name: 'Сохранить'}))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(screen.getByTestId('split-screen-card')).toHaveTextContent('Балл: 96%'))
  expect(screen.getByTestId('split-screen-card')).toHaveTextContent('Петров')
  expect(screen.getByTestId('split-screen-card')).not.toHaveTextContent('Сидоров')
})
