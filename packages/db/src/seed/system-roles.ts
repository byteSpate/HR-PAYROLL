export interface SystemRoleDef {
  name: string;
  description: string;
  permissions: string[] | 'ALL';
}

// Later plans add their module grants here.
export const SYSTEM_ROLES: SystemRoleDef[] = [
  { name: 'SUPER_ADMIN', description: 'Full access to every permission', permissions: 'ALL' },
  { name: 'HR_ADMIN', description: 'Manages users and reads the audit log', permissions: ['user.manage', 'audit.read'] },
  { name: 'FINANCE_OFFICER', description: 'Finance staff', permissions: [] },
  { name: 'EMPLOYEE', description: 'Baseline role for every staff member', permissions: [] },
];
