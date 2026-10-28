// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AttendanceConfig } from './components/attendance-config';
import * as api from './api';
vi.mock('./api', () => ({ configList: vi.fn(), createConfig: vi.fn(), deleteConfig: vi.fn(), exportConfig: vi.fn() }));
afterEach(cleanup);
it('lists configured holidays and provides an add form', async () => {
  vi.mocked(api.configList).mockResolvedValue([{ id: 'h', name: 'Holiday', date: '2026-03-05', type: 'GENERAL' }]);
  render(<QueryClientProvider client={new QueryClient()}><AttendanceConfig kind="holidays" /></QueryClientProvider>);
  expect(await screen.findByText('Holiday')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add holiday' })).toBeTruthy();
});
