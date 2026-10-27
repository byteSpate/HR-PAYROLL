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
    description: 'Manages users and reads the audit log',
    grants: [
      { key: 'user.manage', scope: null },
      { key: 'audit.read', scope: null },
    ],
  },
  { name: 'Finance Officer', description: 'Finance staff', grants: [] },
  { name: 'Employee', description: 'Baseline role for every staff member', grants: [] },
];
