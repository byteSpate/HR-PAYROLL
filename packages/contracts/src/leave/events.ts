import { z } from 'zod';
export const LEAVE_EVENTS = [
  'leave.requested',
  'leave.approved',
  'leave.rejected',
  'leave.cancelled',
] as const;
export const leaveEventPayload = z.object({
  requestId: z.string(),
  employeeId: z.string(),
  subjectUserId: z.string(),
  actorUserId: z.string(),
  chargedDays: z.number(),
});
