import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import OperatorPage from '@/app/operator/page'
import { OperatorLeftPanel, DISTRICTS_BY_OKRUG, CALLER_STATUSES } from '@/components/operator/left-panel'
import { OperatorTopBar } from '@/components/operator/top-bar'
import { OperatorBottomBar } from '@/components/operator/bottom-bar'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('ticket_id=test_ticket_58&session_id=sess_test_58'),
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
}))

describe('ТЗ 58: Задача 1 — Стартовое состояние (Пустая карточка и геолокация)', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('1.1. Имя заявителя и полный адрес изначально пустые, но геолокация подхватила СВАО и Южное Медведково', () => {
    render(<OperatorPage />)

    // Name should be empty
    const nameInput = screen.getByPlaceholderText('Фамилия и имя заявителя') as HTMLInputElement
    expect(nameInput.value).toBe('')

    // Full address string should be empty
    const addressInput = screen.getByTitle('Очистить адрес').previousElementSibling as HTMLInputElement
    expect(addressInput.value).toBe('')

    // Country, subject, city, okrug, district are filled
    expect(screen.getByDisplayValue('Россия')).toBeInTheDocument()
    expect(screen.getAllByDisplayValue('Москва').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByDisplayValue('СВАО')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Южное Медведково')).toBeInTheDocument()

    // Street, house, etc. are empty
    const streetInput = screen.getByText('Улица:').nextElementSibling?.querySelector('input') as HTMLInputElement
    expect(streetInput.value).toBe('')

    const houseInput = screen.getByText('Дом/Вл:').nextElementSibling?.querySelector('input') as HTMLInputElement
    expect(houseInput.value).toBe('')
  })
})

describe('ТЗ 58: Задача 2 — Связка Округ -> Район', () => {
  it('2.1. DISTRICTS_BY_OKRUG содержит основные округа Москвы', () => {
    expect(DISTRICTS_BY_OKRUG['ЦАО']).toBeDefined()
    expect(DISTRICTS_BY_OKRUG['СВАО']).toBeDefined()
    expect(DISTRICTS_BY_OKRUG['ЮАО']).toBeDefined()
    expect(DISTRICTS_BY_OKRUG['ЗАО']).toBeDefined()
    expect(DISTRICTS_BY_OKRUG['ЦАО']).toContain('Арбат')
    expect(DISTRICTS_BY_OKRUG['ЦАО']).toContain('Тверской')
    expect(DISTRICTS_BY_OKRUG['СВАО']).toContain('Южное Медведково')
  })

  it('2.2. При смене округа в OperatorLeftPanel список доступных районов меняется', () => {
    let addressState = {
      country: 'Россия',
      subject: 'Москва',
      city: 'Москва',
      objectName: '',
      okrug: 'СВАО',
      district: 'Южное Медведково',
      street: '',
      house: '',
      building: '',
      structure: '',
      apartment: '',
      entrance: '',
      floor: '',
      doorCode: '',
      description: '',
    }
    const setAddressMock = vi.fn((update) => {
      if (typeof update === 'function') {
        addressState = update(addressState)
      } else {
        addressState = update
      }
    })

    const { rerender } = render(
      <OperatorLeftPanel
        callerName=""
        setCallerName={vi.fn()}
        callerStatus=""
        setCallerStatus={vi.fn()}
        address={addressState}
        setAddress={setAddressMock}
        fullAddressString=""
        setFullAddressString={vi.fn()}
        incidentDescription=""
        setIncidentDescription={vi.fn()}
      />
    )

    // Initially СВАО, options contain Южное Медведково
    expect(screen.getByRole('option', { name: 'Южное Медведково' })).toBeInTheDocument()

    // Change Okrug to ЦАО
    const okrugSelect = screen.getByDisplayValue('СВАО')
    fireEvent.change(okrugSelect, { target: { value: 'ЦАО' } })
    expect(setAddressMock).toHaveBeenCalled()

    // Rerender with updated addressState
    rerender(
      <OperatorLeftPanel
        callerName=""
        setCallerName={vi.fn()}
        callerStatus=""
        setCallerStatus={vi.fn()}
        address={addressState}
        setAddress={setAddressMock}
        fullAddressString=""
        setFullAddressString={vi.fn()}
        incidentDescription=""
        setIncidentDescription={vi.fn()}
      />
    )

    // Now district select contains ЦАО districts (Арбат, Тверской)
    expect(screen.getByRole('option', { name: 'Арбат' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Тверской' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Южное Медведково' })).not.toBeInTheDocument()
  })
})

describe('ТЗ 58: Задача 3 — Статусы заявителя', () => {
  it('3.1. Список CALLER_STATUSES строго соответствует ТЗ', () => {
    expect(CALLER_STATUSES).toEqual([
      'очевидец',
      'пострадавший',
      'родственник',
      'знакомый',
      'ребенок',
      'участник',
    ])
  })

  it('3.2. Выпадающий список "выберите статус" содержит строго эти варианты', () => {
    render(<OperatorPage />)

    const statusSelect = screen.getByDisplayValue('выберите статус') as HTMLSelectElement
    const optionValues = Array.from(statusSelect.options).map((o) => o.value)

    expect(optionValues).toEqual([
      '',
      'очевидец',
      'пострадавший',
      'родственник',
      'знакомый',
      'ребенок',
      'участник',
    ])
    expect(optionValues).not.toContain('заявитель')
  })
})

