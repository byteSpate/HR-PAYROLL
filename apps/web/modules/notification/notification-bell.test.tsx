// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationItem } from '@erp/contracts/notification';
import * as api from './api';
import { NotificationBell } from './components/notification-bell';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
// A factory rather than automock: automocking would still import the real module and its '@/' alias.
vi.mock('./api', () => ({ listNotifications: vi.fn(), unreadCount: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() }));

const item = (over: Partial<NotificationItem>): NotificationItem => ({
  id: 'n1',
  type: 'leave.requested',
  title: 'Leave request',
  body: null,
  href: '/leave/approvals',
  entity: null,
  entityId: null,
  readAt: null,
  createdAt: '2026-03-01T10:00:00.000Z',
  ...over,
});

function renderBell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NotificationBell />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.unreadCount).mockResolvedValue({ count: 3 });
  vi.mocked(api.listNotifications).mockResolvedValue({ items: [item({})], nextCursor: null });
  vi.mocked(api.markRead).mockResolvedValue(undefined);
  vi.mocked(api.markAllRead).mockResolvedValue({ changed: 1 });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('NotificationBell', () => {
  it('shows the unread count on the bell', async () => {
    renderBell();
    expect(await screen.findByText('3')).toBeTruthy();
  });

  it('shows 9+ above nine and nothing at zero', async () => {
    vi.mocked(api.unreadCount).mockResolvedValue({ count: 12 });
    renderBell();
    expect(await screen.findByText('9+')).toBeTruthy();
    cleanup();

    vi.mocked(api.unreadCount).mockResolvedValue({ count: 0 });
    renderBell();
    await waitFor(() => expect(api.unreadCount).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.queryByText('9+')).toBeNull();
  });

  it('opens a list, and clicking an item marks it read and goes to its link', async () => {
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /leave request/i }));
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith('n1'));
    expect(push).toHaveBeenCalledWith('/leave/approvals');
  });

  it('does not mark an already-read item again', async () => {
    vi.mocked(api.listNotifications).mockResolvedValue({
      items: [item({ readAt: '2026-03-01T11:00:00.000Z' })],
      nextCursor: null,
    });
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /leave request/i }));
    expect(push).toHaveBeenCalledWith('/leave/approvals');
    expect(api.markRead).not.toHaveBeenCalled();
  });

  it('marks everything read from the list header', async () => {
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    await userEvent.click(await screen.findByRole('button', { name: /mark all read/i }));
    await waitFor(() => expect(api.markAllRead).toHaveBeenCalledTimes(1));
  });

  it('says so when there is nothing to show', async () => {
    vi.mocked(api.listNotifications).mockResolvedValue({ items: [], nextCursor: null });
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    expect(await screen.findByText(/no notifications/i)).toBeTruthy();
  });

  it('polls the unread count every 60 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderBell();
    await waitFor(() => expect(api.unreadCount).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(60_000);
    await waitFor(() => expect(api.unreadCount).toHaveBeenCalledTimes(2));
  });
});
