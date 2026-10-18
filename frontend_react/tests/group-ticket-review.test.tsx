/** Independent reviewer-owned checks for the DDS catalog changes. */
import React from 'react'
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import Page from '@/app/teacher/sessions/new/page'
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()})}))
const response=(body:any,status=200)=>({ok:status===200,status,json:async()=>body}) as Response
let catalog:any[]=[]
let fail=false
let responder: ((url:string)=>Response) | undefined
beforeEach(()=>{
 catalog=[];fail=false;responder=undefined;localStorage.setItem('token','review')
 vi.stubGlobal('fetch',vi.fn(async(input:any)=>{
  const url=String(input)
  if(url.includes('available-roles')) return response({roles:['DISPATCHER_DDS']})
  if(url.includes('/api/v1/groups')) return response([{group_id:'g',group_name:'Моя группа',student_count:2}])
  if(url.includes('/classifier/categories')) return response(['ЖКХ'])
  if(url.includes('/classifier/subcategories')) return response(['Вода'])
  if(url.includes('/tickets/counts')) return response([])
  if(url.includes('/api/dds/tickets/categories')) return response([{category:'ЖКХ',total:catalog.length,subcategories:[]}])
  if(url.includes('/api/dds/tickets')) return responder ? responder(url) : response(catalog,fail?500:200)
  return response({})
 }))
})
afterEach(()=>{cleanup();vi.unstubAllGlobals();localStorage.clear()})
async function open(){
 render(<Page/>);
 await waitFor(()=>expect(screen.getByLabelText('Фильтр категории ДДС')).toBeInTheDocument())
 await act(async()=>{for(let i=0;i<10;i++)await Promise.resolve()})
 fireEvent.change(document.getElementById('group_id')!,{target:{value:'g'}})
 await act(async()=>{for(let i=0;i<5;i++)await Promise.resolve()})
}
it('blocks lesson creation when catalog is empty',async()=>{
 await open()
 expect(screen.getByRole('button',{name:/Создать и запустить/})).toBeDisabled()
})
it('blocks lesson creation when catalog loading failed',async()=>{
 fail=true;await open()
 expect(screen.getByText(/Ошибка загрузки билетов ДДС/)).toBeInTheDocument()
 expect(screen.getByRole('button',{name:/Создать и запустить/})).toBeDisabled()
})
it('reset filters clears the selected complexity too',async()=>{
 await open()
 fireEvent.click(screen.getByText('Базовый'))
 await act(async()=>{for(let i=0;i<10;i++)await Promise.resolve()})
 const before=(global.fetch as any).mock.calls.filter((c:any)=>String(c[0]).includes('/api/dds/tickets')).at(-1)[0]
 expect(before).toContain('complexity=1')
 fireEvent.click(screen.getByRole('button',{name:'Сбросить фильтры'}))
 await act(async()=>{for(let i=0;i<10;i++)await Promise.resolve()})
 const after=(global.fetch as any).mock.calls.filter((c:any)=>String(c[0]).includes('/api/dds/tickets')).at(-1)[0]
 expect(after).not.toContain('complexity=')
})

it('ignores old response when its JSON body resolves after a newer filter response',async()=>{
 const resolvers: ((body:any)=>void)[]=[]
 responder=(url)=>url.includes('category=')
  ? response([{ticket_id:'new',title:'Новый результат'}])
  : ({ok:true,status:200,json:()=>new Promise(resolve=>resolvers.push(resolve))}) as Response
 await open()
 await waitFor(()=>expect(resolvers.length).toBeGreaterThan(0))
 fireEvent.change(screen.getByLabelText('Фильтр категории ДДС'),{target:{value:'ЖКХ'}})
 await waitFor(()=>expect(screen.getByText('Новый результат')).toBeInTheDocument())
 await act(async()=>{for(const resolve of resolvers)resolve([{ticket_id:'old',title:'Старый результат'}]);for(let i=0;i<10;i++)await Promise.resolve()})
 expect(screen.queryByText('Старый результат')).not.toBeInTheDocument()
 expect(screen.getByText('Новый результат')).toBeInTheDocument()
})

it('clears an excluded ticket and blocks submit while new results are loading',async()=>{
 let resolveBody: ((body:any)=>void) | undefined
 catalog=[{ticket_id:'old',title:'Первый билет'}]
 await open()
 fireEvent.change(screen.getByLabelText('Подготовленный билет ДДС'),{target:{value:'old'}})
 expect(screen.getByRole('button',{name:/Создать и запустить/})).not.toBeDisabled()
 responder=()=>({ok:true,status:200,json:()=>new Promise(resolve=>{resolveBody=resolve})}) as Response
 fireEvent.change(screen.getByLabelText('Фильтр категории ДДС'),{target:{value:'ЖКХ'}})
 await waitFor(()=>expect(resolveBody).toBeDefined())
 expect(screen.getByRole('button',{name:/Создать и запустить/})).toBeDisabled()
 await act(async()=>resolveBody!([{ticket_id:'new',title:'Второй билет'}]))
 await waitFor(()=>expect(screen.getByLabelText('Подготовленный билет ДДС')).toHaveValue(''))
 expect(screen.getByRole('button',{name:/Создать и запустить/})).toBeDisabled()
 fireEvent.change(screen.getByLabelText('Подготовленный билет ДДС'),{target:{value:'new'}})
 expect(screen.getByRole('button',{name:/Создать и запустить/})).not.toBeDisabled()
})
