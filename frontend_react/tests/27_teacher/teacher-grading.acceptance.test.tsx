/** Codex-owned user-flow acceptance checks. Gemini must not edit this file. */
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AnalyticsPage from '@/app/teacher/analytics/page'

// Group AI reports are outside the grading flow under test.
vi.mock('@/components/teacher/dds-lesson-report', () => ({ DDSLessonReport: () => null }))

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})
let savedScore: number | null
let automaticScore: number | null
let savedComment: string
let expertScore: number | null
let active: boolean
let api: ReturnType<typeof vi.fn>
let writeResponse: ((body: any) => Promise<Response>) | undefined
const gradeUrl = '/api/v1/analytics/records/record-1/grade-override'
const writes = () => api.mock.calls.filter(([, init]) => ['POST', 'PATCH', 'PUT'].includes(init?.method))

function record() {
  return { record_id: 'record-1', session_id: 'session-1', ticket_id: 'ticket-1', cadet_id: 'cadet-1',
    cadet_name: 'Иванов Иван', title: 'Пожар на складе', status: active ? 'in_progress' : savedScore === null ? 'pending' : 'completed',
    score: savedScore, automatic_score: automaticScore, expert_score: expertScore,
    teacher_comment: savedComment, expert_modified_by: expertScore === null ? null : 'teacher-1',
    expert_modified_at: expertScore === null ? null : '2026-10-18T10:00:00Z',
    etalon: { address: 'Склад 1' }, student_answer: { address: 'Склад 1' }, error_details: [] }
}
function lessons() {
  return [{ id: 'lesson-1', group_id: 'group-1', group_name: 'ПМ-41', target_role: 'DISPATCHER_DDS',
    status: 'COMPLETED', total_cadets: 1, passed_count: 0, failed_count: 0, avg_score: savedScore,
    created_at: '2026-10-18T09:00:00Z', completed_at: '2026-10-18T09:30:00Z',
    students: [{ cadet_id: 'cadet-1', cadet_name: 'Иванов Иван', session_id: 'session-1',
      status: active ? 'IN_PROGRESS' : savedScore === null ? 'UNGRADED' : 'COMPLETED',
      passed: 0, failed: 0, progress: active ? 10 : 100, score: savedScore,
      tickets: [{ ...record(), status: active ? 'in_progress' : savedScore === null ? 'ungraded' : 'completed',
        card_id: 'record-1', errors_count: 0, errors: [], actions: [] }] }] }]
}

