/** Independent teacher monitoring acceptance, owned by GPT lead. */
import React from 'react'
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import LivePage from '@/app/teacher/sessions/live/page'
vi.mock('next/link',()=>({default:({children,...props}:any)=><a {...props}>{children}</a>}))
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})
const lesson=(id:string,name='Участник',cadetStatus='COMPLETED')=>({id,status:'ACTIVE',target_role:'DISPATCHER_DDS',group_name:'Группа '+id,total_cadets:1,total_in_progress:cadetStatus==='IN_PROGRESS'?1:0,total_passed:0,total_failed:0,overall_progress:cadetStatus==='COMPLETED'?100:0,teacher_notes:'',students:[{cadet_id:'c-'+id,cadet_name:name,session_id:'s-'+id,status:cadetStatus,current_ticket:'Назначенный билет',in_progress:cadetStatus==='IN_PROGRESS'?1:0,passed:0,failed:0,progress:cadetStatus==='COMPLETED'?100:0,score:null,tickets:[{ticket_id:'t-'+id,title:'Назначенный билет',status:cadetStatus==='COMPLETED'?'ungraded':cadetStatus==='INCOMPLETE'?'incomplete':'in_progress',score:null,errors:[],errors_count:0}]}]})
let network:ReturnType<typeof vi.fn>
beforeEach(()=>{window.history.replaceState({},'','/');localStorage.clear();localStorage.setItem('token','a06-live-token');network=vi.fn();vi.stubGlobal('fetch',network)})
afterEach(()=>{cleanup();vi.unstubAllGlobals();localStorage.clear()})
describe('Teacher DDS monitor',()=>{
 it('404 stays an error and does not become a mock session summary',async()=>{
  network.mockImplementation((url:string)=>Promise.resolve(String(url).includes('/api/v1/lessons/')?reply({},404):reply({status:'ACTIVE',cadets:[{cadet_id:'fake',cadet_name:'MOCK_PERSON_MUST_NOT_APPEAR',score:92,passed:1,failed:0,in_progress:0,progress:100}]})))
  render(<LivePage sessionId="missing-lesson"/>);
  await waitFor(()=>expect(screen.queryByText('Загрузка данных сессии...')).toBeNull())
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(document.body.textContent).not.toContain('MOCK_PERSON_MUST_NOT_APPEAR')
  expect(network.mock.calls.some(([url])=>String(url).includes('/api/v1/sessions/'))).toBe(false)
  expect(new Headers(network.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer a06-live-token')
 })
 it.each([['COMPLETED','Выполнено'],['INCOMPLETE','Не завершено']])('shows actual %s without implying a grade',async(status,label)=>{
  network.mockResolvedValue(reply(lesson('lesson-a','Участник',status)))
  render(<LivePage sessionId="lesson-a"/>);await screen.findByText('Участник')
  expect(screen.getAllByText(label).length).toBeGreaterThan(0)
  expect(document.body.textContent).toMatch(/нет оценки/i)
  expect(document.body.textContent).not.toContain('Пожар в жилом секторе')
 })
 it('late summary from a previous lesson cannot replace the selected lesson',async()=>{
  let resolveOld!:(r:Response)=>void
  network.mockImplementation((url:string)=>String(url).endsWith('/lesson-old')?new Promise(r=>{resolveOld=r}):Promise.resolve(reply(lesson('lesson-new','Новый участник','IN_PROGRESS'))))
  const view=render(<LivePage sessionId="lesson-old"/>);
  await waitFor(()=>expect(network).toHaveBeenCalled())
  view.rerender(<LivePage sessionId="lesson-new"/>);await screen.findByText('Новый участник')
  await act(async()=>{resolveOld(reply(lesson('lesson-old','Старый участник','IN_PROGRESS'))); for(let i=0;i<12;i++) await Promise.resolve()})
  await waitFor(()=>expect(screen.getByText('Новый участник')).toBeTruthy())
  expect(screen.queryByText('Старый участник')).toBeNull()
 })
 it('an older refresh of the same lesson cannot overwrite a newer response',async()=>{
  let resolveOlder!:(r:Response)=>void
  network.mockResolvedValueOnce(reply(lesson('lesson-a','Исходный участник')))
    .mockImplementationOnce(()=>new Promise(r=>{resolveOlder=r}))
    .mockResolvedValueOnce(reply(lesson('lesson-a','Актуальный участник')))
  render(<LivePage sessionId="lesson-a"/>);await screen.findByText('Исходный участник')
  fireEvent.click(screen.getByRole('button',{name:'Обновить'}));
  await waitFor(()=>expect(network.mock.calls.length).toBe(2))
  fireEvent.click(screen.getByRole('button',{name:'Обновить'}));await screen.findByText('Актуальный участник')
  await act(async()=>{resolveOlder(reply(lesson('lesson-a','Устаревший участник')));for(let i=0;i<12;i++)await Promise.resolve()})
  expect(screen.getByText('Актуальный участник')).toBeTruthy()
  expect(screen.queryByText('Устаревший участник')).toBeNull()
 })
 it('a stopped lesson keeps server completion progress and does not invent online presence',async()=>{
  network.mockResolvedValue(reply({...lesson('lesson-a','Участник','INCOMPLETE'),status:'COMPLETED',overall_progress:50}))
  render(<LivePage sessionId="lesson-a"/>);await screen.findByText('Участник')
  const progressBars=screen.getAllByRole('progressbar')
  expect(progressBars[0].getAttribute('aria-valuenow')).toBe('50')
  expect(document.body.textContent).not.toContain('В сети')
  expect(document.body.textContent).not.toContain('Решенные билеты')
 })

})
