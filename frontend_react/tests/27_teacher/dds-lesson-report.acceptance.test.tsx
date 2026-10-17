/** Independent A-05 acceptance, owned by the supervising reviewer. */
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DDSLessonReport } from '@/components/teacher/dds-lesson-report'

const job = (status: string, lesson_id = 'lesson-A', extra = {}) => ({
  job_id: `job-${lesson_id}`, lesson_id, status, attempt: 1,
  created_at: '2026-10-17T01:00:00Z', updated_at: '2026-10-17T01:00:05Z',
  report_text: status === 'completed' ? 'Сохранённый отчёт занятия' : null,
  error_code: status === 'failed' ? 'llm_timeout' : null,
  model_used: status === 'completed' ? 'dds-qwen' : null, ...extra,
})
const response = (status: number, body: unknown = {}) => ({ ok:status>=200&&status<300, status, json:async()=>body }) as Response
const flush = async () => { await act(async () => { for(let i=0;i<8;i++) await Promise.resolve() }) }
const tick = async (ms=2100) => { await act(async()=>{ await vi.advanceTimersByTimeAsync(ms) }); await flush() }
const url = '/api/ai-analytics/lessons/lesson-A/report'
let network: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  window.localStorage.setItem('token','independent-token')
  network=vi.fn()
  vi.stubGlobal('fetch',network)
})
afterEach(()=>{ cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); window.localStorage.clear() })

function generateButton() { return screen.getByRole('button',{name:/сформировать|создать|запустить|генерировать/i}) }

