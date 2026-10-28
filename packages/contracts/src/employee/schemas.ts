import { z } from 'zod';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');
const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).nullable().optional();

export const employmentTypes = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'] as const;
export const employmentStatuses = ['ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED'] as const;
export const exitReasons = [
  'RESIGNATION',
  'RETIREMENT',
  'TERMINATION',
  'DISMISSAL',
  'DISCHARGE',
  'RETRENCHMENT',
  'CONTRACT_END',
  'DEATH',
] as const;
export const documentTypes = ['CONTRACT', 'NID', 'CERTIFICATE', 'OFFER_LETTER', 'RESIGNATION', 'OTHER'] as const;

export const createEmployeeSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  fullName: text(150).min(1),
  designation: text(100).min(1),
  departmentId: z.string().min(1),
  reportingManagerId: z.string().min(1).nullable().optional(),
  employmentType: z.enum(employmentTypes),
  joiningDate: dateOnly,
  employeeCode: text(30).min(1).optional(),
  roleId: z.string().min(1).nullable().optional(),
  shiftId: z.string().min(1).nullable().optional(),
});

export const updateEmployeeSchema = z
  .object({
    phone: optionalText(30),
    presentAddress: optionalText(300),
    permanentAddress: optionalText(300),
    dateOfBirth: dateOnly.nullable().optional(),
    gender: optionalText(30),
    emergencyContact: optionalText(200),
    maritalStatus: optionalText(30),
    bloodGroup: optionalText(10),
    fullName: text(150).min(1).optional(),
    designation: text(100).min(1).optional(),
    departmentId: z.string().min(1).optional(),
    reportingManagerId: z.string().min(1).nullable().optional(),
    employmentType: z.enum(employmentTypes).optional(),
    joiningDate: dateOnly.optional(),
    officeLocation: optionalText(100),
    shiftId: z.string().min(1).nullable().optional(),
    bankAccountNumber: optionalText(40),
    bankName: optionalText(100),
    bankRoutingNumber: optionalText(20),
  })
  .strict();

export const exitSchema = z.object({
  lastWorkingDay: dateOnly,
  exitReason: z.enum(exitReasons),
  exitNote: optionalText(500),
});

export const idChangeRequestSchema = z.object({ newValue: text(30).min(1) });
export const idChangeDecisionSchema = z.object({ approve: z.boolean(), note: optionalText(500) });
export const accountStatusSchema = z.object({ isActive: z.boolean() });

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export interface EmployeeView {
  id: string;
  employeeCode: string;
  work: {
    fullName: string;
    designation: string;
    department: { id: string; name: string };
    reportingManager: { id: string; fullName: string } | null;
    email: string;
    phone: string | null;
    avatarUrl: string | null;
  };
  // Present only for tiers allowed to see them; omitted (not null) otherwise.
  employment?: {
    employmentType: string;
    employmentStatus: string;
    joiningDate: string;
    officeLocation: string | null;
    shiftId: string | null;
    lastWorkingDay: string | null;
    exitReason: string | null;
  };
  personal?: {
    dateOfBirth: string | null;
    gender: string | null;
    nationalId: string | null;
    bloodGroup: string | null;
    maritalStatus: string | null;
    presentAddress: string | null;
    permanentAddress: string | null;
    emergencyContact: string | null;
  };
  money?: { bankAccountNumber: string | null; bankName: string | null; bankRoutingNumber: string | null };
  editableFields: string[];
}
