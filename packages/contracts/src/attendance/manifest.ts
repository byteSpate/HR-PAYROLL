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
      label: 'My Space',
      order: 10,
      icon: 'RiUserSmileLine',
      items: [{ label: 'My Attendance', href: '/me/attendance', icon: 'RiTimeLine', permission: null }],
    },
    {
      label: 'Attendance',
      order: 40,
      icon: 'RiCalendarCheckLine',
      items: [
        { label: 'Today', href: '/attendance', icon: 'RiTimeLine', permission: 'attendance.read:team' },
        { label: 'Approvals', href: '/attendance/approvals', icon: 'RiCheckboxCircleLine', permission: 'attendance.approve:team' },
        { label: 'Manual Entry', href: '/attendance/manual', icon: 'RiEditLine', permission: 'attendance.manage:department' },
        { label: 'Reports', href: '/attendance/reports', icon: 'RiBarChartLine', permission: 'attendance.report:team' },
        { label: 'Shifts', href: '/attendance/shifts', icon: 'RiTimerLine', permission: 'attendance.config' },
        { label: 'Holidays', href: '/attendance/holidays', icon: 'RiCalendarEventLine', permission: 'attendance.config' },
      ],
    },
  ],
  events: ATTENDANCE_EVENTS,
});
