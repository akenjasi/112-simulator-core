import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AddServiceModal } from '@/components/operator/AddServiceModal'
import { DEFAULT_SERVICES_LIST, calculateLocalServices, matchCanonicalService, getServiceShortName } from '@/components/operator/services-data'
import { IncidentClassifier } from '@/components/operator/IncidentClassifier'

describe('ТЗ 56: Модальное окно «Добавьте службы»', () => {
  it('1. Отображает заголовок "Добавьте службы" и крестик закрытия', () => {
    const onClose = vi.fn()
    const onSave = vi.fn()
    render(
      <AddServiceModal
        isOpen={true}
        onClose={onClose}
        currentServices={[]}
        onSave={onSave}
      />
    )

    expect(screen.getByRole('heading', { level: 2, name: /добавьте службы/i })).toBeInTheDocument()
    const closeBtn = screen.getByRole('button', { name: /^\ *закрыть\ *$/i })
    expect(closeBtn).toBeInTheDocument()
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('2. Содержит поле поиска с плейсхолдером "Поиск ..."', () => {
    render(
      <AddServiceModal
        isOpen={true}
        onClose={vi.fn()}
        currentServices={[]}
        onSave={vi.fn()}
      />
    )

    const searchInput = screen.getByPlaceholderText('Поиск ...')
    expect(searchInput).toBeInTheDocument()
    // Проверка класса рамки: только нижняя граница (border-b)
    expect(searchInput.className).toContain('border-b')
  })

  it('3. Отображает все 32 службы из утвержденного ТЗ списка', () => {
    render(
      <AddServiceModal
        isOpen={true}
        onClose={vi.fn()}
        currentServices={[]}
        onSave={vi.fn()}
      />
    )

    expect(DEFAULT_SERVICES_LIST.length).toBe(33)
    // Проверяем ключевые организации из списка заказчика
    expect(screen.getByText(/Служба 101/)).toBeInTheDocument()
    expect(screen.getByText(/Служба 102/)).toBeInTheDocument()
    expect(screen.getByText('ФСБ')).toBeInTheDocument()
    expect(screen.getByText('ЦЭМП')).toBeInTheDocument()
    expect(screen.getByText(/Служба 103/)).toBeInTheDocument()
    expect(screen.getByText(/Служба 104/)).toBeInTheDocument()
    expect(screen.getByText(/ЦОДД/)).toBeInTheDocument()
    expect(screen.getByText(/Гормост/)).toBeInTheDocument()
    expect(screen.getByText('Мосгортранс')).toBeInTheDocument()
    expect(screen.getByText(/Мосводоканал/)).toBeInTheDocument()
    expect(screen.getByText('Метро')).toBeInTheDocument()
    expect(screen.getByText(/ГКУ ЦСА/)).toBeInTheDocument()
  })

  it('4. Фильтрует список служб при вводе в строку поиска', () => {
    render(
      <AddServiceModal
        isOpen={true}
        onClose={vi.fn()}
        currentServices={[]}
        onSave={vi.fn()}
      />
    )

    const searchInput = screen.getByPlaceholderText('Поиск ...')
    fireEvent.change(searchInput, { target: { value: 'ЦОДД' } })

    expect(screen.getByText(/ЦОДД/)).toBeInTheDocument()
    expect(screen.queryByText('ФСБ')).not.toBeInTheDocument()
    expect(screen.queryByText(/Мосводоканал/)).not.toBeInTheDocument()
  })

  it('5. Выбирает службу по клику на строку и передает выбранные службы в onSave', () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(
      <AddServiceModal
        isOpen={true}
        onClose={onClose}
        currentServices={[]}
        onSave={onSave}
      />
    )

    // Кликаем по строке ФСБ
    const fsbRow = screen.getByText('ФСБ')
    fireEvent.click(fsbRow)

    // Кликаем по кнопке "Сохранить и закрыть"
    const saveBtn = screen.getByRole('button', { name: /сохранить и закрыть/i })
    expect(saveBtn).toBeInTheDocument()
    expect(saveBtn.className).toContain('border-[#ec653b]')
    expect(saveBtn.className).toContain('text-[#ec653b]')

    fireEvent.click(saveBtn)
    expect(onSave).toHaveBeenCalledWith(expect.arrayContaining(['ФСБ']))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ТЗ 56: Автоматический расчет служб', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/calculate')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(['Служба 101', 'ЦОДД']),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    })
  })

  it('1. Чистая функция calculateLocalServices правильно рассчитывает службы для пожара (101)', () => {
    const services = calculateLocalServices({
      finalType: '101',
      category: '101',
      isFire: true,
      hasVictims: false,
    })
    expect(services).toContain(DEFAULT_SERVICES_LIST[0]) // Служба 101
  })

  it('2. Чистая функция calculateLocalServices добавляет Скорую (103) при наличии пострадавших', () => {
    const services = calculateLocalServices({
      finalType: '101',
      hasVictims: true,
    })
    expect(services).toContain(DEFAULT_SERVICES_LIST[0]) // Служба 101
    expect(services).toContain(DEFAULT_SERVICES_LIST[4]) // Служба 103
  })

  it('3. Чистая функция calculateLocalServices назначает ЦОДД и Гормост для дорог и мостов', () => {
    const services = calculateLocalServices({
      finalType: 'ДТП',
      tags: ['Мост', 'Дорога'],
    })
    expect(services).toContain(DEFAULT_SERVICES_LIST[7]) // ЦОДД
    expect(services).toContain(DEFAULT_SERVICES_LIST[8]) // Гормост
  })

  it('4. IncidentClassifier вызывает onRecommendedServices и POST /api/v1/classifier/calculate при выборе категории', async () => {
    const onRecommendedServices = vi.fn()
    render(
      <IncidentClassifier
        incidentType={null}
        onSelectType={vi.fn()}
        onAggregatedUpdate={vi.fn()}
        onRecommendedServices={onRecommendedServices}
      />
    )

    // Кликаем по кнопке ДТП
    const dtpBtn = screen.getByRole('button', { name: /ДТП/i })
    fireEvent.click(dtpBtn)

    await waitFor(() => {
      expect(onRecommendedServices).toHaveBeenCalled()
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/classifier/calculate',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('5. matchCanonicalService и getServiceShortName корректно форматируют названия служб', () => {
    const canonical = matchCanonicalService('101')
    expect(canonical).toContain('Служба 101')
    const short = getServiceShortName(canonical)
    expect(short).toBe('Служба 101')

    const coddShort = getServiceShortName("ЦОДД (ГКУ 'Центр организации дорожного движения')")
    expect(coddShort).toBe('ЦОДД')
  })
})
