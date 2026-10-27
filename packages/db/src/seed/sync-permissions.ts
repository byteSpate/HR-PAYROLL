import type { Db } from '../client.js';

export interface PermissionDef {
  key: string;
  label: string;
  module: string;
}

// Code is the source of truth for permissions: undeclared rows are deleted, and the
// FK cascade drops their role grants so no role keeps a permission nothing checks.
export async function syncPermissions(
  db: Db,
  perms: PermissionDef[],
): Promise<{ added: string[]; removed: string[] }> {
  const existing = new Set((await db.permission.findMany({ select: { key: true } })).map((p) => p.key));
  const declared = new Set(perms.map((p) => p.key));

  const added = perms.map((p) => p.key).filter((k) => !existing.has(k));
  const removed = [...existing].filter((k) => !declared.has(k));

  for (const p of perms) {
    await db.permission.upsert({
      where: { key: p.key },
      create: p,
      update: { label: p.label, module: p.module },
    });
  }
  if (removed.length > 0) await db.permission.deleteMany({ where: { key: { in: removed } } });
  return { added, removed };
}
