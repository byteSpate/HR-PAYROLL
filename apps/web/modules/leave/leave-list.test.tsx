// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LeaveList } from './components/leave-list';
import * as api from './api';
vi.mock('./api', () => ({ requests: vi.fn(), decide: vi.fn(), teamStatus: vi.fn(), balances: vi.fn() }));
afterEach(cleanup);
it('displays pending team leave requests', async () => {
  vi.mocked(api.requests).mockResolvedValue([{ id: 'r', startDate: '2027-01-04', endDate: '2027-01-04', chargedDays: 1, status: 'PENDING', leaveType: { id: 't', name: 'Casual', isPaid: true }, employee: { id: 'e', fullName: 'Bilal', employeeCode: 'E1' } }]);
  render(<QueryClientProvider client={new QueryClient()}><LeaveList mode="approvals" /></QueryClientProvider>);
  expect(await screen.findByText('Bilal')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy();
});
it('shows the team members on leave today', async () => {
  vi.mocked(api.teamStatus).mockResolvedValue([{ id: 'r', startDate: '2027-01-04', endDate: '2027-01-04', chargedDays: 1, status: 'APPROVED', leaveType: { id: 't', name: 'Casual', isPaid: true }, employee: { id: 'e', fullName: 'Amina', employeeCode: 'E1' } }]);
  render(<QueryClientProvider client={new QueryClient()}><LeaveList mode="status" /></QueryClientProvider>);
  expect(await screen.findByText('Amina')).toBeTruthy();
});
it('shows the employee’s leave balances', async () => {
  vi.mocked(api.requests).mockResolvedValue([]);
  vi.mocked(api.balances).mockResolvedValue([{ id: 'b', year: 2026, accrued: 10, used: 2, balance: 8, leaveType: { id: 't', name: 'Casual', isPaid: true } }]);
  render(<QueryClientProvider client={new QueryClient()}><LeaveList mode="mine" /></QueryClientProvider>);
  expect(await screen.findByText('8 days remaining')).toBeTruthy();
});
