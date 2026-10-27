import type { Db } from '../client.js';
import { toDbScope } from '../scope.js';
import type { StarterRoleDef } from './starter-roles.js';

// Starter roles are created once and then belong to the admins, so seedRoles never touches them
// again. A permission declared by a module added later would otherwise never reach them. Only keys
// that are new in this sync are granted: an older key an admin removed stays removed.
export async function grantNewPermissions(db: Db, added: string[], roles: StarterRoleDef[]): Promise<void> {
  if (added.length === 0) return;
  const fresh = new Set(added);
  for (const def of roles) {
    const grants = def.grants.filter((g) => fresh.has(g.key));
    if (grants.length === 0) continue;
    const role = await db.role.findUnique({ where: { name: def.name }, select: { id: true } });
    if (!role) continue;
    await db.rolePermission.createMany({
      data: grants.map((g) => ({ roleId: role.id, permissionKey: g.key, scope: g.scope ? toDbScope(g.scope) : null })),
      skipDuplicates: true,
    });
  }
}