beforeEach(() => {
  savedScore = null; automaticScore = null; expertScore = null; savedComment = ''; active = false; writeResponse = undefined
  localStorage.setItem('token', 'independent-grading-token')
  api = vi.fn(async (input: any, init?: RequestInit) => {
    const path = String(input)
    if (init?.method === 'POST' && path === gradeUrl) {
      const body = JSON.parse(String(init.body))
      if (writeResponse) return writeResponse(body)
      const oldScore = savedScore
      savedScore = expertScore = body.score
      savedComment = body.comment ?? ''
      return reply({ status: 'ok', record_id: 'record-1', session_id: 'session-1', old_score: oldScore,
        new_score: body.score, teacher_id: 'teacher-1', reason: body.reason, updated_at: '2026-10-18T10:00:00Z' })
    }
    if (init?.method && init.method !== 'GET') return reply({ detail: 'Unexpected write endpoint' }, 404)
    if (path === '/api/v1/lessons' || path.startsWith('/api/v1/lessons?')) return reply(lessons())
    if (path === '/api/v1/lessons/lesson-1') return reply(lessons()[0])
    if (path === '/api/v1/analytics/records/record-1') return reply(record())
    if (path === '/api/v1/analytics/sessions/session-1') return reply({ session_id: 'session-1', title: 'Урок ПМ-41',
      cadets: [{ cadet_id: 'cadet-1', cadet_name: 'Иванов Иван', success_rate: null, records: [record()] }] })
    if (path.includes('/api/v1/groups')) return reply([{ group_id: 'group-1', group_name: 'ПМ-41' }])
    return reply({})
  })
  vi.stubGlobal('fetch', api)
  vi.stubGlobal('alert', vi.fn())
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

async function openHistory() {
  const view = render(<AnalyticsPage initialTab="history" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Подробнее' }))
  fireEvent.click(await screen.findByRole('button', { name: /^Билеты/ }))
  return view
}
async function openGrade(edit = false) {
  await openHistory()
  fireEvent.click(await screen.findByRole('button', { name: edit ? 'Изменить оценку' : 'Выставить оценку' }))
  return screen.findByRole('dialog', { name: /оцен/i })
}
function fill(dialog: HTMLElement, score: string) {
  fireEvent.change(within(dialog).getByRole('spinbutton', { name: /Балл/i }), { target: { value: score } })
  fireEvent.change(within(dialog).getByLabelText('Комментарий преподавателя', { exact: true }), {
    target: { value: 'Проверьте порядок вызова служб' },
  })
}
const save = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: /^Сохранить/ })

it.each([0, 87.5])('grades an ungraded answer with %s directly from lesson history and survives reload', async (score) => {
  const dialog = await openGrade()
  expect(within(dialog).getByText('Иванов Иван', { exact: false })).toBeInTheDocument()
  expect(within(dialog).getByText('Пожар на складе', { exact: false })).toBeInTheDocument()
  fill(dialog, String(score))
  fireEvent.click(save(dialog))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(writes()).toHaveLength(1)
  const [url, init] = writes()[0]
  expect(url).toBe(gradeUrl)
  expect(new Headers(init.headers).get('Authorization')).toBe('Bearer independent-grading-token')
  expect(JSON.parse(init.body)).toMatchObject({ score, comment: 'Проверьте порядок вызова служб' })
  expect(JSON.parse(init.body).reason.trim().length).toBeGreaterThan(0)
  cleanup()
  await openHistory()
  fireEvent.click(await screen.findByRole('button', { name: 'Изменить оценку' }))
  const restored = await screen.findByRole('dialog', { name: /оцен/i })
  expect(within(restored).getByRole('spinbutton', { name: /Балл/i })).toHaveValue(score)
  expect(within(restored).getByLabelText('Комментарий преподавателя', { exact: true })).toHaveValue('Проверьте порядок вызова служб')
  // The flow must obtain all IDs from server data, without manual session-ID entry.
  expect(api.mock.calls.some(([url]) => String(url).includes('/sessions/lesson-1'))).toBe(false)
})

it('edits an existing grade without reducing it to passed=100 or failed=0', async () => {
  savedScore = automaticScore = 84
  const dialog = await openGrade(true)
  expect(within(dialog).getByText(/^Оценка ИИ/)).toBeInTheDocument()
  expect(within(dialog).getByText(/^Экспертная оценка/)).toBeInTheDocument()
  fill(dialog, '73.5')
  fireEvent.change(within(dialog).getByLabelText('Причина изменения', { exact: true }), { target: { value: 'Учтён обоснованный ответ' } })
  fireEvent.click(save(dialog))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(writes()).toHaveLength(1)
  expect(JSON.parse(writes()[0][1].body)).toMatchObject({ score: 73.5, reason: 'Учтён обоснованный ответ' })
})

it('keeps the form open and shows a server error without pretending to save', async () => {
  writeResponse = async () => reply({ detail: 'Сохранение временно недоступно' }, 503)
  const dialog = await openGrade()
  fill(dialog, '73.5'); fireEvent.click(save(dialog))
  expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(within(dialog).getByRole('spinbutton', { name: /Балл/i })).toHaveValue(73.5)
  expect(savedScore).toBeNull()
  expect(writes()).toHaveLength(1)
})

it('cancels without sending a mutation', async () => {
  const dialog = await openGrade()
  fill(dialog, '73.5')
  fireEvent.click(within(dialog).getAllByRole('button', { name: /Отмена|Закрыть/ })[0])
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(writes()).toHaveLength(0)
})

it('does not turn an empty score into zero', async () => {
  const dialog = await openGrade()
  fill(dialog, ''); fireEvent.click(save(dialog))
  expect(writes()).toHaveLength(0)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

it('requires a nonblank reason for changing an existing grade', async () => {
  savedScore = automaticScore = 84
  const dialog = await openGrade(true)
  fill(dialog, '73.5')
  fireEvent.change(within(dialog).getByLabelText('Причина изменения', { exact: true }), { target: { value: '   ' } })
  fireEvent.click(save(dialog))
  expect(writes()).toHaveLength(0)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

it('does not offer grading for an active unsubmitted answer', async () => {
  active = true
  await openHistory()
  expect(screen.queryByRole('button', { name: 'Выставить оценку' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Изменить оценку' })).not.toBeInTheDocument()
})

it('disables repeated submission while the save request is pending', async () => {
  let finish!: (response: Response) => void
  writeResponse = () => new Promise((resolve) => { finish = resolve })
  const dialog = await openGrade()
  fill(dialog, '73.5'); fireEvent.click(save(dialog))
  await waitFor(() => expect(writes()).toHaveLength(1))
  expect(save(dialog)).toBeDisabled()
  fireEvent.click(save(dialog))
  expect(writes()).toHaveLength(1)
  await act(async () => finish(reply({ status: 'ok', record_id: 'record-1', new_score: 73.5 })))
})
