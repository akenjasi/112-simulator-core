import React from 'react'
import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, expect, it, vi} from 'vitest'
import {ServicesBar} from '@/components/dispatcher/services-bar'
import {dispatcherData} from '@/lib/dispatcher-data'
import {postDDSAction, validateDDSSessionState} from '@/lib/dds-cycle'
import {DDSAssignedConsole} from '@/components/dispatcher/dds-assigned-console'

afterEach(() => {cleanup(); localStorage.clear(); vi.unstubAllGlobals()})
const data = {...dispatcherData, description:'Учебное происшествие', services:[{...dispatcherData.services[0], status:'Принята'}]}
const name = data.services[0].name

it('preselects the next stage and offers refusal without picking or skipping work stages', () => {
  render(<ServicesBar data={data} allowedStatuses={{[name]:['Начало реагирования','Отказ от выполнения работ','Принята']}}/>)
  fireEvent.click(screen.getByRole('button', {name:'Редактировать статус'}))
  expect(screen.getByRole('button', {name:'Выбрать статус службы'})).toHaveTextContent('Начало реагирования')
  fireEvent.click(screen.getByRole('button', {name:'Выбрать статус службы'}))
  expect(screen.queryByText('Работы завершены')).toBeNull()
  expect(screen.queryByText('Прибытие')).toBeNull()
  expect(screen.getByText('Отказ от выполнения работ')).toBeTruthy()
  expect(screen.queryByText('Не принята')).toBeNull()
})

it('keeps terminal history and a visibly disabled pencil even for a historical status alias', () => {
  render(<ServicesBar data={{...data, services:[{...data.services[0], status:'Завершена'}]}} allowedStatuses={{[name]:[]}}/>)
  expect(screen.getByRole('button', {name:'Редактировать статус'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button', {name:`История службы ${name}`}))
  expect(screen.getByRole('dialog')).toBeTruthy()
})

it('needs no stage selection and requires a reason if the operator refuses instead', () => {
  render(<ServicesBar data={data} allowedStatuses={{[name]:['Начало реагирования','Отказ от выполнения работ','Принята']}}/>)
  fireEvent.click(screen.getByRole('button', {name:'Редактировать статус'}))
  expect(screen.getByRole('button', {name:'Подтвердить'})).not.toBeDisabled()
  fireEvent.click(screen.getByRole('button', {name:'Выбрать статус службы'}))
  fireEvent.click(screen.getByText('Отказ от выполнения работ'))
  fireEvent.change(screen.getByPlaceholderText('Причина отказа (обязательно)'), {target:{value:''}})
  expect(screen.getByRole('button', {name:'Подтвердить'})).toBeDisabled()
})

it('passes validated server options through the assigned console to the historical pencil menu', async () => {
  const state = {session_id:'s', lesson_id:'l', card_id:'c', ticket_id:'t', session_status:'ACTIVE', lesson_status:'ACTIVE',
    incoming_card:data, actions:[], submitted_at:null, score:null, allowed_service_statuses:{[name]:['Работы завершены']}}
  localStorage.setItem('token','test')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:true,json:async () => state}))
  render(<DDSAssignedConsole sessionId="s"/>)
  fireEvent.click(await screen.findByRole('button', {name:'Редактировать статус'}))
  expect(screen.getByRole('button', {name:'Выбрать статус службы'})).toHaveTextContent('Работы завершены')
  expect(validateDDSSessionState(state).allowed_service_statuses).toEqual(state.allowed_service_statuses)
  expect(() => validateDDSSessionState({...state, allowed_service_statuses:{[name]:['invented']}})).toThrow()
})

it.each([
  ['DDS_REFUSAL_REASON_REQUIRED', 'Укажите причину отказа'],
  ['DDS_SERVICE_TRANSITION_FORBIDDEN', 'Этот переход статуса службы недоступен. Обновите данные'],
  ['private backend data', 'Конфликт состояния сессии. Обновите данные'],
])('shows only a known safe policy error: %s', async (code, message) => {
  localStorage.setItem('token','test')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:false,status:409,json:async () => ({detail:{code,message:'SECRET'}})}))
  await expect(postDDSAction('s',{request_id:'r',kind:'status',service_name:name,status:'Принята'})).rejects.toThrow(message)
})
