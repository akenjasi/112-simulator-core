/** Reviewer-owned edge cases beyond the frozen first acceptance suite. */
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AnalyticsPage from '@/app/teacher/analytics/page'
import { GradeDialog } from '@/components/teacher/grade-dialog'

vi.mock('@/components/teacher/dds-lesson-report', () => ({ DDSLessonReport: () => null }))
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
beforeEach(() => { localStorage.setItem('token', 'review-only-token'); vi.stubGlobal('alert', vi.fn()) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

it('does not overwrite an entered grade or comment when the initial GET finishes late', async () => {
  let finish!: (r: Response) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })))
  render(<GradeDialog isOpen onClose={vi.fn()} recordId="card-1" cadetName="Курсант" ticketTitle="Ответ" isEdit initialScore={84} />)
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByRole('spinbutton', { name: 'Балл' }), { target: { value: '73.5' } })
  fireEvent.change(within(dialog).getByLabelText('Комментарий преподавателя'), { target: { value: 'Новый комментарий' } })
  await act(async () => finish(reply({ score: 84, teacher_comment: 'Старый комментарий', automatic_score: 84, expert_score: null })))
  expect(within(dialog).getByRole('spinbutton', { name: 'Балл' })).toHaveValue(73.5)
  expect(within(dialog).getByLabelText('Комментарий преподавателя')).toHaveValue('Новый комментарий')
})

it('does not offer grading for a closed DDS lesson whose work was not submitted', async () => {
  const lesson = { id: 'lesson-1', group_id: 'g', group_name: 'Группа', target_role: 'DISPATCHER_DDS', status: 'COMPLETED',
    total_cadets: 1, passed_count: 0, failed_count: 0,
    students: [{ cadet_id: 'c', cadet_name: 'Курсант', status: 'INCOMPLETE', passed: 0, failed: 0, progress: 0, score: null,
      tickets: [{ ticket_id: 't', record_id: 'card-1', card_id: 'card-1', session_id: 's', title: 'Несданная работа',
        status: 'incomplete', score: null, errors_count: 0, actions: [] }] }] }
  vi.stubGlobal('fetch', vi.fn(async (url: any) => reply(String(url) === '/api/v1/lessons' ? [lesson] : {})))
  render(<AnalyticsPage initialTab="history" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Подробнее' }))
  fireEvent.click(await screen.findByRole('button', { name: /^Билеты/ }))
  expect(screen.queryByRole('button', { name: 'Выставить оценку' })).not.toBeInTheDocument()
})

it('refreshes the displayed score after a numeric revision in the existing split-screen', async () => {
  let score = 84
  const record = () => ({ record_id: 'record-1', title: 'Ответ для разбора', status: 'completed', score,
    automatic_score: 84, expert_score: score === 84 ? null : score,
    etalon: { address: 'Дом' }, student_answer: { address: 'Дом' }, error_details: [] })
  vi.stubGlobal('fetch', vi.fn(async (url: any, init?: RequestInit) => {
    const path = String(url)
    if (init?.method === 'POST' && path.endsWith('/grade-override')) {
      score = JSON.parse(String(init.body)).score
      return reply({ record_id: 'record-1', session_id: 'session-1', old_score: 84, new_score: score, status: 'ok' })
    }
    if (path === '/api/v1/lessons') return reply([])
    if (path === '/api/v1/analytics/sessions/session-1') return reply({ session_id: 'session-1', title: 'Урок',
      cadets: [{ cadet_id: 'c', cadet_name: 'Курсант', success_rate: null, records: [record()] }] })
    if (path === '/api/v1/analytics/records/record-1') return reply(record())
    return reply({})
  }))
  render(<AnalyticsPage initialTab="split" />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Идентификатор сессии' }), { target: { value: 'session-1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Обновить' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Изменить оценку' }))
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByRole('spinbutton', { name: /Точный балл/ }), { target: { value: '73.5' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(score).toBe(73.5)
  expect(screen.getByText('Балл: 73.5%')).toBeInTheDocument()
})
