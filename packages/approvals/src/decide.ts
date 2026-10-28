import { AppError } from '@erp/utils';

export type DecisionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** A request or record is decided once; a second decision is a stale click, not a new fact. */
export function assertPending(status: string): void {
  if (status !== 'PENDING') throw new AppError(409, 'This request has already been decided');
}

/**
 * Who may decide a subject's request. Admins (ADMIN and SUPER_ADMIN) may decide their own: they
 * hold every permission, so refusing would leave an admin's own leave with nobody able to approve
 * it. Everyone else, including a role holder with the approve permission at `all`, may not.
 */
export function assertMayDecide(args: {
  actorEmployeeId: string | null;
  actorIsAdmin: boolean;
  subjectEmployeeId: string;
  reaches(subjectEmployeeId: string): boolean;
}): void {
  const { actorEmployeeId, actorIsAdmin, subjectEmployeeId } = args;
  if (actorEmployeeId === subjectEmployeeId && !actorIsAdmin) {
    throw new AppError(403, 'You cannot decide your own request');
  }
  if (!actorIsAdmin && !args.reaches(subjectEmployeeId)) {
    throw new AppError(403, 'You cannot decide this request');
  }
}

export function decisionStamp(
  actorUserId: string,
  note?: string | null,
  now = new Date(),
): { decidedBy: string; decidedAt: Date; decisionNote: string | null } {
  const trimmed = note?.trim();
  return { decidedBy: actorUserId, decidedAt: now, decisionNote: trimmed ? trimmed : null };
}
