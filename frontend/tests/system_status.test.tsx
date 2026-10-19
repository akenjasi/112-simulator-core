import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminLayout from '@/app/admin/layout';
import TeacherLayout from '@/app/teacher/layout';

// Keep the real layouts and health request. Authentication has separate tests.
vi.mock('@/components/auth/RequireAuth', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/auth/LogoutButton', () => ({ LogoutButton: () => null }));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

const fetchMock = vi.fn<typeof fetch>();
const ACTIVE = 'Система активна';
const CHECKING = 'Проверка системы…';
const DOWN = 'Система недоступна';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function response(body: unknown = { status: 'ok', version: 'v2' }, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

async function settle() {
  await act(async () => {
    // Drain fetch/json/effect promises without advancing the polling clock.
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await settle();
}

function expectIndicators(text: string, color: string, count = 1) {
  const indicators = screen.getAllByRole('status');
  expect(indicators).toHaveLength(count);
  for (const indicator of indicators) {
    expect(indicator).toHaveTextContent(text);
    expect(indicator.querySelector(`.${color}`)).not.toBeNull();
    if (text !== ACTIVE) {
      expect(indicator.querySelector('.bg-emerald-500')).toBeNull();
    }
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(response());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe.each([
  ['ADMIN', AdminLayout],
  ['TEACHER', TeacherLayout],
] as const)('System status in %s layout', (_role, Layout) => {
  function mount() { return render(<Layout><div>Page content</div></Layout>); }

  it('starts neutral and makes exactly one uncached public health request', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    mount();
    expectIndicators(CHECKING, 'bg-slate-400');
    expect(screen.queryByText(ACTIVE)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/health');
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({
      cache: 'no-store', signal: expect.any(AbortSignal),
    }));
  });

  it('shows green only after a successful health response', async () => {
    mount();
    await settle();
    expectIndicators(ACTIVE, 'bg-emerald-500');
  });

  it.each([
    ['HTTP 503 even with an ok body', () => Promise.resolve(response({ status: 'ok' }, 503))],
    ['HTTP 401', () => Promise.resolve(response({}, 401))],
    ['HTTP 403', () => Promise.resolve(response({}, 403))],
    ['network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['invalid JSON', () => Promise.resolve(new Response('<html>gateway</html>'))],
    ['unknown status', () => Promise.resolve(response({ status: 'degraded' }))],
    ['missing status', () => Promise.resolve(response({}))],
    ['null body', () => Promise.resolve(response(null))],
  ] as const)('shows red for %s', async (_label, result) => {
    fetchMock.mockImplementationOnce(result);
    mount();
    await settle();
    expectIndicators(DOWN, 'bg-red-500');
  });

  it('polls at 30 seconds, drops stale green on failure, and recovers', async () => {
    fetchMock.mockResolvedValueOnce(response())
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue(response());
    mount();
    await settle();
    expectIndicators(ACTIVE, 'bg-emerald-500');
    await advance(29_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectIndicators(DOWN, 'bg-red-500');
    await advance(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expectIndicators(ACTIVE, 'bg-emerald-500');
  });

  it('retains the last confirmed status during a routine refresh', async () => {
    const next = deferred<Response>();
    fetchMock.mockResolvedValueOnce(response()).mockReturnValueOnce(next.promise);
    mount();
    await settle();
    await advance(30_000);
    expectIndicators(ACTIVE, 'bg-emerald-500');
    next.resolve(response({}, 503));
    await settle();
    expectIndicators(DOWN, 'bg-red-500');
  });

  it('times out at 5 seconds, aborts the request, and ignores late success', async () => {
    const slow = deferred<Response>();
    fetchMock.mockReturnValueOnce(slow.promise);
    mount();
    const signal = fetchMock.mock.calls[0]?.[1]?.signal;
    await advance(4_999);
    expectIndicators(CHECKING, 'bg-slate-400');
    await advance(1);
    expectIndicators(DOWN, 'bg-red-500');
    expect(signal?.aborted).toBe(true);
    slow.resolve(response());
    await settle();
    expectIndicators(DOWN, 'bg-red-500');
    await advance(25_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectIndicators(ACTIVE, 'bg-emerald-500');
  });

  it('also times out when headers arrive but the JSON body hangs', async () => {
    const body = deferred<unknown>();
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => body.promise } as Response);
    mount();
    await settle();
    await advance(5_000);
    expectIndicators(DOWN, 'bg-red-500');
    body.resolve({ status: 'ok' });
    await settle();
    expectIndicators(DOWN, 'bg-red-500');
  });

  it('shares current state and polling between desktop and mobile indicators', async () => {
    const retry = deferred<Response>();
    fetchMock.mockResolvedValueOnce(response()).mockReturnValueOnce(retry.promise);
    mount();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }));
    expectIndicators(ACTIVE, 'bg-emerald-500', 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    retry.resolve(response({}, 503));
    await settle();
    expectIndicators(DOWN, 'bg-red-500', 2);
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть меню' }));
    expectIndicators(DOWN, 'bg-red-500');
    fireEvent.click(screen.getByRole('button', { name: 'Открыть меню' }));
    expectIndicators(DOWN, 'bg-red-500', 2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cancels in-flight work and all timers on unmount', async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    const view = mount();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const signal = fetchMock.mock.calls[0][1]?.signal;
    view.unmount();
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    pending.resolve(response());
    await settle();
    await advance(90_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('survives StrictMode effect cleanup without accepting an obsolete response', async () => {
    const obsolete = deferred<Response>();
    fetchMock.mockReturnValueOnce(obsolete.promise).mockResolvedValue(response({}, 503));
    render(<React.StrictMode><Layout><div>Page</div></Layout></React.StrictMode>);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expectIndicators(DOWN, 'bg-red-500');
    obsolete.resolve(response());
    await settle();
    expectIndicators(DOWN, 'bg-red-500');
  });
});
