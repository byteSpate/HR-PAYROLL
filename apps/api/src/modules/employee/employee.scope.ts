import { scopeFor } from '@erp/auth';
import { prisma, type Prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import type { Viewer } from './employee.access.js';

/** The employees one permission reaches, or null when the viewer holds no grant of it. */
async function reachThrough(viewer: Viewer, permission: string): Promise<Prisma.EmployeeWhereInput | null> {
  const scope = scopeFor(viewer, permission);
  if (scope === 'all') return {};
  const me = await prisma.employee.findUnique({ where: { userId: viewer.sub }, select: { id: true, departmentId: true } });
  if (scope === 'department' && me) return { departmentId: me.departmentId };
  if (scope === 'team' && me) return { reportingManagerId: me.id };
  return null;
}

/**
 * Which employees the viewer reaches through `permission`, as a filter on Employee: everyone for an
 * `all` grant, their department, or their direct reports. No grant at all is a 403. Shared by every
 * module whose records belong to an employee, so the rule lives once.
 *
 * Given several permissions it answers for any of them, so reading what you may decide can ride on the
 * approval grant: the result is everyone any one of them reaches.
 */
export async function scopeForViewer(viewer: Viewer, permission: string | readonly string[]): Promise<Prisma.EmployeeWhereInput> {
  const reaches: Prisma.EmployeeWhereInput[] = [];
  for (const key of typeof permission === 'string' ? [permission] : permission) {
    const filter = await reachThrough(viewer, key);
    if (filter) reaches.push(filter);
  }
  if (reaches.length === 0) throw new AppError(403, 'Forbidden');
  return reaches.some((filter) => Object.keys(filter).length === 0) ? {} : reaches.length === 1 ? reaches[0]! : { OR: reaches };
}
