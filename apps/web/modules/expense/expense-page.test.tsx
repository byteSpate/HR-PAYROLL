// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import type { ExpenseClaim } from './types';
import { ExpensePage } from './components/expense-page';

// Factories rather than automocks: automocking would still import the real modules and their '@/' alias.
vi.mock('./api', () => ({
  listExpenseCategories: vi.fn(), createExpenseClaim: vi.fn(), getMyExpenseClaims: vi.fn(), listExpenseClaims: vi.fn(),
  approveExpenseClaim: vi.fn(), batchApproveExpenseClaims: vi.fn(), rejectExpenseClaim: vi.fn(), updateExpenseClaim: vi.fn(),
  deleteExpenseClaim: vi.fn(), uploadClaimReceipt: vi.fn(), listClaimReceipts: vi.fn(), getClaimReceiptUrl: vi.fn(),
  deleteClaimReceipt: vi.fn(), getExpenseReport: vi.fn(), getOutstandingExpenseReimbursements: vi.fn(), downloadExpenseReport: vi.fn(),
}));

let grants: string[] = [];
vi.mock('@/lib/session', () => ({ useSession: () => ({ accessToken: 't', status: 'authenticated', user: { id: 'u-me', grants } }) }));
vi.mock('@/modules/settings/components/require-permission', () => ({ holds: (_user: unknown, key: string) => grants.includes(key) }));

const claim = (over: Partial<ExpenseClaim> = {}): ExpenseClaim => ({
  id: 'c1', employeeId: 'e1', name: 'Client lunch', travelFrom: null, travelTo: null, amount: '80.00', categoryId: 'k1',
  category: { code: 'OTHER', name: 'Other' }, description: null, status: 'PENDING', expenseDate: '2026-10-29', currency: 'BDT',
  fxRateToBdt: null, reviewedBy: null, reviewedAt: null, reviewNote: null, payslipId: null, settlementId: null,
  createdAt: '2026-10-29T00:00:00.000Z', employee: { id: 'e1', fullName: 'Bilal Hossain', employeeCode: 'EMP-2' }, ...over,
});

const report = { from: '2026-10-01', to: '2026-10-31', employee: null, status: null, rows: [], totals: { claims: 0, byCurrency: [], byStatus: [] } };

function renderPage(view: 'me' | 'company') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ExpensePage view={view} /></QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(api.listExpenseCategories).mockResolvedValue([{ id: 'k1', code: 'OTHER', name: 'Other' }]);
  vi.mocked(api.getMyExpenseClaims).mockResolvedValue([claim({ name: 'My own taxi' })]);
  vi.mocked(api.listExpenseClaims).mockResolvedValue([claim()]);
  vi.mocked(api.getExpenseReport).mockResolvedValue(report as never);
  vi.mocked(api.getOutstandingExpenseReimbursements).mockResolvedValue({ rows: [], totals: { claims: 0, byCurrency: [] } });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  grants = [];
});

describe('ExpensePage', () => {
  it('shows a person their own claims, with a way to file one, and no review queue', async () => {
    renderPage('me');
    expect((await screen.findAllByText('My own taxi')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Claim an expense' }).length).toBeGreaterThan(0);
    expect(api.listExpenseClaims).not.toHaveBeenCalled();
    expect(screen.queryByText('Review queue')).toBeNull();
  });

  it('shows everybody’s claims to expense.read, and approve controls only to expense.approve', async () => {
    grants = ['expense.read'];
    renderPage('company');
    expect((await screen.findAllByText('Client lunch')).length).toBeGreaterThan(0);
    expect(api.getMyExpenseClaims).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    cleanup();

    grants = ['expense.read', 'expense.approve'];
    renderPage('company');
    expect((await screen.findAllByRole('button', { name: 'Approve' })).length).toBeGreaterThan(0);
  });

  it('gives an approver without expense.read the claims they are asked to decide', async () => {
    grants = ['expense.approve'];
    renderPage('company');
    expect((await screen.findAllByText('Client lunch')).length).toBeGreaterThan(0);
    expect(api.listExpenseClaims).toHaveBeenCalled();
    expect((await screen.findAllByRole('button', { name: 'Approve' })).length).toBeGreaterThan(0);
  });
});
