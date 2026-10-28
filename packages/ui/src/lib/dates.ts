
/** Friday — the weekly non-working day. Matches WEEKLY_OFF_DAY on the server. */
export const WEEKLY_OFF_DAY = 5

/**
 * Format a Date as YYYY-MM-DD using its LOCAL parts.
 *
 * Deliberately not `toISOString().slice(0,10)`: at UTC+6 a locally-picked
 * Aug 14 becomes "2026-08-13T18:00Z", so that idiom stores every date a day
 * early.
 */
export function toDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Parse YYYY-MM-DD into a local-midnight Date (the inverse of toDateString). */
export function parseDateString(value: string): Date {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

export function isWeeklyOff(date: Date): boolean {
  return date.getDay() === WEEKLY_OFF_DAY
}
