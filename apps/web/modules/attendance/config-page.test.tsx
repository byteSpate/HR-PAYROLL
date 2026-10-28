// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AttendanceConfig } from './components/attendance-config';
import * as api from './api';
vi.mock('./api', () => ({ configList: vi.fn(), createConfig: vi.fn(), deleteConfig: vi.fn(), exportConfig: vi.fn(), importGuide: vi.fn(), importTemplate: vi.fn(), importPreview: vi.fn(), importCommit: vi.fn() }));
afterEach(cleanup);
it('lists configured holidays and provides an add form', async () => {
  vi.mocked(api.configList).mockResolvedValue([{ id: 'h', name: 'Holiday', date: '2026-03-05', type: 'GENERAL' }]);
  render(<QueryClientProvider client={new QueryClient()}><AttendanceConfig kind="holidays" /></QueryClientProvider>);
  expect(await screen.findByText('Holiday')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add holiday' })).toBeTruthy();
});
it('preserves shift settings when editing its name', async () => {
  const userEvent = (await import('@testing-library/user-event')).default;
  vi.mocked(api.configList).mockResolvedValue([{ id: 's', name: 'Ramadan', startTime: '09:00', endTime: '16:00', graceMinutes: 5, breakMinutes: 30, weeklyOffDays: [5, 6], effectiveFrom: '2026-03-01', effectiveTo: '2026-03-30' }]);
  vi.mocked(api.createConfig).mockResolvedValue({ id: 's', name: 'Updated' });
  render(<QueryClientProvider client={new QueryClient()}><AttendanceConfig kind="shifts" /></QueryClientProvider>);
  await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(api.createConfig).toHaveBeenCalledWith('shifts', expect.objectContaining({ graceMinutes: 5, breakMinutes: 30, weeklyOffDays: [5, 6], effectiveFrom: '2026-03-01', effectiveTo: '2026-03-30' }), 's');
});
it('offers an import guide for holiday files', async () => {
  vi.mocked(api.configList).mockResolvedValue([]);
  vi.mocked(api.importGuide).mockResolvedValue([{ header: 'name', typeLabel: 'text', required: true, description: 'Holiday name', example: 'Eid' }]);
  render(<QueryClientProvider client={new QueryClient()}><AttendanceConfig kind="holidays" /></QueryClientProvider>);
  expect(await screen.findByText('Holiday name')).toBeTruthy();
});
