import { describe, expect, it } from 'vitest';
import { projectEmployee, reaches, visibilityTier, writableFieldsFor, type EmployeeRecord } from './employee.access.js';

const viewer = (grants: string[] = [], sub = 'viewer-user') => ({ sub, accessLevel: 'STANDARD' as const, grants });
const viewerEmp = { id: 'viewer-emp', departmentId: 'dep-a' };
const subject = (over: Partial<{ userId: string; departmentId: string; reportingManagerId: string | null }> = {}) => ({
  userId: 'subject-user',
  departmentId: 'dep-a',
  reportingManagerId: null,
  ...over,
});

describe('visibilityTier', () => {
  it('is SELF for the viewer own record, even with wider grants', () => {
    expect(visibilityTier(viewer(['employee.read:all']), viewerEmp, subject({ userId: 'viewer-user' }))).toBe('SELF');
  });

  it('is FULL for an all-scope reader anywhere', () => {
    expect(visibilityTier(viewer(['employee.read:all']), viewerEmp, subject({ departmentId: 'dep-b' }))).toBe('FULL');
  });

  it('is FULL for a department-scope reader only inside their own department', () => {
    const v = viewer(['employee.read:department']);
    expect(visibilityTier(v, viewerEmp, subject())).toBe('FULL');
    expect(visibilityTier(v, viewerEmp, subject({ departmentId: 'dep-b' }))).toBe('COLLEAGUE');
    expect(visibilityTier(v, null, subject())).toBe('COLLEAGUE');
  });

  it('is FINANCE for a holder of employee.read.financial', () => {
    expect(visibilityTier(viewer(['employee.read.financial']), viewerEmp, subject({ departmentId: 'dep-b' }))).toBe('FINANCE');
  });

  it('is MANAGER for the subject direct manager, COLLEAGUE otherwise', () => {
    expect(visibilityTier(viewer(), viewerEmp, subject({ reportingManagerId: 'viewer-emp' }))).toBe('MANAGER');
    expect(visibilityTier(viewer(), viewerEmp, subject())).toBe('COLLEAGUE');
  });

  it('treats admins as FULL', () => {
    expect(visibilityTier({ sub: 'a', accessLevel: 'ADMIN', grants: [] }, null, subject())).toBe('FULL');
  });
});

describe('reaches', () => {
  it('matches department scope by department and all scope everywhere', () => {
    expect(reaches(viewer(['employee.update:department']), viewerEmp, subject(), 'employee.update')).toBe(true);
    expect(reaches(viewer(['employee.update:department']), viewerEmp, subject({ departmentId: 'dep-b' }), 'employee.update')).toBe(false);
    expect(reaches(viewer(['employee.update:all']), null, subject({ departmentId: 'dep-b' }), 'employee.update')).toBe(true);
    expect(reaches(viewer([]), viewerEmp, subject(), 'employee.update')).toBe(false);
  });
});

describe('writableFieldsFor', () => {
  it('gives an employee only the self-service fields', () => {
    const f = writableFieldsFor('SELF', false);
    expect(f.has('phone')).toBe(true);
    expect(f.has('designation')).toBe(false);
    expect(f.has('bankAccountNumber')).toBe(false);
  });

  it('gives an editor every HR field on someone else', () => {
    const f = writableFieldsFor('FULL', true);
    expect(f.has('designation')).toBe(true);
    expect(f.has('bankAccountNumber')).toBe(true);
    expect(f.has('nationalId')).toBe(false);
  });

  it('never lets an editor change their own bank details', () => {
    const f = writableFieldsFor('SELF', true);
    expect(f.has('designation')).toBe(true);
    expect(f.has('bankAccountNumber')).toBe(false);
  });

  it('gives nothing to colleagues, managers and finance', () => {
    for (const tier of ['COLLEAGUE', 'MANAGER', 'FINANCE'] as const) expect(writableFieldsFor(tier, false).size).toBe(0);
  });
});

