import { parseDateOnly } from '@erp/export';
import { AppError } from '@erp/utils';
import { officeToday } from './attendance.time.js';

/** First and last day of a month, as UTC-midnight dates. */
export function monthRange(year: number, month: number): { from: Date; to: Date } {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0));
  return { from, to };
}

/** Defaults an absent range to the current office-local month. */
export function resolveRange(from?: string, to?: string): { from: Date; to: Date } {
  const today = officeToday();
  const fallback = monthRange(today.getUTCFullYear(), today.getUTCMonth() + 1);
  const start = from ? parseDateOnly(from) : fallback.from;
  const end = to ? parseDateOnly(to) : fallback.to;
  if (end < start) throw new AppError(400, 'The end of the range is before its start');
  return { from: start, to: end };
}
