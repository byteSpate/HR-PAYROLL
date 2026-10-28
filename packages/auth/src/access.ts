// Browser-safe (re-exported by ./permissions): no node built-ins here.

export type AccessLevel = 'SUPER_ADMIN' | 'ADMIN' | 'STANDARD';
export type Scope = 'own' | 'team' | 'department' | 'all';

export interface AccessContext {
  accessLevel: AccessLevel;
  /** 'key' for an on/off permission, 'key:scope' for a scoped one. */
  grants: readonly string[];
}

const RANK: Record<Scope, number> = { own: 0, team: 1, department: 2, all: 3 };

function isScope(value: string): value is Scope {
  return Object.hasOwn(RANK, value);
}

/** A wider scope covers a narrower one. */
export function covers(held: Scope, needed: Scope): boolean {
  return RANK[held] >= RANK[needed];
}

function split(grant: string): { key: string; scope: Scope | null } {
  const i = grant.lastIndexOf(':');
  const tail = i === -1 ? '' : grant.slice(i + 1);
  return i !== -1 && isScope(tail) ? { key: grant.slice(0, i), scope: tail } : { key: grant, scope: null };
}

// ADMIN and SUPER_ADMIN hold every permission, including ones from modules added later,
// so they are decided by level and never by a stored grant list.
const holdsEverything = (ctx: AccessContext) => ctx.accessLevel !== 'STANDARD';

/** Widest scope held for a key; null when not held or when it is a plain on/off grant. */
export function scopeFor(ctx: AccessContext, key: string): Scope | null {
  if (holdsEverything(ctx)) return 'all';
  let widest: Scope | null = null;
  for (const grant of ctx.grants) {
    const held = split(grant);
    if (held.key !== key || held.scope === null) continue;
    if (widest === null || covers(held.scope, widest)) widest = held.scope;
  }
  return widest;
}

/**
 * `required` is 'key' (any grant of the key, scoped or not) or 'key:scope' (a grant of at
 * least that scope). An on/off grant never satisfies a scoped requirement.
 */
export function can(ctx: AccessContext, required: string): boolean {
  if (holdsEverything(ctx)) return true;
  const need = split(required);
  return ctx.grants.some((grant) => {
    const held = split(grant);
    if (held.key !== need.key) return false;
    if (need.scope === null) return true;
    return held.scope !== null && covers(held.scope, need.scope);
  });
}
