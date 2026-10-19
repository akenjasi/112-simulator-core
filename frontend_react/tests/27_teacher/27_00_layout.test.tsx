import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TeacherLayout from '@/app/teacher/layout';
import TeacherMainPage from '@/app/teacher/page';

vi.mock('next/navigation',()=>({usePathname:()=>'/teacher',useRouter:()=>({push:vi.fn(),replace:vi.fn()})}));
vi.mock('@/components/auth/RequireAuth',()=>({default:({children}:{children:React.ReactNode})=>children}));

describe('27.0: Layout и Главная страница (UX 60+)', () => {
  it('should render persistent sidebar with simple terminology', () => {
    render(<TeacherLayout><div>Content</div></TeacherLayout>);
    expect(screen.getByRole('link', { name: /Начать урок/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Журнал оценок/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ученики/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Главная страница/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /База билетов/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Справочник/i })).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('should render large tiles on the main page', () => {
    render(<TeacherMainPage />);
    expect(screen.getByText(/Начать урок/i)).toBeInTheDocument();
    expect(screen.getByText(/Ученики/i)).toBeInTheDocument();
    expect(screen.getByText(/Журнал оценок/i)).toBeInTheDocument();
    expect(screen.getByText(/База билетов/i)).toBeInTheDocument();
  });
});
