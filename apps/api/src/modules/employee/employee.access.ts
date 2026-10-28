// The single implementation of who sees and edits which employee fields, ported from HR-MNG-V1
// employee.access.ts and made permission-based. Every read and write of an employee goes through
// here, so two call sites can never disagree about, say, whether Finance may see a national ID.
import { BANK_FIELDS, HR_EDITABLE_FIELDS, SELF_EDITABLE_FIELDS, type EmployeeView } from '@erp/contracts/employee';
import { can, scopeFor, type AccessContext } from '@erp/auth';

export type Tier = 'SELF' | 'FULL' | 'FINANCE' | 'MANAGER' | 'COLLEAGUE';
export type Viewer = AccessContext & { sub: string };
export interface ViewerEmployee {
  id: string;
  departmentId: string;
}
export interface Subject {
  userId: string;
  departmentId: string;
  reportingManagerId: string | null;
}

/** Whether the viewer's department-or-wider grant on `key` covers the subject. */
export function reaches(viewer: Viewer, viewerEmployee: ViewerEmployee | null, subject: Subject, key: string): boolean {
  const scope = scopeFor(viewer, key);
  if (scope === 'all') return true;
  return scope === 'department' && viewerEmployee !== null && viewerEmployee.departmentId === subject.departmentId;
}

/** First match wins; SELF comes first so a manager viewing their own record gets the full view. */
export function visibilityTier(viewer: Viewer, viewerEmployee: ViewerEmployee | null, subject: Subject): Tier {
  if (subject.userId === viewer.sub) return 'SELF';
  if (reaches(viewer, viewerEmployee, subject, 'employee.read')) return 'FULL';
  if (can(viewer, 'employee.read.financial')) return 'FINANCE';
  if (viewerEmployee !== null && subject.reportingManagerId === viewerEmployee.id) return 'MANAGER';
  return 'COLLEAGUE';
}

const SELF_SET: ReadonlySet<string> = new Set(SELF_EDITABLE_FIELDS);
const HR_SET: ReadonlySet<string> = new Set(HR_EDITABLE_FIELDS);
const BANK_SET: ReadonlySet<string> = new Set(BANK_FIELDS);

/** `canUpdate`: the viewer's employee.update grant reaches this subject. */
export function writableFieldsFor(tier: Tier, canUpdate: boolean): ReadonlySet<string> {
  if (canUpdate && tier === 'SELF') return new Set([...HR_SET].filter((f) => !BANK_SET.has(f)));
  if (canUpdate) return HR_SET;
  if (tier === 'SELF') return SELF_SET;
  return new Set();
}

export interface EmployeeRecord {
  id: string;
  employeeCode: string;
  fullName: string;
  designation: string;
  department: { id: string; name: string };
  reportingManager: { id: string; fullName: string } | null;
  user: { email: string };
  phone: string | null;
  profilePicture: string | null;
  employmentType: string;
  employmentStatus: string;
  joiningDate: Date;
  officeLocation: string | null;
  lastWorkingDay: Date | null;
  exitReason: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  nationalId: string | null;
  bloodGroup: string | null;
  maritalStatus: string | null;
  presentAddress: string | null;
  permanentAddress: string | null;
  emergencyContact: string | null;
  bankAccountNumber: string | null;
  bankName: string | null;
  bankRoutingNumber: string | null;
}

/** The `include` every employee read uses, so every projection has what it needs. */
export const EMPLOYEE_INCLUDE = {
  department: { select: { id: true, name: true } },
  reportingManager: { select: { id: true, fullName: true } },
  user: { select: { email: true } },
} as const;

// Date-only columns are stored at UTC midnight; the wire format is YYYY-MM-DD.
const dateOnly = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));

export function projectEmployee(
  e: EmployeeRecord,
  tier: Tier,
  editable: ReadonlySet<string>,
  avatarUrl: string | null,
): EmployeeView {
  const view: EmployeeView = {
    id: e.id,
    employeeCode: e.employeeCode,
    work: {
      fullName: e.fullName,
      designation: e.designation,
      department: e.department,
      reportingManager: e.reportingManager,
      email: e.user.email,
      phone: e.phone,
      avatarUrl,
    },
    editableFields: [...editable],
  };
  if (tier !== 'COLLEAGUE') {
    view.employment = {
      employmentType: e.employmentType,
      employmentStatus: e.employmentStatus,
      joiningDate: dateOnly(e.joiningDate)!,
      officeLocation: e.officeLocation,
      lastWorkingDay: dateOnly(e.lastWorkingDay),
      exitReason: e.exitReason,
    };
  }
  if (tier === 'SELF' || tier === 'FULL') {
    view.personal = {
      dateOfBirth: dateOnly(e.dateOfBirth),
      gender: e.gender,
      nationalId: e.nationalId,
      bloodGroup: e.bloodGroup,
      maritalStatus: e.maritalStatus,
      presentAddress: e.presentAddress,
      permanentAddress: e.permanentAddress,
      emergencyContact: e.emergencyContact,
    };
  }
  if (tier === 'SELF' || tier === 'FULL' || tier === 'FINANCE') {
    view.money = { bankAccountNumber: e.bankAccountNumber, bankName: e.bankName, bankRoutingNumber: e.bankRoutingNumber };
  }
  return view;
}
