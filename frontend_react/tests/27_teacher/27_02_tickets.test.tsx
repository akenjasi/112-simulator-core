import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TicketsPage from '@/app/teacher/tickets/page';

describe('27.2: База билетов', () => {
  const mockTickets = [
    {
      ticket_id: 't-11111111-aaaa-bbbb-cccc-111111111111',
      complexity: 1,
      plot: 'Срочно требуется скорая помощь! Человеку плохо с сердцем.',
      etalon_services: ['03'],
      ground_truth: {
        fio: 'Иванов Иван Иванович',
        phone: '+79001112233',
        street: 'Тверская',
        house: '12',
        city: 'Москва',
      },
      status: 'draft',
    },
    {
      ticket_id: 't-22222222-aaaa-bbbb-cccc-222222222222',
      complexity: 2,
      plot: 'Утечка газа в подъезде жилого дома, сильный запах!',
      etalon_services: ['04', '01'],
      ground_truth: {
        fio: 'Петров Петр Петрович',
        phone: '+79002223344',
        street: 'Арбат',
        house: '5',
        city: 'Москва',
      },
      status: 'draft',
    },
    {
      ticket_id: 't-33333333-aaaa-bbbb-cccc-333333333333',
      complexity: 3,
      plot: 'Лобовое ДТП с возгоранием и заблокированными людьми!',
      etalon_services: ['01', '02', '03'],
      ground_truth: {
        fio: 'Сидоров Сидор Сидорович',
        phone: '+79003334455',
        street: 'Ленинский проспект',
        house: '42',
        city: 'Москва',
      },
      status: 'draft',
    },
  ];

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const urlStr = url.toString();

      if (urlStr.endsWith('/api/v1/tickets') && (!init || init.method === 'GET' || !init.method)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockTickets,
        });
      }

      if (urlStr.endsWith('/api/v1/tickets/generate') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        const count = body.count || 50;
        const generated = Array.from({ length: count }, (_, i) => ({
          ticket_id: `t-gen-${i + 1}-uuid`,
          complexity: (i % 3) + 1,
          plot: `Сгенерированный инцидент #${i + 1}`,
          etalon_services: ['01', '02'],
          ground_truth: {
            fio: `Курсант Тестовый ${i + 1}`,
            phone: `+7900000000${i % 10}`,
            street: 'Мира',
            house: `${i + 1}`,
          },
          status: 'draft',
        }));

        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => generated,
        });
      }

      if (urlStr.endsWith('/api/v1/tickets/approve') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            message: 'Пакет билетов успешно утвержден',
            approved_count: mockTickets.length,
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

  it('should render generate button and input', async () => {
    render(<TicketsPage />);
    expect(screen.getByRole('button', { name: /Сгенерировать пакет/i })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /Количество/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Срочно требуется скорая помощь/i)).toBeInTheDocument();
    });
  });

  it('should have default value 50 for count input', async () => {
    render(<TicketsPage />);
    const input = screen.getByRole('spinbutton', { name: /Количество/i }) as HTMLInputElement;
    expect(input.value).toBe('50');
    await waitFor(() => {
      expect(screen.getByText(/Срочно требуется скорая помощь/i)).toBeInTheDocument();
    });
  });

  it('should display list of tickets and complexity badges', async () => {
    render(<TicketsPage />);

    // Wait for the tickets to load
    await waitFor(() => {
      expect(screen.getByText(/Срочно требуется скорая помощь/i)).toBeInTheDocument();
      expect(screen.getByText(/Утечка газа в подъезде/i)).toBeInTheDocument();
      expect(screen.getByText(/Лобовое ДТП с возгоранием/i)).toBeInTheDocument();
    });

    // Check visual complexity badges: 1 (Green), 2 (Yellow), 3 (Red)
    expect(screen.getByTestId('complexity-badge-1')).toBeInTheDocument();
    expect(screen.getByTestId('complexity-badge-2')).toBeInTheDocument();
    expect(screen.getByTestId('complexity-badge-3')).toBeInTheDocument();

    expect(screen.getByTestId('complexity-badge-1')).toHaveTextContent(/Сложность 1/i);
    expect(screen.getByTestId('complexity-badge-2')).toHaveTextContent(/Сложность 2/i);
    expect(screen.getByTestId('complexity-badge-3')).toHaveTextContent(/Сложность 3/i);
  });

  it('should generate tickets when clicking generate button with specified count', async () => {
    render(<TicketsPage />);

    const countInput = screen.getByRole('spinbutton', { name: /Количество/i });
    const generateBtn = screen.getByRole('button', { name: /Сгенерировать пакет/i });

    // Change count to 25
    fireEvent.change(countInput, { target: { value: '25' } });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText(/успешно сгенерирован/i)).toBeInTheDocument();
      expect(screen.getByText('Сгенерированный инцидент #1')).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/tickets/generate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ count: 25 }),
      })
    );
  });

  it('should open and close ticket details modal', async () => {
    render(<TicketsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Срочно требуется скорая помощь/i)).toBeInTheDocument();
    });

    // Click details button for first ticket
    const detailButtons = screen.getAllByRole('button', { name: /Детали/i });
    fireEvent.click(detailButtons[0]);

    // Check modal content
    await waitFor(() => {
      const modal = screen.getByRole('dialog');
      expect(modal).toBeInTheDocument();
      expect(screen.getByText(/\+79001112233/i)).toBeInTheDocument();
      expect(screen.getByText(/ул\. Тверская/i)).toBeInTheDocument();
    });

    // Close modal
    const closeBtns = screen.getAllByRole('button', { name: /Закрыть/i });
    fireEvent.click(closeBtns[0]);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('should handle package approval when clicking approve button', async () => {
    render(<TicketsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Срочно требуется скорая помощь/i)).toBeInTheDocument();
    });

    const approveBtn = screen.getByRole('button', { name: /Утвердить пакет/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Пакет билетов успешно утвержден/i)).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/tickets/approve',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });
});
