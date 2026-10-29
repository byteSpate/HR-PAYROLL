import { defineModule } from '../module.js';
import { SETTLEMENT_EVENTS } from './events.js';

export const settlement = defineModule({
  name: 'settlement',
  deps: ['core', 'employee', 'attendance', 'payroll', 'expense', 'asset', 'exchange', 'notification'],
  permissions: {
    'settlement.read': { label: 'View final settlements', scopes: ['department', 'all'] },
    'settlement.create': {
      label: 'Calculate and adjust final settlements',
      scopes: ['department', 'all'],
    },
    'settlement.approve': { label: 'Approve or return a final settlement', scopes: ['all'] },
    'settlement.pay': { label: 'Pay a final settlement', scopes: ['all'] },
  },
  nav: [
    {
      label: 'Payroll & finance',
      order: 15,
      items: [
        {
          label: 'Settlements',
          href: '/settlements',
          icon: 'RiHandCoinLine',
          permission: 'settlement.read',
        },
      ],
    },
  ],
  events: SETTLEMENT_EVENTS,
});
