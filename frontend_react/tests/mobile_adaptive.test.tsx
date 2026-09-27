import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Recharts ResponsiveContainer mock for jsdom
vi.mock('recharts', async () => {
  const original = await vi.importActual('recharts');
  return {
    ...original,
    ResponsiveContainer: ({ children, width, height }: any) => (
      <div
        data-testid="responsive-container"
        data-width={width}
        data-height={height}
        style={{ width: width === '100%' ? '100%' : 500, height: 300 }}
      >
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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('user_role', 'ADMIN');

  global.fetch = vi.fn((url: string | Request | URL) => {
    const urlString = String(url);
    if (urlString.includes('/api/v1/users/me')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            user_id: 'user-admin-1',
            username: 'admin@system112.ru',
            role: 'ADMIN',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }
    if (urlString.includes('/api/admin/healthcheck')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            cpu_percent: 22.0,
            ram_percent: 45.0,
            db_status: 'ok',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }
    if (urlString.includes('/api/admin/users')) {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              user_id: 'u1',
              username: 'cadet1@system112.ru',
              role: 'CADET',
              full_name: 'Курсант Один',
              is_active: true,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }
    if (urlString.includes('/students')) {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              user_id: 'u1',
              username: 'cadet1@system112.ru',
              role: 'CADET',
              full_name: 'Курсант Один',
              is_active: true,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }
    if (urlString.includes('/sessions/sess-101') || urlString.includes('/lessons/sess-101')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            session_id: 'sess-101',
            status: 'ACTIVE',
            students: [
              {
                cadet_id: 'c1',
                cadet_name: 'Курсант Тест',
                status: 'PASSED',
                progress: 100,
                passed: 1,
                failed: 0,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }
    if (urlString.includes('/api/v1/groups')) {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              group_id: 'grp-1',
              group_name: 'Группа 101',
              cadet_ids: ['u1'],
              student_count: 1,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }) as any;
});

describe('Mobile Adaptivity (task_78)', () => {
  describe('AdminLayout Mobile Adaptive Header & Drawer', () => {
    it('should have hidden md:flex on desktop sidebar and render mobile hamburger button', async () => {
      const AdminLayout = (await import('../app/admin/layout')).default;
      const { container } = render(
        <AdminLayout>
          <div>Admin Content</div>
        </AdminLayout>
      );

      // Desktop sidebar has hidden md:flex
      const desktopSidebar = container.querySelector(
        'aside[aria-label="Боковое меню администратора"]'
      );
      expect(desktopSidebar).toBeInTheDocument();
      expect(desktopSidebar?.className).toContain('hidden');
      expect(desktopSidebar?.className).toContain('md:flex');

      // Mobile hamburger button is present
      const hamburgerBtn = screen.getByTestId('admin-mobile-menu-toggle');
      expect(hamburgerBtn).toBeInTheDocument();
      expect(hamburgerBtn).toHaveAttribute('aria-label', 'Открыть меню');
    });

    it('should open and close mobile drawer menu when hamburger or backdrop is clicked', async () => {
      const AdminLayout = (await import('../app/admin/layout')).default;
      render(
        <AdminLayout>
          <div>Admin Content</div>
        </AdminLayout>
      );

      // Initially mobile drawer is not open
      expect(
        screen.queryByLabelText('Мобильное меню администратора')
      ).not.toBeInTheDocument();

      // Click hamburger
      const toggleBtn = screen.getByTestId('admin-mobile-menu-toggle');
      fireEvent.click(toggleBtn);

      // Mobile drawer and backdrop appear
      const mobileDrawer = screen.getByLabelText('Мобильное меню администратора');
      expect(mobileDrawer).toBeInTheDocument();
      expect(screen.getByTestId('admin-mobile-backdrop')).toBeInTheDocument();

      // Nav items in mobile menu are present
      expect(mobileDrawer).toHaveTextContent('Дашборд');
      expect(mobileDrawer).toHaveTextContent('Пользователи');
      expect(mobileDrawer).toHaveTextContent('Система и бэкапы');

      // Click close button inside drawer
      const closeBtn = screen.getByTestId('admin-drawer-close');
      fireEvent.click(closeBtn);

      expect(
        screen.queryByLabelText('Мобильное меню администратора')
      ).not.toBeInTheDocument();
    });

    it('should close mobile drawer when backdrop is clicked', async () => {
      const AdminLayout = (await import('../app/admin/layout')).default;
      render(
        <AdminLayout>
          <div>Admin Content</div>
        </AdminLayout>
      );

      // Open drawer
      fireEvent.click(screen.getByTestId('admin-mobile-menu-toggle'));
      expect(screen.getByLabelText('Мобильное меню администратора')).toBeInTheDocument();

      // Click backdrop
      fireEvent.click(screen.getByTestId('admin-mobile-backdrop'));
      expect(
        screen.queryByLabelText('Мобильное меню администратора')
      ).not.toBeInTheDocument();
    });
  });

  describe('TeacherLayout Mobile Adaptive Header & Drawer', () => {
    it('should have hidden md:flex on desktop sidebar and render teacher mobile hamburger button', async () => {
      const TeacherLayout = (await import('../app/teacher/layout')).default;
      const { container } = render(
        <TeacherLayout>
          <div>Teacher Content</div>
        </TeacherLayout>
      );

      // Desktop sidebar has hidden md:flex
      const desktopSidebar = container.querySelector(
        'aside[aria-label="Боковое меню преподавателя"]'
      );
      expect(desktopSidebar).toBeInTheDocument();
      expect(desktopSidebar?.className).toContain('hidden');
      expect(desktopSidebar?.className).toContain('md:flex');

      // Mobile hamburger button is present
      const hamburgerBtn = screen.getByTestId('teacher-mobile-menu-toggle');
      expect(hamburgerBtn).toBeInTheDocument();
      expect(hamburgerBtn).toHaveAttribute('aria-label', 'Открыть меню');
    });

    it('should open teacher mobile drawer with all navigation links and close on X', async () => {
      const TeacherLayout = (await import('../app/teacher/layout')).default;
      render(
        <TeacherLayout>
          <div>Teacher Content</div>
        </TeacherLayout>
      );

      // Initially mobile drawer is closed
      expect(
        screen.queryByLabelText('Мобильное меню преподавателя')
      ).not.toBeInTheDocument();

      // Click hamburger
      fireEvent.click(screen.getByTestId('teacher-mobile-menu-toggle'));

      const mobileDrawer = screen.getByLabelText('Мобильное меню преподавателя');
      expect(mobileDrawer).toBeInTheDocument();
      expect(mobileDrawer).toHaveTextContent('Главная страница');
      expect(mobileDrawer).toHaveTextContent('Начать урок');
      expect(mobileDrawer).toHaveTextContent('Ученики');
      expect(mobileDrawer).toHaveTextContent('Журнал оценок');
      expect(mobileDrawer).toHaveTextContent('База билетов');
      expect(mobileDrawer).toHaveTextContent('Справочник');

      // Close via X button
      const closeBtn = screen.getByTestId('teacher-drawer-close');
      fireEvent.click(closeBtn);
      expect(
        screen.queryByLabelText('Мобильное меню преподавателя')
      ).not.toBeInTheDocument();
    });

    it('should close teacher mobile drawer when backdrop is clicked', async () => {
      const TeacherLayout = (await import('../app/teacher/layout')).default;
      render(
        <TeacherLayout>
          <div>Teacher Content</div>
        </TeacherLayout>
      );

      // Open drawer
      fireEvent.click(screen.getByTestId('teacher-mobile-menu-toggle'));
      expect(screen.getByLabelText('Мобильное меню преподавателя')).toBeInTheDocument();

      // Click backdrop
      fireEvent.click(screen.getByTestId('teacher-mobile-backdrop'));
      expect(
        screen.queryByLabelText('Мобильное меню преподавателя')
      ).not.toBeInTheDocument();
    });
  });

  describe('Horizontal Table Scrolling (overflow-x-auto)', () => {
    it('should render Admin Users table container with overflow-x-auto', async () => {
      const AdminUsersPage = (await import('../app/admin/users/page')).default;
      const { container } = render(<AdminUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('Курсант Один')).toBeInTheDocument();
      });

      // Table container must have overflow-x-auto
      const overflowContainer = container.querySelector('.overflow-x-auto');
      expect(overflowContainer).toBeInTheDocument();
    });

    it('should render Teacher Groups tables with overflow-x-auto containers', async () => {
      const GroupsPage = (await import('../app/teacher/groups/page')).default;
      const { container } = render(<GroupsPage />);

      // Switch to All Students tab where table is rendered
      const allStudentsBtn = screen.getByRole('button', { name: /Все ученики/i });
      fireEvent.click(allStudentsBtn);

      await waitFor(() => {
        expect(screen.getByText('Курсант')).toBeInTheDocument();
      });

      // Check overflow-x-auto exists
      const overflowContainer = container.querySelector('.overflow-x-auto');
      expect(overflowContainer).toBeInTheDocument();
    });

    it('should render Teacher Analytics with overflow-x-auto container', async () => {
      const AnalyticsPage = (await import('../app/teacher/analytics/page')).default;
      const { container } = render(<AnalyticsPage />);

      const overflowContainers = container.querySelectorAll('.overflow-x-auto');
      expect(overflowContainers.length).toBeGreaterThan(0);
    });

    it('should render Teacher Live Session table with overflow-x-auto container', async () => {
      const LiveDashboard = (await import('../app/teacher/sessions/[id]/live/page')).default;
      const { container } = render(<LiveDashboard sessionId="sess-101" />);

      await waitFor(() => {
        expect(screen.getByText('Курсант Тест')).toBeInTheDocument();
      });

      // Switch to table view
      const tableViewBtn = screen.getByRole('button', { name: /Таблица/i });
      fireEvent.click(tableViewBtn);

      const tableCardContent = container.querySelector('.overflow-x-auto');
      expect(tableCardContent).toBeInTheDocument();
    });
  });

  describe('Charts and Dashboards Adaptivity', () => {
    it('should render Admin Dashboard charts with width="100%" and min-w-0 containers', async () => {
      const AdminDashboardPage = (await import('../app/admin/page')).default;
      const { container } = render(<AdminDashboardPage />);

      const responsiveContainers = screen.getAllByTestId('responsive-container');
      expect(responsiveContainers.length).toBeGreaterThanOrEqual(2);

      responsiveContainers.forEach((chartContainer) => {
        expect(chartContainer.getAttribute('data-width')).toBe('100%');
        expect(chartContainer.getAttribute('data-height')).toBe('100%');
      });

      // Check min-w-0 class on chart parent containers to prevent overflow
      const minW0Elements = container.querySelectorAll('.min-w-0');
      expect(minW0Elements.length).toBeGreaterThan(0);
    });
  });
});
