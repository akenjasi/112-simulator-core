import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TicketsPage from '@/app/teacher/tickets/page';

describe('27.2 / ТЗ 30: База билетов и генерация', () => {
  const mockTickets = [
    {
      id: 't-11111111-aaaa-bbbb-cccc-111111111111',
      ticket_id: 't-11111111-aaaa-bbbb-cccc-111111111111',
      category: 'Оказание медицинской скорой и неотложной помощи',
      subcategory: 'Сердечный приступ',
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
      created_at: '2026-09-24T18:00:00Z',
    },
    {
      id: 't-22222222-aaaa-bbbb-cccc-222222222222',
      ticket_id: 't-22222222-aaaa-bbbb-cccc-222222222222',
      category: 'Запах газа',
      subcategory: 'Запах газа в подъезде',
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
      created_at: '2026-09-24T18:30:00Z',
    },
    {
      id: 't-33333333-aaaa-bbbb-cccc-333333333333',
      ticket_id: 't-33333333-aaaa-bbbb-cccc-333333333333',
      category: 'ДТП',
      subcategory: 'Лобовое столкновение',
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
      created_at: '2026-09-24T19:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const urlStr = url.toString();

      if (urlStr.includes('/api/v1/tickets') && (!init || init.method === 'GET' || !init.method)) {
        if (urlStr.includes('category=%D0%92%D0%B7%D1%80%D1%8B%D0%B2%D1%8B') || urlStr.includes('category=Взрывы')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [],
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockTickets,
        });
      }

      if (urlStr.includes('/api/v1/tickets/generate') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        const count = body.count || 10;
        const generated = Array.from({ length: count }, (_, i) => ({
          ticket_id: `t-gen-${i + 1}-uuid`,
          category: body.category || 'Пожары и задымления',
          subcategory: body.subcategory || null,
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
          created_at: '2026-09-24T20:00:00Z',
        }));

        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => generated,
        });
      }

      if (urlStr.includes('/api/v1/tickets/approve') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            message: 'Пакет билетов успешно утвержден',
            approved_count: mockTickets.length,
          }),
        });
      }

      if (urlStr.includes('/audio')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          blob: async () => new Blob(['fake-audio'], { type: 'audio/wav' }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    }));

    global.Audio = vi.fn().mockImplementation(() => ({
      play: vi.fn().mockImplementation(function (this: any) {
        if (this.onplay) this.onplay();
        return Promise.resolve();
      }),
      pause: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as any;
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/fake-audio');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render table with required columns (ID, Категория, Подкатегория, Сложность, Дата создания, Действия) and without plot text or listen column', async () => {
    render(<TicketsPage />);

    expect(screen.getByRole('heading', { name: /База билетов/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: /^ID$/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /Название \/ Категория/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /^Подкатегория$/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /^Сложность$/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /^Дата создания$/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /^Действия$/i })).toBeInTheDocument();

      // "Прослушать" column must NOT be in the main table (ТЗ 35)
      expect(screen.queryByRole('columnheader', { name: /^Прослушать$/i })).not.toBeInTheDocument();

      // Only category names in the category column, NOT plot text (ТЗ 35)
      const table = screen.getByRole('table');
      expect(table).toHaveTextContent('Оказание медицинской скорой и неотложной помощи');
      expect(table).toHaveTextContent('Запах газа');
      expect(table).toHaveTextContent('ДТП');
      expect(table).not.toHaveTextContent('Срочно требуется скорая помощь');
    });

    // Check visual complexity badges: 1, 2, 3
    expect(screen.getByTestId('complexity-badge-1')).toHaveTextContent('1');
    expect(screen.getByTestId('complexity-badge-2')).toHaveTextContent('2');
    expect(screen.getByTestId('complexity-badge-3')).toHaveTextContent('3');
  });

  it('should support local search over tickets by display_id', async () => {
    render(<TicketsPage />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toHaveTextContent('ДТП');
    });

    // Check search input exists
    const searchInput = screen.getByPlaceholderText(/Поиск по ID/i);
    expect(searchInput).toBeInTheDocument();

    // The third ticket is ДТП / Лобовое столкновение -> display_id includes "Д_Л"
    fireEvent.change(searchInput, { target: { value: 'Д_Л' } });

    // Only DTP ticket should remain in the table
    const table = screen.getByRole('table');
    expect(table).toHaveTextContent('ДТП');
    expect(table).not.toHaveTextContent('Запах газа');
    expect(table).not.toHaveTextContent('Оказание медицинской скорой');
  });

  it('should render filter panel with Category, Subcategory, Complexity and filter tickets', async () => {
    render(<TicketsPage />);

    expect(screen.getByRole('combobox', { name: /^Категория$/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^Подкатегория$/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^Сложность$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Применить фильтр/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Сбросить фильтры/i })).toBeInTheDocument();

    const categorySelect = screen.getByRole('combobox', { name: /^Категория$/i });
    fireEvent.change(categorySelect, { target: { value: 'ДТП' } });

    const applyBtn = screen.getByRole('button', { name: /Применить фильтр/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('category=%D0%94%D0%A2%D0%9F')
      );
    });
  });

  it('should support "Smart generation" UX when table is empty for a filter', async () => {
    render(<TicketsPage />);

    const categorySelect = screen.getByRole('combobox', { name: /^Категория$/i });
    fireEvent.change(categorySelect, { target: { value: 'Взрывы' } });

    const applyBtn = screen.getByRole('button', { name: /Применить фильтр/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(screen.getByText(/Билеты не найдены/i)).toBeInTheDocument();
    });

    // Click "Сгенерировать «Взрывы»" button in empty state
    const smartGenBtn = screen.getByRole('button', { name: /Сгенерировать «Взрывы»/i });
    fireEvent.click(smartGenBtn);

    // Modal opens with category pre-filled
    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Генерация билетов/i })).toBeInTheDocument();
    });

    const modalCategorySelect = screen.getAllByRole('combobox', { name: /^Категория$/i })[1] as HTMLSelectElement;
    expect(modalCategorySelect.value).toBe('Взрывы');
  });

  it('should open generation modal and allow quick select buttons (1, 5, 10, 20) with ~30 сек/билет calculation', async () => {
    render(<TicketsPage />);

    const genBtn = screen.getByRole('button', { name: /Сгенерировать/i });
    fireEvent.click(genBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const countInput = screen.getByRole('spinbutton', { name: /Количество/i }) as HTMLInputElement;
    expect(countInput.value).toBe('10');

    // Quick select buttons: 1, 5, 10, 20 (ТЗ 35)
    expect(screen.getByRole('button', { name: /^1$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^5$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^10$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^20$/i })).toBeInTheDocument();

    // Verify ~30 сек расчет времени
    expect(screen.getAllByText(/~30 сек на 1 билет/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /^5$/i }));
    expect(countInput.value).toBe('5');

    fireEvent.click(screen.getByRole('button', { name: /^20$/i }));
    expect(countInput.value).toBe('20');

    fireEvent.click(screen.getByRole('button', { name: /^1$/i }));
    expect(countInput.value).toBe('1');
  });

  it('should start generation, display real-time banner with estimated time, poll server, and show success', async () => {
    render(<TicketsPage />);

    // Open modal
    const genBtn = screen.getByRole('button', { name: /Сгенерировать/i });
    fireEvent.click(genBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const countInput = screen.getByRole('spinbutton', { name: /Количество/i });
    fireEvent.change(countInput, { target: { value: '2' } });

    // Submit generation
    const submitBtn = screen.getAllByRole('button', { name: /Сгенерировать/i }).pop()!;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Сгенерировано 2 билетов/i)).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/tickets/generate',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('should open details modal with plot, and allow audio playback in details', async () => {
    render(<TicketsPage />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toHaveTextContent('Оказание медицинской скорой и неотложной помощи');
    });

    // Click details button for first ticket
    const detailButtons = screen.getAllByRole('button', { name: /Детали/i });
    fireEvent.click(detailButtons[0]);

    // Check modal content (plot is shown inside details modal)
    await waitFor(() => {
      const modal = screen.getByRole('dialog');
      expect(modal).toBeInTheDocument();
      expect(screen.getByText(/Срочно требуется скорая помощь/i)).toBeInTheDocument();
      expect(screen.getByText(/\+79001112233/i)).toBeInTheDocument();
      expect(screen.getByText(/ул\. Тверская/i)).toBeInTheDocument();
    });

    // Click audio playback inside details modal (ТЗ 35: прослушать можно только в деталях)
    const audioBtn = screen.getByRole('button', { name: /Прослушать аудио/i });
    expect(audioBtn).toBeInTheDocument();
    fireEvent.click(audioBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/tickets\/.*\/audio/)
      );
    });

    // Close modal
    const closeBtns = screen.getAllByRole('button', { name: /Закрыть/i });
    fireEvent.click(closeBtns[0]);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('should allow deleting ticket immediately WITHOUT confirmation modal (ТЗ 35)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');

    render(<TicketsPage />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toHaveTextContent('Оказание медицинской скорой и неотложной помощи');
    });

    const deleteButtons = screen.getAllByRole('button', { name: /Удалить билет/i });
    expect(deleteButtons.length).toBeGreaterThan(0);

    fireEvent.click(deleteButtons[0]);

    // ТЗ 35: Удаление должно происходить сразу, БЕЗ вызова window.confirm
    expect(confirmSpy).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/tickets\/t-11111111-aaaa-bbbb-cccc-111111111111/),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});

