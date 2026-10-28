import type { Scope } from '@erp/contracts';
import type { Db } from '../client.js';
import { toDbScope } from '../scope.js';

export interface PermissionDef {
  key: string;
  label: string;
  module: string;
  /** Empty or omitted means plain on/off. */
  scopes?: readonly Scope[];
}

// Code is the source of truth for permissions: undeclared rows are deleted, and the
// FK cascade drops their role grants so no role keeps a permission nothing checks. Scopes are
// synced too, so narrowing a manifest is visible to the roles API's validation.
export async function syncPermissions(
  db: Db,
  perms: PermissionDef[],
): Promise<{ added: string[]; removed: string[] }> {
  const existing = new Set((await db.permission.findMany({ select: { key: true } })).map((p) => p.key));
  const declared = new Set(perms.map((p) => p.key));

  const added = perms.map((p) => p.key).filter((k) => !existing.has(k));
  const removed = [...existing].filter((k) => !declared.has(k));

  for (const p of perms) {
    const data = { label: p.label, module: p.module, scopes: (p.scopes ?? []).map(toDbScope) };
    await db.permission.upsert({ where: { key: p.key }, create: { key: p.key, ...data }, update: data });
  }
  if (removed.length > 0) await db.permission.deleteMany({ where: { key: { in: removed } } });
  return { added, removed };
}
