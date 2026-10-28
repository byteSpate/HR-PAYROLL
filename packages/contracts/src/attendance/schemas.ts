import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a real date');
export const monthString = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm');

export const holidayTypes = ['GENERAL', 'EXECUTIVE_ORDER', 'OPTIONAL', 'WORKING_DAY'] as const;

export const shiftInputSchema = z
  .object({
    name: text(80),
    startTime: hhmm,
    endTime: hhmm,
    breakMinutes: z.number().int().min(0).max(480).default(60),
    graceMinutes: z.number().int().min(0).max(240).default(15),
    // 0=Sunday ... 6=Saturday.
    weeklyOffDays: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .refine((days) => new Set(days).size === days.length, 'Each day once'),
    effectiveFrom: dateOnly.nullable().optional(),
    effectiveTo: dateOnly.nullable().optional(),
  })
  .refine((s) => !s.effectiveFrom === !s.effectiveTo, { message: 'Give both dates of a dated shift, or neither', path: ['effectiveTo'] })
  .refine((s) => !s.effectiveFrom || !s.effectiveTo || s.effectiveFrom <= s.effectiveTo, {
    message: 'The end date is before the start date',
    path: ['effectiveTo'],
  });

export const holidayInputSchema = z.object({
  name: text(120),
  date: dateOnly,
  type: z.enum(holidayTypes).default('GENERAL'),
});

/** A holiday change names only what it changes. No defaults: an omitted type must not reset to GENERAL. */
export const holidayPatchSchema = z.object({ name: text(120), date: dateOnly, type: z.enum(holidayTypes) }).partial();

export type ShiftInput = z.infer<typeof shiftInputSchema>;
export type HolidayInput = z.infer<typeof holidayInputSchema>;

export interface ShiftView {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceMinutes: number;
  weeklyOffDays: number[];
  effectiveFrom: string | null;
  effectiveTo: string | null;
  employeeCount: number;
}

export interface HolidayView {
  id: string;
  name: string;
  date: string;
  type: (typeof holidayTypes)[number];
}
