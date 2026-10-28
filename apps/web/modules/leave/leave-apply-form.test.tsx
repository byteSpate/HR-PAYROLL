// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LeaveApplyForm } from './components/leave-apply-form';
afterEach(cleanup);
it('previews the charge and blocks submission when the balance is short', async () => {
  render(<LeaveApplyForm types={[{ id: 't', name: 'Casual', isPaid: true, balance: 1 }]} preview={() => 2} onSubmit={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-03-05' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-03-06' } });
  expect(await screen.findByText('2 days charged')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Submit request' }) as HTMLButtonElement).disabled).toBe(true);
});
it('waits for an authoritative asynchronous preview before enabling submission', async () => {
  render(<LeaveApplyForm types={[{ id: 't', name: 'Casual', isPaid: true, balance: 3 }]} preview={async () => 1} onSubmit={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-03-05' } });
  fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-03-05' } });
  expect(await screen.findByText('1 days charged')).toBeTruthy();
});