describe('Independent A-05: lesson report UI',()=>{
  it('restores saved result with Bearer, uses selected lesson only and safely renders model text',async()=>{
    const text='<img src=x onerror=alert(1)>\nТолько текст'
    network.mockResolvedValue(response(200,job('completed','lesson-A',{report_text:text})))
    render(<DDSLessonReport lessonId="lesson-A"/>); await flush()
    expect(network).toHaveBeenCalledTimes(1)
    const [target, init]=network.mock.calls[0]
    expect(target).toBe(url)
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer independent-token')
    expect(init.method??'GET').toBe('GET')
    expect(screen.getByText(/Только текст/).textContent).toContain('<img')
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText(/проверьте.*выводы|проверки.*преподавател/i)).toBeTruthy()
    await tick(10000); expect(network).toHaveBeenCalledTimes(1)
  })
  it('404 does not auto-generate; double click sends one authenticated POST without retry',async()=>{
    let resolvePost!: (value:Response)=>void
    network.mockResolvedValueOnce(response(404)).mockImplementationOnce(()=>new Promise(r=>{resolvePost=r}))
    render(<DDSLessonReport lessonId="lesson-A"/>); await flush()
    expect(network).toHaveBeenCalledTimes(1)
    const button=generateButton(); fireEvent.click(button); fireEvent.click(button); await flush()
    expect(network).toHaveBeenCalledTimes(2)
    const [target,init]=network.mock.calls[1]
    expect(target).toBe(url); expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer independent-token')
    expect(init.body ? JSON.parse(init.body).retry : false).not.toBe(true)
    expect(button.hasAttribute('disabled')).toBe(true)
    resolvePost(response(202,job('pending'))); await flush()
  })
  it('polls active states then stops at completed; remount restores via GET only',async()=>{
    network.mockResolvedValueOnce(response(200,job('pending')))
      .mockResolvedValueOnce(response(200,job('running')))
      .mockResolvedValue(response(200,job('completed')))
    const view=render(<DDSLessonReport lessonId="lesson-A"/>); await flush()
    await tick(); await tick()
    expect(screen.getByText('Сохранённый отчёт занятия')).toBeTruthy()
    const count=network.mock.calls.length; await tick(10000)
    expect(network).toHaveBeenCalledTimes(count)
    view.unmount(); render(<DDSLessonReport lessonId="lesson-A"/>); await flush()
    expect(network).toHaveBeenCalledTimes(count+1)
    expect(network.mock.calls.every(([,init])=>(init?.method??'GET')==='GET')).toBe(true)
  })
  it('failed status stops polling and only explicit retry sends retry=true',async()=>{
    network.mockResolvedValueOnce(response(200,job('failed'))).mockResolvedValue(response(202,job('pending')))
    render(<DDSLessonReport lessonId="lesson-A"/>); await flush(); await tick(10000)
    expect(network).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button',{name:/повторить.*генерац|повторить.*попыт|повторить/i})); await flush()
    expect(network.mock.calls[1][1].method).toBe('POST')
    expect(JSON.parse(network.mock.calls[1][1].body)).toEqual({retry:true})
  })
  it.each([401,403,409,500])('HTTP %s does not masquerade as absent report or leak upstream detail',async(status)=>{
    network.mockResolvedValue(response(status,{detail:'SECRET_UPSTREAM_DETAIL'}))
    render(<DDSLessonReport lessonId="lesson-A"/>); await flush(); await tick(10000)
    expect(network).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).not.toContain('SECRET_UPSTREAM_DETAIL')
    expect(screen.queryByRole('button',{name:/сформировать|создать.*отчёт|создать.*отчет/i})).toBeNull()
    expect(document.body.textContent?.trim().length).toBeGreaterThan(15)
  })
  it('does not send requests without a stored token',async()=>{
    window.localStorage.clear(); render(<DDSLessonReport lessonId="lesson-A"/>); await flush()
    expect(network).not.toHaveBeenCalled()
    expect(document.body.textContent).toMatch(/войти|авторизац|вход|сесси/i)
  })
  it('polling network error stops requests and never offers generation as a missing report',async()=>{
    network.mockResolvedValueOnce(response(200,job('running'))).mockRejectedValue(new Error('SECRET_NETWORK'))
    render(<DDSLessonReport lessonId="lesson-A"/>); await flush(); await tick(); await tick(10000)
    expect(network).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).not.toContain('SECRET_NETWORK')
    expect(screen.queryByRole('button',{name:/сформировать|создать.*отчёт/i})).toBeNull()
  })
  it('does not overlap slow polling requests',async()=>{
    network.mockResolvedValueOnce(response(200,job('pending'))).mockImplementation(()=>new Promise(()=>{}))
    render(<DDSLessonReport lessonId="lesson-A"/>); await flush(); await tick(); await tick(12000)
    expect(network).toHaveBeenCalledTimes(2)
  })
  it('unmount aborts a pending poll and prevents further polling',async()=>{
    network.mockResolvedValueOnce(response(200,job('running'))).mockImplementation(()=>new Promise(()=>{}))
    const view=render(<DDSLessonReport lessonId="lesson-A"/>); await flush(); await tick()
    const signal=network.mock.calls[1][1].signal as AbortSignal
    expect(signal).toBeTruthy(); view.unmount(); expect(signal.aborted).toBe(true)
    await tick(12000); expect(network).toHaveBeenCalledTimes(2)
  })
  it('switching lessons ignores late old responses even if transport ignores abort',async()=>{
    let old!: (value:Response)=>void
    network.mockImplementationOnce(()=>new Promise(r=>{old=r}))
      .mockResolvedValueOnce(response(200,job('completed','lesson-B',{report_text:'Результат только B'})))
    const view=render(<DDSLessonReport lessonId="lesson-A"/>); await flush()
    view.rerender(<DDSLessonReport lessonId="lesson-B"/>); await flush()
    old(response(200,job('completed','lesson-A',{report_text:'УСТАРЕВШИЙ А'}))); await flush()
    expect(screen.getByText('Результат только B')).toBeTruthy()
    expect(document.body.textContent).not.toContain('УСТАРЕВШИЙ А')
    expect(network.mock.calls[0][1].signal.aborted).toBe(true)
    expect(network.mock.calls[1][0]).toContain('/lesson-B/report')
  })
  it('unmount aborts the initial GET too',async()=>{
    network.mockImplementation(()=>new Promise(()=>{}))
    const view=render(<DDSLessonReport lessonId="lesson-A"/>); await flush()
    const signal=network.mock.calls[0][1].signal as AbortSignal
    view.unmount(); expect(signal.aborted).toBe(true)
  })
  it('A to B to A navigation cannot accept the first A response',async()=>{
    let old!: (r:Response)=>void
    network.mockImplementationOnce(()=>new Promise(r=>{old=r}))
      .mockResolvedValueOnce(response(404))
      .mockResolvedValueOnce(response(200,job('completed','lesson-A',{report_text:'Актуальный A'})))
    const view=render(<DDSLessonReport lessonId="lesson-A"/>); await flush()
    view.rerender(<DDSLessonReport lessonId="lesson-B"/>); await flush()
    view.rerender(<DDSLessonReport lessonId="lesson-A"/>); await flush()
    old(response(200,job('completed','lesson-A',{report_text:'СТАРЫЙ А'}))); await flush()
    expect(screen.getByText('Актуальный A')).toBeTruthy()
    expect(document.body.textContent).not.toContain('СТАРЫЙ А')
  })
  it('unmount aborts a POST and its late response cannot restart polling',async()=>{
    let post!: (r:Response)=>void
    network.mockResolvedValueOnce(response(404)).mockImplementationOnce(()=>new Promise(r=>{post=r}))
    const view=render(<DDSLessonReport lessonId="lesson-A"/>); await flush()
    fireEvent.click(generateButton()); await flush()
    const signal=network.mock.calls[1][1].signal as AbortSignal
    expect(signal).toBeTruthy(); view.unmount(); expect(signal.aborted).toBe(true)
    post(response(202,job('pending'))); await flush(); await tick(10000)
    expect(network).toHaveBeenCalledTimes(2)
  })
  it.each([job('mystery'),{},job('completed','lesson-B')])('malformed or foreign job response never becomes absent report or a foreign result',async(body)=>{
    network.mockResolvedValue(response(200,body))
    render(<DDSLessonReport lessonId="lesson-A"/>); await flush(); await tick(10000)
    expect(network).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button',{name:/сформировать/i})).toBeNull()
    expect(screen.queryByText('Сохранённый отчёт занятия')).toBeNull()
  })

  it('rejects a completed payload without lesson identity',async()=>{
    const {lesson_id: omitted, ...body}=job('completed')
    network.mockResolvedValue(response(200,body))
    render(<DDSLessonReport lessonId="lesson-A"/>); await flush()
    expect(screen.queryByText('Сохранённый отчёт занятия')).toBeNull()
  })
  it('manual refresh aborts a slow poll and ignores its late result',async()=>{
    let old!: (r:Response)=>void
    network.mockResolvedValueOnce(response(200,job('pending')))
      .mockImplementationOnce(()=>new Promise(r=>{old=r}))
      .mockResolvedValueOnce(response(200,job('completed')))
    render(<DDSLessonReport lessonId="lesson-A"/>); await flush(); await tick()
    const signal=network.mock.calls[1][1].signal as AbortSignal
    fireEvent.click(screen.getByRole('button',{name:/^Обновить$/})); await flush()
    expect(signal.aborted).toBe(true)
    old(response(200,job('failed'))); await flush(); await tick(10000)
    expect(screen.getByText('Сохранённый отчёт занятия')).toBeTruthy()
    expect(network).toHaveBeenCalledTimes(3)
  })
  it.each([409,500,'network'])('failed POST %s gives an explicit recoverable error rather than asserting no report exists',async(kind)=>{
    network.mockResolvedValueOnce(response(404))
    if(kind==='network') network.mockRejectedValueOnce(new Error('SECRET_POST'))
    else network.mockResolvedValueOnce(response(kind as number,{detail:'SECRET_POST'}))
    render(<DDSLessonReport lessonId="lesson-A"/>); await flush()
    fireEvent.click(generateButton()); await flush()
    expect(document.body.textContent).not.toContain('SECRET_POST')
    expect(screen.queryByText(/по этому занятию ещё не сформирован/i)).toBeNull()
    expect(screen.getByRole('button',{name:/^Обновить$/})).toBeTruthy()
    expect(network).toHaveBeenCalledTimes(2)
  })

})
