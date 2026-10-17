import React from 'react'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {getDDSServiceResponse} from '@/lib/dds-service-response'
import {dispatcherData} from '@/lib/dispatcher-data'
import {DDSAssignedConsole} from '@/components/dispatcher/dds-assigned-console'
import type {DDSSessionState} from '@/lib/dds-cycle'

const state=(extra={}):DDSSessionState=>({session_id:'s',lesson_id:'l',card_id:'c',ticket_id:'t',session_status:'ACTIVE',lesson_status:'ACTIVE',
  incoming_card:{...dispatcherData,description:'Учебная карточка',services:[
    {...dispatcherData.services[0],name:'04 Газ',status:'Получена службой'},
    {...dispatcherData.services[0],id:'fire',name:'01 Пожарные',status:'Получена службой'},
  ]},started_at:'2026-10-18T10:00:00Z',actions:[],submitted_at:null,score:null,...extra})
afterEach(()=>{cleanup();localStorage.clear();vi.useRealTimers();vi.unstubAllGlobals()})

it.each([29,30,31])('checks the primary deadline at %s seconds',seconds=>{
  const result=getDDSServiceResponse(state(),'04 Газ',Date.parse('2026-10-18T10:00:00Z')+seconds*1000)
  expect(result.overdue).toBe(seconds>=30)
  expect(result.remaining).toBe(Math.max(0,30-seconds))
})

it.each(['Принята','Прибытие','Проведение работ','Работы завершены','Не принята'])('a saved %s stops only that service deadline even after long work',status=>{
  const saved=state({actions:[{request_id:'r',kind:'status',service_name:'04 Газ',status,at:'2026-10-18T10:00:40Z'}]})
  const now=Date.parse('2026-10-18T11:00:00Z')
  expect(getDDSServiceResponse(saved,'04 Газ',now)).toMatchObject({responded:true,overdue:false,remaining:null})
  expect(getDDSServiceResponse(saved,'01 Пожарные',now)).toMatchObject({responded:false,overdue:true,remaining:0})
})

it('does not flag an already accepted incoming snapshot as unanswered or treat dispatch as a decision',()=>{
  const snapshot=state();snapshot.incoming_card.services[0].status='Прибыли'
  expect(getDDSServiceResponse(snapshot,'04 Газ',Date.now()).responded).toBe(true)
  expect(getDDSServiceResponse(state({actions:[{request_id:'d',kind:'dispatch',service_name:'04 Газ'}]}),'04 Газ',Date.now()).responded).toBe(false)
})

it('shows saved acceptance after reload and keeps another unanswered service overdue',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-18T11:00:00Z'));localStorage.setItem('token','test')
  const saved=state({actions:[{request_id:'a',kind:'status',service_name:'04 Газ',status:'Прибытие',at:'2026-10-18T10:00:40Z'}]})
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>saved}))
  const flush=async()=>{await act(async()=>{for(let i=0;i<8;i++)await Promise.resolve()})}
  const view=render(<DDSAssignedConsole sessionId="s"/>);await flush()
  expect(screen.getByText('Решение принято')).toBeTruthy()
  expect(screen.queryByText('Просрочено')).toBeNull()
  fireEvent.change(screen.getByRole('combobox',{name:'Служба для направления'}),{target:{value:'01 Пожарные'}})
  expect(screen.getByText('Просрочено')).toBeTruthy()
  fireEvent.change(screen.getByRole('combobox',{name:'Служба для направления'}),{target:{value:'04 Газ'}})
  expect(screen.getByText('Решение принято')).toBeTruthy()
  view.unmount();render(<DDSAssignedConsole sessionId="s"/>);await flush()
  expect(screen.getByText('Решение принято')).toBeTruthy()
})
