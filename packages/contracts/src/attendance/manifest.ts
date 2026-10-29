import { defineModule } from '../module.js';
import { ATTENDANCE_EVENTS } from './events.js';

export const attendance = defineModule({
  name: 'attendance',
  deps: ['core', 'employee'],
  permissions: {
    'attendance.read': { label: 'View attendance records', scopes: ['team', 'department', 'all'], managerDefault: true },
    'attendance.approve': { label: 'Approve or reject attendance', scopes: ['team', 'department', 'all'], managerDefault: true },
    'attendance.manage': { label: 'Enter and correct attendance by hand', scopes: ['department', 'all'] },
    'attendance.report': { label: 'View and export attendance reports', scopes: ['team', 'department', 'all'], managerDefault: true },
    'attendance.config': { label: 'Manage shifts and holidays' },
  },
  nav: [
    {
      label: 'Workspace',
      order: 20,
      items: [{ label: 'My Attendance', href: '/me/attendance', icon: 'RiTimeLine', permission: null }],
    },
    {
      label: 'Overview',
      order: 10,
      items: [
        {
          label: 'Attendance',
          href: '/attendance',
          icon: 'RiTimeLine',
          permission: null,
          children: [
            { label: 'Attendance Approvals', href: '/attendance/approvals', permission: 'attendance.approve:team' },
            { label: "Today's Attendance", href: '/attendance', permission: 'attendance.read:team' },
            { label: 'Reports', href: '/attendance/reports', permission: 'attendance.report:team' },
            { label: 'Holiday Calendar', href: '/attendance/holidays', permission: 'attendance.config' },
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
          href: '/settings/shifts',
          icon: 'RiSettingsLine',
          permission: null,
          children: [{ label: 'Shifts', href: '/settings/shifts', permission: 'attendance.config', icon: 'RiTimeLine' }],
        },
      ],
    },
  ],
  events: ATTENDANCE_EVENTS,
});
