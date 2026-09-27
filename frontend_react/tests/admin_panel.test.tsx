import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Recharts ResponsiveContainer mock for jsdom
vi.mock('recharts', async () => {
  const original = await vi.importActual('recharts');
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => (
      <div data-testid="responsive-container" style={{ width: 500, height: 300 }}>
        {children}
      </div>
    ),
  };
});

// Mock next/navigation
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mock fetch API globally for tests
const mockUsers = [
  {
    user_id: 'user-admin-1',
    username: 'admin@system112.ru',
    role: 'ADMIN',
    full_name: 'Главный Администратор',
    student_id: null,
    is_active: true,
  },
  {
    user_id: 'user-teacher-1',
    username: 'teacher@system112.ru',
    role: 'TEACHER',
    full_name: 'Петров Петр Петрович',
    student_id: null,
    is_active: true,
  },
  {
    user_id: 'user-cadet-1',
    username: 'cadet@system112.ru',
    role: 'CADET',
    full_name: 'Сидоров Сидор Сидорович',
    student_id: 'СМ1-12',
    is_active: true,
  },
];

const mockHealth = {
  cpu_percent: 24.5,
  ram_percent: 48.2,
  db_status: 'ok',
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('user_role', 'ADMIN');

  global.fetch = vi.fn((url: string | Request | URL, options?: RequestInit) => {
    const urlString = String(url);

    if (urlString.includes('/api/v1/users/me')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            user_id: 'user-admin-1',
            username: 'admin@system112.ru',
            role: 'ADMIN',
            full_name: 'Главный Администратор',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }

    if (urlString.includes('/api/admin/healthcheck')) {
      return Promise.resolve(
        new Response(JSON.stringify(mockHealth), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }

    if (urlString.includes('/api/admin/backup')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            backup_file: 'backup_2026-09-27_112000.sql',
            status: 'ok',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }

    if (urlString.includes('/api/admin/users')) {
      if (options?.method === 'POST') {
        const body = JSON.parse(options.body as string);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user_id: 'user-new-1',
              username: body.username,
              role: body.role,
              full_name: body.full_name || '',
              student_id: body.student_id || null,
              is_active: true,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }

      if (options?.method === 'PATCH') {
        return Promise.resolve(
          new Response(
            JSON.stringify({ ...mockUsers[0], role: 'TEACHER' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }

      if (options?.method === 'DELETE') {
        return Promise.resolve(
          new Response(
            JSON.stringify({ status: 'ok', user_id: 'user-cadet-1', is_active: false }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify(mockUsers), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }

    return Promise.resolve(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }) as any;
});

describe('Admin Panel Pages and Components', () => {
  it('should import and render Admin Dashboard (/admin)', async () => {
    const AdminDashboard = (await import('../app/admin/page')).default;
    render(<AdminDashboard />);

    expect(screen.getByText(/Панель управления системой/i)).toBeInTheDocument();
    expect(screen.getByText(/Нагрузка CPU/i)).toBeInTheDocument();
    expect(screen.getByText(/Оперативная память RAM/i)).toBeInTheDocument();
    expect(screen.getByText(/База данных/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Создать бэкап/i })).toBeInTheDocument();
  });

  it('should trigger backup creation from dashboard', async () => {
    const AdminDashboard = (await import('../app/admin/page')).default;
    render(<AdminDashboard />);

    const backupBtn = screen.getByRole('button', { name: /Создать бэкап/i });
    fireEvent.click(backupBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Резервная копия успешно создана/i)
      ).toBeInTheDocument();
    });
  });

  it('should import and render Admin Users page (/admin/users)', async () => {
    const AdminUsersPage = (await import('../app/admin/users/page')).default;
    render(<AdminUsersPage />);

    expect(screen.getByText(/Управление пользователями/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Добавить пользователя/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Поиск по ФИО/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Главный Администратор')).toBeInTheDocument();
      expect(screen.getByText('Петров Петр Петрович')).toBeInTheDocument();
      expect(screen.getByText('Сидоров Сидор Сидорович')).toBeInTheDocument();
    });
  });

  it('should filter users and open create modal', async () => {
    const AdminUsersPage = (await import('../app/admin/users/page')).default;
    render(<AdminUsersPage />);

    const addBtn = screen.getByRole('button', { name: /Добавить пользователя/i });
    fireEvent.click(addBtn);

    expect(screen.getByText(/Новый пользователь/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ivanov@system112.ru/i)).toBeInTheDocument();
  });

  it('should import and render Admin System & Backup page (/admin/system)', async () => {
    const AdminSystemPage = (await import('../app/admin/system/page')).default;
    render(<AdminSystemPage />);

    expect(screen.getByText(/Система и резервное копирование/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Создать Backup базы данных/i })).toBeInTheDocument();

    const backupBtn = screen.getByRole('button', { name: /Создать Backup базы данных/i });
    fireEvent.click(backupBtn);

    await waitFor(() => {
      expect(screen.getByText(/Дамп базы данных успешно сформирован/i)).toBeInTheDocument();
    });
  });

  it('should render AdminLayout with navigation items', async () => {
    const AdminLayout = (await import('../app/admin/layout')).default;
    render(
      <AdminLayout>
        <div>Admin Content Test</div>
      </AdminLayout>
    );

    expect(screen.getByText(/Панель администратора/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Дашборд/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Пользователи/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Система и бэкапы/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /На главную/i })).toBeInTheDocument();
    expect(screen.getByText('Admin Content Test')).toBeInTheDocument();
  });
});
