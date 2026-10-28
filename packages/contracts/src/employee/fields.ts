// The facts an employee is the authority on. Bank fields are absent on purpose: self-service bank
// editing is the classic payroll-diversion route. The national ID changes only through a request HR
// decides (employee change requests).
export const SELF_EDITABLE_FIELDS = [
  'phone',
  'presentAddress',
  'permanentAddress',
  'dateOfBirth',
  'gender',
  'emergencyContact',
  'maritalStatus',
  'bloodGroup',
] as const;

export const HR_ONLY_FIELDS = [
  'fullName',
  'designation',
  'departmentId',
  'reportingManagerId',
  'employmentType',
  'joiningDate',
  'officeLocation',
  'bankAccountNumber',
  'bankName',
  'bankRoutingNumber',
] as const;

export const HR_EDITABLE_FIELDS = [...SELF_EDITABLE_FIELDS, ...HR_ONLY_FIELDS] as const;

export const BANK_FIELDS = ['bankAccountNumber', 'bankName', 'bankRoutingNumber'] as const;

export type EditableField = (typeof HR_EDITABLE_FIELDS)[number];
