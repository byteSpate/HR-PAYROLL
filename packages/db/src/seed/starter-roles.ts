import type { Scope } from '@erp/contracts';

export interface StarterGrant {
  key: string;
  /** Null for an on/off permission. */
  scope: Scope | null;
}

export interface StarterRoleDef {
  name: string;
  description: string;
  grants: StarterGrant[];
}

// Later plans add their module grants here. These are only a head start: admins edit
// or delete them freely, so they are created once and never re-applied.
export const STARTER_ROLES: StarterRoleDef[] = [
  {
    name: 'HR Admin',
    description: 'Manages users, departments and employees, and reads the audit log',
    grants: [
      { key: 'user.manage', scope: null },
      { key: 'audit.read', scope: null },
      { key: 'department.read', scope: null },
      { key: 'department.manage', scope: null },
      { key: 'department.import', scope: null },
      { key: 'employee.read', scope: 'all' },
      { key: 'employee.update', scope: 'all' },
      { key: 'employee.exit', scope: 'all' },
      { key: 'employee.documents.manage', scope: 'all' },
      { key: 'employee.id_request.decide', scope: 'all' },
      { key: 'employee.create', scope: null },
      { key: 'employee.read.financial', scope: null },
      { key: 'employee.export', scope: null },
      { key: 'attendance.read', scope: 'all' },
      { key: 'attendance.approve', scope: 'all' },
      { key: 'attendance.manage', scope: 'all' },
      { key: 'attendance.report', scope: 'all' },
      { key: 'attendance.config', scope: null },
      { key: 'leave.read', scope: 'all' },
      { key: 'leave.approve', scope: 'all' },
      { key: 'leave.manage', scope: 'all' },
      { key: 'leave.config', scope: null },
      { key: 'expense.read', scope: 'all' },
      { key: 'expense.report', scope: 'all' },
      { key: 'asset.read', scope: 'all' },
      { key: 'asset.manage', scope: 'all' },
      { key: 'asset.config', scope: null },
            { key: 'payroll.read', scope: 'all' },
      { key: 'payroll.manage', scope: 'all' },
      { key: 'settlement.read', scope: 'all' },
      { key: 'cost.read', scope: null },
    ],
  },
  {
    name: 'Finance Officer',
    description: 'Finance staff',
    grants: [
      { key: 'department.read', scope: null },
      { key: 'employee.read.financial', scope: null },
      { key: 'employee.export', scope: null },
      { key: 'exchange.config', scope: null },
      { key: 'expense.read', scope: 'all' },
      { key: 'expense.approve', scope: 'all' },
      { key: 'expense.manage', scope: 'all' },
      { key: 'expense.config', scope: null },
      { key: 'expense.report', scope: 'all' },
      { key: 'asset.read', scope: 'all' },
      { key: 'asset.capitalise', scope: null },
      { key: 'asset.value', scope: null },
      { key: 'payroll.read', scope: 'all' },
      { key: 'payroll.manage', scope: 'all' },
      { key: 'payroll.disburse', scope: 'all' },
      { key: 'payroll.config', scope: null },
      { key: 'settlement.read', scope: 'all' },
      { key: 'settlement.create', scope: 'all' },
      { key: 'settlement.pay', scope: 'all' },
      { key: 'cost.read', scope: null },
      { key: 'cost.manage', scope: null },
      { key: 'cost.config', scope: null },
    ],
  },
  { name: 'Employee', description: 'Baseline role for every staff member', grants: [] },
];
