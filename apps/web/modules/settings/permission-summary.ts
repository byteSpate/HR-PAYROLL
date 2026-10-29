import { allPermissions, type DeclaredPermission, type Scope } from '@erp/contracts';

export interface GrantedPermission {
  key: string;
  label: string;
  /** null for an on/off permission. */
  scope: Scope | null;
}

export interface ModuleGrants {
  module: string;
  items: GrantedPermission[];
}

const WIDTH: Record<Scope, number> = { own: 0, team: 1, department: 2, all: 3 };

/**
 * Turns a user's grant strings ('key' or 'key:scope') into labelled rows grouped by module, in
 * manifest order. A key held at several scopes shows once, at the widest. Keys no manifest
 * declares any more are dropped: the label is the only thing the page can say about them.
 */
export function summarizeGrants(grants: readonly string[], declared: readonly DeclaredPermission[] = allPermissions()): ModuleGrants[] {
  const widest = new Map<string, Scope | null>();
  for (const grant of grants) {
    const [key, scope] = grant.split(':') as [string, Scope | undefined];
    const held = widest.get(key);
    if (held === undefined || (scope !== undefined && (held === null || WIDTH[scope] > WIDTH[held]))) {
      widest.set(key, scope ?? null);
    }
  }

  const groups = new Map<string, GrantedPermission[]>();
  for (const permission of declared) {
    if (!widest.has(permission.key)) continue;
    const items = groups.get(permission.module) ?? [];
    items.push({ key: permission.key, label: permission.label, scope: widest.get(permission.key) ?? null });
    groups.set(permission.module, items);
  }
  return [...groups].map(([module, items]) => ({ module, items }));
}
