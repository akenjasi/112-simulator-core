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
      cadet_ids: ['cadet-1', 'cadet-2'],
    },
    {
      group_id: 'grp-2',
      group_name: 'Группа 202',
      department: 'Диспетчерская служба',
      cadet_ids: ['cadet-3'],
    },
  ];

  const mockStudents = [
    {
      user_id: 'cadet-1',
      username: 'ivanov@test.com',
      full_name: 'Иванов Иван Иванович',
      role: 'CADET',
      groups: ['Группа 101'],
    },
    {
      user_id: 'cadet-2',
      username: 'petrov@test.com',
      full_name: 'Петров Петр Петрович',
      role: 'CADET',
      groups: ['Группа 101'],
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

      if (urlStr.endsWith('/api/v1/students') && (!init || init.method === 'GET' || !init.method)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockStudents,
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

      if (urlStr.includes('/reset-passwords') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            { user_id: 'cadet-1', fio: 'Иванов Иван Иванович', email: 'ivanov@test.com', new_password: '12345' },
            { user_id: 'cadet-2', fio: 'Петров Петр Петрович', email: 'petrov@test.com', new_password: '67890' },
          ],
        });
      }

      if (urlStr.includes('/reset-password') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            user_id: 'cadet-1',
            fio: 'Иванов Иван Иванович',
            email: 'ivanov@test.com',
            new_password: '54321',
            message: 'Пароль успешно сброшен',
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

    // Verify there is no 'Выбрать' button in groups list (TZ 34)
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

  it('should reset single student password with confirmation modal and display 5-digit code in modal (TZ 34)', async () => {
    render(<GroupsPage />);

    await waitFor(() => {
      expect(screen.getByText('Группа 101')).toBeInTheDocument();
    });

    // Switch to All students tab
    fireEvent.click(screen.getByRole('button', { name: /Все ученики/i }));

    // Verify split FIO columns and localized role (TZ 34)
    await waitFor(() => {
      expect(screen.getByText('Фамилия')).toBeInTheDocument();
      expect(screen.getByText('Имя')).toBeInTheDocument();
      expect(screen.getByText('Отчество')).toBeInTheDocument();
      expect(screen.getByText('Иванов')).toBeInTheDocument();
      expect(screen.getByText('Иван')).toBeInTheDocument();
      expect(screen.getByText('Иванович')).toBeInTheDocument();
      expect(screen.getAllByText('Группа 101').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Ученик').length).toBeGreaterThan(0);
      expect(screen.queryByText('CADET')).not.toBeInTheDocument();
    });

    // Click reset password
    const resetButtons = screen.getAllByRole('button', { name: /Сбросить пароль/i });
    fireEvent.click(resetButtons[0]);

    // Confirmation modal should appear (TZ 34)
    await waitFor(() => {
      expect(screen.getByText('Требуется подтверждение действия')).toBeInTheDocument();
      expect(screen.getByText(/Вы действительно хотите сбросить пароль для ученика/i)).toBeInTheDocument();
    });

    // Confirm password reset inside modal
    const confirmButtons = screen.getAllByRole('button', { name: /Сбросить пароль/i });
    // Find the one in the modal dialog (with amber style)
    const modalConfirmBtn = confirmButtons.find((btn) => btn.className.includes('bg-amber-600')) || confirmButtons[confirmButtons.length - 1];
    fireEvent.click(modalConfirmBtn);

    // Code modal should appear with 5-digit password
    await waitFor(() => {
      expect(screen.getByText('Пароль успешно сброшен')).toBeInTheDocument();
      expect(screen.getByText('54321')).toBeInTheDocument();
    });
  });

  it('should reset group passwords with confirmation modal and show print accesses modal (TZ 34)', async () => {
    render(<GroupsPage />);

    await waitFor(() => {
      expect(screen.getByText('Группа 101')).toBeInTheDocument();
    });

    // Expand group 101
    fireEvent.click(screen.getByText('Группа 101'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Сбросить пароли всей группе/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Сбросить пароли всей группе/i }));

    // Group confirmation modal should appear (TZ 34)
    await waitFor(() => {
      expect(screen.getByText(/Массовый сброс паролей/i)).toBeInTheDocument();
      expect(screen.getByText(/Вы действительно хотите сбросить пароли всем ученикам группы/i)).toBeInTheDocument();
    });

    // Confirm group reset
    const confirmGroupBtn = screen.getByRole('button', { name: /^Сбросить пароли$/i });
    fireEvent.click(confirmGroupBtn);

    await waitFor(() => {
      expect(screen.getByText(/Доступы группы: Группа 101/i)).toBeInTheDocument();
      expect(screen.getByText('12345')).toBeInTheDocument();
      expect(screen.getByText('67890')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Распечатать доступы/i })).toBeInTheDocument();
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
      expect(screen.getByText('Петров')).toBeInTheDocument();
    });

    // Filter by group 202 (has no matching mock students in mock list)
    fireEvent.change(groupSelect, { target: { value: 'grp-2' } });

    await waitFor(() => {
      expect(screen.getByText('Ученики не найдены')).toBeInTheDocument();
    });
  });
});
