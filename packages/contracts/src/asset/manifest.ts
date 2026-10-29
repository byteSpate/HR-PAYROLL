import { defineModule } from '../module.js';
import { ASSET_EVENTS } from './events.js';

export const asset = defineModule({
  name: 'asset',
  deps: ['core', 'department', 'employee', 'exchange', 'notification'],
  permissions: {
    'asset.read': {
      label: 'View the asset register and who holds what',
      scopes: ['team', 'department', 'all'],
      managerDefault: true,
    },
    'asset.approve': {
      label: 'Approve or reject asset requests',
      scopes: ['team', 'department', 'all'],
      managerDefault: true,
    },
    'asset.manage': {
      label: 'Register, assign, repair, retire and recover assets',
      scopes: ['department', 'all'],
    },
    'asset.capitalise': { label: 'Capitalise, pay for, dispose of and depreciate assets' },
    'asset.value': { label: 'See the asset value report' },
    'asset.config': { label: 'Manage asset categories' },
  },
  nav: [
    {
      label: 'Overview',
      order: 10,
      items: [
        {
          label: 'Assets',
          href: '/assets',
          icon: 'RiComputerLine',
          permission: ['asset.read', 'asset.approve'],
          children: [
            { label: 'Register', href: '/assets', permission: ['asset.read', 'asset.approve'] },
            { label: 'Asset ledger', href: '/assets/ledger', permission: 'asset.capitalise' },
            { label: 'Depreciation', href: '/assets/depreciation', permission: 'asset.capitalise' },
            { label: 'Asset value', href: '/assets/value', permission: 'asset.value' },
          ],
        },
      ],
    },
    {
      label: 'Workspace',
      order: 20,
      items: [{ label: 'Assets', href: '/me/assets', icon: 'RiComputerLine', permission: null }],
    },
    {
      label: 'Administration',
      order: 900,
      items: [
        {
          label: 'Settings',
          href: '/settings/asset-categories',
          icon: 'RiSettingsLine',
          permission: null,
          children: [
            {
              label: 'Asset categories',
              href: '/settings/asset-categories',
              permission: 'asset.config',
              icon: 'RiComputerLine',
            },
          ],
        },
      ],
    },
  ],
  events: ASSET_EVENTS,
});
