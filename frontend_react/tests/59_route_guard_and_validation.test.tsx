import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import OperatorPage from '@/app/operator/page'
import { OperatorBottomBar } from '@/components/operator/bottom-bar'

const pushMock = vi.fn()
let currentSearchParams = new URLSearchParams('ticket_id=test_ticket_59&session_id=sess_test_59')

vi.mock('next/navigation', () => ({
  useSearchParams: () => currentSearchParams,
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}))

describe('ТЗ 59: Задача 1 — Защита страницы (Route Guard)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('1.1. Если в URL нет session_id и ticket_id, перенаправляет в лобби (/student/lobby)', () => {
    currentSearchParams = new URLSearchParams('')
    render(<OperatorPage />)

    expect(pushMock).toHaveBeenCalledWith('/student/lobby')
  })

  it('1.2. Если в URL нет ticket_id, перенаправляет в лобби (/student/lobby)', () => {
    currentSearchParams = new URLSearchParams('session_id=sess_only_123')
    render(<OperatorPage />)

    expect(pushMock).toHaveBeenCalledWith('/student/lobby')
  })

  it('1.3. Если в URL нет session_id, перенаправляет в лобби (/student/lobby)', () => {
    currentSearchParams = new URLSearchParams('ticket_id=ticket_only_456')
    render(<OperatorPage />)

    expect(pushMock).toHaveBeenCalledWith('/student/lobby')
  })

  it('1.4. При наличии session_id и ticket_id доступ разрешен (нет редиректа на монтировании)', () => {
    currentSearchParams = new URLSearchParams('ticket_id=test_ticket_59&session_id=sess_test_59')
    render(<OperatorPage />)

    expect(pushMock).not.toHaveBeenCalledWith('/student/lobby')
  })
})

describe('ТЗ 59: Задача 2 — Валидация перед сохранением (Не даем сдать пустую карточку!)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
    currentSearchParams = new URLSearchParams('ticket_id=test_ticket_59&session_id=sess_test_59')
  })

  it('2.1. При нажатии "Сохранить" на пустой карточке модалка не открывается, показывается точный текст ошибки', () => {
    render(<OperatorPage />)

    const saveBtn = screen.getByRole('button', { name: /сохранить/i })
    fireEvent.click(saveBtn)

    // Modal should NOT open
    expect(screen.queryByText('Готова к сохранению и передаче в ДДС экстренных служб')).not.toBeInTheDocument()

    // Error toast should appear
    expect(
      screen.getByText('Ошибка: Заполните обязательные поля (Тип происшествия, Адрес, Статус заявителя)')
    ).toBeInTheDocument()
  })

  it('2.2. Если выбран тип происшествия, но статус заявителя не заполнен — модалка не открывается', () => {
    localStorage.setItem(
      'operator_state_test_ticket_59',
      JSON.stringify({
        activeIncidentTitle: 'Пожар',
        callerStatus: '',
      })
    )
    render(<OperatorPage />)

    const saveBtn = screen.getByRole('button', { name: /сохранить/i })
    fireEvent.click(saveBtn)

    expect(screen.queryByText('Готова к сохранению и передаче в ДДС экстренных служб')).not.toBeInTheDocument()
    expect(
      screen.getByText('Ошибка: Заполните обязательные поля (Тип происшествия, Адрес, Статус заявителя)')
    ).toBeInTheDocument()
  })

  it('2.3. Если указан статус заявителя, но тип происшествия не выбран — модалка не открывается', () => {
    localStorage.setItem(
      'operator_state_test_ticket_59',
      JSON.stringify({
        activeIncidentTitle: null,
        callerStatus: 'очевидец',
      })
    )
    render(<OperatorPage />)

    const saveBtn = screen.getByRole('button', { name: /сохранить/i })
    fireEvent.click(saveBtn)

    expect(screen.queryByText('Готова к сохранению и передаче в ДДС экстренных служб')).not.toBeInTheDocument()
    expect(
      screen.getByText('Ошибка: Заполните обязательные поля (Тип происшествия, Адрес, Статус заявителя)')
    ).toBeInTheDocument()
  })

  it('2.4. Если тип происшествия и статус заявителя выбраны, но адрес полностью пуст — модалка не открывается', () => {
    localStorage.setItem(
      'operator_state_test_ticket_59',
      JSON.stringify({
        activeIncidentTitle: 'ДТП',
        callerStatus: 'пострадавший',
        fullAddressString: '',
        address: {
          country: '',
          subject: '',
          city: '',
          okrug: '',
          district: '',
          street: '',
          house: '',
        },
      })
    )
    render(<OperatorPage />)

    const saveBtn = screen.getByRole('button', { name: /сохранить/i })
    fireEvent.click(saveBtn)

    expect(screen.queryByText('Готова к сохранению и передаче в ДДС экстренных служб')).not.toBeInTheDocument()
    expect(
      screen.getByText('Ошибка: Заполните обязательные поля (Тип происшествия, Адрес, Статус заявителя)')
    ).toBeInTheDocument()
  })

  it('2.5. При заполненных типе происшествия, статусе заявителя и адресе модалка сохранения открывается', () => {
    localStorage.setItem(
      'operator_state_test_ticket_59',
      JSON.stringify({
        activeIncidentTitle: 'Пожар',
        callerStatus: 'очевидец',
        address: {
          country: 'Россия',
          subject: 'Москва',
          city: 'Москва',
          okrug: 'СВАО',
          district: 'Южное Медведково',
          street: '',
        },
      })
    )
    render(<OperatorPage />)

    const saveBtn = screen.getByRole('button', { name: /сохранить/i })
    fireEvent.click(saveBtn)

    expect(screen.getByText('Готова к сохранению и передаче в ДДС экстренных служб')).toBeInTheDocument()
  })
})

