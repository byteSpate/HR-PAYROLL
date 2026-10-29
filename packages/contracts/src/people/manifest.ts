import { defineModule } from '../module.js';

/**
 * The admin employee screens, which bring together what the employee module alone cannot see: salary structure
 * (payroll), leave balances, held assets, payslips and settlement. Those modules all depend on `employee`, so
 * these screens live in a module above them. It declares no permissions or navigation of its own.
 */
export const people = defineModule({
  name: 'people',
  deps: ['core', 'department', 'employee', 'attendance', 'leave', 'asset', 'payroll', 'settlement', 'notification'],
  permissions: {},
  nav: [],
  events: [],
});
