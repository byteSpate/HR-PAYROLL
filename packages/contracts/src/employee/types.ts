// Wire types for the employee screens, written once here and read by the API and the web app.
// Ported from HR-MNG-V1, which mirrored them by hand. The sales role and the device user id are
// left out: ERP has no Sales Hub and no attendance devices.
import type { documentTypes, employmentStatuses, employmentTypes, exitReasons } from './schemas.js';

export type EmploymentType = (typeof employmentTypes)[number];
export type EmploymentStatus = (typeof employmentStatuses)[number];
export type ExitReason = (typeof exitReasons)[number];
export type DocumentType = (typeof documentTypes)[number];

export interface DocumentItem {
  id: string;
  type: DocumentType;
  fileName: string;
  bytes: number;
  format: string;
  uploadedAt: string;
}

export interface SignedDocumentUrl {
  url: string;
  expiresAt: string;
}

export interface WorkIdentity {
  fullName: string;
  designation: string;
  department: { id: string; name: string };
  reportingManager: { id: string; fullName: string } | null;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
}

/** A national-ID change waiting for HR, shown on the owner's own profile. */
export interface PendingNationalIdChangeRequest {
  id: string;
  newValue: string;
  requestedAt: string;
}

export interface PersonalIdentity {
  dateOfBirth: string | null;
  gender: string | null;
  nationalId: string | null;
  bloodGroup: string | null;
  maritalStatus: string | null;
  /** Present only when a request is PENDING. */
  nationalIdChangeRequest?: PendingNationalIdChangeRequest | null;
}

export interface ContactDetails {
  presentAddress: string | null;
  permanentAddress: string | null;
  emergencyContact: string | null;
}

export interface EmploymentDetails {
  employeeCode: string;
  employmentType: EmploymentType;
  employmentStatus: EmploymentStatus;
  joiningDate: string;
  officeLocation: string | null;
  shift: { id: string; name: string } | null;
  /**
   * Whether the login works (`User.isActive`), not `employmentStatus`. The two are independent: a
   * current employee can have a disabled account, and a resigned one can keep a live login until
   * it is revoked. Render both, never one in place of the other.
   */
  accountActive: boolean;
  /** Only sent to HR-level viewers: true while the person has not chosen their own password. */
  passwordPending?: boolean;
}

export interface PayrollDetails {
  salaryStructure: { id: string; name: string; currency: 'BDT' | 'USD' } | null;
  bankAccountNumber: string | null;
  bankName: string | null;
  bankRoutingNumber: string | null;
}

export interface ExitDetailsView {
  lastWorkingDay: string;
  exitReason: string;
  exitNote: string | null;
}

export interface Blocker {
  field: string;
  blocks: string;
}

/**
 * Every group key besides `work` is optional, matching the server's projection: a COLLEAGUE-tier
 * row genuinely has no `employment` or `payroll`, and a component reading one without a guard
 * fails `tsc` rather than crashing for a viewer whose tier never had it.
 */
export interface EmployeeView {
  id: string;
  work: WorkIdentity;
  personal?: PersonalIdentity;
  contact?: ContactDetails;
  employment?: EmploymentDetails;
  payroll?: PayrollDetails;
  exit?: ExitDetailsView | null;
  documents?: DocumentItem[];
  blockers?: Blocker[];
  editableFields: string[];
}
