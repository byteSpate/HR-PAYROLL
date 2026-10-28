// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MyAttendance } from './components/my-attendance';
import * as api from './api';
vi.mock('./api', () => ({ myAttendance: vi.fn(), punch: vi.fn(), regularise: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('punches in and refreshes attendance', async () => {
  vi.mocked(api.myAttendance).mockResolvedValue([]);
  vi.mocked(api.punch).mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MyAttendance /></QueryClientProvider>);
  await userEvent.click(await screen.findByRole('button', { name: 'Check in' }));
  await waitFor(() => expect(api.punch).toHaveBeenCalledWith('check-in'));
});
it('allows an employee to submit a regularisation request', async () => {
  const { fireEvent } = await import('@testing-library/react');
  vi.mocked(api.myAttendance).mockResolvedValue([]);
  vi.mocked(api.regularise).mockResolvedValue(undefined);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MyAttendance /></QueryClientProvider>);
  fireEvent.change(await screen.findByLabelText('Date to regularise'), { target: { value: '2026-03-02' } });
  fireEvent.change(screen.getByLabelText('Regularised check in'), { target: { value: '09:00' } });
  await userEvent.type(screen.getByLabelText('Regularisation reason'), 'Forgot');
  await userEvent.click(screen.getByRole('button', { name: 'Request correction' }));
  await waitFor(() => expect(api.regularise).toHaveBeenCalled());
});
