import { defineModule } from '../module.js';

export const department = defineModule({
  name: 'department',
  deps: ['core'],
  permissions: {
    'department.read': { label: 'View departments' },
    'department.manage': { label: 'Create, rename and delete departments' },
    'department.import': { label: 'Import departments from a spreadsheet' },
  },
  nav: [
    {
      label: 'Administration',
      order: 900,
      items: [
        {
          label: 'Settings',
          href: '/settings/departments',
          icon: 'RiSettingsLine',
          permission: null,
          children: [
            {
              label: 'Departments',
              href: '/settings/departments',
              permission: 'department.manage',
              icon: 'RiBuilding2Line',
            },
          ],
        },
      ],
    },
  ],
  events: [],
});
