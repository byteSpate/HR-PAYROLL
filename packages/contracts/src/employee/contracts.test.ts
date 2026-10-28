import { describe, expect, it } from 'vitest';
import { allPermissions, modules, resolveModuleOrder } from '../registry.js';
import { createEmployeeSchema, exitSchema, updateEmployeeSchema } from './schemas.js';
import { HR_EDITABLE_FIELDS, SELF_EDITABLE_FIELDS } from './fields.js';

describe('employee contracts', () => {
  it('orders employee after core and department', () => {
    const names = resolveModuleOrder(modules).map((m) => m.name);
    expect(names.indexOf('employee')).toBeGreaterThan(names.indexOf('department'));
    expect(names.indexOf('employee')).toBeGreaterThan(names.indexOf('core'));
  });

  it('declares scoped reads with the manager default, and on/off bank access', () => {
    const perms = Object.fromEntries(allPermissions().map((p) => [p.key, p]));
    expect(perms['employee.read']?.scopes).toEqual(['team', 'department', 'all']);
    expect(perms['employee.update']?.scopes).toEqual(['department', 'all']);
    expect(perms['employee.read.financial']?.scopes).toEqual([]);
    expect(modules.find((m) => m.name === 'employee')?.permissions['employee.read']?.managerDefault).toBe(true);
  });

  it('never lets an employee edit their own bank details or national id', () => {
    for (const f of ['bankAccountNumber', 'bankName', 'bankRoutingNumber', 'nationalId']) {
      expect(SELF_EDITABLE_FIELDS).not.toContain(f);
    }
    expect(HR_EDITABLE_FIELDS).toContain('bankAccountNumber');
    expect(HR_EDITABLE_FIELDS).not.toContain('nationalId');
  });

  it('validates a new employee', () => {
    const ok = createEmployeeSchema.safeParse({
      email: ' A@Example.com ',
      fullName: 'A Person',
      designation: 'Engineer',
      departmentId: 'd1',
      employmentType: 'FULL_TIME',
      joiningDate: '2026-01-05',
    });
    expect(ok.success && ok.data.email).toBe('a@example.com');
    expect(createEmployeeSchema.safeParse({ ...ok.data, joiningDate: '05/01/2026' }).success).toBe(false);
  });

  it('rejects unknown keys on update so a typo is not silently ignored', () => {
    expect(updateEmployeeSchema.safeParse({ phone: '017', salary: 5 }).success).toBe(false);
  });

  it('requires a valid exit reason and date', () => {
    expect(exitSchema.safeParse({ lastWorkingDay: '2026-03-31', exitReason: 'RESIGNATION' }).success).toBe(true);
    expect(exitSchema.safeParse({ lastWorkingDay: '2026-03-31', exitReason: 'QUIT' }).success).toBe(false);
  });
});
