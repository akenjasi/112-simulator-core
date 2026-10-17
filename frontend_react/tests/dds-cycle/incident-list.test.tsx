import React from 'react'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import DDSJournalPage from '@/app/dds/journal/page'
import {DDSAssignedConsole} from '@/components/dispatcher/dds-assigned-console'
import {dispatcherData} from '@/lib/dispatcher-data'

let query=''
const replace=vi.fn(),push=vi.fn()
const router={replace,push}
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(query),useRouter:()=>router}))
vi.mock('next/link',()=>({default:({children,...props}:any)=><a {...props}>{children}</a>}))
const state=(index=1)=>({session_id:`s${index}`,lesson_id:'l',ticket_id:`t${index}`,card_id:`c${index}`,
  session_status:'ACTIVE',lesson_status:'ACTIVE',started_at:'2026-10-18T10:00:00Z',actions:[],score:null,submitted_at:null,
  incoming_card:{...structuredClone(dispatcherData),description:`Описание ${index}`,incident:{number:`№${index}`,savedAt:'',operator:'112'},
    classification:{section:'ЖКХ',title:`Газ ${index}`,class:'Авария',visClass:''}}})
const response=(data:unknown,status=200)=>({ok:status===200,status,json:async()=>data})
const flush=async()=>{await act(async()=>{for(let i=0;i<8;i++)await Promise.resolve()})}
let network:ReturnType<typeof vi.fn>
beforeEach(()=>{query='';replace.mockReset();push.mockReset();localStorage.setItem('token','test');network=vi.fn();vi.stubGlobal('fetch',network)})
afterEach(()=>{cleanup();vi.unstubAllGlobals();localStorage.clear()})

it('replaces an old assigned journal URL with the workplace, preserving the full query without mounting a card overview',async()=>{
  query='session_id=old-session&ticket_id=old-ticket&incoming_call=true'
  render(<DDSJournalPage/>);await flush()
  expect(replace).toHaveBeenCalledWith('/dds?'+query)
  expect(network).not.toHaveBeenCalled()
  expect(document.body.textContent).not.toContain('Журнал ДДС')
  expect(document.body.textContent).not.toContain('Назначенная карточка')
  expect(document.body.textContent).not.toContain('Перейти к отработке')
})

