// Wire types for the leave screens, written once here and read by the API and the web app.
// Ported from HR-MNG-V1, which mirrored them by hand on each side.

import type { EmploymentType } from '../employee/types.js';
export type { EmploymentType };

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type TeamStatus = 'ACTIVE' | 'ON_LEAVE' | 'LEFT';
export type LeaveAccrualBasis = 'PRO_RATED' | 'PER_EVENT' | 'EARNED' | 'NONE';

/** Which half of a working day. Mirrors the LeaveSession enum. */
export type LeaveSession = 'FIRST_HALF' | 'SECOND_HALF';

/**
 * The shift window a half day is measured against, for one date.
 *
 * Per date rather than per employee: a dated shift override (Ramadan hours) moves the midpoint, so
 * a window cached at login would be wrong for a leave filed into that window.
 */
export interface HalfDayWindow {
  startTime: string;
  midpoint: string;
  endTime: string;
}

export interface LeaveType {
  id: string;
  /** Stable machine key (CASUAL, SICK, EARNED, MATERNITY, LWP, ...). */
  code: string;
  name: string;
  isPaid: boolean;
  annualQuota: number;
  carryForwardPct: number;
  maxConsecutive: number | null;
  allowsBackdating: boolean;
  eligibleFor: EmploymentType[];
  /** Granted by the Bangladesh Labour Act rather than by company policy. */
  statutory: boolean;
  /** Section 117(3): holidays inside an earned-leave period are part of the leave. */
  countsHolidays: boolean;
  accrualBasis: LeaveAccrualBasis;
  minServiceMonths: number;
  maxAccrual: number | null;
  /** Whether a request against this type may be a half day. */
  allowsHalfDay: boolean;
}

export interface DecidedBy {
  id: string;
  email: string;
  fullName: string | null;
}

export interface LeaveRequestItem {
  id: string;
  employee: { id: string; fullName: string; employeeCode: string };
  leaveType: { id: string; code: string; name: string; isPaid: boolean };
  startDate: string;
  endDate: string;
  startSession: LeaveSession;
  endSession: LeaveSession;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decidedBy: DecidedBy | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

/** Where an earned-leave entitlement came from. Only on EARNED types. */
export interface AccrualDetail {
  daysWorked: number;
  perDaysWorked: number;
  windowStart: string;
  windowEnd: string;
  /** Days in the window that predate attendance tracking, so are unknown. */
  untrackedDays: number;
  eligible: boolean;
  minServiceMonths: number;
}

export interface LeaveBalanceItem {
  leaveTypeId: string;
  code: string;
  name: string;
  isPaid: boolean;
  annualQuota: number;
  entitlement: number;
  used: number;
  pending: number;
  balance: number;
  accrual: AccrualDetail | null;
}

export interface TeamMemberStatus {
  id: string;
  fullName: string;
  employeeCode: string;
  designation: string;
  status: TeamStatus;
  currentLeave: { leaveTypeName: string; startDate: string; endDate: string } | null;
}

export interface ApplyLeaveInput {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  /** Defaulted server-side, so these are only optional to callers. */
  startSession?: LeaveSession;
  endSession?: LeaveSession;
  reason?: string;
}

export interface CreateLeaveTypeInput {
  code: string;
  name: string;
  annualQuota: number;
  eligibleFor: EmploymentType[];
  isPaid?: boolean;
  carryForwardPct?: number;
  maxConsecutive?: number | null;
  allowsBackdating?: boolean;
  countsHolidays?: boolean;
  accrualBasis?: LeaveAccrualBasis;
  minServiceMonths?: number;
  maxAccrual?: number | null;
  allowsHalfDay?: boolean;
}

/** `code` is immutable, and `statutory` is never settable through the API. */
export type UpdateLeaveTypeInput = Partial<Omit<CreateLeaveTypeInput, 'code'>>;
