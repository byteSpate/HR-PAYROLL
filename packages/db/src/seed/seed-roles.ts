import type { Db } from '../client.js';
import { toDbScope } from '../scope.js';
import { STARTER_ROLES } from './starter-roles.js';

// A role is created only when no role of that name exists, so edits and deletions-by-rename
// made by admins survive every deploy. Re-running is a no-op.
export async function seedRoles(db: Db): Promise<void> {
  for (const def of STARTER_ROLES) {
    if (await db.role.findUnique({ where: { name: def.name }, select: { id: true } })) continue;
    await db.role.create({
      data: {
        name: def.name,
        description: def.description,
        permissions: {
          create: def.grants.map((g) => ({
            permissionKey: g.key,
            scope: g.scope ? toDbScope(g.scope) : null,
          })),
        },
      },
    });
  }
}
