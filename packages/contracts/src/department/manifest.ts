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
      label: 'Overview',
      order: 10,
      items: [
        {
          label: 'Departments',
          href: '/departments',
          icon: 'RiBuilding2Line',
          permission: null,
          children: [
            { label: 'Department List', href: '/departments', permission: 'department.read' },
            { label: 'Import Departments', href: '/departments/import', permission: 'department.import' },
          ],
        },
      ],
    },
  ],
  events: [],
});
