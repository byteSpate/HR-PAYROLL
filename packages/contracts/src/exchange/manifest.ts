import { defineModule } from '../module.js';

export const exchange = defineModule({
  name: 'exchange',
  deps: ['core'],
  permissions: {
    'exchange.config': { label: 'Manage exchange rates' },
  },
  nav: [
    {
      label: 'Administration',
      order: 900,
      items: [
        {
          label: 'Settings',
          href: '/settings/exchange-rates',
          icon: 'RiSettingsLine',
          permission: null,
          children: [
            {
              label: 'Exchange rates',
              href: '/settings/exchange-rates',
              permission: 'exchange.config',
              icon: 'RiExchangeDollarLine',
            },
          ],
        },
      ],
    },
  ],
  events: [],
});
