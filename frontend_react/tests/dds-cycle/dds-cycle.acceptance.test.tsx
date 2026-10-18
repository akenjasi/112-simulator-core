/** A-06 independent UI acceptance, owned by GPT lead. */
import React from 'react'
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DDSAssignedConsole} from '@/components/dispatcher/dds-assigned-console'
import {DDSAssignments} from '@/components/dispatcher/dds-assignments'

vi.mock('next/link',()=>({default:({children, ...props}:any)=><a {...props}>{children}</a>}))
vi.mock('@/components/dispatcher/top-bar',()=>({TopBar:()=>null}))
vi.mock('@/components/dispatcher/caller-panel',()=>({CallerPanel:({data}:any)=><p>{data.caller.address}</p>}))
vi.mock('@/components/dispatcher/incident-panel',()=>({IncidentPanel:({data}:any)=><p>{data.description}</p>}))

const incoming={connection:'Установлено',phones:{aon:'000',provided:'000',onSite:''},incident:{number:'A06',savedAt:'now',operator:'112'},caller:{name:'Учебный',role:'очевидец',address:'Учебный адрес'},description:'Назначенная авария',statuses:{injured:'нет',ambulanceRefusal:'нет',blocked:'нет'},emergency:{cs:false,cp:false},classification:{section:'ЖКХ',title:'Вода',class:'Авария',visClass:''},services:[{id:'water',name:'Аварийная служба',time:'10:00',status:'Получена службой',isRejected:false,history:[]}]}
const state=(id='s1',extra={})=>({session_id:id,lesson_id:'l1',ticket_id:'t1',card_id:`c-${id}`,session_status:'ACTIVE',lesson_status:'ACTIVE',incoming_card:incoming,actions:[],submitted_at:null,score:null,...extra})
const response=(body:any,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body}) as Response
const flush=async()=>{await act(async()=>{for(let n=0;n<8;n++) await Promise.resolve()})}
let network:ReturnType<typeof vi.fn>
beforeEach(()=>{localStorage.clear();localStorage.setItem('token','a06-token');network=vi.fn();vi.stubGlobal('fetch',network)})
afterEach(()=>{cleanup();vi.unstubAllGlobals();localStorage.clear()})

function fillStatus(){fireEvent.click(screen.getAllByRole('button',{name:'Редактировать статус'})[0]);fireEvent.change(screen.getByPlaceholderText('Комментарий...'),{target:{value:'Проверено'}});fireEvent.click(screen.getByRole('button',{name:'Подтвердить'}))}

