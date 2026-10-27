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
      label: 'Departments',
      order: 30,
      icon: 'RiBuilding2Line',
      items: [
        { label: 'Department List', href: '/departments', icon: 'RiListUnordered', permission: 'department.read' },
        { label: 'Import Departments', href: '/departments/import', icon: 'RiUploadLine', permission: 'department.import' },
      ],
    },
  ],
  events: [],
});
