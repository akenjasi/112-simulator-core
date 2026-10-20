import React from 'react'
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {ServicesBar} from '@/components/dispatcher/services-bar'
import {dispatcherData} from '@/lib/dispatcher-data'

afterEach(cleanup)

describe('DDS service menu', () => {
  it('keeps exactly the two manual controls and submits through the message icon', () => {
    const next = vi.fn()
    render(<ServicesBar data={dispatcherData} onNextCard={next}/> )
    const controls = within(screen.getByRole('group', {name: 'Действия с карточкой'}))
    expect(controls.getAllByRole('button')).toHaveLength(1)
    expect(controls.getAllByRole('link')).toHaveLength(1)
    expect(controls.queryByText('отработана')).toBeNull()
    for (const name of ['Связи', 'Таймер', 'Оповещения', 'Сообщения']) {
      expect(controls.queryByRole('button', {name})).toBeNull()
    }
    expect(controls.getByRole('link', {name: 'Закрыть карточку и открыть список происшествий'})).toHaveAttribute('href', '/dds/journal')
    expect(next).not.toHaveBeenCalled()
    fireEvent.click(controls.getByRole('button', {name: 'Отработана'}))
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('explains a blocked submission and keeps closing separate from completion', () => {
    const next = vi.fn()
    render(<ServicesBar data={dispatcherData} onNextCard={next} completionDisabled completionReason="Ожидается доклад"/> )
    const submit = screen.getByRole('button', {name: 'Отработана'})
    expect(submit).toBeDisabled()
    expect(submit).toHaveAttribute('title', 'Ожидается доклад')
    expect(submit).toHaveAttribute('aria-description', 'Ожидается доклад')
    fireEvent.click(submit)
    expect(next).not.toHaveBeenCalled()
    expect(screen.getByRole('link', {name: 'Закрыть карточку и открыть список происшествий'})).not.toHaveAttribute('aria-disabled')
  })

  it('keeps one usable pencil for every active service', () => {
    render(<ServicesBar data={dispatcherData}/>)
    const pencils=screen.getAllByRole('button',{name:'Редактировать статус'})
    expect(pencils).toHaveLength(dispatcherData.services.length)
    for(const pencil of pencils) expect(pencil).not.toBeDisabled()
  })

  it('keeps all pencils visible while a service save is in flight', async () => {
    let resolve!:(value:boolean)=>void
    render(<ServicesBar data={dispatcherData} onStatusChange={()=>new Promise<boolean>(done=>{resolve=done})}/>)
    fireEvent.click(screen.getAllByRole('button',{name:'Редактировать статус'})[0])
    fireEvent.change(screen.getByPlaceholderText('Номер наряда'), {target: {value: '17'}})
    fireEvent.click(screen.getByRole('button',{name:'Подтвердить'}))
    const pencils=screen.getAllByRole('button',{name:'Редактировать статус'})
    expect(pencils).toHaveLength(dispatcherData.services.length)
    for(const pencil of pencils) expect(pencil).toBeDisabled()
    await act(async()=>resolve(true))
    for(const pencil of screen.getAllByRole('button',{name:'Редактировать статус'})) expect(pencil).not.toBeDisabled()
  })

  it('opens history outside the horizontal scroll container and closes it', () => {
    render(<ServicesBar data={dispatcherData}/> )
    fireEvent.click(screen.getByText('Упр. Чертанов...'))
    const history = screen.getByRole('dialog', {name: 'История службы Упр. Чертанов...'})
    expect(history.closest('.overflow-x-auto')).toBeNull()
    expect(history.textContent).toContain('Получена службой')
    fireEvent.click(screen.getByRole('button', {name: 'Закрыть историю службы'}))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps an unsuccessful edit and waits for confirmation before unlocking dispatch', async () => {
    let resolve!: (saved: boolean) => void
    const save = vi.fn(() => new Promise<boolean>(done => {resolve = done}))
    const accept = vi.fn()
    render(<ServicesBar data={dispatcherData} onStatusChange={save} onAccept={accept}/> )
    fireEvent.click(screen.getAllByRole('button', {name: 'Редактировать статус'})[0])
    fireEvent.change(screen.getByPlaceholderText('Номер наряда'), {target: {value: '17'}})
    const confirm = screen.getByRole('button', {name: 'Подтвердить'})
    fireEvent.click(confirm); fireEvent.click(confirm)
    expect(save).toHaveBeenCalledTimes(1)
    expect(accept).not.toHaveBeenCalled()
    await act(async () => resolve(false))
    expect(screen.getByPlaceholderText('Номер наряда')).toHaveProperty('value', '17')
    expect(accept).not.toHaveBeenCalled()
  })

  it('allows history but blocks edits and completion when disabled', () => {
    const next = vi.fn()
    render(<ServicesBar data={dispatcherData} disabled onNextCard={next}/> )
    for (const pencil of screen.getAllByRole('button', {name: 'Редактировать статус'})) expect(pencil).toBeDisabled()
    fireEvent.click(screen.getByRole('button', {name: 'Отработана'}))
    expect(next).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Упр. Чертанов...'))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})
