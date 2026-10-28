// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ApprovalsTable } from './components/approvals-table';
afterEach(cleanup);
it('supports selecting rows and requires a rejection note', async () => {
  const decide = vi.fn();
  render(<ApprovalsTable rows={[{ id: 'one', name: 'Amina', date: '2026-03-01' }, { id: 'two', name: 'Bilal', date: '2026-03-02' }]} onDecide={decide} />);
  await userEvent.click(screen.getByLabelText('Select Amina'));
  await userEvent.click(screen.getByLabelText('Select Bilal'));
  expect((screen.getByRole('button', { name: 'Reject selected' }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.type(screen.getByLabelText('Decision note'), 'Missing details');
  await userEvent.click(screen.getByRole('button', { name: 'Reject selected' }));
  expect(decide).toHaveBeenCalledWith(['one', 'two'], 'REJECTED', 'Missing details');
});
