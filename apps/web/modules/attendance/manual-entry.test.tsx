// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ManualEntry } from './components/manual-entry';
afterEach(cleanup);
it('submits the employee, date, times and reason', async () => {
  const submit = vi.fn();
  render(<ManualEntry onSubmit={submit} />);
  await userEvent.type(screen.getByLabelText('Employee ID'), 'employee-id');
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-03-02' } });
  fireEvent.change(screen.getByLabelText('Check in'), { target: { value: '09:00' } });
  fireEvent.change(screen.getByLabelText('Check out'), { target: { value: '18:00' } });
  await userEvent.type(screen.getByLabelText('Reason'), 'Manual');
  await userEvent.click(screen.getByRole('button', { name: 'Save entry' }));
  expect(submit).toHaveBeenCalledWith({ employeeId: 'employee-id', date: '2026-03-02', checkIn: '09:00', checkOut: '18:00', note: 'Manual' });
});
