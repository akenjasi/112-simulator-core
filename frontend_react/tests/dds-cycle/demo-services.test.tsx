import React from 'react'
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, expect, it, vi} from 'vitest'
import DDSPage from '@/app/dds/page'

vi.mock('next/navigation', () => ({useSearchParams: () => new URLSearchParams("demo=true"), useRouter: () => ({replace:vi.fn()})}))
vi.mock('next/link', () => ({default: ({children, ...props}: any) => <a {...props}>{children}</a>}))
vi.mock('@/components/tutorial', () => ({Tutorial: () => null}))
vi.mock('@/components/dispatcher/dds-assigned-console', () => ({DDSAssignedConsole: () => null}))
vi.mock('@/components/dispatcher/dispatch-panel', () => ({DispatchPanel: () => null}))
afterEach(() => {cleanup(); vi.unstubAllGlobals()})

it('does not replace a complete demo card with metadata-only API presets', async () => {
  const network = vi.fn().mockResolvedValue({ok: true, json: async () => ({
    scenarios: [{id: 'DDS-01', title: 'Падение дерева', explanation: 'metadata only'}],
  })})
  vi.stubGlobal('fetch', network)
  render(<DDSPage/> )
  await act(async () => {for (let i = 0; i < 8; i++) await Promise.resolve()})
  expect(screen.getByText('Упр. Чертанов...')).toBeTruthy()
  expect(screen.getByText(/Чертановская улица, 58/)).toBeTruthy()
  fireEvent.click(screen.getByText('Упр. Чертанов...'))
  expect(screen.getByRole('dialog')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', {name:'Редактировать статус'}))
  fireEvent.click(screen.getByRole('button', {name:'Подтвердить'}))
  await act(async () => {for (let i=0;i<8;i++) await Promise.resolve()})
  expect(network.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
  fireEvent.click(screen.getByRole('button', {name:'Отработана'}))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByText(/Ковалева Анна/)).toBeTruthy()
})
