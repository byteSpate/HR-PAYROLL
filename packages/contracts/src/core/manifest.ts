import { defineModule } from '../module.js';

export const core = defineModule({
  name: 'core',
  deps: [],
  permissions: {
    'user.manage': { label: 'Manage users' },
    'role.manage': { label: 'Manage roles and permissions' },
    'settings.manage': { label: 'Manage settings' },
    'audit.read': { label: 'Read audit log' },
  },
  nav: [
    {
      label: 'Dashboard',
      order: 0,
      icon: 'RiDashboardLine',
      items: [{ label: 'Overview', href: '/dashboard', icon: 'RiDashboardLine', permission: null }],
    },
    {
      label: 'Settings',
      order: 900,
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
