import { defineModule } from '../module.js';
import { PAYROLL_EVENTS } from './events.js';

export const payroll = defineModule({
  name: 'payroll',
  deps: ['core', 'employee', 'attendance', 'leave', 'expense', 'asset', 'exchange', 'notification'],
  permissions: {
    'payroll.read': {
      label: 'View payroll runs, adjustments and salary structures',
      scopes: ['department', 'all'],
    },
    'payroll.manage': {
      label: 'Create and process payroll runs and adjustments',
      scopes: ['department', 'all'],
    },
    'payroll.approve': { label: 'Approve or return a payroll run', scopes: ['all'] },
    'payroll.disburse': {
      label: 'Disburse a payroll run and download its bank file',
      scopes: ['all'],
    },
    'payroll.config': { label: 'Manage salary structures and payroll settings' },
  },
  nav: [
    {
      label: 'Payroll & finance',
      order: 15,
      items: [
        {
          label: 'Payroll',
          href: '/payroll',
          icon: 'RiWallet3Line',
          permission: null,
          children: [
            { label: 'Payroll runs', href: '/payroll', permission: 'payroll.read' },
            { label: 'Adjustments', href: '/payroll/adjustments', permission: 'payroll.read' },
          ],
        },
        {
          label: 'Salary structures',
          href: '/payroll/salary-structures',
          icon: 'RiSettingsLine',
          permission: 'payroll.read',
        },
      ],
    },
    {
      label: 'Workspace',
      order: 20,
      items: [{ label: 'Payroll', href: '/me/payroll', icon: 'RiWallet3Line', permission: null }],
    },
    {
      label: 'Administration',
      order: 900,
      items: [
        {
          label: 'Settings',
          href: '/settings/payroll',
          icon: 'RiSettingsLine',
          permission: null,
          children: [
            {
              label: 'Payroll settings',
              href: '/settings/payroll',
              permission: 'payroll.config',
              icon: 'RiWallet3Line',
            },
          ],
        },
      ],
    },
  ],
  events: PAYROLL_EVENTS,
});
