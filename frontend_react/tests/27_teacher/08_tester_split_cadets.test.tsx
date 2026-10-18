import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AnalyticsPage from '@/app/teacher/analytics/page'

const reply = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
})

const recordCadet1 = {
  record_id: 'rec-cadet-1',
  ticket_id: 't-1',
  title: 'Билет 1: Пожар на складе',
  status: 'passed',
  score: 95,
  cadet_name: 'Алексей Смирнов',
  cadet_id: 'cadet-1',
  etalon: { address: 'ул. Складская, 1', services: ['01'] },
  student_answer: { address: 'ул. Складская, 1', services: ['01'] },
  error_details: [],
}

const recordCadet2 = {
  record_id: 'rec-cadet-2',
  ticket_id: 't-2',
  title: 'Билет 2: ДТП с пострадавшими',
  status: 'completed',
  score: null,
  cadet_name: 'Борис Васильев',
  cadet_id: 'cadet-2',
  etalon: { address: 'пр. Мира, 10', services: ['02', '03'] },
  student_answer: { address: 'пр. Мира, 10', services: ['02', '03'] },
  error_details: [],
}

const mockLessons = [
  {
    id: 'lesson-alpha',
    group_id: 'group-101',
    group_name: 'Группа 101-П',
    target_role: 'DISPATCHER_DDS',
    mode: 'TRAINING',
    status: 'COMPLETED',
    total_cadets: 2,
    passed_count: 1,
    failed_count: 0,
    students: [
      {
        cadet_id: 'cadet-1',
        cadet_name: 'Алексей Смирнов',
        status: 'COMPLETED',
        passed: 1,
        failed: 0,
        score: 95,
        tickets: [
          {
            ticket_id: 't-1',
            record_id: 'rec-cadet-1',
            title: 'Билет 1: Пожар на складе',
            status: 'passed',
            score: 95,
            errors_count: 0,
          },
        ],
      },
      {
        cadet_id: 'cadet-2',
        cadet_name: 'Борис Васильев',
        status: 'COMPLETED',
        passed: 0,
        failed: 0,
        score: null,
        tickets: [
          {
            ticket_id: 't-2',
            record_id: 'rec-cadet-2',
            title: 'Билет 2: ДТП с пострадавшими',
            status: 'completed',
            score: null,
            errors_count: 0,
          },
        ],
      },
    ],
  },
  {
    id: 'lesson-empty',
    group_id: 'group-102',
    group_name: 'Группа 102-П',
    target_role: 'DISPATCHER_DDS',
    mode: 'EXAM',
    status: 'WAITING',
    total_cadets: 0,
    students: [],
  },
]

const lessonAlphaDetail = {
  id: 'lesson-alpha',
  group_name: 'Группа 101-П',
  status: 'COMPLETED',
  cadets: [
    {
      cadet_id: 'cadet-1',
      cadet_name: 'Алексей Смирнов',
      success_rate: 100,
      records: [
        {
          record_id: 'rec-cadet-1',
          ticket_id: 't-1',
          title: 'Билет 1: Пожар на складе',
          status: 'passed',
          score: 95,
        },
      ],
    },
    {
      cadet_id: 'cadet-2',
      cadet_name: 'Борис Васильев',
      success_rate: null,
      records: [
        {
          record_id: 'rec-cadet-2',
          ticket_id: 't-2',
          title: 'Билет 2: ДТП с пострадавшими',
          status: 'completed',
          score: null,
        },
      ],
    },
  ],
}

const ancillary = (url: string) => {
  if (url.includes('/groups-comparison')) return reply([])
  return reply({ daily_dynamics: [] })
}

