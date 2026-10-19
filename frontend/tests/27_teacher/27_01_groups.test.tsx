import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import GroupsPage from '@/app/teacher/groups/page';

describe('27.1 / ТЗ 29: Рефакторинг управления группами и учениками', () => {
  const mockGroups = [
    {
      group_id: 'grp-1',
      group_name: 'Группа 101',
      department: 'Отделение связи',
      cadet_ids: ['cadet-1'],
    },
    {
      group_id: 'grp-2',
      group_name: 'Группа 202',
      department: 'Диспетчерская служба',
      cadet_ids: [],
    },
  ];

  const mockStudents = [
    {
      user_id: 'cadet-1',
      username: 'ivanov@test.com',
      full_name: 'Иванов Иван Иванович',
      role: 'CADET',
      groups: ['Группа 101'],
      is_active: true,
      created_at: '2026-01-15T10:00:00Z',
    },
    {
      user_id: 'cadet-2',
      username: 'petrov@test.com',
      full_name: 'Петров Петр Петрович',
      role: 'CADET',
      groups: [],
      is_active: true,
      created_at: '2026-02-20T12:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.stubGlobal('confirm', () => true);
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const urlStr = url.toString();

      if (urlStr.endsWith('/api/v1/groups') && (!init || init.method === 'GET' || !init.method)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockGroups,
        });
      }

      if (urlStr.endsWith('/api/v1/groups') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            group_id: 'grp-new',
            group_name: body.group_name,
            department: body.department,
            cadet_ids: [],
          }),
        });
      }

      if (urlStr.includes('/students/bulk-link') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        const userIds = body.user_ids || [];
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () =>
            userIds.map((uid: string) => ({
              user_id: uid,
              status: 'success',
              error: null,
            })),
        });
      }

      if (urlStr.includes('/students/') && init?.method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ message: 'Курсант успешно исключен из группы' }),
        });
      }

      if (urlStr.endsWith('/api/v1/students') && (!init || init.method === 'GET' || !init.method)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockStudents,
        });
      }

      if (urlStr.includes('/grp-1/students') && (!init || init.method === 'GET' || !init.method)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [mockStudents[0]],
        });
      }

      if (urlStr.includes('/grp-2/students') && (!init || init.method === 'GET' || !init.method)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [],
        });
      }

      if (urlStr.includes('/students') && (!init || init.method === 'GET' || !init.method)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockStudents,
        });
      }

      if (urlStr.includes('/students/csv') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            message: 'Students imported successfully',
            count: 2,
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

  it('should render group list at top and add button', async () => {
    render(<GroupsPage />);

    expect(screen.getByText(/Управление группами/i)).toBeInTheDocument();
    expect(screen.getByText(/Список групп/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Добавить группу$/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Группа 101')).toBeInTheDocument();
      expect(screen.getByText('Группа 202')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Выбрать$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Выбрана$/i })).not.toBeInTheDocument();
    });
  });

  it('should allow creating a new group without profile via modal', async () => {
    render(<GroupsPage />);

    await waitFor(() => {
      expect(screen.getByText('Группа 101')).toBeInTheDocument();
    });

    // Open creation modal
    const addBtn = screen.getByRole('button', { name: /^Добавить группу$/i });
    fireEvent.click(addBtn);

    const nameInput = screen.getByLabelText(/Название группы/i);
    const submitBtn = screen.getByRole('button', { name: /Создать группу/i });

    // Fill in form without profile
    fireEvent.change(nameInput, { target: { value: 'Тестовая Группа 303' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/успешно создана/i)).toBeInTheDocument();
      expect(screen.getByText('Тестовая Группа 303')).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/groups',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          group_name: 'Тестовая Группа 303',
        }),
      })
    );
  });

  it('should upload CSV file via modal drag and drop and call upload endpoint', async () => {
    render(<GroupsPage />);

    await waitFor(() => {
      expect(screen.getByText('Группа 101')).toBeInTheDocument();
    });

    // Open modal and switch to CSV tab
    fireEvent.click(screen.getByRole('button', { name: /^Добавить группу$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Импорт через CSV/i }));

    const dropzoneInput = screen.getByTestId('dropzone-file-input');
    const uploadBtn = screen.getByRole('button', { name: /Загрузить CSV/i });

    const file = new File(
      ['last_name,first_name,middle_name,email\nИванов,Иван,Иванович,ivanov@test.com'],
      'students.csv',
      { type: 'text/csv' }
    );

    fireEvent.change(dropzoneInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('students.csv')).toBeInTheDocument();
    });

    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(screen.getByText(/успешно импортированы/i)).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/groups\/.*\/students\/csv/),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('should handle drag and drop events properly on dropzone in modal', async () => {
    render(<GroupsPage />);

    await waitFor(() => {
      expect(screen.getByText('Группа 101')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Добавить группу$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Импорт через CSV/i }));

    const dropzone = screen.getByTestId('dropzone');
    const file = new File(
      ['last_name,first_name,middle_name,email\nПетров,Петр,Петрович,petrov@test.com'],
      'cadets.csv',
      { type: 'text/csv' }
    );

    // Simulate drag over and drop
    fireEvent.dragOver(dropzone);
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByText('cadets.csv')).toBeInTheDocument();
    });
  });

  it('should completely forbid password resets by teacher: no reset buttons or modals present', async () => {
    render(<GroupsPage />);

    await waitFor(() => {
      expect(screen.getByText('Группа 101')).toBeInTheDocument();
    });

    // Expand Group 101
    fireEvent.click(screen.getByText('Группа 101'));

    await waitFor(() => {
      expect(screen.getByText('Иванов')).toBeInTheDocument();
    });

    // Ensure NO password reset buttons exist in group composition
    expect(screen.queryByRole('button', { name: /Сбросить пароли/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Сбросить пароль/i })).not.toBeInTheDocument();

    // Switch to All students tab
    fireEvent.click(screen.getByRole('button', { name: /Все ученики/i }));

    await waitFor(() => {
      expect(screen.getByText('Иванов')).toBeInTheDocument();
    });

    // Ensure NO password reset buttons exist in All Students table
    expect(screen.queryByRole('button', { name: /Сбросить пароль/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Массовый сброс паролей/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Распечатать доступы/i)).not.toBeInTheDocument();
  });

  it('should select students from catalog and link them to group via bulk-link endpoint', async () => {
    render(<GroupsPage />);

    await waitFor(() => {
      expect(screen.getByText('Группа 101')).toBeInTheDocument();
    });

    // Expand group 101
    fireEvent.click(screen.getByText('Группа 101'));

    // Find and click "Выбрать из каталога" button
    const openCatalogBtn = await screen.findByRole('button', { name: /Выбрать из каталога/i });
    fireEvent.click(openCatalogBtn);

    // Catalog modal should open
    await waitFor(() => {
      expect(screen.getByText(/Выбор курсантов из каталога/i)).toBeInTheDocument();
      expect(screen.getByText(/Целевая группа: Группа 101/i)).toBeInTheDocument();
    });

    // Verify search input is present in modal
    const searchInput = screen.getByPlaceholderText(/Поиск курсантов по ФИО, логину или email.../i);
    expect(searchInput).toBeInTheDocument();

    // In catalog, cadet-1 should show "Уже в этой группе"
    expect(screen.getByText(/Уже в этой группе/i)).toBeInTheDocument();

    // In catalog, cadet-2 (Петров) is available ("Без группы")
    expect(screen.getByText(/^Без группы$/i)).toBeInTheDocument();

    // Select cadet-2 checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    // Find the enabled checkbox for cadet-2
    const availableCheckboxes = checkboxes.filter((cb) => !(cb as HTMLInputElement).disabled);
    expect(availableCheckboxes.length).toBeGreaterThan(0);
    fireEvent.click(availableCheckboxes[availableCheckboxes.length - 1]);

    // Submit button should show count: "Добавить в группу (1)"
    const addSubmitBtn = screen.getByRole('button', { name: /Добавить в группу \(1\)/i });
    fireEvent.click(addSubmitBtn);

    // Should call POST /api/v1/groups/grp-1/students/bulk-link
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/groups/grp-1/students/bulk-link',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ user_ids: ['cadet-2'] }),
        })
      );
      expect(screen.getByText(/Курсанты успешно добавлены в группу/i)).toBeInTheDocument();
    });
  });

  it('should remove student from group with confirmation dialog warning about preserved account and history', async () => {
    render(<GroupsPage />);

    await waitFor(() => {
      expect(screen.getByText('Группа 101')).toBeInTheDocument();
    });

    // Expand group 101
    fireEvent.click(screen.getByText('Группа 101'));

    await waitFor(() => {
      expect(screen.getByText('Иванов')).toBeInTheDocument();
    });

    // Click remove button (trash icon)
    const removeBtn = screen.getByTitle('Исключить из группы');
    fireEvent.click(removeBtn);

    // Confirmation modal should appear with required warning message
    await waitFor(() => {
      expect(screen.getByText('Исключение из группы')).toBeInTheDocument();
      expect(
        screen.getByText(/Ученик будет исключен из группы, но его учетная запись и история результатов сохранятся/i)
      ).toBeInTheDocument();
    });

    // Confirm removal
    const confirmBtn = screen.getByRole('button', { name: /^Исключить из группы$/i });
    fireEvent.click(confirmBtn);

    // Should call DELETE /api/v1/groups/grp-1/students/cadet-1
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/groups/grp-1/students/cadet-1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      expect(screen.getByText(/Ученик успешно исключен из группы/i)).toBeInTheDocument();
    });
  });

  it('should render all students tab with registration date, groups, and status', async () => {
    render(<GroupsPage />);

    // Switch to All students tab
    fireEvent.click(screen.getByRole('button', { name: /Все ученики/i }));

    await waitFor(() => {
      expect(screen.getByText('Фамилия')).toBeInTheDocument();
      expect(screen.getByText('Имя')).toBeInTheDocument();
      expect(screen.getByText('Отчество')).toBeInTheDocument();
      expect(screen.getByText('Дата регистрации')).toBeInTheDocument();
      expect(screen.getByText('Статус')).toBeInTheDocument();
      expect(screen.getByText('Иванов')).toBeInTheDocument();
      expect(screen.getByText('Петров')).toBeInTheDocument();
      expect(screen.getAllByText('Активен').length).toBeGreaterThan(0);
    });
  });

  it('should filter students by group with "Все группы" selected by default (TZ 34)', async () => {
    render(<GroupsPage />);

    // Switch to All students tab
    fireEvent.click(screen.getByRole('button', { name: /Все ученики/i }));

    await waitFor(() => {
      expect(screen.getByText('Иванов')).toBeInTheDocument();
      expect(screen.getByText('Петров')).toBeInTheDocument();
    });

    // Check group filter select default value
    const groupSelect = screen.getAllByRole('combobox').find((select) => {
      return (select as HTMLSelectElement).value === '';
    }) as HTMLSelectElement;

    expect(groupSelect).toBeDefined();
    expect(groupSelect.value).toBe('');

    // Filter by group 101
    fireEvent.change(groupSelect, { target: { value: 'grp-1' } });

    await waitFor(() => {
      expect(screen.getByText('Иванов')).toBeInTheDocument();
    });

    // Filter by group 202 (has no matching mock students in mock list)
    fireEvent.change(groupSelect, { target: { value: 'grp-2' } });

    await waitFor(() => {
      expect(screen.getByText('Ученики не найдены')).toBeInTheDocument();
    });
  });
});
