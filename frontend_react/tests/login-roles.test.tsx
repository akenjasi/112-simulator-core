import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
import LoginPage from '@/app/login/page'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

it.each([
  ['CADET', '/student/profile'],
  ['STUDENT', '/student/profile'],
  ['TEACHER', '/teacher/sessions'],
  ['ADMIN', '/admin'],
])('opens the server-selected %s cabinet without submitting a role', async (role, destination) => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ access_token: 'test-token', username: 'test-user', user_id: 'test-id', role }),
  })
  global.fetch = fetchMock
  render(<LoginPage />)
  expect(screen.queryByText('Роль пользователя')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Логин', { exact: true }), { target: { value: 'test-user' } })
  fireEvent.change(screen.getByLabelText('Пароль', { exact: true }), { target: { value: 'test-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Войти' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith(destination))
  expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
    body: JSON.stringify({ username: 'test-user', password: 'test-password' }),
  }))
})
