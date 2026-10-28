// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LeaveApplyForm } from './components/leave-apply-form';
afterEach(cleanup);
it('previews the charge and blocks submission when the balance is short', () => {
  render(<LeaveApplyForm types={[{ id: 't', name: 'Casual', isPaid: true, balance: 1 }]} preview={() => 2} onSubmit={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-03-05' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-03-06' } });
  expect(screen.getByText('2 days charged')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Submit request' }) as HTMLButtonElement).disabled).toBe(true);
});
