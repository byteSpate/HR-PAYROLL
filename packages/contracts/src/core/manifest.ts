import { defineModule } from '../module.js';

export const core = defineModule({
  name: 'core',
  deps: [],
  permissions: {
    'user.manage': 'Manage users',
    'role.manage': 'Manage roles and permissions',
    'settings.manage': 'Manage settings',
    'audit.read': 'Read audit log',
  },
  nav: [
    {
      label: 'Dashboard',
      icon: 'RiDashboardLine',
      items: [{ label: 'Overview', href: '/dashboard', icon: 'RiDashboardLine', permission: null }],
    },
    {
      label: 'Settings',
      icon: 'RiSettings3Line',
      items: [
        { label: 'Users', href: '/settings/users', icon: 'RiUserLine', permission: 'user.manage' },
        {
          label: 'Roles & Permissions',
          href: '/settings/roles',
          icon: 'RiShieldUserLine',
          permission: 'role.manage',
        },
      ],
    },
  ],
  events: [],
});
