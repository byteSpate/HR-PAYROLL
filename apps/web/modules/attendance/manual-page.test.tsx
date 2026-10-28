// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ManualPage } from './components/manual-page';
vi.mock('./api', () => ({ manual: vi.fn(), manualEmployees: vi.fn().mockResolvedValue([]), manualRecords: vi.fn().mockResolvedValue([]), correct: vi.fn() }));
afterEach(cleanup);
it('shows a manual entry form', () => {
  render(<QueryClientProvider client={new QueryClient()}><ManualPage /></QueryClientProvider>);
  expect(screen.getByRole('button', { name: 'Save entry' })).toBeTruthy();
});
it('offers existing records for correction', async () => {
  const api = await import('./api');
  vi.mocked(api.manualRecords).mockResolvedValue([{ id: 'r', employeeId: 'e', date: '2026-03-02', checkIn: null, checkOut: null, workedHours: null, approval: 'PENDING', employee: { id: 'e', fullName: 'Amina', employeeCode: 'E1' } }]);
  render(<QueryClientProvider client={new QueryClient()}><ManualPage /></QueryClientProvider>);
  expect(await screen.findByRole('option', { name: 'Amina (E1)' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Correct record' })).toBeTruthy();
});
