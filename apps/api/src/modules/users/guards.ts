import { can, type AccessContext, type AccessLevel, type Scope } from '@erp/auth';
import { AppError } from '@erp/utils';

export type Caller = AccessContext & { sub: string };

export interface GrantRequest {
  permissionKey: string;
  /** Null for an on/off permission. */
  scope: Scope | null;
}

/**
 * Who may change an account. The SUPER_ADMIN is untouchable by everyone, itself included
 * (ownership moves only through the server CLI); an ADMIN is touched only by the SUPER_ADMIN.
 * Callers still need their own route permission; this only protects the privileged accounts.
 */
export function assertCanActOn(caller: Caller, target: { id: string; accessLevel: AccessLevel }): void {
  if (target.accessLevel === 'SUPER_ADMIN') {
    throw new AppError(403, 'The super admin cannot be changed through the app');
  }
  if (target.accessLevel === 'ADMIN' && caller.accessLevel !== 'SUPER_ADMIN') {
    throw new AppError(403, 'Only the super admin can change an admin');
  }
}

// Without this a user.manage holder could hand out a role carrying role.manage (or a wider scope
// than their own) and escalate. `can` already treats ADMIN and SUPER_ADMIN as holding everything.
export function assertMayGrant(caller: Caller, grants: readonly GrantRequest[]): void {
  const denied = grants.some((g) => !can(caller, g.scope ? `${g.permissionKey}:${g.scope}` : g.permissionKey));
  if (denied) throw new AppError(403, 'Cannot grant permissions you do not hold');
}
