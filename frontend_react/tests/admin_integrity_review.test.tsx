import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdminSystemPage from '@/app/admin/system/page';

const fetchMock = vi.fn<typeof fetch>();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let healthFails = false;
let integrityFails = false;

beforeEach(() => {
  healthFails = false;
  integrityFails = false;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const path = String(input);
    if (path.includes('/healthcheck')) {
      return healthFails ? reply({}, 503) : reply({ cpu_percent: 10, ram_percent: 20, db_status: 'ok' });
    }
    if (path.includes('/integrity/check')) {
      return integrityFails ? reply({ detail: 'Проверка временно недоступна' }, 503) : reply({
        status: 'ok', checked_at: '2026-10-17T12:00:00Z', checked_files_count: 108,
        manifest_digest: 'a'.repeat(64), deviations: [],
      });
    }
    return reply({ backups: [] });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('does not claim the server is active when a refresh fails after an earlier success', async () => {
  render(<AdminSystemPage />);
  await screen.findByText('Сервер активен');
  healthFails = true;
  fireEvent.click(screen.getByRole('button', { name: 'Проверить статус' }));
  await screen.findByText(/Связь с сервером нарушена/);
  expect(screen.queryByText('Сервер активен')).not.toBeInTheDocument();
});

it('does not retain a current green integrity badge after a new check fails', async () => {
  render(<AdminSystemPage />);
  const button = screen.getByRole('button', { name: 'Проверить целостность файлов' });
  fireEvent.click(button);
  await screen.findByText('Целостность подтверждена');
  integrityFails = true;
  fireEvent.click(button);
  await screen.findByText('Проверка временно недоступна');
  expect(screen.queryByText('Целостность подтверждена')).not.toBeInTheDocument();
});
