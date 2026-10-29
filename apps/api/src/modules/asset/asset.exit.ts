import { prisma, type Tx } from '@erp/db';
import { openAssignmentsFor, type OpenAssignment } from './asset.assignments.js';
import { pendingRecoveriesFor } from './asset.recoveries.js';

export interface ExitChecklist {
  employeeId: string;
  openAssignments: OpenAssignment[];
  pendingRecoveries: Awaited<ReturnType<typeof pendingRecoveriesFor>>;
  /** Informational. It never gates anything. */
  hasOutstanding: boolean;
}

/**
 * Open assignments plus pending recoveries for one employee. It warns and never blocks: an unreturned laptop
 * does not stop a settlement, because the salary figure is right and the asset is a separate debt. Hard-blocking
 * would leave someone unpayable over a mislaid charger, and withholding a statutory settlement as leverage over
 * company property is contentious besides. Name the debt, price it, deduct it, pay them.
 */
export async function exitChecklist(employeeId: string): Promise<ExitChecklist> {
  const [openAssignments, pendingRecoveries] = await Promise.all([
    openAssignmentsFor(employeeId),
    pendingRecoveriesFor(employeeId),
  ]);
  return {
    employeeId,
    openAssignments,
    pendingRecoveries,
    hasOutstanding: openAssignments.length > 0 || pendingRecoveries.length > 0,
  };
}

/** What a leaver still owes, inside the caller's transaction so a settlement reads the same rows it then marks. */
export const listOpenRecoveries = (employeeId: string, db: Tx | typeof prisma = prisma) =>
  pendingRecoveriesFor(employeeId, db);
