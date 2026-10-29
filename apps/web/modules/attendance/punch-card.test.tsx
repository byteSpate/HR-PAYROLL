// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PunchCard } from './components/punch-card';
import type { TodayAttendance } from './types';

afterEach(cleanup);

const shift = { id: 's', name: 'General', startTime: '09:00', endTime: '18:00', breakMinutes: 60, graceMinutes: 15, weeklyOffDays: [5], expectedHours: 9 };
const today = (over: Partial<TodayAttendance> = {}): TodayAttendance => ({
  serverTime: '2026-03-02T05:00:00.000Z', date: '2026-03-02', status: 'ABSENT', checkIn: null, checkOut: null, workedHours: null,
  isLate: false, isEarlyOut: false, approval: null, shift, canCheckIn: true, canCheckOut: false, detail: null, leaveFraction: 0, ...over,
});
const card = (t: TodayAttendance | undefined, handlers = { onCheckIn: vi.fn(), onCheckOut: vi.fn() }) =>
  render(<PunchCard today={t} isLoading={false} isPunching={false} error={null} onDayRollover={vi.fn()} {...handlers} />);

it('offers only the action the server says is allowed', () => {
  const onCheckIn = vi.fn();
  card(today(), { onCheckIn, onCheckOut: vi.fn() });
  fireEvent.click(screen.getByRole('button', { name: 'Check in' }));
  expect(onCheckIn).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Check out' })).toBeNull();
});

it('offers check out once checked in, and says the day is done after it', () => {
  const onCheckOut = vi.fn();
  const view = card(today({ canCheckIn: false, canCheckOut: true, checkIn: '2026-03-02T03:00:00.000Z', status: 'PRESENT' }), { onCheckIn: vi.fn(), onCheckOut });
  fireEvent.click(screen.getByRole('button', { name: 'Check out' }));
  expect(onCheckOut).toHaveBeenCalledTimes(1);
  view.unmount();
  card(today({ canCheckIn: false, canCheckOut: false, checkIn: '2026-03-02T03:00:00.000Z', checkOut: '2026-03-02T12:00:00.000Z', status: 'PRESENT', approval: 'PENDING' }));
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByText('Done for today')).toBeTruthy();
});

it('says what a day off means above the button', () => {
  card(today({ status: 'HOLIDAY', detail: 'Eid ul-Fitr' }));
  expect(screen.getByText('Eid ul-Fitr')).toBeTruthy();
  expect(screen.getByText(/not expected in/i)).toBeTruthy();
});