describe('ТЗ 59: Задача 3 — Отключение лишних кнопок (Чат и Закрытие)', () => {
  it('3.1. Кнопка "Служебный чат смены" (MessageSquare) заблокирована, имеет tooltip и правильные CSS классы', () => {
    render(
      <OperatorBottomBar
        services={[]}
        onRemoveService={vi.fn()}
        onAddService={vi.fn()}
        onSave={vi.fn()}
      />
    )

    const chatBtn = screen.getByLabelText('Служебный чат смены')
    expect(chatBtn).toBeDisabled()
    expect(chatBtn).toHaveClass('cursor-not-allowed')
    expect(chatBtn).toHaveClass('opacity-50')
    expect(chatBtn).toHaveAttribute(
      'title',
      'Недоступно в тренажере. В реальности используется для связи со старшим смены.'
    )
  })

  it('3.2. Кнопка "Закрыть карточку вызова" (X) заблокирована, имеет tooltip и правильные CSS классы', () => {
    render(
      <OperatorBottomBar
        services={[]}
        onRemoveService={vi.fn()}
        onAddService={vi.fn()}
        onSave={vi.fn()}
      />
    )

    const closeBtn = screen.getByLabelText(/Закрыть карточку/i)
    expect(closeBtn).toBeDisabled()
    expect(closeBtn).toHaveClass('cursor-not-allowed')
    expect(closeBtn).toHaveClass('opacity-50')
    expect(closeBtn).toHaveAttribute(
      'title',
      "В учебном режиме вызов должен быть отработан до конца. Воспользуйтесь кнопкой 'Сохранить'"
    )
  })

  it('3.3. Клик по заблокированным кнопкам чата и закрытия в OperatorPage не открывает модалки', () => {
    currentSearchParams = new URLSearchParams('ticket_id=test_ticket_59&session_id=sess_test_59')
    render(<OperatorPage />)

    const chatBtn = screen.getByLabelText('Служебный чат смены')
    fireEvent.click(chatBtn)
    expect(screen.queryByText('Служебный чат смены 112')).not.toBeInTheDocument()

    const closeBtn = screen.getByLabelText(/Закрыть карточку/i)
    fireEvent.click(closeBtn)
    expect(screen.queryByText('Закрыть карточку вызова?')).not.toBeInTheDocument()
  })
})