describe('ТЗ 58: Задача 4 — Уведомления (Toast) перекрывают интерфейс', () => {
  it('4.1. Toast расположен внизу экрана (не сверху top-14)', async () => {
    render(<OperatorPage />)

    // Click AON copy button
    const aonBtns = screen.getAllByTitle('Скопировать номер из АОН')
    expect(aonBtns.length).toBeGreaterThan(0)
    fireEvent.click(aonBtns[0])

    const toast = await screen.findByText(/Номер АОН скопирован/)
    expect(toast).toBeInTheDocument()
    expect(toast.className).toContain('bottom-')
    expect(toast.className).not.toContain('top-14')
  })
})

describe('ТЗ 58: Задача 5 — Блокировка неиспользуемых кнопок', () => {
  it('5.1. Кнопки "Сообщение" (SMS) в TopBar заблокированы, имеют tooltip и cursor-not-allowed', () => {
    render(
      <OperatorTopBar
        elapsedSeconds={10}
      />
    )

    const smsBtns = screen.getAllByTitle('Недоступно в тренажере. Функция служит для отправки SMS заявителю')
    expect(smsBtns.length).toBeGreaterThan(0)
    smsBtns.forEach((btn) => {
      expect(btn).toBeDisabled()
      expect(btn.className).toContain('cursor-not-allowed')
      expect(btn.className).toContain('opacity-50')
    })
  })

  it('5.2. Кнопка "Связанные карточки (Дубли)" в BottomBar заблокирована, имеет tooltip и cursor-not-allowed', () => {
    render(
      <OperatorBottomBar
        services={[]}
        onRemoveService={vi.fn()}
        onAddService={vi.fn()}
        onSave={vi.fn()}
      />
    )

    const linksBtn = screen.getByTitle(/Недоступно в тренажере. Функция служит для поиска и связывания дубликатов/i)
    expect(linksBtn).toBeInTheDocument()
    expect(linksBtn).toBeDisabled()
    expect(linksBtn.className).toContain('cursor-not-allowed')
    expect(linksBtn.className).toContain('opacity-50')
  })
})

describe('ТЗ 58: Задача 6 — Остановка таймера и отправка на Бэкенд', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('6.1. При нажатии "Сохранить" таймер останавливается', async () => {
    localStorage.setItem(
      'operator_state_test_ticket_58',
      JSON.stringify({
        activeIncidentTitle: 'Пожар',
        callerStatus: 'очевидец',
      })
    )
    render(<OperatorPage />)

    // Advance 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByText(/00:05/)).toBeInTheDocument()

    // Click "сохранить" to open modal
    const saveBtn = screen.getByRole('button', { name: /сохранить/i })
    fireEvent.click(saveBtn)

    expect(screen.getByText('Готова к сохранению и передаче в ДДС экстренных служб')).toBeInTheDocument()

    // Advance 5 more seconds while modal is open
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    // Timer must STILL be 00:05!
    expect(screen.getByText(/00:05/)).toBeInTheDocument()
  })

  it('6.2. В финальной модалке клик "Передать в службы" отправляет POST-запрос на evaluate и редиректит в лобби', async () => {
    localStorage.setItem(
      'operator_state_test_ticket_58',
      JSON.stringify({
        activeIncidentTitle: 'Пожар',
        callerStatus: 'очевидец',
      })
    )
    const fetchMock = vi.fn().mockImplementation((url) => {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          evaluation_id: 'eval-123',
          scores: { total: 100 },
          metrics: { time_taken_seconds: 5 },
          errors_list: [],
        }),
      })
    })
    global.fetch = fetchMock

    render(<OperatorPage />)

    // Open save modal
    const saveBtn = screen.getByRole('button', { name: /сохранить/i })
    fireEvent.click(saveBtn)

    // Click "Передать в службы"
    const submitBtn = screen.getByRole('button', { name: /передать в службы/i })
    await act(async () => {
      fireEvent.click(submitBtn)
    })

    // Verify evaluate call
    const evaluateCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/evaluate'))
    expect(evaluateCall).toBeDefined()
    const [url, options] = evaluateCall!
    expect(url).toContain('/api/v2/sessions/sess_test_58/evaluate')
    expect(options.method).toBe('POST')

    const body = JSON.parse(options.body)
    expect(body.ticket_id).toBe('test_ticket_58')
    expect(body.assigned_services).toBeInstanceOf(Array)
    expect(body.time_taken_seconds).toBeDefined()

    // Advance timer to trigger redirect
    act(() => {
      vi.advanceTimersByTime(2500)
    })

    expect(pushMock).toHaveBeenCalledWith('/student/lobby')
  })
})
