// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import type { LeaveRequestItem } from './types';
import { LeavePage, type LeaveSection } from './components/leave-page';

// Factories rather than automocks: automocking would still import the real modules and their '@/' alias.
vi.mock('./api', () => ({
  listLeaveRequests: vi.fn(), listLeaveTypes: vi.fn(), getMyLeaveBalances: vi.fn(), getTeamStatus: vi.fn(),
  approveLeaveRequest: vi.fn(), rejectLeaveRequest: vi.fn(), revertLeaveRequest: vi.fn(), cancelLeaveRequest: vi.fn(),
  applyForLeave: vi.fn(), getHalfDayWindow: vi.fn(),
}));
vi.mock('@/modules/attendance/api', () => ({ listHolidays: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/session', () => ({ useSession: () => ({ accessToken: 't', status: 'authenticated', user: { id: 'u-me' } }) }));
vi.mock('@/modules/employee/hooks', () => ({ useMe: () => ({ data: { id: 'e-me' } }) }));
vi.mock('@/modules/settings/components/require-permission', () => ({ holds: () => true }));
vi.mock('@/lib/query/default-options', () => ({ REFERENCE_STALE_MS: 0 }));

const request = (id: string, name: string, employeeId: string, over: Partial<LeaveRequestItem> = {}): LeaveRequestItem => ({
  id,
  employee: { id: employeeId, fullName: name, employeeCode: `EMP-${id}` },
  leaveType: { id: 't1', code: 'CASUAL', name: 'Casual Leave', isPaid: true },
  startDate: '2099-01-05', endDate: '2099-01-05', startSession: 'FIRST_HALF', endSession: 'SECOND_HALF',
  days: 1, reason: 'Family event', status: 'PENDING', decidedBy: null, decidedAt: null, decisionNote: null,
  createdAt: '2026-10-01T00:00:00.000Z', ...over,
});

function renderPage(section: LeaveSection) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><LeavePage section={section} /></QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(api.listLeaveRequests).mockResolvedValue([request('r1', 'Me Myself', 'e-me'), request('r2', 'Bilal Hossain', 'e-bilal')]);
  vi.mocked(api.listLeaveTypes).mockResolvedValue([]);
  vi.mocked(api.getMyLeaveBalances).mockResolvedValue([
    { leaveTypeId: 't1', code: 'CASUAL', name: 'Casual Leave', isPaid: true, annualQuota: 10, entitlement: 10, used: 2, pending: 1, balance: 8, accrual: null },
  ]);
  vi.mocked(api.getTeamStatus).mockResolvedValue([
    { id: 'e-bilal', fullName: 'Bilal Hossain', employeeCode: 'EMP-2', designation: 'Engineer', status: 'ON_LEAVE', currentLeave: { leaveTypeName: 'Casual Leave', startDate: '2026-10-29', endDate: '2026-10-30' } },
  ]);
  vi.mocked(api.cancelLeaveRequest).mockResolvedValue(request('r1', 'Me Myself', 'e-me', { status: 'CANCELLED' }));
  vi.mocked(api.approveLeaveRequest).mockResolvedValue(request('r2', 'Bilal Hossain', 'e-bilal', { status: 'APPROVED' }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('LeavePage', () => {
  it('shows a person their own balances and requests only, and lets them cancel a pending one', async () => {
    renderPage('mine');
    expect(await screen.findByText('My requests')).toBeTruthy();
    expect((await screen.findAllByText('Casual Leave')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Bilal Hossain')).toBeNull();
    expect(screen.getByRole('button', { name: 'Request leave' })).toBeTruthy();
    // The table renders a desktop grid and a mobile list together (CSS shows one), so controls appear twice.
    await userEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]!);
    await waitFor(() => expect(api.cancelLeaveRequest).toHaveBeenCalledWith('t', 'r1'));
  });

  it('lists every request the viewer may review and decides one from its sheet', async () => {
    renderPage('requests');
    expect(await screen.findByText('All leave requests')).toBeTruthy();
    expect((await screen.findAllByText('Bilal Hossain')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Request leave' })).toBeNull();
    await userEvent.click((await screen.findAllByRole('button', { name: 'Decide' }))[1]!);
    await userEvent.click(await screen.findByRole('button', { name: /approve/i }));
    await waitFor(() => expect(api.approveLeaveRequest).toHaveBeenCalledWith('t', 'r2'));
  });

  it('shows the team and its requests without the viewer’s own', async () => {
    renderPage('team');
    expect(await screen.findByText('My team')).toBeTruthy();
    expect(await screen.findByText('Team requests')).toBeTruthy();
    expect((await screen.findAllByText('Bilal Hossain')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Me Myself')).toBeNull();
  });
});
