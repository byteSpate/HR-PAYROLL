// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountView } from '@erp/contracts/core';
import { AccountProfile } from './account-profile';

let grants: string[] = [];

// Factories rather than automocks: automocking would still import the real modules and their '@/' alias.
vi.mock('@/lib/session', () => ({
  useSession: () => ({ accessToken: 't', status: 'authenticated', user: { grants }, signOut: vi.fn() }),
}));
vi.mock('@/modules/settings/api', () => ({
  listSessions: vi.fn().mockResolvedValue([]),
  revokeSession: vi.fn(),
  logoutEverywhere: vi.fn(),
  setDisplayName: vi.fn(),
  uploadOwnAvatar: vi.fn(),
  clearOwnAvatar: vi.fn(),
}));

const account = (over: Partial<AccountView>): AccountView => ({
  email: 'pat@example.com',
  accessLevel: 'STANDARD',
  role: { id: 'r1', name: 'Payroll clerk' },
  mustChangePassword: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  sessions: { count: 1, lastActiveAt: null },
  displayName: null,
  avatarUrl: null,
  ...over,
});

function renderProfile(a: AccountView) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AccountProfile account={a} onChanged={() => undefined} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  grants = [];
});

describe('AccountProfile permissions panel', () => {
  it('lists the labels of the permissions the account holds, with their scope', () => {
    grants = ['leave.read:team', 'leave.config'];
    renderProfile(account({}));
    expect(screen.getByRole('heading', { name: 'What Payroll clerk can do' })).toBeTruthy();
    expect(screen.getByText('View leave requests')).toBeTruthy();
    expect(screen.getByText(/Team/)).toBeTruthy();
    expect(screen.getByText('Manage leave policies')).toBeTruthy();
  });

  it('says so when a role has granted nothing yet', () => {
    renderProfile(account({ role: null }));
    expect(screen.getByRole('heading', { name: 'What No role can do' })).toBeTruthy();
    expect(screen.getByText(/No permissions yet/)).toBeTruthy();
  });

  it('shows every permission for an admin, who carries no grants', () => {
    renderProfile(account({ accessLevel: 'ADMIN', role: null }));
    expect(screen.getByRole('heading', { name: 'What Admin can do' })).toBeTruthy();
    expect(screen.getByText('Every permission in the system')).toBeTruthy();
  });
});
