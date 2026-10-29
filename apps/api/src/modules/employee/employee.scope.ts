import { scopeFor } from '@erp/auth';
import { prisma, type Prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import type { Viewer } from './employee.access.js';

/**
 * Which employees the viewer reaches through `permission`, as a filter on Employee: everyone for an
 * `all` grant, their department, or their direct reports. No grant at all is a 403. Shared by every
 * module whose records belong to an employee, so the rule lives once.
 */
export async function scopeForViewer(viewer: Viewer, permission: string): Promise<Prisma.EmployeeWhereInput> {
  const scope = scopeFor(viewer, permission);
  if (scope === 'all') return {};
  const me = await prisma.employee.findUnique({ where: { userId: viewer.sub }, select: { id: true, departmentId: true } });
  if (scope === 'department' && me) return { departmentId: me.departmentId };
  if (scope === 'team' && me) return { reportingManagerId: me.id };
  throw new AppError(403, 'Forbidden');
}
