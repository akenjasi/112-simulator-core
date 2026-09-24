import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import KnowledgePage from '@/app/teacher/knowledge/page';

describe('27.6: База знаний', () => {
  const mockFiles = [
    {
      id: 'doc-1',
      name: 'Приказ_МЧС_112.pdf',
      size: 1048576, // 1 MB
      uploaded_at: '2026-09-20T10:00:00Z',
      content_type: 'application/pdf',
      url: '/api/v1/knowledge/files/doc-1/download',
    },
    {
      id: 'doc-2',
      name: 'Регламент_ДДС_01.docx',
      size: 2097152, // 2 MB
      uploaded_at: '2026-09-22T14:30:00Z',
      content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      url: '/api/v1/knowledge/files/doc-2/download',
    },
  ];

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      const urlStr = url.toString();

      // GET list of files
      if (urlStr.endsWith('/api/v1/knowledge/files') && (!init || init.method === 'GET' || !init.method)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockFiles,
        });
      }

      // POST upload file
      if (urlStr.endsWith('/api/v1/knowledge/files') && init?.method === 'POST') {
        const body = init.body as FormData;
        const uploadedFile = body.get('file') as File;
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            id: 'doc-new',
            name: uploadedFile ? uploadedFile.name : 'new_doc.pdf',
            size: uploadedFile ? uploadedFile.size : 500000,
            uploaded_at: new Date().toISOString(),
            content_type: uploadedFile?.type || 'application/pdf',
            url: '/api/v1/knowledge/files/doc-new/download',
          }),
        });
      }

      // DELETE file
      if (urlStr.includes('/api/v1/knowledge/files/') && init?.method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok' }),
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

  it('should render file upload button', async () => {
    render(<KnowledgePage />);
    expect(screen.getByRole('button', { name: /Загрузить документ/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Приказ_МЧС_112.pdf')).toBeInTheDocument();
    });
  });

  it('should render file manager with document list (name, upload date, size)', async () => {
    render(<KnowledgePage />);

    // Header and structure checks
    expect(screen.getByText(/База знаний/i)).toBeInTheDocument();
    expect(screen.getByText(/Файловый менеджер регламентов/i)).toBeInTheDocument();

    // Wait for the files to load and display
    await waitFor(() => {
      expect(screen.getByText('Приказ_МЧС_112.pdf')).toBeInTheDocument();
      expect(screen.getByText('Регламент_ДДС_01.docx')).toBeInTheDocument();
    });

    // Check size formatting
    expect(screen.getByText(/1 МБ/i)).toBeInTheDocument();
    expect(screen.getByText(/2 МБ/i)).toBeInTheDocument();

    // Check formats
    expect(screen.getAllByText('PDF').length).toBeGreaterThan(0);
    expect(screen.getAllByText('DOCX').length).toBeGreaterThan(0);
  });

  it('should upload PDF file using FormData and refresh list', async () => {
    render(<KnowledgePage />);

    await waitFor(() => {
      expect(screen.getByText('Приказ_МЧС_112.pdf')).toBeInTheDocument();
    });

    const fileInput = screen.getByTestId('file-upload-input');
    const pdfFile = new File(['pdf content mock'], 'Новый_Регламент_2026.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByText(/успешно загружен/i)).toBeInTheDocument();
    });

    // Verify fetch was called with FormData
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/knowledge/files',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      })
    );
  });

  it('should upload DOCX file using FormData', async () => {
    render(<KnowledgePage />);

    await waitFor(() => {
      expect(screen.getByText('Приказ_МЧС_112.pdf')).toBeInTheDocument();
    });

    const fileInput = screen.getByTestId('file-upload-input');
    const docxFile = new File(
      ['docx content mock'],
      'Инструкция_Связи.docx',
      { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    );

    fireEvent.change(fileInput, { target: { files: [docxFile] } });

    await waitFor(() => {
      expect(screen.getByText(/успешно загружен/i)).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/knowledge/files',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      })
    );
  });

  it('should reject unsupported file formats like .txt or .exe with error message', async () => {
    render(<KnowledgePage />);

    await waitFor(() => {
      expect(screen.getByText('Приказ_МЧС_112.pdf')).toBeInTheDocument();
    });

    const fileInput = screen.getByTestId('file-upload-input');
    const invalidFile = new File(['plain text'], 'unsupported_document.txt', {
      type: 'text/plain',
    });

    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    await waitFor(() => {
      expect(
        screen.getByText(/Поддерживаются только файлы формата PDF и DOCX/i)
      ).toBeInTheDocument();
    });

    // Verify fetch POST was not called for invalid format
    expect(global.fetch).not.toHaveBeenCalledWith(
      '/api/v1/knowledge/files',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('should toggle between table list view and card grid view', async () => {
    render(<KnowledgePage />);

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-table')).toBeInTheDocument();
    });

    const gridBtn = screen.getByLabelText(/Вид сеткой/i);
    fireEvent.click(gridBtn);

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-grid')).toBeInTheDocument();
    });

    const listBtn = screen.getByLabelText(/Вид списком/i);
    fireEvent.click(listBtn);

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-table')).toBeInTheDocument();
    });
  });

  it('should filter documents by search query', async () => {
    render(<KnowledgePage />);

    await waitFor(() => {
      expect(screen.getByText('Приказ_МЧС_112.pdf')).toBeInTheDocument();
      expect(screen.getByText('Регламент_ДДС_01.docx')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Поиск по названию/i);
    fireEvent.change(searchInput, { target: { value: 'МЧС' } });

    await waitFor(() => {
      expect(screen.getByText('Приказ_МЧС_112.pdf')).toBeInTheDocument();
      expect(screen.queryByText('Регламент_ДДС_01.docx')).not.toBeInTheDocument();
    });
  });

  it('should filter documents by format buttons (PDF and DOCX)', async () => {
    render(<KnowledgePage />);

    await waitFor(() => {
      expect(screen.getByText('Приказ_МЧС_112.pdf')).toBeInTheDocument();
      expect(screen.getByText('Регламент_ДДС_01.docx')).toBeInTheDocument();
    });

    const pdfFilterBtn = screen.getByRole('button', { name: /PDF \(1\)/i });
    fireEvent.click(pdfFilterBtn);

    await waitFor(() => {
      expect(screen.getByText('Приказ_МЧС_112.pdf')).toBeInTheDocument();
      expect(screen.queryByText('Регламент_ДДС_01.docx')).not.toBeInTheDocument();
    });

    const docxFilterBtn = screen.getByRole('button', { name: /DOCX \(1\)/i });
    fireEvent.click(docxFilterBtn);

    await waitFor(() => {
      expect(screen.queryByText('Приказ_МЧС_112.pdf')).not.toBeInTheDocument();
      expect(screen.getByText('Регламент_ДДС_01.docx')).toBeInTheDocument();
    });
  });

  it('should support uploading file through dropzone', async () => {
    render(<KnowledgePage />);

    await waitFor(() => {
      expect(screen.getByText('Приказ_МЧС_112.pdf')).toBeInTheDocument();
    });

    const dropzoneInput = screen.getByTestId('dropzone-file-input');
    const newDoc = new File(['docx dummy'], 'Регламент_Эвакуации.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    fireEvent.change(dropzoneInput, { target: { files: [newDoc] } });

    await waitFor(() => {
      expect(screen.getByText(/Регламент_Эвакуации.docx/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Отправить выбранный файл/i })).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Отправить выбранный файл/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/успешно загружен/i)).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/knowledge/files',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      })
    );
  });
});
