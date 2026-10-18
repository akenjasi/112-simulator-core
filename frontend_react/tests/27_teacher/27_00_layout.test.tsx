import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  usePathname: () => '/teacher',
}));
import TeacherLayout from '@/app/teacher/layout';
import TeacherMainPage from '@/app/teacher/page';

describe('27.0: Layout и Главная страница (UX 60+)', () => {
  beforeEach(() => {
    localStorage.setItem('access_token', 'teacher-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ role: 'TEACHER' }), { status: 200 })
    ));
  });

  it('should render persistent sidebar with simple terminology', async () => {
    render(<TeacherLayout><div>Content</div></TeacherLayout>);
    await waitFor(() => expect(screen.getByRole('link', { name: /Начать урок/i })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Начать урок/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Журнал оценок/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ученики/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Главная страница/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /База билетов/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Справочник/i })).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('should render large tiles on the main page', async () => {
    render(<TeacherMainPage />);
    await waitFor(() => expect(screen.getByText(/Начать урок/i)).toBeInTheDocument());
    expect(screen.getByText(/Начать урок/i)).toBeInTheDocument();
    expect(screen.getByText(/Ученики/i)).toBeInTheDocument();
    expect(screen.getByText(/Журнал оценок/i)).toBeInTheDocument();
    expect(screen.getByText(/База билетов/i)).toBeInTheDocument();
  });
});
