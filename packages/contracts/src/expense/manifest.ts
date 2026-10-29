import { defineModule } from '../module.js';
import { EXPENSE_EVENTS } from './events.js';

export const expense = defineModule({
  name: 'expense',
  deps: ['core', 'employee', 'exchange', 'notification'],
  permissions: {
    'expense.read': { label: 'View expense claims', scopes: ['team', 'department', 'all'], managerDefault: true },
    'expense.approve': { label: 'Approve or reject expense claims', scopes: ['team', 'department', 'all'], managerDefault: true },
    'expense.manage': { label: 'See what is owed in reimbursements', scopes: ['department', 'all'] },
    'expense.config': { label: 'Manage expense categories' },
    'expense.report': { label: 'Run expense reports', scopes: ['department', 'all'] },
  },
  nav: [],
  events: EXPENSE_EVENTS,
});
