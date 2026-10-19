/** A-06 independent history acceptance; authored by GPT lead. */
import React from 'react'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import AnalyticsPage from '@/components/teacher/analytics-page'
vi.mock('next/link',()=>({default:({children,...props}:any)=><a {...props}>{children}</a>}))
vi.mock('@/components/teacher/dds-lesson-report',()=>({DDSLessonReport:()=> <div>Отчёт выбранного занятия</div>}))
const reply=(body:unknown)=>new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}})
beforeEach(()=>{localStorage.clear();localStorage.setItem('token','a06-history-token')})
afterEach(()=>{cleanup();vi.unstubAllGlobals();localStorage.clear()})
it('history preserves real ticket/card/actions and translates an ungraded completion honestly',async()=>{
 const action={actor_id:'own-cadet',at:'2026-10-17T08:00:00Z',service_name:'Аварийная служба',status:'Принята',order_number:'Наряд-А06',comment:'Сохранённый комментарий А06',who_accepted:'Дежурный А06',summary:'Направление А06'}
 const lesson={id:'lesson-history-a06',group_id:'own-group',group_name:'Группа А06',target_role:'DISPATCHER_DDS',status:'COMPLETED',total_cadets:1,passed_count:0,failed_count:0,avg_score:null,created_at:'2026-10-17T08:00:00Z',students:[{cadet_id:'own-cadet',cadet_name:'Участник А06',status:'COMPLETED',progress:100,score:null,passed:0,failed:0,tickets:[{ticket_id:'real-ticket-a06',card_id:'real-card-a06',title:'Билет А06',status:'ungraded',score:null,errors_count:0,errors:[],actions:[action]}]}]}
 const network=vi.fn((url:string,init?:RequestInit)=>Promise.resolve(reply(String(url)==='/api/v1/lessons'?[lesson]:String(url).includes('/sessions/')?{cadets:[]}:[])))
 vi.stubGlobal('fetch',network)
 render(<AnalyticsPage initialTab="history"/>);
 await screen.findAllByText('Группа А06');fireEvent.click(screen.getByRole('button',{name:'Подробнее'}));await screen.findByText('Участник А06')
 fireEvent.click(screen.getByRole('button',{name:'Билеты (1)'}));await screen.findByText('Билет А06')
 expect(document.body.textContent).toContain('real-ticket-a06')
 expect(document.body.textContent).toContain('real-card-a06')
 for(const value of ['Наряд-А06','Сохранённый комментарий А06','Дежурный А06','Направление А06','Нет оценки']) expect(document.body.textContent).toContain(value)
 expect(document.body.textContent).not.toContain('Ошибок не обнаружено')
 expect(document.body.textContent).not.toMatch(/ungraded/i)
 const historyCall=network.mock.calls.find(([url])=>url==='/api/v1/lessons')!
 expect(new Headers(historyCall[1]?.headers).get('Authorization')).toBe('Bearer a06-history-token')
})