describe('Assigned DDS console',()=>{
 it('loads selected session with Bearer and keeps incoming fields read-only',async()=>{
  network.mockResolvedValue(response(state()));render(<DDSAssignedConsole sessionId="s1" ticketId="t1"/>);await flush()
  expect(network.mock.calls[0][0]).toBe('/api/dds/sessions/s1')
  expect(new Headers(network.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer a06-token')
  expect(screen.getByText('Назначенная авария')).toBeTruthy()
  expect(screen.queryByDisplayValue('Учебный адрес')).toBeNull()
  expect(document.body.textContent).not.toMatch(/100 баллов|АТТЕСТАЦИЯ|Билет с подвохом/)
 })
 it('does not request data without token',async()=>{
  localStorage.clear();render(<DDSAssignedConsole sessionId="s1"/>);await flush()
  expect(network).not.toHaveBeenCalled();expect(document.body.textContent).toMatch(/вход|войти|авторизац/i)
 })
 it.each([401,403,404,500])('load HTTP %s shows error without fake card',async(status)=>{
  network.mockResolvedValue(response({detail:'SECRET'},status));render(<DDSAssignedConsole sessionId="s1"/>);await flush()
  expect(screen.queryByText('Назначенная авария')).toBeNull()
  expect(document.body.textContent).not.toContain('SECRET')
  expect(screen.getByRole('alert')).toBeTruthy()
 })
 it('rejects a mismatched session or ticket payload',async()=>{
  network.mockResolvedValue(response(state('someone-else')));render(<DDSAssignedConsole sessionId="s1" ticketId="t1"/>);await flush()
  expect(screen.queryByText('Назначенная авария')).toBeNull();expect(screen.getByRole('alert')).toBeTruthy()
 })
 it('does not optimistically mark a failed action saved, retries the same request_id',async()=>{
  network.mockResolvedValueOnce(response(state())).mockRejectedValueOnce(new Error('offline'))
  render(<DDSAssignedConsole sessionId="s1"/>);await flush();fillStatus();await flush()
  expect(screen.getByRole('alert')).toBeTruthy()
  const first=JSON.parse(network.mock.calls[1][1].body)
  expect(first.request_id).toBeTruthy();expect(first.service_name).toBe('Аварийная служба');expect(first.comment).toBe('Проверено')
  expect(first).not.toHaveProperty('score');expect(first).not.toHaveProperty('at')
  network.mockResolvedValueOnce(response(state('s1',{actions:[{...first,actor_id:'cadet1',at:'2026-10-17T10:00:00Z'}]})))
  fireEvent.click(screen.getByRole('button',{name:'Повторить сохранение'}));await flush()
  expect(JSON.parse(network.mock.calls[2][1].body)).toEqual(first)
  expect(new Headers(network.mock.calls[2][1].headers).get('Authorization')).toBe('Bearer a06-token')
  expect(screen.queryByRole('alert')).toBeNull()
 })
 it('blocks double action click while saving',async()=>{
  let done!:(r:Response)=>void
  network.mockResolvedValueOnce(response(state())).mockImplementationOnce(()=>new Promise(r=>{done=r}))
  render(<DDSAssignedConsole sessionId="s1"/>);await flush()
  fireEvent.click(screen.getAllByRole('button',{name:'Редактировать статус'})[0]);const button=screen.getByRole('button',{name:'Подтвердить'});fireEvent.click(button);fireEvent.click(button);await flush()
  expect(network).toHaveBeenCalledTimes(2);expect(button.hasAttribute('disabled')).toBe(true)
  done(response(state()));await flush()
 })
 it('finishes on server and shows completed without inventing a grade',async()=>{
  network.mockResolvedValueOnce(response(state())).mockResolvedValueOnce(response(state('s1',{session_status:'COMPLETED',submitted_at:'2026-10-17T10:01:00Z'})))
  render(<DDSAssignedConsole sessionId="s1"/>);await flush();fireEvent.click(screen.getByRole('button',{name:'Завершить смену'}));await flush()
  expect(network.mock.calls[1][0]).toBe('/api/dds/sessions/s1/finish');expect(JSON.parse(network.mock.calls[1][1].body)).toEqual({})
  expect(document.body.textContent).toMatch(/нет оценки|оценка.*отсутствует/i)
  for(const pencil of screen.getAllByRole('button',{name:'Редактировать статус'})) expect(pencil).toBeDisabled()
 })
 it('restores the saved actions after remount and never posts on load',async()=>{
  network.mockResolvedValue(response(state('s1',{actions:[{request_id:'saved',kind:'status',service_name:'Аварийная служба',status:'Принята',comment:'Сохранённое действие',actor_id:'cadet',at:'2026-10-17T10:00:00Z'}],session_status:'COMPLETED',submitted_at:'2026-10-17T10:00:00Z'})))
  const view=render(<DDSAssignedConsole sessionId="s1"/>);await flush();view.unmount();render(<DDSAssignedConsole sessionId="s1"/>);await flush()
  fireEvent.click(screen.getByRole('button',{name:'История службы Аварийная служба'}));expect(screen.getByRole('dialog').textContent).toContain('Сохранённое действие')
  expect(network.mock.calls.every(([,init])=>(init?.method??'GET')==='GET')).toBe(true)
 })
 it('ignores delayed responses after session changes',async()=>{
  let resolveA!:(r:Response)=>void
  network.mockImplementationOnce(()=>new Promise(r=>{resolveA=r})).mockResolvedValueOnce(response(state('s2',{incoming_card:{...incoming,description:'Другая карточка'}})))
  const view=render(<DDSAssignedConsole sessionId="s1"/>);await flush();view.rerender(<DDSAssignedConsole sessionId="s2"/>);await flush()
  resolveA(response(state()));await flush()
  expect(screen.getByText('Другая карточка')).toBeTruthy();expect(screen.queryByText('Назначенная авария')).toBeNull()
 })
 it('rejects malformed successful payload rather than rendering a demo',async()=>{
  network.mockResolvedValue(response({session_id:'s1'}));render(<DDSAssignedConsole sessionId="s1"/>);await flush()
  expect(screen.getByRole('alert')).toBeTruthy();expect(screen.queryAllByRole('button',{name:'Редактировать статус'})).toHaveLength(0)
 })
})

describe('Personal DDS assignments',()=>{
 it('renders every returned assignment and its real session/card route',async()=>{
  network.mockResolvedValue(response([state('s1'),state('s2'),state('s3')]))
  render(<DDSAssignments/>);await flush()
  expect(network.mock.calls[0][0]).toBe('/api/dds/assignments')
  expect(new Headers(network.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer a06-token')
  for(const id of ['s1','s2','s3']) expect(document.querySelector(`a[href^="/dds?session_id=${id}"]`)).toBeTruthy()
 })
 it('empty is empty, never filled with sample incidents',async()=>{
  network.mockResolvedValue(response([]));render(<DDSAssignments/>);await flush()
  expect(document.body.textContent).toMatch(/нет.*назнач|назнач.*нет/i)
  expect(document.querySelectorAll('a[href*="session_id="]').length).toBe(0)
 })
 it('request failure is visible and does not become empty or demo data',async()=>{
  network.mockResolvedValue(response({},500));render(<DDSAssignments/>);await flush()
  expect(screen.getByRole('alert')).toBeTruthy();expect(document.querySelectorAll('a[href*="session_id="]').length).toBe(0)
 })
})

describe('Independent mutation lifecycle boundaries',()=>{
 it('blocks new mutations until the uncertain request has been retried or refreshed',async()=>{
  network.mockResolvedValueOnce(response(state())).mockRejectedValueOnce(new Error('offline'))
  render(<DDSAssignedConsole sessionId="s1"/>);await flush();fillStatus();await flush()
  for(const name of ['Подтвердить','Сохранить','Завершить смену']) {
   expect(screen.getByRole('button',{name}).hasAttribute('disabled')).toBe(true)
  }
  expect(screen.getByRole('button',{name:'Повторить сохранение'}).hasAttribute('disabled')).toBe(false)
 })
 it('late POST cannot replace a newly selected session and does not lock its controls',async()=>{
  let done!:(r:Response)=>void
  network.mockResolvedValueOnce(response(state())).mockImplementationOnce(()=>new Promise(r=>{done=r}))
   .mockResolvedValueOnce(response(state('s2',{incoming_card:{...incoming,description:'Новая сессия'}})))
  const view=render(<DDSAssignedConsole sessionId="s1"/>);await flush();fillStatus();await flush()
  const signal=network.mock.calls[1][1].signal as AbortSignal
  view.rerender(<DDSAssignedConsole sessionId="s2"/>);await flush()
  expect(signal?.aborted).toBe(true)
  expect(screen.getAllByRole('button',{name:'Редактировать статус'})[0].hasAttribute('disabled')).toBe(false)
  done(response(state('s1',{actions:[{request_id:'late',kind:'status',service_name:'Аварийная служба',status:'Принята',comment:'OLD_POST_MUST_NOT_APPEAR',actor_id:'c',at:'2026-10-17T10:00:00Z'}]})));await flush()
  expect(screen.getByText('Новая сессия')).toBeTruthy()
  expect(document.body.textContent).not.toContain('OLD_POST_MUST_NOT_APPEAR')
 })
 it('teacher stop is incomplete rather than trainee submission',async()=>{
  network.mockResolvedValue(response(state('s1',{session_status:'COMPLETED',lesson_status:'COMPLETED',submitted_at:null})))
  render(<DDSAssignedConsole sessionId="s1"/>);await flush()
  expect(document.body.textContent).toMatch(/выполнение не завершено|не завершено/i)
  expect(document.body.textContent).not.toMatch(/Выполнено\./)
 })
 it('assignment list distinguishes stop from submitted work',async()=>{
  network.mockResolvedValue(response([state('s1',{session_status:'COMPLETED',lesson_status:'COMPLETED',submitted_at:null})]))
  render(<DDSAssignments/>);await flush()
  expect(document.body.textContent).toMatch(/не завершено/i)
  expect(document.body.textContent).not.toContain('Выполнено')
 })
 it('aborts assignment loading on unmount',async()=>{
  network.mockImplementation(()=>new Promise(()=>{}))
  const view=render(<DDSAssignments/>);await flush()
  const signal=network.mock.calls[0][1].signal as AbortSignal
  view.unmount();expect(signal.aborted).toBe(true)
 })
})