describe('projectEmployee', () => {
  const record: EmployeeRecord = {
    id: 'e1',
    employeeCode: 'EMP-0001',
    fullName: 'Rahim',
    designation: 'Engineer',
    department: { id: 'dep-a', name: 'Engineering' },
    reportingManager: null,
    user: { email: 'r@example.com', isActive: true, mustChangePassword: false },
    shift: null,
    exitNote: null,
    phone: '017',
    profilePicture: null,
    employmentType: 'FULL_TIME',
    employmentStatus: 'ACTIVE',
    joiningDate: new Date('2026-01-05T00:00:00Z'),
    officeLocation: null,
    lastWorkingDay: null,
    exitReason: null,
    dateOfBirth: null,
    gender: null,
    nationalId: '123',
    bloodGroup: null,
    maritalStatus: null,
    presentAddress: null,
    permanentAddress: null,
    emergencyContact: null,
    bankAccountNumber: '999',
    bankName: 'Bank',
    bankRoutingNumber: null,
  };

  it('omits every hidden section for a colleague (absent keys, not nulls)', () => {
    const view = projectEmployee(record, 'COLLEAGUE', new Set(), null);
    expect(Object.keys(view).sort()).toEqual(['editableFields', 'id', 'work']);
    expect(JSON.stringify(view)).not.toContain('999');
    expect(JSON.stringify(view)).not.toContain('123');
  });

  it('shows the payroll group but not personal details to finance', () => {
    const view = projectEmployee(record, 'FINANCE', new Set(), null);
    expect(view.payroll).toMatchObject({ salaryStructure: null, bankAccountNumber: '999' });
    expect(view.employment).toMatchObject({ employeeCode: 'EMP-0001', joiningDate: '2026-01-05', accountActive: true, shift: null });
    expect(view.exit).toBeNull();
    expect('personal' in view || 'contact' in view).toBe(false);
  });

  it('shows employment but no personal, contact or payroll to a manager', () => {
    const view = projectEmployee(record, 'MANAGER', new Set(), null);
    expect(view.employment).toBeDefined();
    expect('personal' in view || 'contact' in view || 'payroll' in view || 'exit' in view).toBe(false);
  });

  it('shows everything to the employee and lists their editable fields', () => {
    const view = projectEmployee(record, 'SELF', new Set(['phone']), 'https://img');
    expect(view.personal).toMatchObject({ nationalId: '123', nationalIdChangeRequest: null });
    expect(view.contact).toMatchObject({ emergencyContact: null });
    expect(view.payroll?.bankName).toBe('Bank');
    expect(view.editableFields).toEqual(['phone']);
    expect(view.work.avatarUrl).toBe('https://img');
    expect(view.employment && 'passwordPending' in view.employment).toBe(false);
  });

  it('tells HR whether the person still has to choose a password, and shows a finished exit', () => {
    const leaver = { ...record, lastWorkingDay: new Date('2026-09-30T00:00:00Z'), exitReason: 'RESIGNATION', exitNote: 'Moving abroad' };
    const view = projectEmployee(leaver, 'FULL', new Set(), null);
    expect(view.employment?.passwordPending).toBe(false);
    expect(view.exit).toEqual({ lastWorkingDay: '2026-09-30', exitReason: 'RESIGNATION', exitNote: 'Moving abroad' });
  });

  it('carries documents, blockers and a pending national-id request when given', () => {
    const request = { id: 'r1', newValue: '999', requestedAt: '2026-10-01T00:00:00.000Z' };
    const view = projectEmployee(record, 'FULL', new Set(), null, {
      documents: [{ id: 'd1', type: 'NID', fileName: 'nid.pdf', bytes: 10, format: 'pdf', uploadedAt: '2026-10-01T00:00:00.000Z' }],
      blockers: [{ field: 'bankAccountNumber', blocks: 'payroll' }],
      nationalIdChangeRequest: request,
    });
    expect(view.documents).toHaveLength(1);
    expect(view.blockers).toEqual([{ field: 'bankAccountNumber', blocks: 'payroll' }]);
    expect(view.personal?.nationalIdChangeRequest).toEqual(request);
  });
});
