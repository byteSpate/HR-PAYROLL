import { defineModule } from '../module.js';

const HR_SCOPES = ['department', 'all'] as const;

export const employee = defineModule({
  name: 'employee',
  deps: ['core', 'department'],
  permissions: {
    'employee.read': {
      label: 'View employee records',
      scopes: ['team', 'department', 'all'],
      managerDefault: true,
    },
    'employee.update': { label: 'Edit employee records', scopes: HR_SCOPES },
    'employee.exit': { label: 'Record an employee exit', scopes: HR_SCOPES },
    'employee.documents.manage': {
      label: 'Upload and delete employee documents',
      scopes: HR_SCOPES,
    },
    'employee.id_request.decide': { label: 'Approve national ID changes', scopes: HR_SCOPES },
    'employee.create': { label: 'Add employees' },
    'employee.read.financial': { label: 'View employee bank details' },
    'employee.export': { label: 'Export the employee list' },
  },
  nav: [
    {
      label: 'Workspace',
      order: 20,
      items: [
        {
          label: 'Directory',
          href: '/me/directory',
          icon: 'RiContactsBook2Line',
          permission: null,
        },
        { label: 'My Profile', href: '/me', icon: 'RiUser3Line', permission: null },
      ],
    },
    {
      label: 'Overview',
      order: 10,
      items: [
        {
          label: 'Employees',
          href: '/employees',
          icon: 'RiTeamLine',
          permission: null,
          children: [
            {
              label: 'Employee List',
              href: '/employees',
              permission: ['employee.read:department', 'employee.read.financial'],
            },
            { label: 'Add Employee', href: '/employees/new', permission: 'employee.create' },
            {
              label: 'ID Change Requests',
              href: '/employees/id-requests',
              permission: 'employee.id_request.decide:department',
            },
          ],
        },
      ],
    },
  ],
  events: [
    'employee.joined',
    'employee.bank_changed',
    'employee.exited',
    'employee.national_id_change_requested',
  ],
});
