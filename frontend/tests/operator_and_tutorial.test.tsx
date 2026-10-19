import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { OperatorTopBar } from '@/components/operator/top-bar'
import { Tutorial } from '@/components/tutorial'

describe('OperatorTopBar Tooltips, Actions, and SMS Disabled State', () => {
  it('renders disabled SMS button with explanatory tooltip', () => {
    render(<OperatorTopBar elapsedSeconds={10} />)
    const smsButtons = screen.getAllByTitle(/Недоступно в тренажере\. Функция служит для отправки SMS заявителю/i)
    expect(smsButtons.length).toBeGreaterThanOrEqual(1)
    smsButtons.forEach((btn) => {
      expect(btn).toBeDisabled()
      expect(btn.className).toContain('cursor-not-allowed')
    })
  })

  it('renders interactive tooltips and triggers callbacks for AON, Map, and Provider buttons', () => {
    const onAonMock = vi.fn()
    const onMapMock = vi.fn()
    const onProviderMock = vi.fn()

    render(
      <OperatorTopBar
        elapsedSeconds={10}
        onAonInfo={onAonMock}
        onMapInfo={onMapMock}
        onProviderInfo={onProviderMock}
      />
    )

    const aonBtn = screen.getByTitle('Справка по определению номера АОН')
    expect(aonBtn).toBeInTheDocument()
    fireEvent.click(aonBtn)
    expect(onAonMock).toHaveBeenCalledTimes(1)

    const mapBtn = screen.getByTitle('Определение местоположения базовой станции')
    expect(mapBtn).toBeInTheDocument()
    fireEvent.click(mapBtn)
    expect(onMapMock).toHaveBeenCalledTimes(1)

    const providerBtns = screen.getAllByTitle('Данные оператора связи')
    expect(providerBtns.length).toBeGreaterThanOrEqual(1)
    fireEvent.click(providerBtns[0])
    expect(onProviderMock).toHaveBeenCalledTimes(1)
  })

  it('renders audio playback button and triggers onPlayAudio', () => {
    const onPlayAudioMock = vi.fn()
    render(
      <OperatorTopBar
        elapsedSeconds={10}
        callStatus="ANSWERED"
        isPlayingAudio={false}
        onPlayAudio={onPlayAudioMock}
      />
    )

    const playBtn = screen.getByTitle('Воспроизвести речь заявителя')
    expect(playBtn).toBeInTheDocument()
    fireEvent.click(playBtn)
    expect(onPlayAudioMock).toHaveBeenCalledTimes(1)
  })
})

// Mock react-joyride boundary
vi.mock('react-joyride', async () => {
  const actual = await vi.importActual<any>('react-joyride')
  return {
    ...actual,
    Joyride: ({ onEvent, run }: any) => {
      if (!run) return null
      return (
        <div data-testid="joyride-mock">
          <button
            type="button"
            onClick={() => onEvent?.({ status: 'running', type: 'step:after' })}
            data-testid="joyride-next"
          >
            Next Step
          </button>
          <button
            type="button"
            onClick={() => onEvent?.({ status: 'skipped', type: 'tour:end' })}
            data-testid="joyride-skip"
          >
            Skip Tour
          </button>
          <button
            type="button"
            onClick={() => onEvent?.({ status: 'finished', type: 'tour:end' })}
            data-testid="joyride-finish"
          >
            Finish Tour
          </button>
        </div>
      )
    },
  }
})

describe('Tutorial Component Lifecycle & react-joyride Integration', () => {
  it('renders Tutorial component when run is true', () => {
    const onFinishMock = vi.fn()
    render(<Tutorial run={true} onFinish={onFinishMock} />)
    expect(screen.getByTestId('joyride-mock')).toBeInTheDocument()
    expect(onFinishMock).not.toHaveBeenCalled()
  })

  it('does not invoke onFinish on intermediate steps', () => {
    const onFinishMock = vi.fn()
    render(<Tutorial run={true} onFinish={onFinishMock} />)
    fireEvent.click(screen.getByTestId('joyride-next'))
    expect(onFinishMock).not.toHaveBeenCalled()
  })

  it('invokes onFinish when tour is skipped', () => {
    const onFinishMock = vi.fn()
    render(<Tutorial run={true} onFinish={onFinishMock} />)
    fireEvent.click(screen.getByTestId('joyride-skip'))
    expect(onFinishMock).toHaveBeenCalledTimes(1)
  })

  it('invokes onFinish when tour is finished', () => {
    const onFinishMock = vi.fn()
    render(<Tutorial run={true} onFinish={onFinishMock} />)
    fireEvent.click(screen.getByTestId('joyride-finish'))
    expect(onFinishMock).toHaveBeenCalledTimes(1)
  })
})
