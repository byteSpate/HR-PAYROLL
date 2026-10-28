export type AttendanceApproval = "PENDING" | "APPROVED" | "REJECTED"

export type AttendanceStatus =
  | "PRESENT"
  | "ABSENT"
  | "ON_LEAVE"
  | "HOLIDAY"
  | "WEEKLY_OFF"
  | "NOT_CHECKED_IN"
  | "NOT_TRACKED"

export type ExceptionCode =
  | "LATE"
  | "EARLY_OUT"
  | "MISSING_CHECKOUT"
  | "SHORTFALL"
  | "LEAVE_CONFLICT"
  | "WORKED_OFF_DAY"
  | "REGULARISED"
  | "MANUAL_ENTRY"
  | "AUTO_CHECK_OUT"

export type HolidayType = "GENERAL" | "EXECUTIVE_ORDER" | "OPTIONAL" | "WORKING_DAY"

export interface AttendanceEmployeeRef {
  id: string
  fullName: string
  employeeCode: string
  designation: string
}

export interface ApprovalItem {
  id: string
  employee: AttendanceEmployeeRef
  date: string
  checkIn: string | null
  checkOut: string | null
  workedHours: number | null
  isLate: boolean
  isEarlyOut: boolean
  approval: AttendanceApproval
  regularised: boolean
  regularisedNote: string | null
  exceptions: ExceptionCode[]
  agingDays: number
  stalled: boolean
}

export interface BulkDecisionResult {
  id: string
  ok: boolean
  error?: string
}