it('restores the full-width original table with real sessions and direct workplace links',async()=>{
  network.mockResolvedValue(response([state(1),state(2)]))
  render(<DDSJournalPage/>);await flush()
  expect(screen.getByText('Поиск происшествий')).toBeTruthy()
  expect(screen.getByText('Список происшествий')).toBeTruthy()
  for(const label of ['Связи','Опер.','АРМ','Номер','Дата','Время','Тип происшествия','Постр.','Статус','Адрес']) expect(screen.getByText(label)).toBeTruthy()
  expect(screen.getByRole('link',{name:'№1'})).toHaveAttribute('href','/dds?session_id=s1&ticket_id=t1')
  expect(screen.getByRole('link',{name:'№2'})).toHaveAttribute('href','/dds?session_id=s2&ticket_id=t2')
  expect(screen.getByText('Список происшествий').closest('.max-w-5xl')).toBeNull()
  expect(document.body.textContent).not.toContain('Назначенные занятия ДДС')
  expect(document.body.textContent).not.toContain('38260204')
  expect(network.mock.calls[0][0]).toBe('/api/dds/assignments')
  expect(new Headers(network.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer test')
  fireEvent.click(screen.getByRole('button',{name:'Взять карточку в обработку'}))
  expect(push).toHaveBeenCalledWith('/dds?session_id=s1&ticket_id=t1')
})

it('searches and pages real incidents instead of a hardcoded count',async()=>{
  network.mockResolvedValue(response(Array.from({length:12},(_,index)=>state(index+1))))
  render(<DDSJournalPage/>);await flush()
  expect(screen.getByText('1-10 из 12')).toBeTruthy()
  expect(screen.queryByRole('link',{name:'№12'})).toBeNull()
  fireEvent.click(screen.getByTitle('Следующая'))
  expect(screen.getByText('11-12 из 12')).toBeTruthy()
  expect(screen.getByRole('link',{name:'№12'})).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Поиск происшествий'),{target:{value:'Газ 12'}})
  expect(screen.getByText('1-1 из 1')).toBeTruthy()
  expect(screen.getByRole('link',{name:'№12'})).toBeTruthy()
  expect(screen.queryByRole('link',{name:'№1'})).toBeNull()
})

it('keeps an empty list empty without sample incidents or a made-up total',async()=>{
  network.mockResolvedValue(response([]))
  render(<DDSJournalPage/>);await flush()
  expect(screen.getByText('Нет доступных карточек происшествий')).toBeTruthy()
  expect(screen.getByText('0-0 из 0')).toBeTruthy()
  expect(screen.queryAllByRole('link')).toHaveLength(0)
  expect(document.body.textContent).not.toContain('23030')
})

it('shows an error and retries safely without substituting fake rows',async()=>{
  network.mockResolvedValueOnce(response({},403)).mockResolvedValueOnce(response([state()]))
  render(<DDSJournalPage/>);await flush()
  expect(screen.getByRole('alert')).toHaveTextContent('Доступ к занятию запрещен')
  expect(screen.queryAllByRole('link')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button',{name:'Повторить загрузку'}));await flush()
  expect(screen.getByRole('link',{name:'№1'})).toBeTruthy()
})

it('aborts an outstanding list request when leaving the page',async()=>{
  network.mockImplementation(()=>new Promise(()=>{}))
  const view=render(<DDSJournalPage/>);await flush()
  const signal=network.mock.calls[0][1].signal
  view.unmount()
  expect(signal.aborted).toBe(true)
})

it('the existing workplace close icon returns to the list without submitting or finishing the session',async()=>{
  network.mockResolvedValue(response(state()))
  render(<DDSAssignedConsole sessionId="s1"/>);await flush()
  expect(screen.getByRole('link',{name:'Закрыть карточку и открыть список происшествий'})).toHaveAttribute('href','/dds/journal')
  expect(network.mock.calls.every(([,init])=>init.method==='GET')).toBe(true)
  expect(screen.getByRole('button',{name:'Отработана'})).toBeTruthy()
})

it('a demo focus stays on the list until Take opens exactly the created session',async()=>{
  query='focus_session_id=s2&focus_ticket_id=t2'
  network.mockResolvedValue(response([state(1),state(2)]))
  render(<DDSJournalPage/>);await flush()
  expect(screen.getByText('Список происшествий')).toBeTruthy()
  expect(replace).not.toHaveBeenCalled()
  expect(push).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Взять карточку в обработку'}))
  expect(push).toHaveBeenCalledWith('/dds?session_id=s2&ticket_id=t2')
})

it.each(['focus_session_id=foreign&focus_ticket_id=t1','focus_session_id=s1&focus_ticket_id=wrong'])('never substitutes another card for an unavailable focus: %s',async(focus)=>{
  query=focus;network.mockResolvedValue(response([state(1)]))
  render(<DDSJournalPage/>);await flush()
  expect(screen.getByRole('alert')).toHaveTextContent('Выбранная карточка недоступна')
  const take=screen.getByRole('button',{name:'Взять карточку в обработку'})
  expect(take).toBeDisabled();fireEvent.click(take)
  expect(push).not.toHaveBeenCalled()
})

it('does not offer a completed focused session as a new card to take',async()=>{
  query='focus_session_id=s1&focus_ticket_id=t1'
  network.mockResolvedValue(response([{...state(1),session_status:'COMPLETED',submitted_at:'2026-10-18T10:01:00Z'},state(2)]))
  render(<DDSJournalPage/>);await flush()
  expect(screen.getByRole('button',{name:'Взять карточку в обработку'})).toBeDisabled()
  expect(screen.getByRole('link',{name:'№1'})).toHaveAttribute('href','/dds?session_id=s1&ticket_id=t1')
})
