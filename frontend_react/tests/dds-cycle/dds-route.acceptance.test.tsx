/** Independent route boundary: assigned DDS must never execute demo hooks. */
import React from 'react'
import {act,cleanup,render,screen} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import DDSPage from '@/app/dds/page'
let query=''
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(query),useRouter:()=>({push:vi.fn()})}))
vi.mock('next/link',()=>({default:({children,...props}:any)=><a {...props}>{children}</a>}))
vi.mock('@/components/dispatcher/dds-assigned-console',()=>({DDSAssignedConsole:({sessionId,ticketId}:any)=><div>assigned {sessionId} {ticketId}</div>}))
vi.mock('@/components/dispatcher/top-bar',()=>({TopBar:()=>null}))
vi.mock('@/components/dispatcher/caller-panel',()=>({CallerPanel:()=>null}))
vi.mock('@/components/dispatcher/incident-panel',()=>({IncidentPanel:()=>null}))
vi.mock('@/components/dispatcher/services-bar',()=>({ServicesBar:()=>null}))
vi.mock('@/components/dispatcher/dispatch-panel',()=>({DispatchPanel:()=>null}))
vi.mock('@/components/tutorial',()=>({Tutorial:()=>null}))
let network:ReturnType<typeof vi.fn>
beforeEach(()=>{query='';network=vi.fn().mockResolvedValue({ok:true,json:async()=>({scenarios:[]})});vi.stubGlobal('fetch',network)})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
const flush=async()=>{await act(async()=>{for(let i=0;i<8;i++)await Promise.resolve()})}
describe('DDS route boundary',()=>{
 it('assigned route renders only its dedicated child, without demo network calls',async()=>{
  query='session_id=assigned-session&ticket_id=assigned-ticket'
  render(<DDSPage/>);await flush()
  expect(screen.getByText('assigned assigned-session assigned-ticket')).toBeTruthy()
  expect(network).not.toHaveBeenCalled()
 })
 it('ticket without assignment cannot fetch ground truth through legacy ticket API',async()=>{
  query='ticket_id=forged-ticket';render(<DDSPage/>);await flush()
  expect(document.body.textContent).toMatch(/назначенн.*заняти/i)
  expect(network).not.toHaveBeenCalled()
 })
 it('the separate demo still renders without removed session or ticket variables',async()=>{
  expect(()=>render(<DDSPage/>)).not.toThrow();await flush()
  expect(screen.queryByText(/^assigned /)).toBeNull()
  expect(network.mock.calls.every(([url])=>!String(url).includes('/tickets/'))).toBe(true)
 })
})
