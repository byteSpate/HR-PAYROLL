// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AttendanceReport } from './components/attendance-report';
import * as api from './api';
vi.mock('./api', () => ({ report: vi.fn(), exportReport: vi.fn() }));
afterEach(cleanup);
it('displays an employee and their daily statuses', async () => {
  vi.mocked(api.report).mockResolvedValue([{ employeeId: 'e', employeeCode: 'E1', fullName: 'Bilal', department: 'HR', days: [{ date: '2026-03-02', status: 'leave' }] }]);
  render(<QueryClientProvider client={new QueryClient()}><AttendanceReport /></QueryClientProvider>);
  expect(await screen.findByText('Bilal')).toBeTruthy();
  expect(screen.getByText('leave')).toBeTruthy();
});
