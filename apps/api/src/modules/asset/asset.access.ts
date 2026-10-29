import { can, scopeFor } from '@erp/auth';
import { prisma, type Prisma } from '@erp/db';
import type { Viewer } from '../employee/employee.access.js';

/** Cost, vendor and the frozen BDT figures go to people who manage, capitalise or value assets, and to nobody else. */
export function canSeeCosts(viewer: Viewer): boolean {
  return (
    can(viewer, 'asset.manage') || can(viewer, 'asset.capitalise') || can(viewer, 'asset.value')
  );
}

const heldNow = (holder: Prisma.EmployeeWhereInput): Prisma.AssetWhereInput => ({
  assignments: { some: { returnedAt: null, employee: holder } },
});

/**
 * Which assets the viewer reaches through `permission`, as a filter on Asset. Scoped by open custody, so a
 * manager sees what their team is holding now, not everything the team has ever touched. A department
 * reader also gets assets their department owns, since a spare chair has no holder to be found by.
 *
 * `own` adds the viewer's own holdings, which need no grant: reading is for anyone, managing is not.
 * With no grant and no holdings the filter matches nothing, so a viewer with no way in sees an empty register.
 */
export async function assetScope(
  viewer: Viewer,
  permission: string | readonly string[],
  opts: { own: boolean },
): Promise<Prisma.AssetWhereInput> {
  const me = await prisma.employee.findUnique({
    where: { userId: viewer.sub },
    select: { id: true, departmentId: true },
  });
  const clauses: Prisma.AssetWhereInput[] = [];
  if (opts.own && me) clauses.push(heldNow({ id: me.id }));
  for (const key of typeof permission === 'string' ? [permission] : permission) {
    const scope = scopeFor(viewer, key);
    if (scope === 'all') return {};
    if (scope === 'department' && me)
      clauses.push({ departmentId: me.departmentId }, heldNow({ departmentId: me.departmentId }));
    if (scope === 'team' && me) clauses.push(heldNow({ reportingManagerId: me.id }));
  }
  return clauses.length > 0 ? { OR: clauses } : { id: { in: [] } };
}

export const readableAssets = (viewer: Viewer) => assetScope(viewer, 'asset.read', { own: true });
export const manageableAssets = (viewer: Viewer) =>
  assetScope(viewer, 'asset.manage', { own: false });
