// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LeaveTypes } from './components/leave-types';
import * as api from './api';
vi.mock('./api', () => ({ types: vi.fn(), saveType: vi.fn(), deleteType: vi.fn() }));
afterEach(cleanup);
it('lists leave policies and offers a policy form', async () => {
  vi.mocked(api.types).mockResolvedValue([{ id: 't', name: 'Casual', isPaid: true }]);
  render(<QueryClientProvider client={new QueryClient()}><LeaveTypes /></QueryClientProvider>);
  expect(await screen.findByText('Casual')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add leave type' })).toBeTruthy();
});
