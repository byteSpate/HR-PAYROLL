// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ApplyLeave } from './components/apply-leave';
import * as api from './api';
vi.mock('./api', () => ({ types: vi.fn(), preview: vi.fn(), apply: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('loads policies, previews and submits a leave request', async () => {
  vi.mocked(api.types).mockResolvedValue([{ id: 't', name: 'Casual', isPaid: true }]);
  vi.mocked(api.preview).mockResolvedValue({ chargedDays: 1, available: 10 });
  vi.mocked(api.apply).mockResolvedValue(undefined);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ApplyLeave /></QueryClientProvider>);
  fireEvent.change(await screen.findByLabelText('Start date'), { target: { value: '2027-01-04' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2027-01-04' } });
  await screen.findByText('1 days charged');
  await userEvent.click(screen.getByRole('button', { name: 'Submit request' }));
  await waitFor(() => expect(api.apply).toHaveBeenCalled());
});
