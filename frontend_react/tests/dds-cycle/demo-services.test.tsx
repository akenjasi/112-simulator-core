import React from 'react'
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, expect, it, vi} from 'vitest'
import DDSPage from '@/app/dds/page'

const navigation = vi.hoisted(() => ({replace: vi.fn(), push: vi.fn()}))
vi.mock('next/navigation', () => ({useSearchParams: () => new URLSearchParams(), useRouter: () => navigation}))
vi.mock('next/link', () => ({default: ({children, ...props}: any) => <a {...props}>{children}</a>}))
vi.mock('@/components/tutorial', () => ({Tutorial: () => null}))
vi.mock('@/components/dispatcher/dds-assigned-console', () => ({DDSAssignedConsole: () => null}))
vi.mock('@/components/dispatcher/dispatch-panel', () => ({DispatchPanel: () => null}))
afterEach(() => {cleanup(); vi.unstubAllGlobals()})

it('redirects an unassigned route without generating a fixed demo card', async () => {
  const network = vi.fn()
  vi.stubGlobal('fetch', network)
  render(<DDSPage />)
  await act(async () => {for (let i = 0; i < 8; i++) await Promise.resolve()})
  expect(navigation.replace).toHaveBeenCalledWith('/dds/journal')
  expect(network).not.toHaveBeenCalled()
  expect(screen.queryByText(/Чертановская улица, 58/)).toBeNull()
  expect(screen.queryByRole('button', {name: 'Отработана'})).toBeNull()
})
