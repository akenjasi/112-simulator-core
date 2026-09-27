import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AnalyticsPage from '@/app/teacher/analytics/page';

describe('Task 75: Advanced Analytics & Charts Dashboard', () => {
  const mockDynamics = [
    { date: '2026-09-01', avg_score: 75.0, total_sessions: 20, passed_count: 15, failed_count: 5, pass_rate: 75.0 },
    { date: '2026-09-15', avg_score: 85.0, total_sessions: 30, passed_count: 27, failed_count: 3, pass_rate: 90.0 },
  ];

  const mockGroupsComparison = [
    { group_id: 'grp-1', group_name: 'Группа 101-П', student_count: 15, avg_score: 88.0, pass_rate: 90.0, total_sessions: 200, total_errors: 30 },
    { group_id: 'grp-2', group_name: 'Группа 102-П', student_count: 14, avg_score: 82.0, pass_rate: 80.0, total_sessions: 190, total_errors: 45 },
  ];

  const mockHeatmap = {
    error_types: [
      { key: 'comm_rude_tone', label: 'Грубый тон', category: 'communication', severity: 'high' },
      { key: 'card_wrong_address', label: 'Ошибка адреса', category: 'card', severity: 'critical' },
      { key: 'sla_dispatch_delay', label: 'Задержка ДДС', category: 'sla', severity: 'high' },
    ],
    entities: [
      {
        id: 'cadet-1',
        name: 'Кузнецов Артем',
        group_name: 'Группа 101-П',
        error_counts: { comm_rude_tone: 3, card_wrong_address: 2 },
        total_errors: 5,
      },
    ],
    totals_by_error: {
      comm_rude_tone: 3,
      card_wrong_address: 2,
      sla_dispatch_delay: 0,
    },
  };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const urlStr = url.toString();
        if (urlStr.includes('/api/analytics/dynamics')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockDynamics,
          });
        }
        if (urlStr.includes('/api/analytics/groups-comparison')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockGroupsComparison,
          });
        }
        if (urlStr.includes('/api/analytics/errors-heatmap')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockHeatmap,
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({}),
        });
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render analytics dashboards container and tab switcher with charts tab', async () => {
    render(<AnalyticsPage initialTab="charts" />);

    expect(screen.getByTestId('analytics-dashboards')).toBeInTheDocument();
    expect(screen.getByText(/Дашборды успеваемости и статистика/i)).toBeInTheDocument();
    expect(screen.getByTestId('tab-charts')).toBeInTheDocument();
  });

  it('should render Line Chart for score dynamics and allow toggling periods', async () => {
    render(<AnalyticsPage initialTab="charts" />);

    expect(screen.getAllByText(/Динамика среднего балла/i)[0]).toBeInTheDocument();
    expect(screen.getByTestId('line-chart-container')).toBeInTheDocument();

    const sevenDaysBtn = screen.getByRole('button', { name: /7 дней/i });
    const thirtyDaysBtn = screen.getByRole('button', { name: /30 дней/i });
    expect(sevenDaysBtn).toBeInTheDocument();
    expect(thirtyDaysBtn).toBeInTheDocument();

    fireEvent.click(sevenDaysBtn);
    expect(sevenDaysBtn.className).toMatch(/bg-white|font-bold/);
  });

  it('should render Bar Chart comparing student groups', async () => {
    render(<AnalyticsPage initialTab="charts" />);

    expect(screen.getByText(/Сравнение успеваемости групп/i)).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart-container')).toBeInTheDocument();
  });

  it('should render Heatmap matrix with error types, entities, and toggle controls', async () => {
    render(<AnalyticsPage initialTab="charts" />);

    expect(screen.getByTestId('heatmap-card')).toBeInTheDocument();
    expect(screen.getByText(/Тепловая карта девиаций и ошибок/i)).toBeInTheDocument();

    // Toggle by students vs by groups
    const byCadetsBtn = screen.getByRole('button', { name: /По курсантам/i });
    const byGroupsBtn = screen.getByRole('button', { name: /По группам/i });
    expect(byCadetsBtn).toBeInTheDocument();
    expect(byGroupsBtn).toBeInTheDocument();

    // Filter categories
    expect(screen.getByRole('button', { name: /Коммуникация/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Карточка/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^SLA$/i })).toBeInTheDocument();
  });
});
