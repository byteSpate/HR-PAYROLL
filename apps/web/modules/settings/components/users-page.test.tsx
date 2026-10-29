// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserAccountView } from '@erp/contracts/core';
import * as api from '../api';
import { UsersPage } from './users-page';

// Factories rather than automocks: automocking would still import the real modules and their '@/' alias.
vi.mock('../api', () => ({
  listUsers: vi.fn(),
  listRoleOptions: vi.fn(),
  createUser: vi.fn(),
  setUserRole: vi.fn(),
  setUserAccessLevel: vi.fn(),
  setUserStatus: vi.fn(),
}));

let viewer = { id: 'u-me', accessLevel: 'SUPER_ADMIN', grants: [] as string[] };
vi.mock('@/lib/session', () => ({ useSession: () => ({ user: viewer, status: 'authenticated' }) }));

const account = (over: Partial<UserAccountView>): UserAccountView => ({
  id: 'u1',
  email: 'pat@example.com',
  displayName: 'Pat',
  isActive: true,
  mustChangePassword: false,
  accessLevel: 'STANDARD',
  role: { id: 'r-clerk', name: 'Payroll clerk' },
  grants: [],
  createdAt: '2026-10-01T00:00:00.000Z',
  employee: null,
  ...over,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UsersPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  viewer = { id: 'u-me', accessLevel: 'SUPER_ADMIN', grants: [] };
  vi.mocked(api.listRoleOptions).mockResolvedValue([
    { id: 'r-clerk', name: 'Payroll clerk' },
    { id: 'r-hr', name: 'HR officer' },
  ]);
  // The owner's row comes first, so the first "Change role" button on the page is Pat's.
  vi.mocked(api.listUsers).mockResolvedValue([
    account({ id: 'u-me', email: 'owner@example.com', accessLevel: 'SUPER_ADMIN', role: null }),
    account({ id: 'u1' }),
    account({ id: 'u2', email: 'amy@example.com', accessLevel: 'ADMIN', role: null }),
  ]);
  vi.mocked(api.setUserRole).mockResolvedValue(account({}) as never);
  vi.mocked(api.setUserAccessLevel).mockResolvedValue(account({}) as never);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openRoleDialogForPat() {
  await screen.findAllByText('pat@example.com');
  await userEvent.click(screen.getAllByRole('button', { name: 'Change role' })[0]!);
  await userEvent.click(await screen.findByRole('combobox'));
}

describe('UsersPage', () => {
  it('names each account by its level or role and counts the admins who can still administer', async () => {
    renderPage();
    expect((await screen.findAllByText('pat@example.com')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Payroll clerk').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Super Admin').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Admin').length).toBeGreaterThan(0);
    expect(screen.getByText('Active admins')).toBeTruthy();
  });

  it('gives a standard account another role with one call and leaves the access level alone', async () => {
    renderPage();
    await openRoleDialogForPat();
    await userEvent.click(await screen.findByRole('option', { name: 'HR officer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save role' }));
    await waitFor(() => expect(api.setUserRole).toHaveBeenCalledWith('u1', 'r-hr'));
    expect(api.setUserAccessLevel).not.toHaveBeenCalled();
  });

  it('offers Admin only to the super admin, who alone may appoint one', async () => {
    renderPage();
    await openRoleDialogForPat();
    expect(await screen.findByRole('option', { name: 'Admin' })).toBeTruthy();
    cleanup();

    viewer = { id: 'u-me', accessLevel: 'STANDARD', grants: ['user.manage'] };
    renderPage();
    await openRoleDialogForPat();
    await screen.findByRole('option', { name: 'HR officer' });
    expect(screen.queryByRole('option', { name: 'Admin' })).toBeNull();
  });
});
