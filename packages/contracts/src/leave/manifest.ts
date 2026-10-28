import { defineModule } from '../module.js';
import { LEAVE_EVENTS } from './events.js';
export const leave = defineModule({
  name: 'leave', deps: ['core', 'employee', 'attendance'],
  permissions: {
    'leave.read': { label: 'View leave requests', scopes: ['team', 'department', 'all'], managerDefault: true },
    'leave.approve': { label: 'Approve or reject leave', scopes: ['team', 'department', 'all'], managerDefault: true },
    'leave.manage': { label: 'Manage leave requests', scopes: ['department', 'all'] },
    'leave.config': { label: 'Manage leave policies' },
  },
  nav: [
    { label: 'My Space', order: 10, icon: 'RiUserSmileLine', items: [{ label: 'My Leave', href: '/me/leave', icon: 'RiCalendarLine', permission: null }] },
    { label: 'Leave', order: 50, icon: 'RiCalendarLine', items: [
      { label: 'Apply Leave', href: '/leave/apply', icon: 'RiAddCircleLine', permission: null },
      { label: 'Leave Requests', href: '/leave/requests', icon: 'RiFileListLine', permission: 'leave.read:team' },
      { label: 'Approvals', href: '/leave/approvals', icon: 'RiCheckboxCircleLine', permission: 'leave.approve:team' },
      { label: 'Team Status', href: '/leave/team', icon: 'RiTeamLine', permission: 'leave.read:team' },
      { label: 'Leave Types', href: '/leave/types', icon: 'RiSettingsLine', permission: 'leave.config' },
    ] },
  ], events: LEAVE_EVENTS,
});