describe('FIX-08: Split screen lesson selection and cadets roster', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'teacher-test-token')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('allows teacher to select a lesson without manual UUID and displays two cadets with their records', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input) => {
        const url = String(input)
        if (url.endsWith('/api/v1/lessons')) return Promise.resolve(reply(mockLessons))
        if (url.includes('/lessons/lesson-alpha')) return Promise.resolve(reply(lessonAlphaDetail))
        if (url.endsWith('/records/rec-cadet-1')) return Promise.resolve(reply(recordCadet1))
        if (url.endsWith('/records/rec-cadet-2')) return Promise.resolve(reply(recordCadet2))
        return Promise.resolve(ancillary(url))
      })
    )

    render(<AnalyticsPage initialTab="split" />)

    // Verify lesson selector exists
    const lessonSelect = await screen.findByRole('combobox', { name: /выбор урока/i })
    expect(lessonSelect).toBeInTheDocument()
    await screen.findByRole('option', { name: /Группа 101-П/i })

    // Select lesson-alpha from dropdown
    fireEvent.change(lessonSelect, { target: { value: 'lesson-alpha' } })

    // Two cadets should appear in the roster
    await waitFor(() => {
      expect(screen.getAllByText('Алексей Смирнов').length).toBeGreaterThan(0)
      expect(screen.getByText('Борис Васильев')).toBeInTheDocument()
    })

    // Cadet 1 has passed grade, Cadet 2 has no grade (not a fake 100%)
    expect(screen.getByTestId('success-rate-cadet-1')).toHaveTextContent(/100% успеха|95% успеха/)
    expect(screen.getByTestId('success-rate-cadet-2')).toHaveTextContent('Нет оценки')

    // Both record items are rendered
    expect(screen.getByTestId('record-item-rec-cadet-1')).toBeInTheDocument()
    expect(screen.getByTestId('record-item-rec-cadet-2')).toBeInTheDocument()

    // First cadet's record is displayed in SplitScreen
    expect(await screen.findByTestId('split-screen-card')).toBeInTheDocument()
    expect(screen.getByTestId('split-screen-card')).toHaveTextContent('Алексей Смирнов')
    expect(screen.getByTestId('split-screen-card')).toHaveTextContent('Билет 1: Пожар на складе')

    // Click second cadet's record: SplitScreen switches to Boris Vasilyev
    fireEvent.click(screen.getByTestId('record-item-rec-cadet-2'))
    await waitFor(() => {
      expect(screen.getByTestId('split-screen-card')).toHaveTextContent('Борис Васильев')
      expect(screen.getByTestId('split-screen-card')).toHaveTextContent('Билет 2: ДТП с пострадавшими')
    })
  })

  it('clears previous cadet records when switching to an empty lesson', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input) => {
        const url = String(input)
        if (url.endsWith('/api/v1/lessons')) return Promise.resolve(reply(mockLessons))
        if (url.includes('/lessons/lesson-alpha')) return Promise.resolve(reply(lessonAlphaDetail))
        if (url.includes('/lessons/lesson-empty'))
          return Promise.resolve(reply({ id: 'lesson-empty', group_name: 'Группа 102-П', cadets: [], students: [] }))
        if (url.endsWith('/records/rec-cadet-1')) return Promise.resolve(reply(recordCadet1))
        return Promise.resolve(ancillary(url))
      })
    )

    render(<AnalyticsPage initialTab="split" />)

    const lessonSelect = await screen.findByRole('combobox', { name: /выбор урока/i })
    await screen.findByRole('option', { name: /Группа 101-П/i })
    fireEvent.change(lessonSelect, { target: { value: 'lesson-alpha' } })

    expect(await screen.findByTestId('split-screen-card')).toBeInTheDocument()
    expect(screen.getAllByText('Алексей Смирнов').length).toBeGreaterThan(0)

    // Switch to empty lesson
    fireEvent.change(lessonSelect, { target: { value: 'lesson-empty' } })

    await waitFor(() => {
      expect(screen.queryByTestId('split-screen-card')).not.toBeInTheDocument()
      expect(screen.queryByText('Алексей Смирнов')).not.toBeInTheDocument()
      expect(screen.queryByText('Борис Васильев')).not.toBeInTheDocument()
    })
    expect(screen.getByText(/В выбранном занятии пока нет ответов курсантов/i)).toBeInTheDocument()
  })

  it('ignores a late response from an earlier lesson selection', async () => {
    let finishSlow!: (value: ReturnType<typeof reply>) => void
    vi.stubGlobal(
      'fetch',
      vi.fn((input) => {
        const url = String(input)
        if (url.endsWith('/api/v1/lessons')) return Promise.resolve(reply(mockLessons))
        if (url.includes('/lessons/lesson-alpha')) {
          return new Promise((resolve) => {
            finishSlow = resolve
          })
        }
        if (url.includes('/lessons/lesson-empty'))
          return Promise.resolve(reply({ id: 'lesson-empty', group_name: 'Группа 102-П', cadets: [], students: [] }))
        return Promise.resolve(ancillary(url))
      })
    )

    render(<AnalyticsPage initialTab="split" />)

    const lessonSelect = await screen.findByRole('combobox', { name: /выбор урока/i })
    await screen.findByRole('option', { name: /Группа 101-П/i })
    // Start loading lesson-alpha (slow)
    fireEvent.change(lessonSelect, { target: { value: 'lesson-alpha' } })
    // Quickly switch to lesson-empty
    fireEvent.change(lessonSelect, { target: { value: 'lesson-empty' } })

    await waitFor(() => {
      expect(screen.getByText(/В выбранном занятии пока нет ответов курсантов/i)).toBeInTheDocument()
    })

    // Now resolve the slow lesson-alpha
    await act(async () => finishSlow(reply(lessonAlphaDetail)))

    // The slow response must NOT override lesson-empty
    expect(screen.queryByText('Алексей Смирнов')).not.toBeInTheDocument()
    expect(screen.queryByTestId('split-screen-card')).not.toBeInTheDocument()
    expect(screen.getByText(/В выбранном занятии пока нет ответов курсантов/i)).toBeInTheDocument()
  })

  it('displays authorization error when lesson is forbidden for this teacher', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input) => {
        const url = String(input)
        if (url.endsWith('/api/v1/lessons')) return Promise.resolve(reply(mockLessons))
        if (url.includes('/lessons/lesson-alpha')) return Promise.resolve(reply({}, 403))
        return Promise.resolve(ancillary(url))
      })
    )

    render(<AnalyticsPage initialTab="split" />)

    const lessonSelect = await screen.findByRole('combobox', { name: /выбор урока/i })
    await screen.findByRole('option', { name: /Группа 101-П/i })
    fireEvent.change(lessonSelect, { target: { value: 'lesson-alpha' } })

    expect(await screen.findByRole('alert')).toHaveTextContent(/Доступ к этому занятию ограничен/i)
    expect(screen.queryByTestId('split-screen-card')).not.toBeInTheDocument()
  })
})
