import React from 'react'
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {DDSAssignedConsole} from '@/components/dispatcher/dds-assigned-console'
import {dispatcherData} from '@/lib/dispatcher-data'
import {getDDSWorkingCard} from '@/lib/dds-working-card'
import type {DDSSessionState} from '@/lib/dds-cycle'

vi.mock('@/components/dispatcher/top-bar', () => ({TopBar: () => null}))
vi.mock('@/components/dispatcher/caller-panel', () => ({CallerPanel: () => null}))
vi.mock('@/components/dispatcher/incident-panel', () => ({IncidentPanel: () => null}))
const state = (extra = {}): DDSSessionState => ({session_id:'s1', lesson_id:'l1', ticket_id:'t1', card_id:'c1',
  incoming_card: {...structuredClone(dispatcherData), description:'Учебное происшествие'}, session_status:'ACTIVE', lesson_status:'ACTIVE',
  actions:[], submitted_at:null, score:null, ...extra})
const response = (data: unknown) => ({ok:true, json:async () => data})
const flush = async () => {await act(async () => {for (let i=0;i<8;i++) await Promise.resolve()})}
let network: ReturnType<typeof vi.fn>
beforeEach(() => {localStorage.setItem('token','test-token'); network = vi.fn(); vi.stubGlobal('fetch',network)})
afterEach(() => {cleanup(); localStorage.clear(); vi.unstubAllGlobals()})

it('projects saved actions per service without changing the incoming card', () => {
  const initial = state()
  const original = structuredClone(initial.incoming_card)
  initial.actions = [{request_id:'saved',kind:'status',service_name:'Упр. Чертанов...',status:'Принята',
    comment:'Принято после проверки',order_number:'17',actor_id:'cadet',at:'2026-10-17T10:00:00Z'}]
  const working = getDDSWorkingCard(initial)
  expect(working.services[0].status).toBe('Принята')
  expect(working.services[0].history.at(-1)?.orderNumber).toBe('17')
  expect(working.services[1]).toMatchObject({status: original.services[1].status, history:original.services[1].history})
  expect(initial.incoming_card).toEqual(original)
})

it('saves pencil edits through the DDS API and restores the blue history on reload', async () => {
  let saved = state()
  network.mockImplementation(async (_url: string, init: RequestInit) => {
    if (init.method === 'POST') {
      const payload = JSON.parse(init.body as string)
      saved = {...saved, actions:[{...payload, actor_id:'cadet', at:'2026-10-17T10:00:00Z'}]}
    }
    return response(saved)
  })
  const view = render(<DDSAssignedConsole sessionId="s1"/>); await flush()
  fireEvent.click(screen.getAllByRole('button', {name:'Редактировать статус'})[0])
  fireEvent.change(screen.getByPlaceholderText('Номер наряда'), {target:{value:'17'}})
  fireEvent.click(screen.getByRole('button', {name:'Подтвердить'})); await flush()
  expect(network.mock.calls[1][0]).toBe('/api/dds/sessions/s1/actions')
  expect(JSON.parse(network.mock.calls[1][1].body)).toMatchObject({service_name:'Упр. Чертанов...',status:'Принята',order_number:'17'})
  view.unmount(); render(<DDSAssignedConsole sessionId="s1"/>); await flush()
  fireEvent.click(screen.getByRole('button', {name:'История службы Упр. Чертанов...'}))
  expect(screen.getByRole('dialog').textContent).toContain('[наряд: 17]')
  expect(screen.getByRole('dialog').textContent).toContain('Принята')
})

it('does not show an unsaved menu status and retries the same request', async () => {
  network.mockResolvedValueOnce(response(state())).mockRejectedValueOnce(new Error('offline'))
  render(<DDSAssignedConsole sessionId="s1"/>); await flush()
  fireEvent.click(screen.getAllByRole('button', {name:'Редактировать статус'})[0])
  fireEvent.click(screen.getByRole('button', {name:'Подтвердить'})); await flush()
  const first = JSON.parse(network.mock.calls[1][1].body)
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(screen.getByRole('button', {name:'Подтвердить'}).hasAttribute('disabled')).toBe(true)
  network.mockResolvedValueOnce(response(state({actions:[{...first,at:'2026-10-17T10:00:00Z'}]})))
  fireEvent.click(screen.getByRole('button', {name:'Повторить сохранение'})); await flush()
  expect(JSON.parse(network.mock.calls[2][1].body)).toEqual(first)
  expect(screen.queryByRole('button', {name:'Подтвердить'})).toBeNull()
})

it('keeps completed history available while preventing edits', async () => {
  network.mockResolvedValue(response(state({session_status:'COMPLETED', submitted_at:'2026-10-17T10:00:00Z'})))
  render(<DDSAssignedConsole sessionId="s1"/>); await flush()
  for (const pencil of screen.getAllByRole('button', {name:'Редактировать статус'})) {
    expect(pencil).toBeDisabled()
    expect(pencil).toHaveAttribute('title','Занятие завершено: доступен только просмотр')
  }
  expect(screen.getByRole('button', {name:'Отработана'}).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', {name:'История службы Упр. Чертанов...'}))
  expect(screen.getByRole('dialog')).toBeTruthy()
})
