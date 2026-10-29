import { z } from 'zod';

export const ATTENDANCE_EVENTS = [
  'attendance.approved',
  'attendance.rejected',
  'attendance.corrected',
] as const;

// `selfDecided` is true when an admin decided their own record, so the audit trail and any consumer
// can see the decider and the subject are the same person.
export const attendanceDecidedPayload = z.object({
  attendanceId: z.string(),
  employeeId: z.string(),
  date: z.string(),
  decidedBy: z.string(),
  decisionNote: z.string().nullable(),
  selfDecided: z.boolean(),
});

export const attendanceCorrectedPayload = z.object({
  attendanceId: z.string(),
  employeeId: z.string(),
  date: z.string(),
  correctedBy: z.string(),
});

export type AttendanceDecidedPayload = z.infer<typeof attendanceDecidedPayload>;
export type AttendanceCorrectedPayload = z.infer<typeof attendanceCorrectedPayload>;
