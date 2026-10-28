import { defineModule } from '../module.js';

const HR_SCOPES = ['department', 'all'] as const;

export const employee = defineModule({
  name: 'employee',
  deps: ['core', 'department'],
  permissions: {
    'employee.read': { label: 'View employee records', scopes: ['team', 'department', 'all'], managerDefault: true },
    'employee.update': { label: 'Edit employee records', scopes: HR_SCOPES },
    'employee.exit': { label: 'Record an employee exit', scopes: HR_SCOPES },
    'employee.documents.manage': { label: 'Upload and delete employee documents', scopes: HR_SCOPES },
    'employee.id_request.decide': { label: 'Approve national ID changes', scopes: HR_SCOPES },
    'employee.create': { label: 'Add employees' },
    'employee.read.financial': { label: 'View employee bank details' },
    'employee.export': { label: 'Export the employee list' },
  },
  nav: [
    {
      label: 'My Space',
      order: 10,
      icon: 'RiUserSmileLine',
      items: [
        { label: 'My Profile', href: '/me', icon: 'RiUserLine', permission: null },
        { label: 'Directory', href: '/me/directory', icon: 'RiContactsBook2Line', permission: null },
      ],
    },
    {
      label: 'Employees',
      order: 20,
      icon: 'RiTeamLine',
      items: [
        { label: 'Add Employee', href: '/employees/new', icon: 'RiUserAddLine', permission: 'employee.create' },
        {
          label: 'Employee List',
          href: '/employees',
          icon: 'RiListUnordered',
          permission: ['employee.read:department', 'employee.read.financial'],
        },
        { label: 'My Team', href: '/employees/team', icon: 'RiGroupLine', permission: 'employee.read:team' },
        {
          label: 'ID Change Requests',
          href: '/employees/id-requests',
          icon: 'RiIdCardLine',
          permission: 'employee.id_request.decide:department',
        },
      ],
    },
  ],
  events: ['employee.joined', 'employee.bank_changed', 'employee.exited', 'employee.national_id_change_requested'],
});
