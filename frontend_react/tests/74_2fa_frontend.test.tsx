import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginPage from '../app/login/page'
import AdminProfilePage from '../app/admin/profile/page'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  usePathname: () => '/login',
}))

describe('LoginPage 2FA Flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('renders credential form initially', () => {
    render(<LoginPage />)
    expect(screen.getByText('Вход в систему')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('admin')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument()
  })

  it('switches to 2FA step when backend requires 2FA', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        requires_2fa: true,
        user_id: 'admin-id-123',
      }),
    } as any)

    render(<LoginPage />)

    fireEvent.change(screen.getByPlaceholderText('admin'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: /Войти/i }))

    await waitFor(() => {
      expect(screen.getByText('Двухфакторная защита')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('000000')).toBeInTheDocument()
    })
  })

  it('submits 6-digit TOTP code and handles login success', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          requires_2fa: true,
          user_id: 'admin-id-123',
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'fake-jwt-token',
          role: 'ADMIN',
          username: 'admin',
          user_id: 'admin-id-123',
        }),
      } as any)

    render(<LoginPage />)

    fireEvent.change(screen.getByPlaceholderText('admin'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: /Войти/i }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('000000')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /Подтвердить вход/i }))

    await waitFor(() => {
      expect(localStorage.getItem('access_token')).toBe('fake-jwt-token')
      expect(localStorage.getItem('user_role')).toBe('ADMIN')
    })
  })
})

describe('AdminProfilePage 2FA Configuration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('renders profile and shows 2FA status', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user_id: 'admin-1',
          username: 'admin',
          role: 'ADMIN',
          full_name: 'Главный Администратор',
          is_2fa_enabled: false,
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          is_2fa_enabled: false,
        }),
      } as any)

    render(<AdminProfilePage />)

    await waitFor(() => {
      expect(screen.getByText('Профиль администратора')).toBeInTheDocument()
      expect(screen.getByText('Отключена')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Включить 2FA/i })).toBeInTheDocument()
    })
  })
})
