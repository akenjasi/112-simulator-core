/** Independent Codex review: use API-shaped data, including real legacy fields. */
import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { SplitScreen, type RecordDetail } from '@/components/teacher/split-screen'

afterEach(cleanup)

const base = (patch: Partial<RecordDetail> = {}): RecordDetail => ({
  record_id: 'card-review', title: 'ДДС', status: 'completed', score: null,
  automatic_score: null, expert_score: null, etalon: {}, student_answer: {}, error_details: [],
  incident_context: { description: 'Сохранённый исходный контекст' },
  has_dds_etalon: false, cadet_actions: [], ...patch,
})

it('does not claim an ungraded completed work has failed', () => {
  render(<SplitScreen record={base()} />)
  expect(screen.queryByText('Не зачтено')).not.toBeInTheDocument()
})

it('does not present incoming legacy card fields as cadet authored answer', () => {
  render(<SplitScreen record={base({
    etalon: { fio: 'Исходный заявитель', caller_status: 'Очевидец', speaker: 'aidar', visclass: 'bg-red-500' },
    student_answer: {
      caller: { name: 'Исходный заявитель', role: 'Очевидец' },
      phones: { aon: '+79991234567' },
      statuses: { ambulanceRefusal: 'нет' },
      assigned_services: { '104': { status: 'Получена службой', history: [] } },
    },
  })} />)
  const answer = screen.getByTestId('student-column')
  expect(within(answer).queryByText(/Исходный заявитель/)).not.toBeInTheDocument()
  expect(answer.textContent).not.toMatch(/caller|aon|ambulanceRefusal|bg-red-500/)
})

it('does not leave raw legacy keys and CSS values in the DDS etalon', () => {
  render(<SplitScreen record={base({
    etalon: { fio: 'Исходный заявитель', caller_status: 'Очевидец', visclass: 'bg-red-500',
              connection: 'Установлено', emergency: { cs: false, cp: false } },
  })} />)
  const text = screen.getByTestId('etalon-column').textContent
  expect(text).not.toMatch(/fio|caller_status|visclass|bg-red-500|connection|emergency/)
})

it('renders structured historical errors without object Object or losing the explanation', () => {
  render(<SplitScreen record={base({
    error_details: { comment: { message: 'Причина отказа не указана', severity: 'error' } },
  })} />)
  expect(document.body.textContent).not.toContain('[object Object]')
  expect(screen.getAllByText(/Причина отказа не указана/).length).toBeGreaterThan(0)
})

it('shows the separately saved AI and teacher scores in the full grading view', () => {
  render(<SplitScreen record={base({ automatic_score: 84, expert_score: 73.5, score: 73.5 })} />)
  expect(screen.getByText(/Оценка ИИ/)).toBeInTheDocument()
  expect(screen.getByText(/84/)).toBeInTheDocument()
  expect(screen.getByText(/Оценка преподавателя|Экспертная оценка/)).toBeInTheDocument()
})

it('does not replace an unspecified historical time requirement with thirty seconds', () => {
  render(<SplitScreen record={base({
    has_dds_etalon: true,
    dds_etalon: { expected_decision: 'Принята', confirmation_time_limit_seconds: null } as any,
    dds_comparison: {
      has_dds_etalon: true, has_cadet_actions: false,
      decision: { expected_decision: 'Принята' },
      timeliness: { normative_seconds: null, actual_seconds: null, is_recorded: false },
      progression: { expected_stages: [], actual_stages: [] },
      comment: { required_points: [], actual_comments: [], actual_messages: [] },
    } as any,
  })} />)
  expect(within(screen.getByTestId('etalon-column')).queryByText(/^30 сек\.$/)).not.toBeInTheDocument()
})
