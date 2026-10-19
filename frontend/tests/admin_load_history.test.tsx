import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Dashboard from '@/app/admin/page';

vi.mock('recharts', async () => ({
  ...await vi.importActual('recharts'),
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  AreaChart: ({ data }: any) => <pre data-testid="history">{JSON.stringify(data)}</pre>,
}));
beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('keeps real chart measurements when navigating away and returning before the next response', async () => {
  let checks = 0;
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    if (String(input).includes('/healthcheck')) {
      checks++;
      if (checks > 1) return new Promise(() => {});
      return new Response(JSON.stringify({ cpu_percent: 31.2, ram_percent: 57.1, db_status: 'ok' }));
    }
    return new Response('[]');
  }));
  const first = render(<Dashboard />);
  await waitFor(() => expect(screen.getByTestId('history')).toHaveTextContent('31.2'));
  const previous = screen.getByTestId('history').textContent;
  first.unmount();
  render(<Dashboard />);
  expect(screen.getByTestId('history').textContent).toBe(previous);
});

it('does not create chart measurements when the first health request fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input) => String(input).includes('/healthcheck')
    ? new Response('{}', { status: 503 }) : new Response('[]')));
  render(<Dashboard />);
  await screen.findByText('Ошибка healthcheck: 503');
  expect(screen.getByTestId('history')).toHaveTextContent('[]');
});

it('restores only recent valid measurements from the tab history', () => {
  const now = Date.now();
  const point = { measuredAt: now - 1000, time: '12:00:00', cpu: 25, ram: 50 };
  sessionStorage.setItem('admin-server-load-history-v1', JSON.stringify([
    { ...point, measuredAt: now - 60 * 60 * 1000 },
    { ...point, cpu: 150 },
    { ...point, measuredAt: now + 60_000 },
    point,
  ]));
  vi.stubGlobal('fetch', vi.fn(async (input) => String(input).includes('/healthcheck')
    ? new Promise(() => {}) : new Response('[]')));
  render(<Dashboard />);
  expect(JSON.parse(screen.getByTestId('history').textContent || '[]')).toEqual([point]);
});
