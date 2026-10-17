/** Independent P3 acceptance: preserve UI behavior when fixing library types. */
import React from 'react'
import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {OperatorTopBar} from '@/components/operator/top-bar'
import {Tutorial} from '@/components/tutorial'

// Current installed Joyride uses onEvent. Its UI/geometry is outside this test.
vi.mock('react-joyride', () => ({
  STATUS: {FINISHED: 'finished', SKIPPED: 'skipped', RUNNING: 'running'},
  Joyride: ({run, onEvent}: {run: boolean; onEvent?: (event: {status: string}) => void}) => (
    <div>
      <span>{run ? 'tour-running' : 'tour-stopped'}</span>
      <button onClick={() => onEvent?.({status: 'finished'})}>finish-tour</button>
      <button onClick={() => onEvent?.({status: 'skipped'})}>skip-tour</button>
      <button onClick={() => onEvent?.({status: 'running'})}>progress-tour</button>
    </div>
  ),
}))

afterEach(() => {cleanup(); vi.restoreAllMocks()})

describe('P3 component contracts', () => {
  it.each(['finish-tour', 'skip-tour'])('tutorial calls onFinish for %s with the installed library API', (button) => {
    const finish = vi.fn()
    render(<Tutorial run onFinish={finish} />)
    fireEvent.click(screen.getByRole('button', {name: button}))
    expect(finish).toHaveBeenCalledTimes(1)
  })

  it('tutorial does not finish on an ordinary progress event and obeys run', () => {
    const finish = vi.fn()
    const view = render(<Tutorial run={false} onFinish={finish} />)
    expect(screen.getByText('tour-stopped')).toBeTruthy()
    view.rerender(<Tutorial run onFinish={finish} />)
    expect(screen.getByText('tour-running')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', {name: 'progress-tour'}))
    expect(finish).not.toHaveBeenCalled()
  })

  it('keeps unsupported SMS controls disabled while fixing their props', () => {
    const messages = vi.fn()
    render(<OperatorTopBar elapsedSeconds={65} onOpenMsg={messages} />)
    const controls = screen.getAllByRole('button', {name: 'Сообщение'})
    expect(controls.length).toBeGreaterThan(0)
    for (const control of controls) {
      expect(control).toBeDisabled()
      fireEvent.click(control)
    }
    expect(messages).not.toHaveBeenCalled()
    expect(screen.getByText('01:05')).toBeTruthy()
  })

  it('keeps caller-number help and copy callbacks connected', () => {
    const aon = vi.fn(), map = vi.fn(), provider = vi.fn(), copy = vi.fn()
    render(<OperatorTopBar elapsedSeconds={0} onAonInfo={aon} onMapInfo={map}
      onProviderInfo={provider} onCopyAonToProvided={copy} />)
    fireEvent.click(screen.getByTitle('Справка по определению номера АОН'))
    fireEvent.click(screen.getByTitle('Определение местоположения базовой станции'))
    fireEvent.click(screen.getAllByTitle('Данные оператора связи')[0])
    fireEvent.click(screen.getAllByTitle('Скопировать номер из АОН')[0])
    expect(aon).toHaveBeenCalledTimes(1)
    expect(map).toHaveBeenCalledTimes(1)
    expect(provider).toHaveBeenCalledTimes(1)
    expect(copy).toHaveBeenCalledTimes(1)
  })
})
