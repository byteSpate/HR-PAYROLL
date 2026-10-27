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
