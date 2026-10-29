import type { Tone } from '@erp/ui/page';

// Display names for employee fields, shared by the profile, the table and the forms.
export const FIELD_LABELS: Record<string, string> = {
  fullName: 'Full name',
  designation: 'Designation',
  departmentId: 'Department',
  reportingManagerId: 'Reporting manager',
  email: 'Email',
  phone: 'Phone',
  employmentType: 'Employment type',
  employmentStatus: 'Status',
  joiningDate: 'Joining date',
  officeLocation: 'Office location',
  lastWorkingDay: 'Last working day',
  exitReason: 'Exit reason',
  dateOfBirth: 'Date of birth',
  gender: 'Gender',
  nationalId: 'National ID',
  bloodGroup: 'Blood group',
  maritalStatus: 'Marital status',
  presentAddress: 'Present address',
  permanentAddress: 'Permanent address',
  emergencyContact: 'Emergency contact',
  bankAccountNumber: 'Bank account number',
  bankName: 'Bank name',
  bankRoutingNumber: 'Routing number',
};

export const DATE_FIELDS = new Set(['joiningDate', 'dateOfBirth', 'lastWorkingDay']);

export const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: 'good',
  ON_LEAVE: 'info',
  RESIGNED: 'warn',
  TERMINATED: 'bad',
};

/** FULL_TIME -> Full time */
export const humanize = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');

export const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERN: 'Intern',
};
