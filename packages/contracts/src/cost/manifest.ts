import { defineModule } from '../module.js';
import { COST_EVENTS } from './events.js';

export const cost = defineModule({
  name: 'cost',
  deps: ['core'],
  permissions: {
    'cost.read': { label: 'View operating costs and commitments' },
    'cost.manage': { label: 'Record, pay and import operating costs' },
    'cost.config': { label: 'Manage cost categories' },
  },
  nav: [
    {
      label: 'Payroll & finance',
      order: 15,
      items: [{ label: 'Expenses', href: '/costs', icon: 'RiWallet3Line', permission: ['cost.read', 'cost.manage'] }],
    },
    {
      label: 'Administration',
      order: 900,
      items: [
        {
          label: 'Settings',
          href: '/settings/cost-categories',
          icon: 'RiSettingsLine',
          permission: null,
          children: [{ label: 'Cost categories', href: '/settings/cost-categories', permission: 'cost.config', icon: 'RiWallet3Line' }],
        },
      ],
    },
  ],
  events: COST_EVENTS,
});
