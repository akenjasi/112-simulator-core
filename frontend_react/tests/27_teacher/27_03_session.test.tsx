import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SessionSetupPage from '@/app/teacher/sessions/new/page';

describe('ТЗ 41: Запуск урока (Создание сессии) - Настройка и UI', () => {
  const mockGroups = [
    {
      group_id: 'grp-1',
      group_name: 'Группа 101',
      profile: 'OPERATOR_112',
      department: 'Отделение связи',
      cadet_ids: ['cadet-1', 'cadet-2'],
      student_count: 2,
    },
    {
      group_id: 'grp-2',
      group_name: 'Группа 202',
      profile: 'DISPATCHER_DDS',
      department: 'Диспетчерская служба',
      cadet_ids: ['cadet-3'],
      student_count: 1,
    },
    {
      group_id: 'grp-empty',
      group_name: 'Группа 303',
      department: 'Резерв',
      cadet_ids: [],
      student_count: 0,
    },
  ];

  const mockCategories = [
    'Пожары и задымления',
    'Взрывы',
    'Обрушения',
    'ДТП',
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

      if (urlStr.includes('/api/classifier/categories')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockCategories,
        });
      }

      if (urlStr.includes('/api/classifier/subcategories')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ['Подкатегория Я', 'Подкатегория А'],
        });
      }

      if (urlStr.includes('/api/v1/tickets/counts')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            { category: 'Взрывы', total: 5, subcategories: { 'Подкатегория А': 2, 'Подкатегория Я': 3 } },
            { category: 'ДТП', total: 5, subcategories: { 'Подкатегория А': 2, 'Подкатегория Я': 3 } },
            { category: 'Обрушения', total: 5, subcategories: { 'Подкатегория А': 2, 'Подкатегория Я': 3 } },
            { category: 'Пожары и задымления', total: 5, subcategories: { 'Подкатегория А': 2, 'Подкатегория Я': 3 } },
          ],
        });
      }

      if ((urlStr.endsWith('/api/v1/lessons') || urlStr.endsWith('/api/v1/sessions')) && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            id: 'lesson-new-123',
            lesson_id: 'lesson-new-123',
            assignment_id: 'lesson-new-123',
            session_id: 'lesson-new-123',
            group_id: body.group_id,
            target_role: body.target_role || 'OPERATOR_112',
            categories: body.categories || [],
            complexity: body.complexity || 'adaptive',
            time_limit_seconds: body.time_limit_seconds ?? 30,
            status: 'WAITING',
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

  it('should render form with empty group, disabled submit button, and role options', async () => {
    render(<SessionSetupPage />);

    // Header & Submit button
    expect(screen.getByText(/Запуск урока|Создать занятие/i)).toBeInTheDocument();
    const submitBtn = screen.getByRole('button', { name: /Создать и запустить/i });
    expect(submitBtn).toBeInTheDocument();

    // Group select must default to empty and submit must be disabled initially
    const groupSelect = screen.getByRole('combobox', { name: /Выбор Группы/i }) as HTMLSelectElement;
    expect(groupSelect).toBeInTheDocument();
    expect(groupSelect.value).toBe('');
    expect(submitBtn).toBeDisabled();

    // Role options (Оператор 112, Диспетчер ДДС)
    expect(screen.getByText(/Оператор 112/i)).toBeInTheDocument();
    expect(screen.getByText(/Диспетчер ДДС/i)).toBeInTheDocument();

    // Complexity cards: "Базовый", "Средний", "Продвинутый", "Адаптивный / Смешанный"
    expect(screen.getByText(/Базовый/i)).toBeInTheDocument();
    expect(screen.getByText(/Средний/i)).toBeInTheDocument();
    expect(screen.getByText(/Продвинутый/i)).toBeInTheDocument();
    expect(screen.getByText(/Адаптивный/i)).toBeInTheDocument();

    // Check error calculation note
    expect(
      screen.getByText(/Допустимое количество ошибок рассчитывается на основе сложности/i)
    ).toBeInTheDocument();

    // Time limit placeholder
    const timeLimitInput = screen.getByPlaceholderText(/По умолчанию \(30 сек\)/i);
    expect(timeLimitInput).toBeInTheDocument();

    // Wait for groups to populate
    await waitFor(() => {
      expect(screen.getByText(/Группа 101/i)).toBeInTheDocument();
    });

    // Selecting a group enables the submit button
    fireEvent.change(groupSelect, { target: { value: 'grp-1' } });
    expect(groupSelect.value).toBe('grp-1');
    expect(submitBtn).not.toBeDisabled();
  });

  it('should submit lesson configuration to POST /api/v1/lessons', async () => {
    render(<SessionSetupPage />);

    await waitFor(() => {
      expect(screen.getByText(/Группа 101/i)).toBeInTheDocument();
    });

    const groupSelect = screen.getByRole('combobox', { name: /Выбор Группы/i });
    const timeLimitInput = screen.getByPlaceholderText(/По умолчанию \(30 сек\)/i);
    const submitBtn = screen.getByRole('button', { name: /Создать и запустить/i });

    // Select second group
    fireEvent.change(groupSelect, { target: { value: 'grp-2' } });

    // Select DISPATCHER_DDS role
    const dispatcherRadio = screen.getByRole('radio', { name: /Диспетчер ДДС/i });
    fireEvent.click(dispatcherRadio);

    // Select adaptive complexity
    const adaptiveRadio = screen.getByText(/Адаптивный/i);
    fireEvent.click(adaptiveRadio);

    // Set custom limits
    fireEvent.change(timeLimitInput, { target: { value: '45' } });

    // Submit form
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Урок успешно создан/i)).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/lessons',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"group_id":"grp-2"'),
      })
    );

    const callArgs = (global.fetch as any).mock.calls.find((c: any) =>
      c[0].toString().endsWith('/api/v1/lessons') || c[0].toString().endsWith('/api/v1/sessions')
    );
    const parsedBody = JSON.parse(callArgs[1].body);

    expect(parsedBody.group_id).toBe('grp-2');
    expect(parsedBody.time_limit_seconds).toBe(45);
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
      if (urlStr.includes('/api/classifier')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockCategories,
        });
      }
      if (urlStr.endsWith('/api/v1/lessons') || urlStr.endsWith('/api/v1/sessions')) {
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

    const groupSelect = screen.getByRole('combobox', { name: /Выбор Группы/i });
    fireEvent.change(groupSelect, { target: { value: 'grp-1' } });

    const submitBtn = screen.getByRole('button', { name: /Создать и запустить/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Ошибка валидации конфигурации/i)).toBeInTheDocument();
    });
  });

  it('ТЗ 43: should show cadet counts, mark 0 student groups as disabled and prevent selection', async () => {
    render(<SessionSetupPage />);

    await waitFor(() => {
      expect(screen.getByText(/Группа 101/i)).toBeInTheDocument();
    });

    // Group 101 (2 cadets) -> label contains "(2 чел.)"
    const option101 = screen.getByRole('option', { name: /Группа 101.*\(2 чел\.\)/i }) as HTMLOptionElement;
    expect(option101).toBeInTheDocument();
    expect(option101.disabled).toBe(false);

    // Group 202 (1 cadet) -> label contains "(1 чел.)"
    const option202 = screen.getByRole('option', { name: /Группа 202.*\(1 чел\.\)/i }) as HTMLOptionElement;
    expect(option202).toBeInTheDocument();
    expect(option202.disabled).toBe(false);

    // Group 303 (0 cadets) -> label contains "(нет учеников)" and must be disabled
    const option303 = screen.getByRole('option', { name: /Группа 303.*\(нет учеников\)/i }) as HTMLOptionElement;
    expect(option303).toBeInTheDocument();
    expect(option303.disabled).toBe(true);

    const groupSelect = screen.getByRole('combobox', { name: /Выбор Группы/i });
    const submitBtn = screen.getByRole('button', { name: /Создать и запустить/i });

    // Selecting empty group keeps submit disabled
    fireEvent.change(groupSelect, { target: { value: 'grp-empty' } });
    expect(submitBtn).toBeDisabled();

    // Selecting valid group enables submit
    fireEvent.change(groupSelect, { target: { value: 'grp-1' } });
    expect(submitBtn).not.toBeDisabled();
  });

  it('ТЗ 43: should handle 2-stage hierarchical category and subcategory selection in alphabetical order', async () => {
    render(<SessionSetupPage />);

    await waitFor(() => {
      expect(screen.getByText(/Этап 1: Выберите категории происшествий/i)).toBeInTheDocument();
    });

    // Subcategories in stage 2 initially blocked
    expect(screen.getByText(/Подкатегории заблокированы/i)).toBeInTheDocument();

    // Check categories strictly sorted in alphabetical order: Взрывы, ДТП, Обрушения, Пожары и задымления
    const categoryCheckboxes = screen.getAllByRole('checkbox', { name: /Взрывы|ДТП|Обрушения|Пожары и задымления/i });
    expect(categoryCheckboxes.length).toBe(4);
    expect(categoryCheckboxes[0].closest('label')?.textContent).toContain('Взрывы');
    expect(categoryCheckboxes[1].closest('label')?.textContent).toContain('ДТП');
    expect(categoryCheckboxes[2].closest('label')?.textContent).toContain('Обрушения');
    expect(categoryCheckboxes[3].closest('label')?.textContent).toContain('Пожары и задымления');

    // Click on category "Пожары и задымления"
    const fireCheckbox = categoryCheckboxes[3];
    await act(async () => {
      fireEvent.click(fireCheckbox);
    });

    // Stage 2 unlocked: blocked placeholder disappears, subcategories appear
    await waitFor(() => {
      expect(screen.queryByText(/Подкатегории заблокированы/i)).not.toBeInTheDocument();
      expect(screen.getByText('Подкатегория А')).toBeInTheDocument();
      expect(screen.getByText('Подкатегория Я')).toBeInTheDocument();
    });

    // Verify subcategories are also sorted alphabetically: 'Подкатегория А' appears before 'Подкатегория Я'
    const subCheckboxes = screen.getAllByRole('checkbox', { name: /Подкатегория/i });
    expect(subCheckboxes.length).toBe(2);
    expect(subCheckboxes[0].closest('label')?.textContent).toContain('Подкатегория А');
    expect(subCheckboxes[1].closest('label')?.textContent).toContain('Подкатегория Я');

    // Select subcategory "Подкатегория А"
    await act(async () => {
      fireEvent.click(subCheckboxes[0]);
    });
    // Badge chip + checkbox label both show "Подкатегория А"
    expect(screen.getAllByText('Подкатегория А').length).toBe(2);

    // Deselect category "Пожары и задымления" -> stage 2 is blocked again and subcategory is cleared
    await act(async () => {
      fireEvent.click(fireCheckbox);
    });
    expect(screen.getByText(/Подкатегории заблокированы/i)).toBeInTheDocument();
    expect(screen.queryByText('Подкатегория А')).not.toBeInTheDocument();
  });

  it('should not show "По умолчанию используются все категории" and should show "Сбросить фильтры" when filtered', async () => {
    // Mock ticket counts with "Пожары и задымления" having tickets
    const originalFetch = global.fetch;
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/v1/tickets/counts')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            {
              category: 'Пожары и задымления',
              total: 5,
              subcategories: { 'Подкатегория Я': 5, 'Подкатегория А': 0 },
            },
          ],
        });
      }
      return originalFetch(url, init);
    }));

    render(<SessionSetupPage />);

    // Text "По умолчанию используются все категории" should NOT be present
    expect(screen.queryByText(/По умолчанию используются все категории/i)).not.toBeInTheDocument();

    // "Сбросить фильтры" is initially not shown because no filter is applied
    expect(screen.queryByRole('button', { name: /Сбросить фильтры/i })).not.toBeInTheDocument();

    // Non-empty category "Пожары и задымления" (5 tickets) should be placed before empty ones
    await waitFor(() => {
      const categoryLabels = screen.getAllByRole('checkbox', { name: /Взрывы|ДТП|Обрушения|Пожары и задымления/i });
      expect(categoryLabels[0].closest('label')?.textContent).toContain('Пожары и задымления');
    });

    // Select category "Пожары и задымления"
    const fireCheckbox = screen.getAllByRole('checkbox', { name: /Пожары и задымления/i })[0];
    await act(async () => {
      fireEvent.click(fireCheckbox);
    });

    // "Сбросить фильтры" button is now visible
    const resetBtn = screen.getByRole('button', { name: /Сбросить фильтры/i });
    expect(resetBtn).toBeInTheDocument();

    // In Stage 2, "Подкатегория Я" (5 tickets) should appear before "Подкатегория А" (0 tickets)
    await waitFor(() => {
      const subCheckboxes = screen.getAllByRole('checkbox', { name: /Подкатегория/i });
      expect(subCheckboxes[0].closest('label')?.textContent).toContain('Подкатегория Я');
      expect(subCheckboxes[1].closest('label')?.textContent).toContain('Подкатегория А');
    });

    // Click "Сбросить фильтры"
    await act(async () => {
      fireEvent.click(resetBtn);
    });

    // Filters reset -> Stage 2 blocked again, button disappears
    expect(screen.getByText(/Подкатегории заблокированы/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Сбросить фильтры/i })).not.toBeInTheDocument();
  });

  it('should disable submit button and show warning when 0 tickets are available, and show divider in Stage 2', async () => {
    // Mock ticket counts: "Пожары и задымления" has 5 tickets, "ДТП" has 0 tickets
    const originalFetch = global.fetch;
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/v1/tickets/counts')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            {
              category: 'Пожары и задымления',
              total: 5,
              subcategories: { 'Подкатегория А': 5, 'Подкатегория Я': 0 },
            },
            {
              category: 'ДТП',
              total: 0,
              subcategories: { 'Подкатегория А': 0, 'Подкатегория Я': 0 },
            },
          ],
        });
      }
      return originalFetch(url, init);
    }));

    render(<SessionSetupPage />);

    // Wait for groups to load
    await waitFor(() => {
      expect(screen.getByText(/Группа 101/i)).toBeInTheDocument();
    });

    // Select group 1
    const groupSelect = screen.getByRole('combobox', { name: /Выбор Группы/i });
    fireEvent.change(groupSelect, { target: { value: 'grp-1' } });

    // Select category "ДТП" (has 0 tickets)
    await waitFor(() => {
      expect(document.getElementById('main-cat-ДТП')).toBeInTheDocument();
    });
    const dtpCheckbox = document.getElementById('main-cat-ДТП') as HTMLInputElement;
    await act(async () => {
      fireEvent.click(dtpCheckbox);
    });

    // Submit button should be disabled because available tickets = 0
    const submitBtn = screen.getByRole('button', { name: /Создать и запустить/i });
    await waitFor(() => {
      expect(submitBtn).toBeDisabled();
    });

    // Warning message should be visible
    expect(screen.getByText(/Выберите другую категорию или подготовьте билеты/i)).toBeInTheDocument();

    // Now also select "Пожары и задымления" (which has > 0 tickets)
    const fireCheckbox = document.getElementById('main-cat-Пожары и задымления') as HTMLInputElement;
    await act(async () => {
      fireEvent.click(fireCheckbox);
    });

    // In Stage 2, both "Пожары и задымления" and "ДТП" are selected.
    // The divider "Категории без доступных билетов" should be visible between them!
    await waitFor(() => {
      expect(screen.getByText(/Категории без доступных билетов/i)).toBeInTheDocument();
    });

    // Now available tickets > 0 (5 tickets from Пожары и задымления), submit button is enabled!
    await waitFor(() => {
      expect(submitBtn).not.toBeDisabled();
    });
    expect(screen.queryByText(/Выберите другую категорию или подготовьте билеты/i)).not.toBeInTheDocument();
  });
});
