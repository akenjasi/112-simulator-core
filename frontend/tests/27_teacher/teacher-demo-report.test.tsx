import React from 'react'
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, expect, it, vi} from 'vitest'
import {DDSLessonReport} from '@/components/teacher/dds-lesson-report'
afterEach(() => {cleanup(); vi.unstubAllGlobals(); localStorage.clear()})

it('explicitly starts an old memory-waiting job after demo mode is enabled, never on read', async () => {
  localStorage.setItem('token', 'teacher-test-token')
  let posted = false
  const network = vi.fn(async (url: unknown, init?: RequestInit) => {
    const path = String(url)
    if (init?.method === 'POST') posted = true
    const body = path.endsWith('/personal-reports') ? {lesson_id: 'lesson', reports: [{session_id: 'student', cadet_name: 'Курсант'}]}
      : path.endsWith('/recommendation') ? {session_id: 'student', status: posted ? 'completed' : 'not_started', report_text: posted ? 'Свежий совет курсанту' : null}
      : {lesson_id: 'lesson', job_id: 'job', execution_mode: 'demo', attempt: posted ? 2 : 1,
        status: posted ? 'completed' : 'pending', waiting_reason: 'memory_low', report_text: posted ? 'Свежий отчёт занятия' : null}
    return new Response(JSON.stringify(body), {status: 200})
  })
  vi.stubGlobal('fetch', network)
  render(<DDSLessonReport lessonId="lesson" />)
  const button = await screen.findByRole('button', {name: 'Запустить анализ ИИ'})
  expect(network.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  expect(screen.queryByText('Недостаточно ресурсов')).not.toBeInTheDocument()
  fireEvent.click(button)
  expect(await screen.findByText('Свежий отчёт занятия')).toBeInTheDocument()
  expect(await screen.findByText('Свежий совет курсанту')).toBeInTheDocument()
  await waitFor(() => expect(network.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1))
})

it('creates and reads a real group job, without polling the legacy advice table', async () => {
  localStorage.setItem('token', 'teacher-test-token')
  let posted = false
  const network = vi.fn(async (url: unknown, init?: RequestInit) => {
    expect(String(url)).toBe('/api/ai-analytics/groups/group/report')
    if (init?.method === 'POST') posted = true
    return new Response(JSON.stringify(posted ? {group_id: 'group', kind: 'group', job_id: 'new-job',
      status: 'completed', report_text: 'Новый отчёт по результатам группы.'} : {}), {status: posted ? 200 : 404})
  })
  vi.stubGlobal('fetch', network)
  render(<DDSLessonReport lessonId="group" scope="groups" />)
  fireEvent.click(await screen.findByRole('button', {name: 'Сформировать нейроотчёт'}))
  expect(await screen.findByText('Новый отчёт по результатам группы.')).toBeInTheDocument()
  expect(screen.getByRole('button', {name: 'Сформировать по актуальным результатам'})).toBeEnabled()
  expect(network.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
})

it('never displays a report returned for another group', async () => {
  localStorage.setItem('token', 'teacher-test-token')
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({group_id: 'other', status: 'completed', report_text: 'Чужие результаты.'}), {status: 200})))
  render(<DDSLessonReport lessonId="group" scope="groups" />)
  expect(await screen.findByText('Получены некорректные данные отчёта или данные для другого занятия.')).toBeInTheDocument()
  expect(screen.queryByText('Чужие результаты.')).not.toBeInTheDocument()
})
