import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AnalyticsPage from '@/app/teacher/analytics/page';
import { SplitScreen, RecordDetail } from '@/components/teacher/split-screen';

describe('27.5: Пост-аналитика и Апелляция', () => {
  const mockSessionData = {
    session_id: 'session-test-100',
    title: 'Тестовая сессия разбора',
    cadets: [
      {
        cadet_id: 'cadet-01',
        cadet_name: 'Иванов Иван Алексеевич',
        success_rate: 50,
        records: [
          {
            record_id: 'rec-test-1',
            ticket_id: 'ticket-42',
            title: 'Билет №42: ДТП на Ленина',
            status: 'failed',
            score: 50,
            is_appealed: false,
            errors_count: 2,
            etalon: {
              address: 'ул. Ленина, д. 15',
              incident_type: 'ДТП',
              services: ['01', '02', '03'],
            },
            student_answer: {
              address: 'ул. Лермонтова, д. 15',
              incident_type: 'ДТП',
              services: ['02'],
            },
            error_details: [
              {
                field: 'address',
                severity: 'error',
                message: 'Неверный адрес',
              },
              {
                field: 'services',
                severity: 'warning',
                message: 'Не все службы вызваны',
              },
            ],
          },
          {
            record_id: 'rec-test-2',
            ticket_id: 'ticket-10',
            title: 'Билет №10: Запах газа',
            status: 'passed',
            score: 100,
            is_appealed: false,
            errors_count: 0,
            etalon: {
              address: 'пр. Мира, д. 8',
              incident_type: 'Утечка газа',
              services: ['04'],
            },
            student_answer: {
              address: 'пр. Мира, д. 8',
              incident_type: 'Утечка газа',
              services: ['04'],
            },
            error_details: [],
          },
        ],
      },
      {
        cadet_id: 'cadet-02',
        cadet_name: 'Петрова Анна Сергеевна',
        success_rate: 100,
        records: [
          {
            record_id: 'rec-test-3',
            ticket_id: 'ticket-05',
            title: 'Билет №05: Возгорание',
            status: 'passed',
            score: 100,
            is_appealed: false,
            errors_count: 0,
            etalon: {
              address: 'ул. Садовая, д. 4',
              services: ['01'],
            },
            student_answer: {
              address: 'ул. Садовая, д. 4',
              services: ['01'],
            },
            error_details: [],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        const urlStr = url.toString();

        // GET session analytics
        if (urlStr.includes('/api/v1/analytics/sessions') && (!init || init.method === 'GET' || !init.method)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockSessionData,
          });
        }

        // GET record details
        if (urlStr.includes('/api/v1/analytics/records/') && !urlStr.endsWith('/appeal') && (!init || init.method === 'GET' || !init.method)) {
          const rec = mockSessionData.cadets[0].records[0];
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              ...rec,
              cadet_name: 'Иванов Иван Алексеевич',
            }),
          });
        }

        // PATCH record appeal
        if (urlStr.includes('/appeal') && init?.method === 'PATCH') {
          const body = JSON.parse(init.body as string);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              record_id: 'rec-test-1',
              status: body.status,
              teacher_comment: body.comment,
              is_appealed: true,
            }),
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

  it('should render split screen and appeal button', async () => {
    render(<AnalyticsPage />);
    expect(screen.getByRole('button', { name: /Изменить оценку/i })).toBeInTheDocument();
    expect(screen.getByText(/Эталон/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Иванов Иван Алексеевич')).toBeInTheDocument();
    });
  });

  it('should render cadets list with success rates', async () => {
    render(<AnalyticsPage />);

    expect(screen.getByText(/Детализация по курсантам/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Иванов Иван Алексеевич')).toBeInTheDocument();
      expect(screen.getByText(/50% успеха/i)).toBeInTheDocument();
      expect(screen.getByText('Петрова Анна Сергеевна')).toBeInTheDocument();
      expect(screen.getByText(/100% успеха/i)).toBeInTheDocument();
    });
  });

  it('should render split-screen with dual columns and highlight errors in red or yellow', async () => {
    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('split-screen-columns')).toBeInTheDocument();
    });

    // Check dual columns
    expect(screen.getByText(/Эталон/i)).toBeInTheDocument();
    expect(screen.getByText(/Ввод курсанта/i)).toBeInTheDocument();

    // Check error highlighting on student fields
    const addressField = screen.getByTestId('student-field-address');
    expect(addressField).toHaveAttribute('data-severity', 'error');
    expect(addressField.className).toMatch(/border-red-500|text-red/);

    const servicesField = screen.getByTestId('student-field-services');
    expect(servicesField).toHaveAttribute('data-severity', 'warning');
    expect(servicesField.className).toMatch(/border-yellow-500|text-yellow/);

    // Check error details section
    expect(screen.getByTestId('error-details-section')).toBeInTheDocument();
    expect(screen.getAllByText(/Неверный адрес/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Не все службы вызваны/i).length).toBeGreaterThan(0);
  });

  it('should open appeal modal with Textarea when clicking Изменить оценку and send PATCH request', async () => {
    render(<AnalyticsPage />);

    const appealBtn = screen.getByRole('button', { name: /Изменить оценку/i });
    fireEvent.click(appealBtn);

    // Verify modal is open
    expect(screen.getByTestId('appeal-modal')).toBeInTheDocument();
    expect(screen.getByText(/Апелляция: Изменение оценки/i)).toBeInTheDocument();

    // Verify textarea is present
    const commentInput = screen.getByLabelText(/Комментарий преподавателя/i);
    expect(commentInput).toBeInTheDocument();
    expect(commentInput.tagName.toLowerCase()).toBe('textarea');

    // Fill in comment
    fireEvent.change(commentInput, { target: { value: 'Опечатка в адресе, курсант исправил устно' } });

    // Click Save
    const saveBtn = screen.getByRole('button', { name: /Сохранить/i });
    fireEvent.click(saveBtn);

    // Verify PATCH request
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/analytics\/records\/.*\/appeal/),
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            status: 'passed',
            comment: 'Опечатка в адресе, курсант исправил устно',
          }),
        })
      );
    });

    // Check success notification and updated badge
    await waitFor(() => {
      expect(screen.getByText(/Оценка успешно обновлена/i)).toBeInTheDocument();
    });
  });

  it('should render SplitScreen component independently', () => {
    const mockRecord: RecordDetail = {
      record_id: 'rec-custom-1',
      title: 'Билет #99: Пожар',
      status: 'failed',
      score: 40,
      etalon: {
        address: 'Невский пр., 1',
        service: '01',
      },
      student_answer: {
        address: 'Невский пр., 10',
        service: '02',
      },
      error_details: [
        {
          field: 'address',
          severity: 'error',
          message: 'Ошибка в номере дома',
        },
      ],
    };

    render(<SplitScreen record={mockRecord} />);

    expect(screen.getByText(/Эталон/i)).toBeInTheDocument();
    expect(screen.getByText(/Ввод курсанта/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Изменить оценку/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Ошибка в номере дома/i).length).toBeGreaterThan(0);
  });
});
