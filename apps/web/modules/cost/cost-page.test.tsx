// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import { CostPage } from './components/cost-page';

vi.mock('./api', () => ({
  listCosts: vi.fn(),
  listCostCategories: vi.fn(),
  listCostCommitments: vi.fn(),
  getCostSummary: vi.fn(),
  payCost: vi.fn(),
  createCost: vi.fn(),
  updateCost: vi.fn(),
  createCostCommitment: vi.fn(),
  updateCostCommitment: vi.fn(),
  uploadCostReceipt: vi.fn(),
  getCostReceiptUrl: vi.fn(),
  deleteCostReceipt: vi.fn(),
  getCost: vi.fn(),
  previewCostImport: vi.fn(),
  commitCostImport: vi.fn(),
}));
let grants: string[] = [];
vi.mock('@/lib/session', () => ({
  useSession: () => ({ accessToken: 't', status: 'authenticated', user: { id: 'u', grants } }),
}));
vi.mock('@/modules/settings/components/require-permission', () => ({
  holds: (_user: unknown, key: string) => grants.includes(key),
}));

const bill = {
  id: 'b1',
  categoryId: 'c',
  category: { id: 'c', code: 'RENT', name: 'Office rent' },
  commitmentId: null,
  commitment: null,
  label: 'October rent',
  payee: 'Landlord',
  periodMonth: 10,
  periodYear: new Date().getFullYear(),
  amount: '150000.50',
  currency: 'BDT',
  dueDate: null,
  status: 'PENDING',
  paidAt: null,
  paidBy: null,
  paymentRef: null,
  notes: null,
  createdBy: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  isOverdue: false,
};

beforeEach(() => {
  vi.mocked(api.listCosts).mockResolvedValue([bill] as never);
  vi.mocked(api.listCostCategories).mockResolvedValue([]);
  vi.mocked(api.listCostCommitments).mockResolvedValue([]);
  vi.mocked(api.getCostSummary).mockResolvedValue({ categories: [], totals: [], overdueCount: 0 });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  grants = [];
});

describe('CostPage', () => {
  it('lists the bills for someone who may read, without the add action', async () => {
    grants = ['cost.read'];
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <CostPage />
      </QueryClientProvider>,
    );
    expect((await screen.findAllByText('October rent')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Add a cost/i })).toBeNull();
  });
});
