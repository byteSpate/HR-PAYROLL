import { modules } from '@erp/contracts';
import type { EmployeeView } from '@erp/contracts/employee';
import { prisma, type Db } from '@erp/db';
import { registerGrantProvider } from '../auth/derived-grants.js';
import { EMPLOYEE_INCLUDE, type Viewer } from './employee.access.js';
import { avatarUrlFor, viewerEmployeeOf } from './employee.service.js';
import { projectEmployee } from './employee.access.js';

// Reports who have left do not make someone a manager any more.
const CURRENT = ['ACTIVE', 'ON_LEAVE'] as const;

// Every permission a module marks managerDefault, at team scope. Later modules only mark theirs.
const TEAM_GRANTS = modules.flatMap((m) =>
  Object.entries(m.permissions)
    .filter(([, def]) => def.managerDefault)
    .map(([key]) => `${key}:team`),
);

/** Manager powers come from having direct reports, never from a role (spec section 6). */
export async function managerGrants(db: Db, userId: string): Promise<string[]> {
  const reports = await db.employee.count({
    where: { reportingManager: { userId }, employmentStatus: { in: [...CURRENT] } },
  });
  return reports > 0 ? TEAM_GRANTS : [];
}

let registered = false;

/** Idempotent: createApp may run several times in one process (tests). */
export function registerEmployeeGrants(): void {
  if (registered) return;
  registered = true;
  registerGrantProvider(managerGrants);
}

export async function listTeam(viewer: Viewer): Promise<EmployeeView[]> {
  const me = await viewerEmployeeOf(prisma, viewer.sub);
  if (!me) return [];
  const rows = await prisma.employee.findMany({
    where: { reportingManagerId: me.id, employmentStatus: { in: [...CURRENT] } },
    include: EMPLOYEE_INCLUDE,
    orderBy: { fullName: 'asc' },
  });
  return rows.map((r) => projectEmployee(r, 'MANAGER', new Set(), avatarUrlFor(r.profilePicture)));
}
