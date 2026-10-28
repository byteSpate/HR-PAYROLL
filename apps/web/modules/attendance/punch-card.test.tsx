// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PunchCard } from './components/punch-card';
afterEach(cleanup);
it('shows the appropriate punch action', () => {
  const action = vi.fn();
  const view = render(<PunchCard record={null} onPunch={action} />);
  expect(screen.getByRole('button', { name: 'Check in' })).toBeTruthy();
  view.rerender(<PunchCard record={{ checkIn: '2026-01-01', checkOut: null }} onPunch={action} />);
  expect(screen.getByRole('button', { name: 'Check out' })).toBeTruthy();
  view.rerender(<PunchCard record={{ checkIn: '2026-01-01', checkOut: '2026-01-01' }} onPunch={action} />);
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
});
