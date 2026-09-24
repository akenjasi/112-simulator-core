import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LiveDashboardPage from '@/app/teacher/sessions/[id]/live/page';

describe('27.4: Live Dashboard', () => {
  const mockStats = {
    session_id: 'sess-101',
    session_name: 'Сессия #sess-101',
    group_name: 'Группа 101 (Операторы)',
    status: 'active',
    overall_progress: 75,
    total_cadets: 2,
    total_in_progress: 1,
    total_passed: 3,
    total_failed: 1,
    cadets: [
      {
        cadet_id: 'cadet-1',
        cadet_name: 'Иван Иванов',
        status: 'IN_PROGRESS',
        current_ticket: 'Билет #2 (Пожар на складе)',
        in_progress: 1,
        passed: 2,
        failed: 0,
        progress: 66,
        score: 92,
        last_activity: '1 мин назад',
      },
      {
        cadet_id: 'cadet-2',
        cadet_name: 'Петр Петров',
        status: 'FAILED',
        current_ticket: 'Билет #3 (ДТП на трассе)',
        in_progress: 0,
        passed: 1,
        failed: 1,
        progress: 50,
        score: 68,
        last_activity: 'Только что',
      },
    ],
  };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const urlStr = url.toString();
        if (urlStr.includes('/api/v1/sessions/') && urlStr.endsWith('/stats')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockStats,
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

  it('should render live statistics', async () => {
    render(<LiveDashboardPage sessionId="sess-101" />);

    expect(screen.getByText(/Live Мониторинг сессии/i)).toBeInTheDocument();
    expect(screen.getByText(/В эфире/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Иван Иванов')).toBeInTheDocument();
      expect(screen.getByText('Петр Петров')).toBeInTheDocument();
    });

    // Check counters: "В процессе", "Сдано", "Провалено"
    const inProgressElements = screen.getAllByText(/В процессе/i);
    expect(inProgressElements.length).toBeGreaterThanOrEqual(1);

    const passedElements = screen.getAllByText(/Сдано/i);
    expect(passedElements.length).toBeGreaterThanOrEqual(1);

    const failedElements = screen.getAllByText(/Провалено/i);
    expect(failedElements.length).toBeGreaterThanOrEqual(1);

    // Check overall progress bar
    expect(screen.getByText(/Общий прогресс сессии/i)).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBeGreaterThanOrEqual(1);
  });

  it('should not have pause or intervention buttons (read-only mode)', async () => {
    render(<LiveDashboardPage sessionId="sess-101" />);

    await waitFor(() => {
      expect(screen.getByText('Иван Иванов')).toBeInTheDocument();
    });

    // Restriction check: no pause or intervention buttons
    expect(screen.queryByRole('button', { name: /пауза|pause/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /остановить|stop|прервать/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /вмешаться|intervene/i })).toBeNull();

    // Read-only indicator is displayed
    expect(screen.getByText(/только чтение/i)).toBeInTheDocument();
  });

  it('should poll data periodically for updates', async () => {
    vi.useFakeTimers();

    render(<LiveDashboardPage sessionId="sess-101" />);

    // Initial fetch
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Advance 3 seconds (polling interval)
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);

    // Advance another 3 seconds
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(global.fetch).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('should toggle between grid and table view', async () => {
    render(<LiveDashboardPage sessionId="sess-101" />);

    await waitFor(() => {
      expect(screen.getByText('Иван Иванов')).toBeInTheDocument();
    });

    // Switch to table view
    const tableBtn = screen.getByRole('button', { name: /Таблица/i });
    fireEvent.click(tableBtn);

    // Table elements should now be rendered
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Курсант/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Текущий билет/i })).toBeInTheDocument();
    });

    // Switch back to grid view
    const gridBtn = screen.getByRole('button', { name: /Сетка/i });
    fireEvent.click(gridBtn);

    await waitFor(() => {
      expect(screen.queryByRole('table')).toBeNull();
    });
  });

  it('should filter cadets by search query', async () => {
    render(<LiveDashboardPage sessionId="sess-101" />);

    await waitFor(() => {
      expect(screen.getByText('Иван Иванов')).toBeInTheDocument();
      expect(screen.getByText('Петр Петров')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Поиск курсанта/i);
    fireEvent.change(searchInput, { target: { value: 'Иван' } });

    await waitFor(() => {
      expect(screen.getByText('Иван Иванов')).toBeInTheDocument();
      expect(screen.queryByText('Петр Петров')).toBeNull();
    });
  });
});
