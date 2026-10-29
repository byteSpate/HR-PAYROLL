import { defineModule } from '../module.js';
import { LEAVE_EVENTS } from './events.js';
export const leave = defineModule({
  name: 'leave',
  deps: ['core', 'employee', 'attendance'],
  permissions: {
    'leave.read': {
      label: 'View leave requests',
      scopes: ['team', 'department', 'all'],
      managerDefault: true,
    },
    'leave.approve': {
      label: 'Approve or reject leave',
      scopes: ['team', 'department', 'all'],
      managerDefault: true,
    },
    'leave.manage': { label: 'Manage leave requests', scopes: ['department', 'all'] },
    'leave.config': { label: 'Manage leave policies' },
  },
  nav: [
    {
      label: 'Workspace',
      order: 20,
      items: [
        {
          label: 'My Leave',
          href: '/me/leave',
          icon: 'RiCalendarEventLine',
          permission: null,
        },
      ],
    },
    {
      label: 'Overview',
      order: 10,
      items: [
        {
          label: 'Leave',
          href: '/leave/requests',
          icon: 'RiCalendarEventLine',
          permission: null,
          children: [
            { label: 'Leave Requests', href: '/leave/requests', permission: 'leave.read:team' },
            { label: 'Team Status', href: '/leave/team', permission: 'leave.read:team' },
          ],
        },
      ],
    },
    {
      label: 'Administration',
      order: 900,
      items: [
        {
          label: 'Settings',
          href: '/settings/leave-types',
          icon: 'RiSettingsLine',
          permission: null,
          children: [
            {
              label: 'Leave types',
              href: '/settings/leave-types',
              permission: 'leave.config',
              icon: 'RiCalendarCheckLine',
            },
          ],
        },
      ],
    },
  ],
  events: LEAVE_EVENTS,
});
