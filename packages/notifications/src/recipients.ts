import type { Tx } from '@erp/db';

/**
 * Who should be told that `employeeId` has something to decide: their reporting manager if that
 * person's account is active; otherwise every active admin plus active standard users whose role
 * holds `permission` at `all`. Never the employee's own account, so nobody is asked to approve
 * their own request.
 */
export async function approverUserIds(tx: Tx, employeeId: string, permission: string): Promise<string[]> {
  const employee = await tx.employee.findUnique({
    where: { id: employeeId },
    select: { userId: true, reportingManager: { select: { user: { select: { id: true, isActive: true } } } } },
  });
  if (!employee) return [];

  const manager = employee.reportingManager?.user;
  if (manager?.isActive && manager.id !== employee.userId) return [manager.id];

  const users = await tx.user.findMany({
    where: {
      isActive: true,
      id: { not: employee.userId },
      OR: [
        { accessLevel: { in: ['ADMIN', 'SUPER_ADMIN'] } },
        { accessLevel: 'STANDARD', role: { permissions: { some: { permissionKey: permission, scope: 'ALL' } } } },
      ],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
