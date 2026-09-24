import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import GroupsPage from '@/app/teacher/groups/page';

describe('27.1: Управление группами', () => {
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

      if (urlStr.endsWith('/api/v1/groups') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            group_id: 'grp-new',
            group_name: body.group_name,
            profile: body.profile,
            department: body.department,
            cadet_ids: [],
          }),
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

  it('should render group list and creation form', async () => {
    render(<GroupsPage />);

    expect(screen.getByText(/Управление группами/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /профиль/i })).toBeInTheDocument();
    expect(screen.getByText(/drag/i)).toBeInTheDocument(); // Зона drag-and-drop

    // Wait for the groups to load
    await waitFor(() => {
      expect(screen.getByText('Группа 101')).toBeInTheDocument();
      expect(screen.getByText('Группа 202')).toBeInTheDocument();
    });
  });

  it('should allow creating a new group with profile OPERATOR_112 or DISPATCHER_DDS', async () => {
    render(<GroupsPage />);

    const nameInput = screen.getByLabelText(/Название группы/i);
    const profileSelect = screen.getByRole('combobox', { name: /профиль/i });
    const submitBtn = screen.getByRole('button', { name: /Создать группу/i });

    // Fill in form
    fireEvent.change(nameInput, { target: { value: 'Тестовая Группа 303' } });
    fireEvent.change(profileSelect, { target: { value: 'DISPATCHER_DDS' } });

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
          profile: 'DISPATCHER_DDS',
        }),
      })
    );
  });

  it('should upload CSV file via drag and drop and call upload endpoint', async () => {
    render(<GroupsPage />);

    await waitFor(() => {
      expect(screen.getByText('Группа 101')).toBeInTheDocument();
    });

    const dropzoneInput = screen.getByTestId('dropzone-file-input');
    const uploadBtn = screen.getByRole('button', { name: /Загрузить CSV/i });

    const file = new File(['first_name,last_name,email\nИван,Иванов,ivan@test.com'], 'students.csv', {
      type: 'text/csv',
    });

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

  it('should handle drag and drop events properly on dropzone', async () => {
    render(<GroupsPage />);

    await waitFor(() => {
      expect(screen.getByText('Группа 101')).toBeInTheDocument();
    });

    const dropzone = screen.getByTestId('dropzone');
    const file = new File(['first_name,last_name,email\nПетр,Петров,petr@test.com'], 'cadets.csv', {
      type: 'text/csv',
    });

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
});
