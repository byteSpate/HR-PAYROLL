import type { Db } from '../client.js';
import { SYSTEM_ROLES } from './system-roles.js';

export async function seedRoles(db: Db): Promise<void> {
  const keys = (await db.permission.findMany({ select: { key: true } })).map((p) => p.key);
  for (const def of SYSTEM_ROLES) {
    let role = await db.role.findUnique({ where: { name: def.name } });
    const created = !role;
    role ??= await db.role.create({
      data: { name: def.name, description: def.description, isSystem: true },
    });
    // Only SUPER_ADMIN is re-granted on every run; other roles get grants once so admin edits survive.
    if (def.permissions === 'ALL' || created) {
      const grant = def.permissions === 'ALL' ? keys : def.permissions;
      await db.rolePermission.createMany({
        data: grant.map((permissionKey) => ({ roleId: role.id, permissionKey })),
        skipDuplicates: true,
      });
    }
  }
}
