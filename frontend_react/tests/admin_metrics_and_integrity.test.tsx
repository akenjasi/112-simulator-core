import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Recharts ResponsiveContainer mock
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
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

describe('Admin Dashboard Metrics and System Diagnostics (Stage 2 & 3 UI)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('user_role', 'ADMIN');
    localStorage.setItem('access_token', 'admin-token');
  });

  it('renders neutral loading states on Dashboard without fake 18.5/42.1 metrics', async () => {
    // Return pending promise so it stays in loading state
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/healthcheck')) {
        return new Promise(() => {});
      }
      if (url.includes('/api/admin/users')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const AdminDashboardPage = (await import('../app/admin/page')).default;
    render(<AdminDashboardPage />);

    // Assert that fake initial values are NOT rendered
    expect(screen.queryByText('18.5%')).not.toBeInTheDocument();
    expect(screen.queryByText('42.1%')).not.toBeInTheDocument();

    // Assert neutral placeholders are rendered
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Статус БД неизвестен')).toBeInTheDocument();
  });

  it('populates real metrics when healthcheck succeeds', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/healthcheck')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ cpu_percent: 55.4, ram_percent: 68.9, db_status: 'ok' }),
            { status: 200 }
          )
        );
      }
      if (url.includes('/api/admin/users')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const AdminDashboardPage = (await import('../app/admin/page')).default;
    render(<AdminDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('55.4%')).toBeInTheDocument();
      expect(screen.getByText('68.9%')).toBeInTheDocument();
      expect(screen.getByText('PostgreSQL Connection OK')).toBeInTheDocument();
    });
  });

  it('displays warning alert on Dashboard when healthcheck poll fails', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/healthcheck')) {
        return Promise.resolve(new Response('Internal Server Error', { status: 500 }));
      }
      if (url.includes('/api/admin/users')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const AdminDashboardPage = (await import('../app/admin/page')).default;
    render(<AdminDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/Ошибка healthcheck: 500/i)).toBeInTheDocument();
    });
  });

  it('distinguishes checking, connection error, and active status in AdminSystemPage', async () => {
    // 1. Loading state (pending healthcheck)
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/healthcheck')) {
        return new Promise(() => {});
      }
      if (url.includes('/api/admin/backups')) {
        return Promise.resolve(new Response(JSON.stringify({ backups: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const AdminSystemPage = (await import('../app/admin/system/page')).default;
    const { unmount } = render(<AdminSystemPage />);

    // Must NOT claim "Сервер активен" before response arrives
    expect(screen.getByText('Проверка...')).toBeInTheDocument();
    expect(screen.queryByText('Сервер активен')).not.toBeInTheDocument();
    unmount();

    // 2. Resolved state (active)
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/healthcheck')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ cpu_percent: 10.0, ram_percent: 20.0, db_status: 'ok' }),
            { status: 200 }
          )
        );
      }
      if (url.includes('/api/admin/backups')) {
        return Promise.resolve(new Response(JSON.stringify({ backups: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const { unmount: unmount2 } = render(<AdminSystemPage />);
    await waitFor(() => {
      expect(screen.getByText('Сервер активен')).toBeInTheDocument();
      expect(screen.getByText('Подключена')).toBeInTheDocument();
    });
    unmount2();

    // 3. Error state (network error, health is null)
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/healthcheck')) {
        return Promise.resolve(new Response('Failed', { status: 503 }));
      }
      if (url.includes('/api/admin/backups')) {
        return Promise.resolve(new Response(JSON.stringify({ backups: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const { unmount: unmount3 } = render(<AdminSystemPage />);
    await waitFor(() => {
      expect(screen.getByText('Ошибка связи')).toBeInTheDocument();
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(3); // CPU, RAM, DB all '—'
    });
    unmount3();

    // 4. Component error state (health returns db_status === 'error')
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/healthcheck')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ cpu_percent: 25.0, ram_percent: 45.0, db_status: 'error' }),
            { status: 200 }
          )
        );
      }
      if (url.includes('/api/admin/backups')) {
        return Promise.resolve(new Response(JSON.stringify({ backups: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    render(<AdminSystemPage />);
    await waitFor(() => {
      expect(screen.getByText('Сбой компонентов')).toBeInTheDocument();
      expect(screen.getByText('Недоступна')).toBeInTheDocument();
    });
  });

  it('renders integrity check card and performs check with verified result', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/admin/healthcheck')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ cpu_percent: 12.0, ram_percent: 30.0, db_status: 'ok' }),
            { status: 200 }
          )
        );
      }
      if (url.includes('/api/admin/backups')) {
        return Promise.resolve(new Response(JSON.stringify({ backups: [] }), { status: 200 }));
      }
      if (url.includes('/api/admin/integrity/check') && options?.method === 'POST') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'ok',
              checked_at: '2026-10-17T18:00:00Z',
              manifest_digest: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
              checked_files_count: 85,
              deviations: [],
              scope_summary: 'Python-файлы, скрипты запуска, нативные библиотеки bin/',
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const AdminSystemPage = (await import('../app/admin/system/page')).default;
    render(<AdminSystemPage />);

    expect(screen.getByText(/Целостность файлов backend/i)).toBeInTheDocument();
    expect(screen.getByText('Проверка не выполнялась')).toBeInTheDocument();

    const checkBtn = screen.getByRole('button', { name: /Проверить целостность файлов/i });
    fireEvent.click(checkBtn);

    await waitFor(() => {
      expect(screen.getByText('Целостность подтверждена')).toBeInTheDocument();
      expect(screen.getByText('85')).toBeInTheDocument();
      expect(screen.getByText(/abcdef1234567890/i)).toBeInTheDocument();
    });
  });

  it('renders deviations when integrity check detects modifications', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/admin/healthcheck')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ cpu_percent: 12.0, ram_percent: 30.0, db_status: 'ok' }),
            { status: 200 }
          )
        );
      }
      if (url.includes('/api/admin/backups')) {
        return Promise.resolve(new Response(JSON.stringify({ backups: [] }), { status: 200 }));
      }
      if (url.includes('/api/admin/integrity/check') && options?.method === 'POST') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'deviation',
              checked_at: '2026-10-17T18:00:00Z',
              manifest_digest: 'abcdef1234567890abcdef1234567890',
              checked_files_count: 85,
              deviations: [
                {
                  path: 'backend/main.py',
                  reason: 'modified',
                  details: 'Expected hash mismatch',
                },
                {
                  path: 'scripts/init.sh',
                  reason: 'missing',
                  details: 'File not found on disk',
                },
              ],
              scope_summary: 'Python-файлы, скрипты запуска, нативные библиотеки bin/',
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const AdminSystemPage = (await import('../app/admin/system/page')).default;
    render(<AdminSystemPage />);

    const checkBtn = screen.getByRole('button', { name: /Проверить целостность файлов/i });
    fireEvent.click(checkBtn);

    await waitFor(() => {
      expect(screen.getByText('Обнаружены отклонения')).toBeInTheDocument();
      expect(screen.getByText(/Обнаружены отклонения целостности \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText('backend/main.py')).toBeInTheDocument();
      expect(screen.getByText('modified')).toBeInTheDocument();
      expect(screen.getByText('scripts/init.sh')).toBeInTheDocument();
      expect(screen.getByText('missing')).toBeInTheDocument();
    });
  });

  it('renders friendly unavailable message when manifest does not exist in dev mode', async () => {
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/admin/healthcheck')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ cpu_percent: 12.0, ram_percent: 30.0, db_status: 'ok' }),
            { status: 200 }
          )
        );
      }
      if (url.includes('/api/admin/backups')) {
        return Promise.resolve(new Response(JSON.stringify({ backups: [] }), { status: 200 }));
      }
      if (url.includes('/api/admin/integrity/check') && options?.method === 'POST') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: 'unavailable',
              checked_at: '2026-10-17T18:00:00Z',
              manifest_digest: null,
              checked_files_count: 0,
              deviations: [],
              scope_summary: 'Python-файлы, скрипты запуска, нативные библиотеки bin/',
              error: 'Проверка недоступна (манифест отсутствует; создаётся при сборке Docker-образа)',
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const AdminSystemPage = (await import('../app/admin/system/page')).default;
    render(<AdminSystemPage />);

    const checkBtn = screen.getByRole('button', { name: /Проверить целостность файлов/i });
    fireEvent.click(checkBtn);

    await waitFor(() => {
      expect(screen.getByText('Недоступно')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Проверка недоступна (манифест отсутствует; создаётся при сборке Docker-образа)'
        )
      ).toBeInTheDocument();
    });
  });
});
