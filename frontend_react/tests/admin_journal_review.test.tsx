import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdminLogsPage from '@/app/admin/logs/page';

const fetchMock = vi.fn<typeof fetch>();
const rows = Array.from({ length: 23 }, (_, i) => ({
  log_id: `review-${i}`, action: `ACTION_${i}`, user_id: 'u-123',
  username: 'review_user', timestamp: '2026-10-17T12:00:00Z',
}));
const reply = (data: unknown) => new Response(JSON.stringify(data), {
  headers: { 'Content-Type': 'application/json' },
});
function lastUrl() {
  return new URL(String(fetchMock.mock.calls.at(-1)?.[0]), 'http://localhost');
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('error-logs')) return reply([]);
    const offset = Number(url.searchParams.get('offset'));
    const limit = Number(url.searchParams.get('limit'));
    return reply(rows.slice(offset, offset + limit));
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('pages on the server, refreshes the current page and resets after filtering', async () => {
  render(<AdminLogsPage />);
  await screen.findByText('ACTION_0');
  expect(screen.queryByText('ACTION_20')).not.toBeInTheDocument();
  expect(lastUrl().searchParams.get('limit')).toBe('21');
  fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
  await screen.findByText('ACTION_20');
  expect(lastUrl().searchParams.get('offset')).toBe('20');
  expect(screen.queryByText('ACTION_0')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Обновить' }));
  await screen.findByText('ACTION_20');
  expect(lastUrl().searchParams.get('offset')).toBe('20');
  fireEvent.change(screen.getByLabelText('Пользователь (ID)'), { target: { value: 'u-123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
  await screen.findByText('ACTION_0');
  expect(lastUrl().searchParams.get('offset')).toBe('0');
  expect(lastUrl().searchParams.get('user_id')).toBe('u-123');
});

it('keeps the visible user filter consistent after applying a period in Errors', async () => {
  render(<AdminLogsPage />);
  await screen.findByText('ACTION_0');
  fireEvent.change(screen.getByLabelText('Пользователь (ID)'), { target: { value: 'u-123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
  await waitFor(() => expect(lastUrl().searchParams.get('user_id')).toBe('u-123'));
  fireEvent.click(screen.getByRole('tab', { name: 'Ошибки' }));
  await screen.findByText('Записей не найдено');
  fireEvent.change(screen.getByLabelText('С'), { target: { value: '2026-10-17T10:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
  await screen.findByText('Записей не найдено');
  fireEvent.click(screen.getByRole('tab', { name: 'Действия пользователей' }));
  await screen.findByText('ACTION_0');
  // Either preserve the applied user filter or clear its input when removing it.
  const visibleValue = (screen.getByLabelText('Пользователь (ID)') as HTMLInputElement).value;
  expect(lastUrl().searchParams.get('user_id') || '').toBe(visibleValue);
});
