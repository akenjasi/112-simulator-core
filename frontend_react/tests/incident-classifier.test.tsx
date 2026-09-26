import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { IncidentClassifier } from '@/components/operator/IncidentClassifier'

describe('IncidentClassifier Component', () => {
  it('renders initial blank state with search input and quick buttons', () => {
    const onUpdate = vi.fn()
    const onSelectType = vi.fn()
    render(<IncidentClassifier incidentType={null} onAggregatedUpdate={onUpdate} onSelectType={onSelectType} />)
    
    // Should have the input for searching incident type
    expect(screen.getByPlaceholderText(/что случилось/i)).toBeInTheDocument()
    
    // Should have quick buttons
    expect(screen.getByRole('button', { name: /ДТП/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Справка-103/i })).toBeInTheDocument()
  })

  it('renders generic form for unknown incident type', () => {
    const onUpdate = vi.fn()
    render(<IncidentClassifier incidentType="Прочие" onAggregatedUpdate={onUpdate} onSelectType={vi.fn()} />)
    
    expect(screen.getByText(/Детали происшествия/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders 101 form with cascade buttons when 101 is selected', () => {
    const onUpdate = vi.fn()
    render(<IncidentClassifier incidentType="101" onAggregatedUpdate={onUpdate} onSelectType={vi.fn()} />)
    
    // Step 1: Click Улица
    const streetBtn = screen.getByRole('button', { name: /Улица/i })
    fireEvent.click(streetBtn)
    
    // Step 2: Click Открытое пламя / Дым
    const fireBtn = screen.getByRole('button', { name: /Открытое пламя \/ Дым/i })
    expect(fireBtn).toBeInTheDocument()
    fireEvent.click(fireBtn)
    
    expect(onUpdate).toHaveBeenCalled()
  })

  it('transitions to questionnaire on quick button click and resets back on cross click', () => {
    const onUpdate = vi.fn()
    const onSelectType = vi.fn()
    render(<IncidentClassifier incidentType={null} onAggregatedUpdate={onUpdate} onSelectType={onSelectType} />)

    // Click quick button ДТП
    const dtpBtn = screen.getByRole('button', { name: /ДТП/i })
    fireEvent.click(dtpBtn)

    expect(onSelectType).toHaveBeenCalledWith('ДТП')
    // Blank state disappears, questionnaire appears
    expect(screen.queryByPlaceholderText(/что случилось/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Детали происшествия/i)).toBeInTheDocument()

    // Click reset cross button
    const closeBtn = screen.getByRole('button', { name: /Сбросить тип происшествия/i })
    fireEvent.click(closeBtn)

    expect(onSelectType).toHaveBeenCalledWith(null)
    // Returns back to blank state
    expect(screen.getByPlaceholderText(/что случилось/i)).toBeInTheDocument()
  })

  it('opens combobox dropdown on input and selects category', () => {
    const onSelectType = vi.fn()
    render(<IncidentClassifier incidentType={null} onSelectType={onSelectType} />)

    const input = screen.getByPlaceholderText(/что случилось/i)
    fireEvent.change(input, { target: { value: '101' } })

    const option = screen.getByRole('button', { name: /^101/i })
    fireEvent.click(option)

    expect(onSelectType).toHaveBeenCalledWith('101')
    expect(screen.getByRole('button', { name: /Улица/i })).toBeInTheDocument()
  })
})
