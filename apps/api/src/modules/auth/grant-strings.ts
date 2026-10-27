import { fromDbScope, type Scope } from '@erp/db';

// 'key' for an on/off grant, 'key:scope' (lowercase) for a scoped one; the format
// `can` and `scopeFor` read from the token and from PublicUser.
export function grantStrings(rows: { permissionKey: string; scope: Scope | null }[]): string[] {
  return rows.map((r) => (r.scope ? `${r.permissionKey}:${fromDbScope(r.scope)}` : r.permissionKey));
}
