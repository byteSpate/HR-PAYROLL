// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api';
import type { ApprovalItem } from '../types';
import { ApprovalsSection } from './approvals-section';

// A factory rather than automock: automocking would still import the real module and its '@/' alias.
vi.mock('../api', () => ({ getApprovals: vi.fn(), bulkDecideAttendance: vi.fn() }));

const item = (id: string, name: string, over: Partial<ApprovalItem> = {}): ApprovalItem => ({
  id,
  employee: { id: `e-${id}`, fullName: name, employeeCode: `EMP-${id}`, designation: 'Engineer' },
  date: '2026-03-03',
  checkIn: '2026-03-03T03:00:00.000Z',
  checkOut: '2026-03-03T12:00:00.000Z',
  workedHours: 9,
  isLate: false,
  isEarlyOut: false,
  approval: 'PENDING',
  regularised: false,
  regularisedNote: null,
  exceptions: [],
  agingDays: 1,
  stalled: false,
  ...over,
});

// The component renders a desktop grid and a mobile list together (CSS shows one), so a control or a
// name appears twice. These pick the first.
const firstByText = async (text: string) => (await screen.findAllByText(text))[0]!;
// Exact names: /^approve/ would also match the "Approved" tab.
const firstByRole = async (role: 'checkbox' | 'button', name: string) => (await screen.findAllByRole(role, { name }))[0]!;

function renderSection(isHr = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApprovalsSection accessToken="t" isHr={isHr} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(api.getApprovals).mockResolvedValue([item('1', 'Amina Rahman'), item('2', 'Bilal Hossain')]);
  vi.mocked(api.bulkDecideAttendance).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ApprovalsSection', () => {
  it('lists the queue, titled for HR or for a manager', async () => {
    renderSection(true);
    expect(await firstByText('Amina Rahman')).toBeTruthy();
    expect(await firstByText('Bilal Hossain')).toBeTruthy();
    expect(screen.getByText('Attendance approvals')).toBeTruthy();
    cleanup();
    renderSection(false);
    expect(await screen.findByText('Approvals for my team')).toBeTruthy();
  });

  it('asks for the pending queue first', async () => {
    renderSection();
    await firstByText('Amina Rahman');
    expect(api.getApprovals).toHaveBeenCalledWith('t', 'PENDING');
  });

  it('approves the ticked records in one bulk call', async () => {
    renderSection();
    await userEvent.click(await firstByRole('checkbox', 'Select Amina Rahman on 2026-03-03'));
    await userEvent.click(await firstByRole('button', 'Approve'));
    await waitFor(() => expect(api.bulkDecideAttendance).toHaveBeenCalledWith('t', ['1'], 'APPROVE', undefined));
  });

  it('selects everything with Select all', async () => {
    renderSection();
    await firstByText('Amina Rahman');
    await userEvent.click(await firstByRole('checkbox', 'Select all'));
    await userEvent.click(await firstByRole('button', 'Approve'));
    await waitFor(() => expect(api.bulkDecideAttendance).toHaveBeenCalledWith('t', ['1', '2'], 'APPROVE', undefined));
  });

  it('will not reject without a written reason, then sends it', async () => {
    renderSection();
    await userEvent.click(await firstByRole('checkbox', 'Select Bilal Hossain on 2026-03-03'));
    await userEvent.click(await firstByRole('button', 'Reject'));
    const confirm = within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reject' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(screen.getByRole('textbox'), 'Not at the office');
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(confirm);
    await waitFor(() => expect(api.bulkDecideAttendance).toHaveBeenCalledWith('t', ['2'], 'REJECT', 'Not at the office'));
    expect(api.bulkDecideAttendance).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when nothing needs review', async () => {
    vi.mocked(api.getApprovals).mockResolvedValue([]);
    renderSection();
    expect(await screen.findByText('Nothing needs your review')).toBeTruthy();
  });
});
