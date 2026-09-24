import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TeacherLayout from '@/app/teacher/layout';
import TeacherMainPage from '@/app/teacher/page';

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
