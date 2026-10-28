// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MyAttendance } from './components/my-attendance';
import * as api from './api';
vi.mock('./api', () => ({ myAttendance: vi.fn(), punch: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('punches in and refreshes attendance', async () => {
  vi.mocked(api.myAttendance).mockResolvedValue([]);
  vi.mocked(api.punch).mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MyAttendance /></QueryClientProvider>);
  await userEvent.click(await screen.findByRole('button', { name: 'Check in' }));
  await waitFor(() => expect(api.punch).toHaveBeenCalledWith('check-in'));
});
