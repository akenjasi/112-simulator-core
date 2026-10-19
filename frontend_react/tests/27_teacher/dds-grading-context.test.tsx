import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SplitScreen } from '@/components/teacher/split-screen'
import { GradeDialog } from '@/components/teacher/grade-dialog'

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  localStorage.setItem('token', 'test-token')
  vi.stubGlobal('alert', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

it('renders 4 clear grading blocks in SplitScreen for DDS without separate etalon, expected actions, or missing etalon warnings', () => {
  const fullDdsRecord: any = {
    record_id: 'rec-dds-101',
    title: 'Пожар на складе ГСМ',
    cadet_name: 'Иванов Иван',
    status: 'completed',
    score: 95,
    expert_score: 95,
    automatic_score: 88,
    teacher_comment: 'Оперативное реагирование, верный алгоритм действий.',
    incident_context: {
      category: 'Пожар',
      subcategory: 'Возгорание на складе ГСМ',
      address: 'ул. Промышленная, д. 12',
      assigned_service: '101',
      caller_name: 'Петров П.П.',
      caller_phone: '+79991234567',
      caller_role: 'Охранник',
      description: 'Сильное задымление на складе ГСМ, виден открытый огонь.',
      signs: { 'Угроза взрыва': 'Да', 'Пострадавшие': 'Нет' },
      services: ['101', '103'],
    },
    cadet_actions: [
      {
        action_type: 'STATUS_CHANGE',
        status: 'Принята',
        timestamp: '2026-10-18T10:00:15',
        seconds_from_start: 15,
        comment: 'Вызов принят, 2 отделения направлены',
        who_accepted: 'Диспетчер Иванов',
        order_number: 'НАРЯД-42',
        summary: 'Передано дежурному караулу',
      },
      {
        action_type: 'STATUS_CHANGE',
        status: 'Выехали',
        timestamp: '2026-10-18T10:01:00',
        seconds_from_start: 60,
        comment: 'Отделения выехали к месту пожара',
      },
    ],
  }

  render(<SplitScreen record={fullDdsRecord} />)

  // 1. Block 1: Исходная карточка происшествия
  const contextCard = screen.getByTestId('incident-context-card')
  expect(within(contextCard).getByText(/1\. Исходная карточка происшествия/)).toBeInTheDocument()
  expect(within(contextCard).getAllByText(/Пожар/).length).toBeGreaterThan(0)
  expect(within(contextCard).getByText(/Возгорание на складе ГСМ/)).toBeInTheDocument()
  expect(within(contextCard).getByText(/ул\. Промышленная, д\. 12/)).toBeInTheDocument()
  expect(within(contextCard).getAllByText(/101/).length).toBeGreaterThan(0)
  expect(within(contextCard).getByText(/Сильное задымление на складе ГСМ/)).toBeInTheDocument()
  expect(within(contextCard).getByText(/Петров П\.П\./)).toBeInTheDocument()
  expect(within(contextCard).getByText(/\+79991234567/)).toBeInTheDocument()
  expect(within(contextCard).getByText(/Угроза взрыва:/)).toBeInTheDocument()
  expect(within(contextCard).getByText(/Распределение вызова по службам/)).toBeInTheDocument()

  // 2. Block 2: Его действия
  const cadetColumn = screen.getByTestId('student-column')
  expect(within(cadetColumn).getByText(/2\. Действия курсанта/)).toBeInTheDocument()
  expect(within(cadetColumn).getByText(/Принята/)).toBeInTheDocument()
  expect(within(cadetColumn).getByText(/Выехали/)).toBeInTheDocument()
  expect(within(cadetColumn).getByText(/«Вызов принят, 2 отделения направлены»/)).toBeInTheDocument()
  expect(within(cadetColumn).getByText(/Диспетчер Иванов/)).toBeInTheDocument()
  expect(within(cadetColumn).getByText(/НАРЯД-42/)).toBeInTheDocument()
  expect(within(cadetColumn).getByText(/Передано дежурному караулу/)).toBeInTheDocument()

  // 3. Block 3: Оценка и замечания преподавателя
  const teacherBlock = screen.getByTestId('teacher-grade-block')
  expect(within(teacherBlock).getByText(/3\. Экспертный разбор и замечания/)).toBeInTheDocument()
  expect(within(teacherBlock).getByText(/95%/)).toBeInTheDocument()
  expect(within(teacherBlock).getByText(/Оперативное реагирование, верный алгоритм действий/)).toBeInTheDocument()
  expect(within(teacherBlock).getByRole('button', { name: /Изменить оценку/ })).toBeInTheDocument()

  // 4. Block 4: Отдельная оценка ИИ
  const aiBlock = screen.getByTestId('ai-grade-block')
  expect(within(aiBlock).getByText(/4\. Автоматическая проверка ИИ/)).toBeInTheDocument()
  expect(within(aiBlock).getByText(/88%/)).toBeInTheDocument()

  // 5. Absence of cancelled DDS etalon requirements and phantom warnings
  expect(screen.queryByText('Эталон действий для этой работы не задан')).not.toBeInTheDocument()
  expect(screen.queryByText(/1\. Решение по карточке/)).not.toBeInTheDocument()
  expect(screen.queryByText(/2\. Своевременность подтверждения/)).not.toBeInTheDocument()
  expect(screen.queryByText(/3\. Ход и результат реагирования/)).not.toBeInTheDocument()
  expect(screen.queryByText(/4\. Содержание комментария\/сообщения/)).not.toBeInTheDocument()
  expect(screen.queryByText('Ожидаемые действия')).not.toBeInTheDocument()

  // 6. Prohibited content assertions: no [object Object], no raw json, no voice/speaker
  const html = document.body.innerHTML
  expect(html).not.toContain('[object Object]')
  expect(html).not.toContain('"speaker"')
  expect(html).not.toContain('"gender"')
  expect(html).not.toContain('"visClass"')
  expect(html).not.toContain('"bricks"')
})

it('honestly handles missing actions, ungraded neutral completed work, and missing AI score without fake failures', () => {
  const legacyRecord: any = {
    record_id: 'rec-legacy-empty',
    title: 'Старая работа без эталона',
    cadet_name: 'Сидоров С.С.',
    status: 'completed',
    score: null,
    expert_score: null,
    automatic_score: null,
    incident_context: {
      category: 'ДТП',
      address: 'Трасса М-4, 50 км',
      assigned_service: '112',
    },
    cadet_actions: [],
  }

  render(<SplitScreen record={legacyRecord} />)

  // Status for completed ungraded work is neutral
  expect(screen.queryByText('Не зачтено')).not.toBeInTheDocument()
  expect(screen.getAllByText('Ожидает проверки').length).toBeGreaterThan(0)

  // Block 2 honest missing state
  expect(screen.getByText('Сохранённые действия для этой работы отсутствуют')).toBeInTheDocument()

  // Block 4 honest missing AI score
  expect(screen.getByText('Оценка ИИ отсутствует')).toBeInTheDocument()

  // No phantom etalon warnings
  expect(screen.queryByText('Эталон действий для этой работы не задан')).not.toBeInTheDocument()
})

it('shows compact incident context and cadet actions in GradeDialog without separate etalon, and supports opening SplitScreen', async () => {
  const onOpenSplitScreen = vi.fn()
  const onClose = vi.fn()

  const mockRecordDetails = {
    record_id: 'rec-dlg-1',
    score: 80,
    automatic_score: null,
    expert_score: 80,
    teacher_comment: 'Отработано верно',
    incident_context: {
      category: 'Запах газа',
      subcategory: 'В подъезде жилого дома',
      address: 'ул. Ленина, д. 5',
      assigned_service: '104',
      description: 'Резкий запах газа на 3 этаже',
    },
    cadet_actions: [
      {
        status: 'Принята',
        seconds_from_start: 20,
        comment: 'Вызов принят, бригада АДС 104 направлена',
      },
    ],
  }

  vi.stubGlobal('fetch', vi.fn(async () => reply(mockRecordDetails)))

  render(
    <GradeDialog
      isOpen={true}
      onClose={onClose}
      onOpenSplitScreen={onOpenSplitScreen}
      recordId="rec-dlg-1"
      cadetName="Петров Петр"
      ticketTitle="Запах газа"
      isEdit={true}
      initialScore={80}
    />
  )

  await waitFor(() => {
    expect(screen.getByText(/Запах газа/)).toBeInTheDocument()
  })

  // Check compact incident context rendered
  expect(screen.getByText(/ул\. Ленина, д\. 5/)).toBeInTheDocument()
  expect(screen.getByText(/Служба задания:/)).toBeInTheDocument()
  expect(screen.getAllByText(/104/).length).toBeGreaterThanOrEqual(1)

  // Check cadet actions
  expect(screen.getByText(/«Вызов принят, бригада АДС 104 направлена»/)).toBeInTheDocument()

  // Check absence of separate etalon
  expect(screen.queryByText('Эталон действий:')).not.toBeInTheDocument()
  expect(screen.queryByText('Эталон действий для этой работы не задан')).not.toBeInTheDocument()

  // Check honest score statuses
  expect(screen.getByText(/Оценка ИИ отсутствует/)).toBeInTheDocument()
  expect(screen.getByText(/80%/)).toBeInTheDocument()

  // Click on "Перейти к полному разбору работы →"
  const splitBtn = screen.getByRole('button', { name: /Перейти к.*разбору работы/ })
  fireEvent.click(splitBtn)
  expect(onOpenSplitScreen).toHaveBeenCalledWith('rec-dlg-1')
  expect(onClose).toHaveBeenCalled()

  // Ensure no raw JSON or [object Object]
  const html = document.body.innerHTML
  expect(html).not.toContain('[object Object]')
  expect(html).not.toContain('{"')
})
