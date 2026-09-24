import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SessionSetupPage from '@/app/teacher/sessions/new/page';

describe('27.3: Настройка занятия', () => {
  const mockGroups = [
    {
      group_id: 'grp-1',
      group_name: 'Группа 101',
      profile: 'OPERATOR_112',
      department: 'Отделение связи',
      cadet_ids: ['cadet-1', 'cadet-2'],
    },
    {
      group_id: 'grp-2',
      group_name: 'Группа 202',
      profile: 'DISPATCHER_DDS',
      department: 'Диспетчерская служба',
      cadet_ids: ['cadet-3'],
    },
  ];

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const urlStr = url.toString();

      if (urlStr.endsWith('/api/v1/groups') && (!init || init.method === 'GET' || !init.method)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockGroups,
        });
      }

      if (urlStr.endsWith('/api/v1/sessions') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            session_id: 'sess-new-123',
            group_id: body.group_id,
            categories: body.categories,
            complexity: body.complexity,
            distribution_mode: body.distribution_mode,
            time_limit_seconds: body.time_limit_seconds ?? 30,
            error_limit: body.error_limit ?? 0,
            status: 'active',
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render configuration form', async () => {
    render(<SessionSetupPage />);

    // Header & Submit button
    expect(screen.getByText(/Создать занятие/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Создать и запустить/i })).toBeInTheDocument();

    // Group select
    expect(screen.getByRole('combobox', { name: /Выбор Группы/i })).toBeInTheDocument();

    // Categories (multi-select)
    expect(screen.getByLabelText(/Пожары/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Медицина/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ДТП/i)).toBeInTheDocument();

    // Complexity (RadioGroup)
    expect(screen.getByLabelText(/level_1/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/level_2/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/level_3/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mixed/i)).toBeInTheDocument();

    // Distribution mode (RadioGroup)
    expect(screen.getByLabelText(/live_stream/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/exam/i)).toBeInTheDocument();

    // Optional limits
    expect(screen.getByLabelText(/Лимит времени/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Допустимое количество ошибок/i)).toBeInTheDocument();

    // Wait for groups to populate
    await waitFor(() => {
      expect(screen.getByText(/Группа 101/i)).toBeInTheDocument();
    });
  });

  it('should submit session configuration to POST /api/v1/sessions', async () => {
    render(<SessionSetupPage />);

    await waitFor(() => {
      expect(screen.getByText(/Группа 101/i)).toBeInTheDocument();
    });

    const groupSelect = screen.getByRole('combobox', { name: /Выбор Группы/i });
    const timeLimitInput = screen.getByLabelText(/Лимит времени/i);
    const errorLimitInput = screen.getByLabelText(/Допустимое количество ошибок/i);
    const submitBtn = screen.getByRole('button', { name: /Создать и запустить/i });

    // Select second group
    fireEvent.change(groupSelect, { target: { value: 'grp-2' } });

    // Select level_2 complexity
    const level2Radio = screen.getByLabelText(/level_2/i);
    fireEvent.click(level2Radio);

    // Select exam distribution mode
    const examRadio = screen.getByLabelText(/exam/i);
    fireEvent.click(examRadio);

    // Toggle category (DTP)
    const dtpCheckbox = screen.getByLabelText(/ДТП/i);
    fireEvent.click(dtpCheckbox);

    // Set custom limits
    fireEvent.change(timeLimitInput, { target: { value: '45' } });
    fireEvent.change(errorLimitInput, { target: { value: '1' } });

    // Submit form
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Занятие успешно создано и запущено/i)).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/sessions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"group_id":"grp-2"'),
      })
    );

    const callArgs = (global.fetch as any).mock.calls.find((c: any) =>
      c[0].toString().endsWith('/api/v1/sessions')
    );
    const parsedBody = JSON.parse(callArgs[1].body);

    expect(parsedBody.group_id).toBe('grp-2');
    expect(parsedBody.complexity).toBe('level_2');
    expect(parsedBody.distribution_mode).toBe('exam');
    expect(parsedBody.categories).toEqual(expect.arrayContaining(['Пожары', 'Медицина', 'ДТП']));
    expect(parsedBody.time_limit_seconds).toBe(45);
    expect(parsedBody.error_limit).toBe(1);
  });

  it('should handle API errors gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.endsWith('/api/v1/groups')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockGroups,
        });
      }
      if (urlStr.endsWith('/api/v1/sessions')) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ detail: 'Ошибка валидации конфигурации' }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }));

    render(<SessionSetupPage />);

    await waitFor(() => {
      expect(screen.getByText(/Группа 101/i)).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Создать и запустить/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Ошибка валидации конфигурации/i)).toBeInTheDocument();
    });
  });
});
