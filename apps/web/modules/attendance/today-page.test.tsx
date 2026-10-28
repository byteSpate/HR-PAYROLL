// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AttendanceToday } from './components/attendance-today';
import * as api from './api';
vi.mock('./api', () => ({ listAttendance: vi.fn() }));
afterEach(cleanup);
it('lists attendance records returned for today', async () => {
  vi.mocked(api.listAttendance).mockResolvedValue([{ id: 'a', employeeId: 'e', date: '2026-03-01', checkIn: null, checkOut: null, workedHours: null, approval: 'PENDING', employee: { id: 'e', fullName: 'Bilal', employeeCode: 'E1' } }]);
  render(<QueryClientProvider client={new QueryClient()}><AttendanceToday /></QueryClientProvider>);
  expect(await screen.findByText('Bilal')).toBeTruthy();
});
