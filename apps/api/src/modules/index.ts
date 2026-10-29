import type { Router } from 'express';
import { attendanceRouter } from './attendance/attendance.routes.js';
import { attendanceMineRouter } from './attendance/attendance.mine.routes.js';
import { attendanceConfigRouter } from './attendance/config.routes.js';
import { authRouter } from './auth/auth.routes.js';
import { auditRouter } from './core-audit/audit.routes.js';
import { departmentRouter } from './department/department.routes.js';
import { employeeRouter } from './employee/employee.routes.js';
import { exchangeRouter } from './exchange/exchange.routes.js';
import { leaveRouter } from './leave/leave.routes.js';
import { notificationRouter } from './notification/notification.routes.js';
import { rolesRouter } from './users/roles.routes.js';
import { usersRouter } from './users/users.routes.js';


// Each module registers its router here (filled by later tasks); prefixes are relative to /api.
export const apiMounts: [prefix: string, router: Router][] = [
  ['/auth', authRouter],
  ['/users', usersRouter],
  ['/roles', rolesRouter],
  ['/audit', auditRouter],
  ['/departments', departmentRouter],
  ['/employees', employeeRouter],
  ['/exchange-rates', exchangeRouter],
  ['/notifications', notificationRouter],
  ['/leave', leaveRouter],
  ['/attendance', attendanceMineRouter],
  ['/attendance', attendanceConfigRouter],
  ['/attendance', attendanceRouter],
];
