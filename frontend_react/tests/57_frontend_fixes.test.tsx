import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import OperatorPage from '@/app/operator/page'
import { AddServiceModal } from '@/components/operator/AddServiceModal'
import {
  DEFAULT_SERVICES_LIST,
  calculateLocalServices,
  matchCanonicalService,
  SERVICE_101,
  SERVICE_102,
} from '@/components/operator/services-data'
import { IncidentClassifier } from '@/components/operator/IncidentClassifier'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('ticket_id=test_ticket_123&session_id=sess_456'),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))

describe('ТЗ 57: Задача 1 — Нелогичные службы и сброс', () => {
  it('1.1. Выбор "Отмена вызова" НЕ добавляет саму отмену вызова и НЕ добавляет Службу 101', () => {
    const services = calculateLocalServices({
      finalType: 'Отмена вызова',
      category: 'Отмена вызова',
      isFire: false,
      hasVictims: false,
      isBlocked: false,
    })
    expect(services).toEqual([])
    expect(services).not.toContain(SERVICE_101)
    expect(services).not.toContain('Отмена вызова')
  })

  it('1.2. matchCanonicalService возвращает пустую строку для не-службы "Отмена вызова"', () => {
    const result = matchCanonicalService('Отмена вызова')
    expect(result).toBe('')
  })

  it('1.3. При нажатии на крестик (X) сброса типа происшествия вызывается onSelectType(null)', () => {
    const onSelectType = vi.fn()
    const onAggregatedUpdate = vi.fn()
    render(
      <IncidentClassifier
        incidentType="ДТП"
        onSelectType={onSelectType}
        onAggregatedUpdate={onAggregatedUpdate}
      />
    )

    const resetBtn = screen.getByTitle('Сбросить тип происшествия')
    expect(resetBtn).toBeInTheDocument()
    fireEvent.click(resetBtn)

    expect(onSelectType).toHaveBeenCalledWith(null)
    expect(onAggregatedUpdate).toHaveBeenCalledWith('')
  })
})

describe('ТЗ 57: Задача 2 — Добавление службы "102"', () => {
  it('2.1. В DEFAULT_SERVICES_LIST присутствует "Служба 102 (Дежурная часть ГУ МВД)"', () => {
    expect(DEFAULT_SERVICES_LIST).toContain('Служба 102 (Дежурная часть ГУ МВД)')
    expect(SERVICE_102).toBe('Служба 102 (Дежурная часть ГУ МВД)')
  })

  it('2.2. В модалке "Добавьте службы" отображается полиция (Служба 102)', () => {
    render(
      <AddServiceModal
        isOpen={true}
        onClose={vi.fn()}
        currentServices={[]}
        onSave={vi.fn()}
      />
    )
    expect(screen.getByText(/Служба 102 \(Дежурная часть ГУ МВД\)/)).toBeInTheDocument()
  })

  it('2.3. matchCanonicalService распознает "102" и "полиция" как Службу 102', () => {
    expect(matchCanonicalService('102')).toBe(SERVICE_102)
    expect(matchCanonicalService('полиция')).toBe(SERVICE_102)
  })
})

describe('ТЗ 57: Задача 3 — Персистентность состояния (LocalStorage)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('3.1. Восстанавливает сохраненное состояние из localStorage при монтировании', async () => {
    const mockState = {
      callerName: 'Петров Петр Петрович',
      callerStatus: 'Очевидец',
      fullAddressString: 'Москва, ул. Тверская, д. 1',
      address: {
        country: 'Россия',
        subject: 'Москва',
        city: 'Москва',
        objectName: '',
        okrug: 'ЦАО',
        district: 'Тверской',
        street: 'ул. Тверская',
        house: '1',
        building: '',
        structure: '',
        apartment: '10',
        entrance: '1',
        floor: '2',
        doorCode: '1234',
        description: '',
      },
      incidentDescription: 'Тестовое описание происшествия заявителем',
      services: [
        {
          id: 'svc_test_1',
          name: SERVICE_102,
          shortName: 'Служба 102',
          isGray: true,
        },
      ],
      activeIncidentTitle: 'ДТП',
      classifierAggregatedText: 'Детали ДТП',
      elapsedSeconds: 42,
    }

    localStorage.setItem('operator_state_test_ticket_123', JSON.stringify(mockState))

    render(<OperatorPage />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Петров Петр Петрович')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Тестовое описание происшествия заявителем')).toBeInTheDocument()
      expect(screen.getByText(/00:42/)).toBeInTheDocument()
      expect(screen.getByText(/Служба 102/)).toBeInTheDocument()
    })
  })
})

describe('ТЗ 57: Задача 4 — Таймер', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('4.1. Таймер по умолчанию стартует с 0 секунд (не с 16)', () => {
    render(<OperatorPage />)
    // 00:00 or 00:01
    expect(screen.getByText(/00:0[0-1]/)).toBeInTheDocument()
  })
})

describe('ТЗ 57: Задача 5 — Верстка и Training Strip', () => {
  it('5.1. Главный контейнер и панели имеют корректные flex / shrink-0 / min-h-0 классы', () => {
    const { container } = render(<OperatorPage />)

    // Внешняя обертка
    const rootWrapper = container.firstElementChild as HTMLElement
    expect(rootWrapper.className).toContain('h-screen')
    expect(rootWrapper.className).toContain('w-full')
    expect(rootWrapper.className).toContain('flex')
    expect(rootWrapper.className).toContain('flex-col')
    expect(rootWrapper.className).toContain('overflow-hidden')

    // Плашка учебного режима
    const trainingStrip = screen.getByText(/Учебный режим: Оператор 112/).closest('div')
    expect(trainingStrip?.parentElement?.className).toContain('shrink-0')

    // Грид с двумя колонками
    const gridContainer = container.querySelector('.grid-cols-2')
    expect(gridContainer?.className).toContain('flex-1')
    expect(gridContainer?.className).toContain('min-h-0')
    expect(gridContainer?.className).toContain('overflow-hidden')

    // Нижняя панель
    const bottomBar = screen.getByText('Службы:').closest('div')?.parentElement
    expect(bottomBar?.className).toContain('shrink-0')
  })
})
