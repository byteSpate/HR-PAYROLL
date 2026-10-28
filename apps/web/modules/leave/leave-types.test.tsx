// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LeaveTypes } from './components/leave-types';
import * as api from './api';
vi.mock('./api', () => ({ types: vi.fn(), saveType: vi.fn(), deleteType: vi.fn(), configEmployees: vi.fn().mockResolvedValue([]), adjustBalance: vi.fn() }));
afterEach(cleanup);
it('lists leave policies and offers a policy form', async () => {
  vi.mocked(api.types).mockResolvedValue([{ id: 't', name: 'Casual', isPaid: true }]);
  render(<QueryClientProvider client={new QueryClient()}><LeaveTypes /></QueryClientProvider>);
  expect(await screen.findByRole('cell', { name: 'Casual' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add leave type' })).toBeTruthy();
});
it('lets HR configure leave eligibility and policy rules', async () => {
  const { fireEvent } = await import('@testing-library/react');
  const userEvent = (await import('@testing-library/user-event')).default;
  vi.mocked(api.types).mockResolvedValue([]);
  vi.mocked(api.saveType).mockResolvedValue({ id: 't', code: 'COMP', name: 'Company', isPaid: false, annualQuota: 3, carryForwardPct: 0, maxConsecutive: null, allowsBackdating: false, eligibleFor: ['FULL_TIME'], statutory: false, countsHolidays: true, accrualBasis: 'NONE', minServiceMonths: 0, maxAccrual: null, allowsHalfDay: true });
  render(<QueryClientProvider client={new QueryClient()}><LeaveTypes /></QueryClientProvider>);
  await userEvent.type(screen.getByLabelText('Code'), 'COMP');
  await userEvent.type(screen.getByLabelText('Name'), 'Company');
  fireEvent.change(screen.getByLabelText('Annual quota'), { target: { value: '3' } });
  await userEvent.click(screen.getByLabelText('Paid leave'));
  await userEvent.click(screen.getByLabelText('Count holidays'));
  await userEvent.selectOptions(screen.getByLabelText('Accrual basis'), 'NONE');
  await userEvent.click(screen.getByRole('button', { name: 'Add leave type' }));
  expect(api.saveType).toHaveBeenCalledWith(expect.objectContaining({ isPaid: false, countsHolidays: true, accrualBasis: 'NONE' }), undefined);
});
it('offers a balance adjustment with an employee and reason', async () => {
  vi.mocked(api.types).mockResolvedValue([{ id: 't', name: 'Casual', isPaid: true }]);
  vi.mocked(api.configEmployees).mockResolvedValue([{ id: 'e', fullName: 'Bilal', employeeCode: 'E1' }]);
  render(<QueryClientProvider client={new QueryClient()}><LeaveTypes /></QueryClientProvider>);
  expect(await screen.findByRole('option', { name: 'Bilal (E1)' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Adjust balance' })).toBeTruthy();
});
