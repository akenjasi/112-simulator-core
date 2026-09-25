import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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

      if (urlStr.includes('/api/tickets/') && init?.method === 'PATCH') {
        const body = JSON.parse(init.body as string);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            ...mockTickets[0],
            ...body,
            display_id: 'ОМ_СП_1_MODIFIED',
          }),
        });
      }

      if (urlStr.includes('/api/classifier/categories')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            'Пожары и задымления',
            'ДТП',
            'Запах газа',
            'Оказание медицинской скорой и неотложной помощи',
            'Нарушение правопорядка',
            'Взрывы',
          ],
        });
      }

      if (urlStr.includes('/api/classifier/subcategories')) {
        if (urlStr.includes('category=%D0%94%D0%A2%D0%9F') || urlStr.includes('category=ДТП')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => [
              'Лобовое столкновение',
              'Дорожно-транспортные происшествия с пострадавшими',
              'Наезд на пешехода',
            ],
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            'Пожар в квартире',
            'Пожар в жилом секторе',
            'Задымление в подъезде',
          ],
        });
      }

      if (urlStr.includes('/api/classifier/services')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            '01',
            '02',
            '03',
            '04',
            'Служба 101',
            'Служба 102',
            'Служба 103',
            'Служба 104',
            'ЦОДД',
            'ЦЭМП',
            'Мосводоканал',
            'Росгвардия',
          ],
        });
      }

      if (urlStr.includes('/api/classifier/details')) {
        if (urlStr.includes('%D0%9E%D0%BA%D0%B0%D0%B7%D0%B0%D0%BD%D0%B8%D0%B5') || urlStr.includes('Оказание')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              services: ['03', '03 Скорая'],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            services: ['01 Пожарные', '02 Полиция', 'ФСБ', 'ЦОДД'],
          }),
        });
      }

      if (urlStr.includes('/api/generator/address')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            city: 'Москва',
            street: 'Лесная улица',
            house: '15к2',
            apartment: '45',
            floor: '4',
            entrance: '2',
            intercom: '45#',
            lat: 55.75,
            lon: 37.61,
            full_address: 'Москва, Лесная улица, 15к2',
          }),
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
    await waitFor(() => {
      expect(categorySelect).toHaveTextContent('ДТП');
    });

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
    await waitFor(() => {
      expect(categorySelect).toHaveTextContent('Взрывы');
    });

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

  it('ТЗ 36.1: should allow editing ticket fields in details modal and saving via PATCH', async () => {
    render(<TicketsPage />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toHaveTextContent('Оказание медицинской скорой и неотложной помощи');
    });

    // Open Details modal
    const detailButtons = screen.getAllByRole('button', { name: /Детали/i });
    fireEvent.click(detailButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Click "Редактировать"
    const editBtns = screen.getAllByRole('button', { name: /Редактировать/i });
    fireEvent.click(editBtns[0]);

    // Edit plot textarea
    const plotTextarea = screen.getByRole('textbox', { name: /Фабула вызова/i });
    expect(plotTextarea).toBeInTheDocument();
    fireEvent.change(plotTextarea, { target: { value: 'Обновленная фабула вызова скорой помощи!' } });

    // Edit FIO and phone
    const fioInput = screen.getByRole('textbox', { name: /ФИО заявителя/i });
    fireEvent.change(fioInput, { target: { value: 'Кузнецов Алексей Петрович' } });

    const phoneInput = screen.getByRole('textbox', { name: /Телефон заявителя/i });
    fireEvent.change(phoneInput, { target: { value: '+79998887766' } });

    // Toggle service: Add 01 Пожарные
    const addFireBtn = screen.getByRole('button', { name: /01 Пожарные/i });
    fireEvent.click(addFireBtn);

    // Change complexity: click Level 2
    const comp2Btn = screen.getByRole('button', { name: /Сложность 2/i });
    fireEvent.click(comp2Btn);

    // Click "Сохранить"
    const saveBtn = screen.getByRole('button', { name: /Сохранить/i });
    fireEvent.click(saveBtn);

    // Verify PATCH was called
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/tickets\/t-11111111-aaaa-bbbb-cccc-111111111111/),
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    // Check saved state rendered
    await waitFor(() => {
      expect(screen.getByText(/Изменения сохранены!/i)).toBeInTheDocument();
    });
  });

  it('ТЗ 36.2: should NOT render factoids block in details modal', async () => {
    render(<TicketsPage />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toHaveTextContent('Запах газа');
    });

    // Open details
    const detailButtons = screen.getAllByRole('button', { name: /Детали/i });
    fireEvent.click(detailButtons[1]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Ensure factoids block is absent
    expect(screen.queryByText(/Дополнительные фактоиды/i)).not.toBeInTheDocument();
  });

  it('ТЗ 36.3: should place Search by ID inside filter card and center complexity column', async () => {
    render(<TicketsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /База билетов/i })).toBeInTheDocument();
    });

    // Search by ID should be inside the filter form alongside Category, Subcategory, Complexity
    const searchInput = screen.getByPlaceholderText(/Поиск по ID билета/i);
    expect(searchInput).toBeInTheDocument();

    const categorySelect = screen.getByRole('combobox', { name: /^Категория$/i });
    const subcategorySelect = screen.getByRole('combobox', { name: /^Подкатегория$/i });
    const complexitySelect = screen.getByRole('combobox', { name: /^Сложность$/i });

    expect(categorySelect).toBeInTheDocument();
    expect(subcategorySelect).toBeInTheDocument();
    expect(complexitySelect).toBeInTheDocument();

    // Check filter buttons
    const applyBtn = screen.getByRole('button', { name: /Применить фильтр/i });
    const resetBtn = screen.getByRole('button', { name: /Сбросить фильтры/i });
    expect(applyBtn).toBeInTheDocument();
    expect(resetBtn).toBeInTheDocument();

    // Check complexity column header has center alignment
    const complexityHeader = screen.getByRole('columnheader', { name: /^Сложность$/i });
    expect(complexityHeader.className).toContain('text-center');
  });

  it('ТЗ 37.1: Category and Subcategory in edit modal are dropdowns, and changing Category resets Subcategory and fetches new options', async () => {
    render(<TicketsPage />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toHaveTextContent('ДТП');
    });

    // Open third ticket (ДТП / Лобовое столкновение)
    const detailButtons = screen.getAllByRole('button', { name: /Детали/i });
    fireEvent.click(detailButtons[2]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    // Click Edit inside dialog
    const editBtns = within(dialog).getAllByRole('button', { name: /Редактировать/i });
    fireEvent.click(editBtns[0]);

    // Both Category and Subcategory must be comboboxes (Select), NOT text inputs
    const editCategorySelect = within(dialog).getByRole('combobox', { name: /^Категория$/i }) as HTMLSelectElement;
    const editSubcategorySelect = within(dialog).getByRole('combobox', { name: /^Подкатегория$/i }) as HTMLSelectElement;

    expect(editCategorySelect.tagName.toLowerCase()).toBe('select');
    expect(editSubcategorySelect.tagName.toLowerCase()).toBe('select');

    expect(editCategorySelect.value).toBe('ДТП');
    expect(editSubcategorySelect.value).toBe('Лобовое столкновение');

    // Change category to "Пожары и задымления"
    fireEvent.change(editCategorySelect, { target: { value: 'Пожары и задымления' } });

    // Subcategory must be reset to ""
    expect(editSubcategorySelect.value).toBe('');

    // And subcategories API must have been queried for the new category
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/classifier/subcategories?category=')
      );
    });
  });

  it('ТЗ 37.2: Street and House are read-only and Random Address generator button updates address fields', async () => {
    render(<TicketsPage />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toHaveTextContent('ДТП');
    });

    const detailButtons = screen.getAllByRole('button', { name: /Детали/i });
    fireEvent.click(detailButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    // Click Edit inside dialog
    const editBtns = within(dialog).getAllByRole('button', { name: /Редактировать/i });
    fireEvent.click(editBtns[0]);

    // Street and House must be read-only
    const streetInput = screen.getByRole('textbox', { name: /Улица/i }) as HTMLInputElement;
    const houseInput = screen.getByRole('textbox', { name: /^Дом/i }) as HTMLInputElement;

    expect(streetInput).toHaveAttribute('readonly');
    expect(houseInput).toHaveAttribute('readonly');

    // Random address button must exist
    const genAddressBtn = screen.getByRole('button', { name: /Сгенерировать случайный адрес/i });
    expect(genAddressBtn).toBeInTheDocument();

    // Click generate address
    fireEvent.click(genAddressBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/generator/address');
      expect(streetInput.value).toBe('Лесная улица');
      expect(houseInput.value).toBe('15к2');
    });
  });

  it('ТЗ 37.3: Apartment, Floor, Entrance, Intercom fields are manually editable and saved via PATCH', async () => {
    render(<TicketsPage />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toHaveTextContent('ДТП');
    });

    const detailButtons = screen.getAllByRole('button', { name: /Детали/i });
    fireEvent.click(detailButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    // Click Edit inside dialog
    const editBtns = within(dialog).getAllByRole('button', { name: /Редактировать/i });
    fireEvent.click(editBtns[0]);

    // Find the 4 new fields
    const aptInput = screen.getByRole('textbox', { name: /Квартира/i }) as HTMLInputElement;
    const floorInput = screen.getByRole('textbox', { name: /Этаж/i }) as HTMLInputElement;
    const entranceInput = screen.getByRole('textbox', { name: /Подъезд/i }) as HTMLInputElement;
    const intercomInput = screen.getByRole('textbox', { name: /Код домофона/i }) as HTMLInputElement;

    expect(aptInput).toBeInTheDocument();
    expect(floorInput).toBeInTheDocument();
    expect(entranceInput).toBeInTheDocument();
    expect(intercomInput).toBeInTheDocument();

    // Unlike street and house, these 4 fields are NOT read-only
    expect(aptInput).not.toHaveAttribute('readonly');
    expect(floorInput).not.toHaveAttribute('readonly');
    expect(entranceInput).not.toHaveAttribute('readonly');
    expect(intercomInput).not.toHaveAttribute('readonly');

    // Edit them manually
    fireEvent.change(aptInput, { target: { value: '108' } });
    fireEvent.change(floorInput, { target: { value: '9' } });
    fireEvent.change(entranceInput, { target: { value: '3' } });
    fireEvent.change(intercomInput, { target: { value: '108B' } });

    // Save ticket
    const saveBtn = screen.getByRole('button', { name: /Сохранить/i });
    fireEvent.click(saveBtn);

    // Verify PATCH payload contains the new fields
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/tickets\/.+/),
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"apartment":"108"'),
        })
      );
    });
  });

  it('ТЗ 37.4: Emergency services can be selected from classifier directory dropdown and removed via badge close button', async () => {
    render(<TicketsPage />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toHaveTextContent('ДТП');
    });

    const detailButtons = screen.getAllByRole('button', { name: /Детали/i });
    fireEvent.click(detailButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    // Click Edit inside dialog
    const editBtns = within(dialog).getAllByRole('button', { name: /Редактировать/i });
    fireEvent.click(editBtns[0]);

    // Find services dropdown
    const serviceSelect = screen.getByRole('combobox', { name: /Выбрать службу/i }) as HTMLSelectElement;
    expect(serviceSelect).toBeInTheDocument();

    // Select "ЦОДД" from dropdown
    fireEvent.change(serviceSelect, { target: { value: 'ЦОДД' } });

    // "ЦОДД" should now appear in the active services list with a remove button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Удалить службу ЦОДД/i })).toBeInTheDocument();
    });

    // Click remove button for ЦОДД
    const removeBtn = screen.getByRole('button', { name: /Удалить службу ЦОДД/i });
    fireEvent.click(removeBtn);

    // ЦОДД should now be removed from active services
    expect(screen.queryByRole('button', { name: /Удалить службу ЦОДД/i })).not.toBeInTheDocument();
  });

  it('ТЗ 38.1: Changing subcategory in edit modal calls GET /api/classifier/details and automatically updates assigned emergency services', async () => {
    render(<TicketsPage />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toHaveTextContent('ДТП');
    });

    // Open ДТП ticket (detailButtons[2])
    const detailButtons = screen.getAllByRole('button', { name: /Детали/i });
    fireEvent.click(detailButtons[2]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    const editBtns = within(dialog).getAllByRole('button', { name: /Редактировать/i });
    fireEvent.click(editBtns[0]);

    const editSubcategorySelect = within(dialog).getByRole('combobox', { name: /^Подкатегория$/i }) as HTMLSelectElement;

    // Change subcategory to "Наезд на пешехода"
    fireEvent.change(editSubcategorySelect, { target: { value: 'Наезд на пешехода' } });

    // Verify GET /api/classifier/details was called with category & subcategory
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/classifier/details?category=')
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('subcategory=%D0%9D%D0%B0%D0%B5%D0%B7%D0%B4%20%D0%BD%D0%B0%20%D0%BF%D0%B5%D1%88%D0%B5%D1%85%D0%BE%D0%B4%D0%B0')
      );
    });

    // Check that etalon services were updated with the services from the classifier details API
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: /Удалить службу ФСБ/i })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /Удалить службу ЦОДД/i })).toBeInTheDocument();
    });

    // Teacher can still manually remove a service
    const removeFsbBtn = within(dialog).getByRole('button', { name: /Удалить службу ФСБ/i });
    fireEvent.click(removeFsbBtn);
    expect(within(dialog).queryByRole('button', { name: /Удалить службу ФСБ/i })).not.toBeInTheDocument();
  });

  it('ТЗ 38.2: When Random Address generator returns apartment as null, apartment, floor, intercom inputs are emptied', async () => {
    // Override fetch for /api/generator/address to return null apartment
    const originalFetch = global.fetch;
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/generator/address')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            city: 'Москва',
            street: 'Остоженка',
            house: '25',
            apartment: null,
            floor: null,
            entrance: null,
            intercom: null,
            lat: 55.74,
            lon: 37.59,
            full_address: 'Москва, Остоженка, 25',
          }),
        });
      }
      return (originalFetch as any)(url, init);
    }));

    render(<TicketsPage />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toHaveTextContent('ДТП');
    });

    const detailButtons = screen.getAllByRole('button', { name: /Детали/i });
    fireEvent.click(detailButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    const editBtns = within(dialog).getAllByRole('button', { name: /Редактировать/i });
    fireEvent.click(editBtns[0]);

    const streetInput = screen.getByRole('textbox', { name: /Улица/i }) as HTMLInputElement;
    const houseInput = screen.getByRole('textbox', { name: /^Дом/i }) as HTMLInputElement;
    const aptInput = screen.getByRole('textbox', { name: /Квартира/i }) as HTMLInputElement;
    const floorInput = screen.getByRole('textbox', { name: /Этаж/i }) as HTMLInputElement;
    const intercomInput = screen.getByRole('textbox', { name: /Код домофона/i }) as HTMLInputElement;

    // Fill apartment, floor, intercom first
    fireEvent.change(aptInput, { target: { value: '99' } });
    fireEvent.change(floorInput, { target: { value: '5' } });
    fireEvent.change(intercomInput, { target: { value: '99K' } });

    expect(aptInput.value).toBe('99');
    expect(floorInput.value).toBe('5');
    expect(intercomInput.value).toBe('99K');

    // Click "Сгенерировать случайный адрес"
    const genAddressBtn = screen.getByRole('button', { name: /Сгенерировать случайный адрес/i });
    fireEvent.click(genAddressBtn);

    // Inputs for apartment, floor, intercom must be cleared
    await waitFor(() => {
      expect(streetInput.value).toBe('Остоженка');
      expect(houseInput.value).toBe('25');
      expect(aptInput.value).toBe('');
      expect(floorInput.value).toBe('');
      expect(intercomInput.value).toBe('');
    });
  });

  it('ТЗ 39.1: Filter and Generation modal use dynamic API categories and subcategories', async () => {
    render(<TicketsPage />);

    // Wait for categories to load
    const filterCategorySelect = screen.getByRole('combobox', { name: /^Категория$/i }) as HTMLSelectElement;
    await waitFor(() => {
      expect(filterCategorySelect).toHaveTextContent('ДТП');
    });

    // Change filter category to "ДТП"
    fireEvent.change(filterCategorySelect, { target: { value: 'ДТП' } });

    // Check filter subcategory dropdown updates from API
    const filterSubcategorySelect = screen.getByRole('combobox', { name: /^Подкатегория$/i }) as HTMLSelectElement;
    await waitFor(() => {
      expect(filterSubcategorySelect).toHaveTextContent('Лобовое столкновение');
      expect(filterSubcategorySelect).toHaveTextContent('Наезд на пешехода');
    });

    // Open Generation modal
    const genBtn = screen.getByRole('button', { name: /Сгенерировать/i });
    fireEvent.click(genBtn);

    const genDialog = screen.getByRole('dialog');
    const modalCategorySelect = within(genDialog).getByRole('combobox', { name: /^Категория$/i }) as HTMLSelectElement;
    expect(modalCategorySelect).toHaveTextContent('ДТП');

    // Change modal category to "ДТП"
    fireEvent.change(modalCategorySelect, { target: { value: 'ДТП' } });

    // Check modal subcategory dropdown updates from API
    const modalSubcategorySelect = within(genDialog).getByRole('combobox', { name: /Подкатегория/i }) as HTMLSelectElement;
    await waitFor(() => {
      expect(modalSubcategorySelect).toHaveTextContent('Лобовое столкновение');
    });
  });

  it('ТЗ 39.2: When ticket ground_truth contains null for apartment, floor, entrance, or intercom, inputs render empty string "" and never "null"', async () => {
    const originalFetch = global.fetch;
    const ticketWithNullAddress = {
      id: 't-blank-addr-uuid',
      ticket_id: 't-blank-addr-uuid',
      category: 'ДТП',
      subcategory: 'Лобовое столкновение',
      complexity: 2,
      plot: 'ДТП на перекрестке без дома и квартиры',
      etalon_services: ['02'],
      ground_truth: {
        fio: 'Тестов Тест',
        phone: '+79001112233',
        street: 'Улица Мира',
        house: '10',
        apartment: null,
        floor: null,
        entrance: null,
        intercom: null,
      },
      status: 'draft',
      created_at: '2026-09-24T18:00:00Z',
    };

    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/v1/tickets') && (!init || init.method === 'GET' || !init.method)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [ticketWithNullAddress],
        });
      }
      return (originalFetch as any)(url, init);
    }));

    render(<TicketsPage />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toHaveTextContent('Лобовое столкновение');
    });

    const detailBtn = screen.getByRole('button', { name: /Детали/i });
    fireEvent.click(detailBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');

    // Read-only view must NOT contain "null" in address
    expect(dialog).not.toHaveTextContent('кв. null');
    expect(dialog).not.toHaveTextContent('эт. null');
    expect(dialog).not.toHaveTextContent('под. null');
    expect(dialog).not.toHaveTextContent('домофон: null');

    // Click Edit
    const editBtns = within(dialog).getAllByRole('button', { name: /Редактировать/i });
    fireEvent.click(editBtns[0]);

    const aptInput = screen.getByRole('textbox', { name: /Квартира/i }) as HTMLInputElement;
    const floorInput = screen.getByRole('textbox', { name: /Этаж/i }) as HTMLInputElement;
    const entranceInput = screen.getByRole('textbox', { name: /Подъезд/i }) as HTMLInputElement;
    const intercomInput = screen.getByRole('textbox', { name: /Код домофона/i }) as HTMLInputElement;

    // All these fields must be empty string "", NOT "null"
    expect(aptInput.value).toBe('');
    expect(floorInput.value).toBe('');
    expect(entranceInput.value).toBe('');
    expect(intercomInput.value).toBe('');
  });

  it('ТЗ 39.3: Opening a ticket modal immediately fetches /api/classifier/details?category=...&subcategory=... to display the complete up-to-date etalon services', async () => {
    render(<TicketsPage />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toHaveTextContent('ДТП');
    });

    // Open ticket 2 (ДТП / Лобовое столкновение)
    const detailButtons = screen.getAllByRole('button', { name: /Детали/i });
    fireEvent.click(detailButtons[2]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Check GET /api/classifier/details was immediately called on modal open
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/classifier/details?category=')
      );
    });

    // Read-only modal should now display the full up-to-date services from classifier details (ФСБ, ЦОДД)
    const dialog = screen.getByRole('dialog');
    await waitFor(() => {
      expect(within(dialog).getByText(/ФСБ/i)).toBeInTheDocument();
      expect(within(dialog).getByText(/ЦОДД/i)).toBeInTheDocument();
    });
  });

  it('Modal details has only one "Редактировать" button in the footer and none in the header', async () => {
    render(<TicketsPage />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toHaveTextContent('ДТП');
    });

    const detailButtons = screen.getAllByRole('button', { name: /Детали/i });
    fireEvent.click(detailButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    const editButtons = within(dialog).getAllByRole('button', { name: /Редактировать/i });
    expect(editButtons).toHaveLength(1);

    // Header close button exists
    const closeBtn = within(dialog).getByTestId('modal-dismiss-btn');
    expect(closeBtn).toBeInTheDocument();
  });
});


