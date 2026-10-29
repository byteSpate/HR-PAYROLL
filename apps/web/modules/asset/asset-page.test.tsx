// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import { AssetPage } from './components/asset-page';

vi.mock('./api', () => ({
  listAssets: vi.fn(),
  listCategories: vi.fn(),
  getMyHoldings: vi.fn(),
  listAssetRequests: vi.fn(),
  listUnacknowledged: vi.fn(),
  listRepairs: vi.fn(),
  listRecoveries: vi.fn(),
  acknowledgeAssignment: vi.fn(),
  approveAssetRequest: vi.fn(),
  rejectAssetRequest: vi.fn(),
  cancelAssetRequest: vi.fn(),
  markAssetRequestOrdered: vi.fn(),
  retireAsset: vi.fn(),
  markAssetLost: vi.fn(),
  capitaliseAsset: vi.fn(),
  payForAsset: vi.fn(),
  disposeAsset: vi.fn(),
}));
vi.mock('@/modules/employee/api', () => ({
  getMe: vi.fn(async () => ({ employment: { employeeCode: 'EMP-9' } })),
  listEmployees: vi.fn(async () => []),
}));

let grants: string[] = [];
vi.mock('@/lib/session', () => ({
  useSession: () => ({ accessToken: 't', status: 'authenticated', user: { id: 'u', grants } }),
}));
vi.mock('@/modules/settings/components/require-permission', () => ({
  holds: (_user: unknown, key: string) => grants.includes(key),
}));

const asset = {
  id: 'a1',
  assetTag: 'BS-AST-00001',
  name: 'Dell Latitude',
  categoryId: 'c',
  category: { id: 'c', code: 'LAPTOP', name: 'Laptop' },
  serialNumber: 'S1',
  model: null,
  status: 'AVAILABLE',
  heldBy: null,
  location: null,
  departmentId: null,
  currency: 'BDT',
  warrantyExpiry: null,
  capitalisedAt: null,
  capitalisedBy: null,
  purchaseCost: '1000.00',
  fxRateToBdt: null,
  purchaseCostBdt: null,
  paid: false,
};

function renderPage(view: 'me' | 'company' | 'ledger') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AssetPage view={view} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.listAssets).mockResolvedValue([asset] as never);
  vi.mocked(api.listCategories).mockResolvedValue([]);
  vi.mocked(api.getMyHoldings).mockResolvedValue([]);
  vi.mocked(api.listAssetRequests).mockResolvedValue([]);
  vi.mocked(api.listUnacknowledged).mockResolvedValue([]);
  vi.mocked(api.listRepairs).mockResolvedValue([]);
  vi.mocked(api.listRecoveries).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  grants = [];
});

describe('AssetPage', () => {
  it('shows a person their own holdings and a way to ask for something, and never loads the register', async () => {
    renderPage('me');
    expect((await screen.findAllByText('Request an asset')).length).toBeGreaterThan(0);
    expect(api.getMyHoldings).toHaveBeenCalled();
    expect(api.listAssets).not.toHaveBeenCalled();
  });

  it('shows the register to a manager of assets, who gets the manage tabs', async () => {
    grants = ['asset.read', 'asset.manage'];
    renderPage('company');
    expect((await screen.findAllByText('Dell Latitude')).length).toBeGreaterThan(0);
    expect(api.getMyHoldings).not.toHaveBeenCalled();
  });

  it('shows the books to whoever may capitalise, with the capitalise action', async () => {
    grants = ['asset.read', 'asset.capitalise'];
    renderPage('ledger');
    expect((await screen.findAllByText('Dell Latitude')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Not capitalised')).length).toBeGreaterThan(0);
  });
});
