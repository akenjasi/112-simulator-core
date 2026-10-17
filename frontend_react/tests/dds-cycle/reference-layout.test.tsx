import React, {useState} from 'react'
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, expect, it, vi} from 'vitest'
import {DDSAssignedConsole} from '@/components/dispatcher/dds-assigned-console'
import {DispatchPanel} from '@/components/dispatcher/dispatch-panel'
import {dispatcherData} from '@/lib/dispatcher-data'

vi.mock('next/link', () => ({default:({children, ...props}:any) => <a {...props}>{children}</a>}))
const incoming = {...dispatcherData, description:'Карточка из сохранённого снимка'}
const state = (extra={}) => ({session_id:'s1',lesson_id:'l1',ticket_id:'t1',card_id:'c1',session_status:'ACTIVE',
  lesson_status:'ACTIVE',incoming_card:incoming,actions:[],score:null,submitted_at:null,...extra})
const response = (value:unknown) => ({ok:true,json:async()=>value})
const flush = async () => {await act(async()=>{for(let i=0;i<8;i++)await Promise.resolve()})}
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();localStorage.clear()})

it('uses the reference workspace instead of the replacement status form and activity feed',async()=>{
  localStorage.setItem('token','test')
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(state())))
  render(<DDSAssignedConsole sessionId="s1"/>);await flush()
  expect(screen.getByText('Смена активна (ДДС-112)')).toBeTruthy()
  expect(screen.getByRole('button',{name:'Завершить смену'})).toBeTruthy()
  expect(screen.getByText('Отработка (Направление служб)')).toBeTruthy()
  expect(screen.getByTestId('dds-reference-columns').children).toHaveLength(2)
  expect(screen.queryByText('Действия диспетчера ДДС')).toBeNull()
  expect(screen.queryByRole('button',{name:'Сохранить статус'})).toBeNull()
  expect(screen.queryByText(/Журнал действий занятия/)).toBeNull()
  expect(screen.getByRole('button',{name:'Сохранить'}).hasAttribute('disabled')).toBe(true)
})

it('restores the SLA clock from server time instead of restarting thirty seconds on reload',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-17T10:00:15Z'))
  localStorage.setItem('token','test')
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(state({started_at:'2026-10-17T10:00:00Z'}))))
  const view=render(<DDSAssignedConsole sessionId="s1"/>);await flush()
  expect(screen.getByText('15 сек')).toBeTruthy()
  view.unmount();vi.setSystemTime(new Date('2026-10-17T10:00:20Z'))
  render(<DDSAssignedConsole sessionId="s1"/>);await flush()
  expect(screen.getByText('10 сек')).toBeTruthy()
})

const services=[{name:'Служба 101'}]
function DispatchHarness({save}:{save:(...args:string[])=>Promise<boolean>}) {
  const [who,setWho]=useState('');const [summary,setSummary]=useState('')
  return <DispatchPanel isCardAccepted whoAccepted={who} setWhoAccepted={setWho}
    summary={summary} setSummary={setSummary} services={services} onServiceSaved={save}/>
}

it('the restored dispatch panel preserves a failed draft and only marks confirmed saves successful',async()=>{
  class SilentAudio {play=()=>Promise.resolve();pause=()=>{};currentTime=0}
  vi.stubGlobal('Audio',SilentAudio)
  let done!:(value:boolean)=>void
  const save=vi.fn(()=>new Promise<boolean>(resolve=>{done=resolve}))
  render(<DispatchHarness save={save}/>)
  fireEvent.change(screen.getByLabelText('Кто принял'),{target:{value:'Дежурный'}})
  fireEvent.change(screen.getByLabelText('Суть сообщения'),{target:{value:'Бригада направлена'}})
  const button=screen.getByRole('button',{name:'Сохранить'})
  fireEvent.click(button);fireEvent.click(button)
  expect(save).toHaveBeenCalledTimes(1)
  expect(save).toHaveBeenCalledWith('Служба 101','Дежурный','Бригада направлена')
  expect(screen.queryByText('✓ Сохранено')).toBeNull()
  await act(async()=>done(false))
  expect(screen.getByLabelText('Кто принял')).toHaveProperty('value','Дежурный')
  save.mockResolvedValueOnce(true)
  fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));await flush()
  expect(screen.getByText('✓ Сохранено')).toBeTruthy()
})

it('sends dispatch from the reference panel to the server and restores it after reload',async()=>{
  class SilentAudio {play=()=>Promise.resolve();pause=()=>{};currentTime=0}
  vi.stubGlobal('Audio',SilentAudio);localStorage.setItem('token','test')
  const accepted={request_id:'accepted',kind:'status',service_name:'Упр. Чертанов...',status:'Принята',at:'2026-10-17T10:00:00Z'}
  let saved=state({actions:[accepted]})
  const network=vi.fn(async (_url:string,init?:RequestInit)=>{
    if(init?.method==='POST')saved=state({actions:[accepted,{...JSON.parse(init.body as string),at:'2026-10-17T10:00:01Z'}]})
    return response(saved)
  })
  vi.stubGlobal('fetch',network)
  const view=render(<DDSAssignedConsole sessionId="s1"/>);await flush()
  fireEvent.change(screen.getByLabelText('Кто принял'),{target:{value:'Дежурный'}})
  fireEvent.change(screen.getByLabelText('Суть сообщения'),{target:{value:'Бригада направлена'}})
  fireEvent.click(screen.getByRole('button',{name:'Сохранить'}));await flush()
  expect(network.mock.calls[1][0]).toBe('/api/dds/sessions/s1/actions')
  expect(JSON.parse(network.mock.calls[1][1]!.body as string)).toMatchObject({kind:'dispatch',service_name:'Упр. Чертанов...',who_accepted:'Дежурный',summary:'Бригада направлена'})
  expect(screen.getByText('✓ Сохранено')).toBeTruthy()
  view.unmount();render(<DDSAssignedConsole sessionId="s1"/>);await flush()
  expect(screen.getByLabelText('Кто принял')).toHaveProperty('value','Дежурный')
  expect(screen.getByLabelText('Суть сообщения')).toHaveProperty('value','Бригада направлена')
  expect(screen.getByText('✓ Сохранено')).toBeTruthy()
})
