export const MS_PER_DAY = 86_400_000;

/** The inverse of formatDateOnly. Rejects anything that is not a real calendar date, so "2026-02-30" never rolls over. */
export function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Expected a YYYY-MM-DD date, received "${value}"`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || formatDateOnly(date) !== value) throw new Error(`"${value}" is not a valid calendar date`);
  return date;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Date-only values are carried as UTC midnight; the wire and file-name format is YYYY-MM-DD. */
export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// File names and audit dates follow the office calendar, not the server's: a UTC host at 20:00Z is
// already tomorrow in Dhaka.
export function officeToday(timeZone = process.env['APP_TIMEZONE'] ?? 'Asia/Dhaka'): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}
