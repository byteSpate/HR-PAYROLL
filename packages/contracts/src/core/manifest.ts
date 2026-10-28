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
      label: 'Overview',
      order: 10,
      items: [{ label: 'Dashboard', href: '/dashboard', icon: 'RiDashboardLine', permission: null }],
    },
    {
      label: 'Administration',
      order: 900,
      items: [
        { label: 'Users', href: '/settings/users', icon: 'RiUserLine', permission: 'user.manage' },
        { label: 'Roles & Permissions', href: '/settings/roles', icon: 'RiSettingsLine', permission: 'role.manage' },
        { label: 'Activity', href: '/settings/activity', icon: 'RiPulseLine', permission: 'audit.read' },
      ],
    },
  ],
  events: [],
});
